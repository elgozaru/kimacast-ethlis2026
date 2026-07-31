import type { BuiltPrompt } from "./promptBuilder.js";
import { parseAndValidate } from "./parseGenerationContent.js";
import type { GenerateResult } from "./claude.js";

/// Runs the generation pipeline against the 0G Compute Network - a
/// decentralized marketplace of GPU providers serving LLM inference behind
/// a pay-per-call settlement layer on 0G's chain (paid in 0G tokens, e.g.
/// from the Galileo testnet faucet), instead of a single centralized API
/// billed in USD. Alternative to generation/claude.ts, picked per-agent via
/// generation/providers.ts. Ported from story402/src/compute/zgCompute.ts
/// (this project's own sibling prototype, already built against this exact
/// SDK) and extended with the multi-model / auto-funding / provider-listing
/// capabilities the installed @0gfoundation/0g-compute-ts-sdk@0.9.0
/// actually exposes (confirmed against its .d.ts, not guessed).
///
/// 0G Compute does NOT serve Claude/Anthropic models - only open-weight
/// ones (DeepSeek, Qwen, GPT-OSS variants as of this writing). This is a
/// genuinely different model, not just a different bill payer; output
/// tone/quality will differ from the Claude-tuned prompt variants.
const MIN_LEDGER_BALANCE_OG = 3; // matches LedgerProcessor.MIN_LEDGER_BALANCE_OG in the SDK

export function isConfigured(): boolean {
  return Boolean(process.env.ZEROG_COMPUTE_RPC && process.env.ZEROG_COMPUTE_PRIVATE_KEY);
}

let brokerPromise: Promise<any> | null = null;
async function getBroker() {
  if (!brokerPromise) {
    brokerPromise = (async () => {
      const { ethers } = await import("ethers");
      const { createZGComputeNetworkBroker } = await import("@0gfoundation/0g-compute-ts-sdk");
      const provider = new ethers.JsonRpcProvider(process.env.ZEROG_COMPUTE_RPC);
      // Cast at the SDK boundary: it ships its own ethers type
      // declarations resolved under a different module-resolution mode
      // than ours, so a structurally-identical Wallet doesn't nominally
      // match (same issue noted in story402's wrapper).
      const wallet = new ethers.Wallet(process.env.ZEROG_COMPUTE_PRIVATE_KEY!, provider) as any;
      return createZGComputeNetworkBroker(wallet);
    })();
  }
  return brokerPromise;
}

export type ZgComputeProviderListing = {
  provider: string;
  model: string;
  verifiability: string;
  inputPrice: string;
  outputPrice: string;
};

/// Lists available providers/models directly from the chain - a read-only
/// operation that needs only the public RPC, no wallet/private key, so the
/// dashboard can populate a provider/model picker before a creator has
/// configured ZEROG_COMPUTE_PRIVATE_KEY at all.
export async function listProviders(): Promise<ZgComputeProviderListing[]> {
  const rpcUrl = process.env.ZEROG_COMPUTE_RPC;
  if (!rpcUrl) throw new Error("ZEROG_COMPUTE_RPC is not configured");
  const { createZGComputeNetworkReadOnlyBroker } = await import("@0gfoundation/0g-compute-ts-sdk");
  const broker = await createZGComputeNetworkReadOnlyBroker(rpcUrl);
  const services = await broker.inference.listService();
  return services.map((s) => ({
    provider: s.provider,
    model: s.model,
    verifiability: s.verifiability,
    inputPrice: s.inputPrice.toString(),
    outputPrice: s.outputPrice.toString(),
  }));
}

const autoFundingStarted = new Set<string>();

/// One-time-per-provider setup: create this wallet's Compute Network ledger
/// if it doesn't exist yet (requires the wallet to already hold 0G testnet
/// tokens - this only creates the ledger account, it can't conjure funds),
/// and start the SDK's background auto-funding for this provider so
/// getRequestHeaders never has to wait on an on-chain top-up mid-request.
async function ensureFundedAndAcknowledged(broker: Awaited<ReturnType<typeof getBroker>>, providerAddress: string) {
  try {
    await broker.ledger.getLedger();
  } catch {
    const initial = Number(process.env.ZEROG_COMPUTE_INITIAL_DEPOSIT_OG ?? MIN_LEDGER_BALANCE_OG);
    await broker.ledger.addLedger(initial);
  }

  const acknowledged = await broker.inference.acknowledged(providerAddress);
  if (!acknowledged) await broker.inference.acknowledgeProviderSigner(providerAddress);

  if (!autoFundingStarted.has(providerAddress)) {
    await broker.inference.startAutoFunding(providerAddress);
    autoFundingStarted.add(providerAddress);
  }
}

export async function generate(
  prompt: BuiltPrompt,
  sourceUrl: string,
  options: { providerAddress: string; model?: string },
): Promise<GenerateResult> {
  const broker = await getBroker();
  await ensureFundedAndAcknowledged(broker, options.providerAddress);

  const { endpoint, model } = await broker.inference.getServiceMetadata(options.providerAddress, options.model);
  const headers = await broker.inference.getRequestHeaders(options.providerAddress, prompt.user);

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`0G Compute provider ${options.providerAddress} responded ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  const chatId = (response.headers.get("ZG-Res-Key") || data.id) as string | undefined;

  // Best-effort TEE-verification bookkeeping; a failure here shouldn't
  // block the caller from getting the generated content back.
  await broker.inference.processResponse(options.providerAddress, chatId, text).catch(() => undefined);

  return {
    content: parseAndValidate(text, sourceUrl),
    provider: "0g-compute",
    model,
  };
}
