import { Router } from "express";
import { getDb } from "@kimacast/db";
import type { AuthedRequest } from "../auth.js";
import { encryptToken } from "../social/tokenCrypto.js";
import { deriveCodeChallenge, generateCodeVerifier, generateState } from "../social/pkce.js";
import * as xOauth from "../social/xOauth.js";
import * as instagramOauth from "../social/instagramOauth.js";
import { CONNECTABLE_PLATFORMS, resolveDefaultConnectionId } from "../social/connectionDefaults.js";

/// A creator connects their OWN X/Instagram account here - independent of
/// any agent (see the SocialConnection model comment in schema.prisma).
/// Split into two routers because the callback leg is hit directly by the
/// browser being redirected back from X/Meta, with no Bearer token to
/// verify - it can only be mounted behind requireCreatorAuth for the
/// authenticated half (connect/list/delete/default-connections).
export const socialConnectionsRouter = Router();
export const socialOauthCallbackRouter = Router();

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function dashboardOrigin(): string {
  return process.env.DASHBOARD_APP_ORIGIN || "http://localhost:3010";
}

/// GET /social/:platform/connect - starts the OAuth flow. Returns the
/// authorize URL as JSON rather than a redirect, since this is called from
/// the dashboard's own authenticated fetch() (which can't follow a
/// cross-origin redirect meaningfully); the frontend does
/// `window.location.href = authorizeUrl` itself.
socialConnectionsRouter.get("/social/:platform/connect", async (req: AuthedRequest, res) => {
  try {
    const platform = req.params.platform;
    if (platform !== "x" && platform !== "instagram") {
      return res.status(400).json({ error: "unsupported_platform" });
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    await getDb().oAuthState.create({
      data: { state, creatorId: req.creatorId!, platform, codeVerifier },
    });

    const authorizeUrl =
      platform === "x" ? xOauth.buildAuthorizeUrl(state, deriveCodeChallenge(codeVerifier)) : instagramOauth.buildAuthorizeUrl(state);
    res.json({ authorizeUrl });
  } catch (err) {
    respondError(res, err);
  }
});

/// GET /social/:platform/callback - the browser lands here directly after
/// approving on X/Meta's consent screen (?code=...&state=...). Recovers
/// creatorId + the PKCE verifier from the OAuthState row `state` points at,
/// exchanges the code, upserts the SocialConnection, then redirects the
/// browser back into the dashboard's Connections page - there's no JSON
/// response to return here, nothing is fetch()-ing this URL.
socialOauthCallbackRouter.get("/social/:platform/callback", async (req, res) => {
  const platform = req.params.platform;
  const { code, state, error: oauthError } = req.query as { code?: string; state?: string; error?: string };

  if (oauthError) {
    return res.redirect(`${dashboardOrigin()}/connections?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state) {
    return res.redirect(`${dashboardOrigin()}/connections?error=missing_code_or_state`);
  }

  try {
    const pending = await getDb().oAuthState.findUnique({ where: { state } });
    if (!pending || pending.platform !== platform) {
      return res.redirect(`${dashboardOrigin()}/connections?error=invalid_state`);
    }
    // One-shot: consume immediately so a replayed callback can't reuse it.
    await getDb().oAuthState.delete({ where: { state } });
    if (Date.now() - pending.createdAt.getTime() > OAUTH_STATE_TTL_MS) {
      return res.redirect(`${dashboardOrigin()}/connections?error=expired_state`);
    }

    const exchanged =
      platform === "x" ? await xOauth.exchangeCode(code, pending.codeVerifier) : await instagramOauth.exchangeCode(code);

    await getDb().socialConnection.upsert({
      where: {
        creatorId_platform_platformUserId: {
          creatorId: pending.creatorId,
          platform,
          platformUserId: exchanged.platformUserId,
        },
      },
      create: {
        creatorId: pending.creatorId,
        platform,
        platformUserId: exchanged.platformUserId,
        platformUsername: exchanged.platformUsername,
        accessTokenEnc: encryptToken(exchanged.accessToken),
        refreshTokenEnc: exchanged.refreshToken ? encryptToken(exchanged.refreshToken) : null,
        expiresAt: exchanged.expiresAt ?? null,
      },
      update: {
        platformUsername: exchanged.platformUsername,
        accessTokenEnc: encryptToken(exchanged.accessToken),
        refreshTokenEnc: exchanged.refreshToken ? encryptToken(exchanged.refreshToken) : null,
        expiresAt: exchanged.expiresAt ?? null,
      },
    });

    res.redirect(`${dashboardOrigin()}/connections?connected=${platform}`);
  } catch (err) {
    console.error(`[dashboard-api] ${platform} OAuth callback failed:`, err);
    res.redirect(`${dashboardOrigin()}/connections?error=${encodeURIComponent((err as Error).message)}`);
  }
});

/// Lists the calling creator's connections - never the tokens themselves.
socialConnectionsRouter.get("/social/connections", async (req: AuthedRequest, res) => {
  try {
    const connections = await getDb().socialConnection.findMany({
      where: { creatorId: req.creatorId! },
      orderBy: { createdAt: "desc" },
      select: { id: true, platform: true, platformUsername: true, expiresAt: true, createdAt: true },
    });
    res.json(connections);
  } catch (err) {
    respondError(res, err);
  }
});

/// Disconnecting a connection that a not-yet-fired scheduled post is bound
/// to would silently orphan that publish - refused for now (409) rather
/// than designing the reassignment flow, per the explicit "refine
/// disconnect/revoke later" scoping call.
socialConnectionsRouter.delete("/social/connections/:id", async (req: AuthedRequest, res) => {
  try {
    const connection = await getDb().socialConnection.findFirst({
      where: { id: req.params.id, creatorId: req.creatorId! },
    });
    if (!connection) return res.status(404).json({ error: "not_found" });

    const pendingCount = await getDb().postPublication.count({
      where: { socialConnectionId: connection.id, status: "pending" },
    });
    if (pendingCount > 0) {
      return res.status(409).json({
        error: "connection_in_use",
        message: `${pendingCount} scheduled post(s) are bound to this connection. Wait for them to publish or unschedule them first.`,
      });
    }

    await getDb().socialConnection.delete({ where: { id: connection.id } });
    res.status(204).end();
  } catch (err) {
    respondError(res, err);
  }
});

/// GET /agents/:agentId/default-connections - one connectionId per
/// platform, derived from the most recent successful PostPublication for
/// this agent+channel (never stored redundantly - see the PostPublication
/// model comment). Falls back to the creator's most-recently-connected
/// account for that platform if this agent has never published on it yet.
/// The dashboard's schedule/publish UI pre-selects these, but the creator
/// can override per action.
socialConnectionsRouter.get("/agents/:agentId/default-connections", async (req: AuthedRequest, res) => {
  try {
    const agent = await getDb().agent.findFirst({ where: { id: req.params.agentId, creatorId: req.creatorId! } });
    if (!agent) return res.status(404).json({ error: "not_found" });

    const defaults: Record<string, string> = {};
    for (const platform of CONNECTABLE_PLATFORMS) {
      const connectionId = await resolveDefaultConnectionId(agent.id, req.creatorId!, platform);
      if (connectionId) defaults[platform] = connectionId;
    }
    res.json(defaults);
  } catch (err) {
    respondError(res, err);
  }
});

function respondError(res: any, err: unknown) {
  const status = (err as any)?.status ?? 500;
  res.status(status).json({ error: (err as Error).message });
}
