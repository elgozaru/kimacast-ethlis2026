import "dotenv/config";
import cors from "cors";
import express from "express";
import { requireCreatorAuth } from "./auth.js";
import { agentsRouter } from "./routes/agents.js";
import { contentRouter } from "./routes/content.js";
import { postsRouter } from "./routes/posts.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" })); // pasted article text can be sizeable

// Mounted under /api to match apps/dashboard's vite.config.ts dev proxy
// (which forwards /api/* here without rewriting the prefix away) and this
// repo's established convention (apps/resource-server's routes are all
// under /api/... too).
app.use("/api", requireCreatorAuth, agentsRouter);
app.use("/api", requireCreatorAuth, contentRouter);
app.use("/api", requireCreatorAuth, postsRouter);

const port = Number(process.env.PORT ?? 4100);
app.listen(port, () => console.log(`[dashboard-api] listening on :${port}`));
