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

app.use(requireCreatorAuth, agentsRouter);
app.use(requireCreatorAuth, contentRouter);
app.use(requireCreatorAuth, postsRouter);

const port = Number(process.env.PORT ?? 4100);
app.listen(port, () => console.log(`[dashboard-api] listening on :${port}`));
