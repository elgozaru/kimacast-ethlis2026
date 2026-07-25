import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const LOCAL_MEMORY_DIR = new URL("./.local-memory/", import.meta.url);

function isConfigured() {
  return Boolean(process.env.ZEROG_STORAGE_RPC && process.env.ZEROG_STORAGE_PRIVATE_KEY);
}

/**
 * Shared memory between the Research, Content, and Analytics agents, backed
 * by 0G Storage. Each write returns a content-addressed URI (0g://<rootHash>)
 * that the next agent in the pipeline reads back.
 *
 * Falls back to a local JSON file (keyed by the same content hash) when
 * ZEROG_STORAGE_* credentials aren't set, so the pipeline is runnable
 * without live testnet funds.
 */
export async function writeMemory(key, data) {
  const payload = JSON.stringify(data, null, 2);

  if (!isConfigured()) {
    const rootHash = `0xlocal${createHash("sha256").update(payload).digest("hex")}`;
    await mkdir(LOCAL_MEMORY_DIR, { recursive: true });
    await writeFile(new URL(`${rootHash}.json`, LOCAL_MEMORY_DIR), payload, "utf-8");
    return { uri: `local://${key}/${rootHash}`, rootHash };
  }

  const { ethers } = await import("ethers");
  const { Indexer, MemData } = await import("@0gfoundation/0g-storage-ts-sdk");

  const provider = new ethers.JsonRpcProvider(process.env.ZEROG_STORAGE_RPC);
  const wallet = new ethers.Wallet(process.env.ZEROG_STORAGE_PRIVATE_KEY, provider);
  const indexer = new Indexer(process.env.ZEROG_STORAGE_INDEXER);

  const file = new MemData(Buffer.from(payload, "utf-8"));
  const [tree] = await file.merkleTree();
  const rootHash = tree?.rootHash() ?? "";

  const [result, err] = await indexer.upload(file, process.env.ZEROG_STORAGE_RPC, wallet);
  if (err) throw err;
  if (!("txHash" in result)) throw new Error("writeMemory: unexpected multi-file upload result");

  return { uri: `0g://${result.rootHash || rootHash}`, rootHash: result.rootHash || rootHash };
}

export async function readMemory(uri) {
  if (uri.startsWith("local://")) {
    const rootHash = uri.split("/").pop();
    const raw = await readFile(new URL(`${rootHash}.json`, LOCAL_MEMORY_DIR), "utf-8");
    return JSON.parse(raw);
  }

  const { Indexer } = await import("@0gfoundation/0g-storage-ts-sdk");
  const indexer = new Indexer(process.env.ZEROG_STORAGE_INDEXER);
  const rootHash = uri.replace("0g://", "");
  const outPath = `/tmp/x-agent-${rootHash}.json`;
  await indexer.download(rootHash, outPath, true);
  return JSON.parse(await readFile(outPath, "utf-8"));
}
