import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/// Thin wrapper around 0G Storage (@0gfoundation/0g-storage-ts-sdk), ported
/// from story402/src/storage/zgStorage.ts and x-agent/storage.js so all
/// three projects share the same env var names and fallback behavior.
/// Falls back to a local content-addressed file (no network write) when
/// ZEROG_STORAGE_* credentials aren't set, matching this repo's established
/// "runnable with zero keys" convention.
export class ZgStorageClient {
  isConfigured(): boolean {
    return Boolean(process.env.ZEROG_STORAGE_RPC && process.env.ZEROG_STORAGE_PRIVATE_KEY);
  }

  async upload(content: string): Promise<{ rootHash: string; storageUri: string }> {
    if (!this.isConfigured()) {
      const rootHash = `0xlocal${createHash("sha256").update(content).digest("hex")}`;
      await mkdir(join(tmpdir(), "kimacast-local-0g"), { recursive: true });
      await writeFile(join(tmpdir(), "kimacast-local-0g", `${rootHash}.txt`), content, "utf-8");
      return { rootHash, storageUri: `local://kimacast/${rootHash}` };
    }

    const { ethers } = await import("ethers");
    const { Indexer, MemData } = await import("@0gfoundation/0g-storage-ts-sdk");

    const provider = new ethers.JsonRpcProvider(process.env.ZEROG_STORAGE_RPC);
    const wallet = new ethers.Wallet(process.env.ZEROG_STORAGE_PRIVATE_KEY!, provider) as any;
    const indexer = new Indexer(process.env.ZEROG_STORAGE_INDEXER!);

    const file = new MemData(Buffer.from(content, "utf-8"));
    const [tree] = await file.merkleTree();
    const rootHash = tree?.rootHash() ?? "";

    const [result, err] = await indexer.upload(file, process.env.ZEROG_STORAGE_RPC!, wallet);
    if (err) throw err;
    if (!("txHash" in result)) throw new Error("upload: unexpected multi-file upload result");

    return { rootHash: result.rootHash || rootHash, storageUri: `0g://${result.rootHash || rootHash}` };
  }

  async download(storageUri: string): Promise<string> {
    if (storageUri.startsWith("local://")) {
      const rootHash = storageUri.split("/").pop();
      return readFile(join(tmpdir(), "kimacast-local-0g", `${rootHash}.txt`), "utf-8");
    }

    const { Indexer } = await import("@0gfoundation/0g-storage-ts-sdk");
    const indexer = new Indexer(process.env.ZEROG_STORAGE_INDEXER!);
    const rootHash = storageUri.replace("0g://", "");
    const outPath = join(tmpdir(), `kimacast-0g-download-${rootHash}`);
    await indexer.download(rootHash, outPath, true);
    return readFile(outPath, "utf-8");
  }

  /// Uploads content, downloads it back, and confirms the round trip is
  /// byte-for-byte identical - the verification step the spec calls for
  /// ("Download it again. Compare the downloaded file with the original.").
  async uploadAndVerify(content: string): Promise<{ rootHash: string; storageUri: string; verified: boolean }> {
    const { rootHash, storageUri } = await this.upload(content);
    const roundTripped = await this.download(storageUri);
    return { rootHash, storageUri, verified: roundTripped === content };
  }
}

/// Reevaluation trigger: compares a newly-fetched source's contentHash
/// against the hash of the last ContentSource row for the same
/// canonicalUrl. A mismatch means the source changed since the last
/// generation run and the agent's suggested posts are stale.
export function hasSourceChanged(previousContentHash: string | undefined, currentContentHash: string): boolean {
  return previousContentHash !== undefined && previousContentHash !== currentContentHash;
}
