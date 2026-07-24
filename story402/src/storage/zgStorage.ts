import "dotenv/config";
import { createHash } from "node:crypto";
import type { StoredPaidContent } from "../agent/types.js";

/**
 * Persists the paid half of a story to 0G Storage - the log-layer,
 * erasure-coded decentralized storage network in the 0G stack - so that
 * the payload a viewer unlocks is content-addressed and independently
 * verifiable rather than sitting on our own server.
 *
 * Falls back to a deterministic local content hash (no network write)
 * when ZEROG_STORAGE_* credentials aren't set, so the pipeline is runnable
 * without live testnet funds.
 */
export class ZgStorageClient {
  isConfigured(): boolean {
    return Boolean(process.env.ZEROG_STORAGE_RPC && process.env.ZEROG_STORAGE_PRIVATE_KEY);
  }

  async uploadPaidContent(resourceId: string, content: string): Promise<StoredPaidContent> {
    if (!this.isConfigured()) {
      const rootHash = `0xlocal${createHash("sha256").update(content).digest("hex")}`;
      return { rootHash, txHash: "local-dry-run", storageUri: `local://story402/${resourceId}` };
    }

    const { ethers } = await import("ethers");
    const { Indexer, MemData } = await import("@0gfoundation/0g-storage-ts-sdk");

    const provider = new ethers.JsonRpcProvider(process.env.ZEROG_STORAGE_RPC);
    // Cast at the SDK boundary: the SDK ships its own ethers type declarations
    // resolved under a different module/resolution-mode than ours, so
    // structurally-identical Wallet/Signer types don't nominally match.
    const wallet = new ethers.Wallet(process.env.ZEROG_STORAGE_PRIVATE_KEY!, provider) as any;
    const indexer = new Indexer(process.env.ZEROG_STORAGE_INDEXER!);

    const file = new MemData(Buffer.from(content, "utf-8"));
    const [tree] = await file.merkleTree();
    const rootHash = tree?.rootHash() ?? "";

    const [result, err] = await indexer.upload(file, process.env.ZEROG_STORAGE_RPC!, wallet);
    if (err) throw err;
    if (!("txHash" in result)) throw new Error("uploadPaidContent: unexpected multi-file upload result");

    return {
      rootHash: result.rootHash || rootHash,
      txHash: result.txHash,
      storageUri: `0g://${result.rootHash || rootHash}`,
    };
  }

  async downloadPaidContent(storageUri: string): Promise<string> {
    if (storageUri.startsWith("local://")) {
      throw new Error("downloadPaidContent: local dry-run content has no retrievable payload");
    }
    const { Indexer } = await import("@0gfoundation/0g-storage-ts-sdk");
    const indexer = new Indexer(process.env.ZEROG_STORAGE_INDEXER!);
    const rootHash = storageUri.replace("0g://", "");
    const outPath = `/tmp/story402-${rootHash}`;
    await indexer.download(rootHash, outPath, true);
    const { readFile } = await import("node:fs/promises");
    return (await readFile(outPath)).toString("utf-8");
  }
}
