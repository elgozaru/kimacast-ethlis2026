import type { NextFunction, Request, Response } from "express";
import { PrivyClient } from "@privy-io/server-auth";

const privy = new PrivyClient(requireEnv("PRIVY_APP_ID"), requireEnv("PRIVY_APP_SECRET"));

export type AuthedRequest = Request & { creatorId?: string };

/// Verifies the creator dashboard's Privy access token (sent as
/// `Authorization: Bearer <token>`, matching apps/web's own
/// usePrivy().getAccessToken() pattern) and attaches the verified Privy
/// user id as req.creatorId. Every dashboard-api route that mutates a
/// creator's own agents/posts should sit behind this.
export async function requireCreatorAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return res.status(401).json({ error: "missing_token" });

  try {
    const claims = await privy.verifyAuthToken(token);
    req.creatorId = claims.userId;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

/// Resolves a creator's actual Ethereum wallet address from their Privy DID
/// (req.creatorId) - needed anywhere an on-chain address is required (ENS
/// text records, agent-context's "owner" field). The DID itself
/// (did:privy:...) is never a valid address and must never be passed to an
/// ethers/ENS call directly - that's exactly what caused
/// UNCONFIGURED_NAME when it was passed to setSubnodeRecord.
export async function getCreatorWalletAddress(creatorId: string): Promise<string | null> {
  const user = await privy.getUser(creatorId);
  const wallet = user.linkedAccounts.find(
    (a: any) => a.type === "wallet" && (a.walletClientType === "privy" || a.chainType === "ethereum"),
  ) as any;
  return wallet?.address ?? null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
