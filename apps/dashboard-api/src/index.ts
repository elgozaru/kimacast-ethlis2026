import "dotenv/config";
import cors from "cors";
import express from "express";
import { requireCreatorAuth } from "./auth.js";
import { agentsRouter } from "./routes/agents.js";
import { contentRouter } from "./routes/content.js";
import { postsRouter, runScheduledPublishes } from "./routes/posts.js";

// Last-resort safety net: every route handler in routes/ wraps its own
// logic in try/catch, but an unhandled rejection anywhere (a missed
// try/catch in a future route, a rejection from code running outside a
// request context) would otherwise crash the whole process per-request
// handlers can't - taking down every other creator's in-flight request
// too. Log and keep serving instead.
process.on("unhandledRejection", (err) => {
  console.error("[dashboard-api] unhandled rejection:", err);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" })); // base64-encoded PDF uploads (see routes/content.ts) run ~33% larger than the file itself

// Mounted under /api to match apps/dashboard's vite.config.ts dev proxy
// (which forwards /api/* here without rewriting the prefix away) and this
// repo's established convention (apps/resource-server's routes are all
// under /api/... too).
app.use("/api", requireCreatorAuth, agentsRouter);
app.use("/api", requireCreatorAuth, contentRouter);
app.use("/api", requireCreatorAuth, postsRouter);

const port = Number(process.env.PORT ?? 4100);
app.listen(port, () => console.log(`[dashboard-api] listening on :${port}`));

// Polls for scheduled posts whose time has arrived - a plain setInterval
// rather than a proper job queue since dashboard-api is a single
// long-running process for this project's scope; each tick's failures are
// caught inside runScheduledPublishes() itself so a bad post never stops
// future ticks. 60s is frequent enough that "post later" never lags a
// scheduled time by more than a minute, without hammering the DB.
const SCHEDULED_PUBLISH_POLL_MS = 60_000;
setInterval(() => {
  runScheduledPublishes().catch((err) => console.error("[dashboard-api] runScheduledPublishes failed:", err));
}, SCHEDULED_PUBLISH_POLL_MS);
