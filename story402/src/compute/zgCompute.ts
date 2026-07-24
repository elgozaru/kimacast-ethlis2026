import "dotenv/config";

export interface ZgComputePrompt {
  system: string;
  user: string;
}

export interface ZgComputeResult {
  text: string;
  providerAddress: string;
  model: string;
}

/**
 * Thin wrapper around the 0G Compute Network's inference-broker SDK
 * (@0glabs/0g-serving-broker). 0G Compute is a decentralized marketplace of
 * GPU providers that serve LLM inference behind a verifiable, pay-per-call
 * settlement layer on the 0G chain, instead of a single centralized API.
 *
 * The broker connection is created lazily and only when ZEROG_COMPUTE_*
 * env vars are present, so the rest of the agent (and its tests) can run
 * without live testnet credentials.
 */
export class ZgComputeClient {
  private brokerPromise: Promise<any> | null = null;

  private async getBroker() {
    if (!this.brokerPromise) {
      this.brokerPromise = (async () => {
        const { ethers } = await import("ethers");
        const { createZGComputeNetworkBroker } = await import("@0gfoundation/0g-compute-ts-sdk");

        const provider = new ethers.JsonRpcProvider(process.env.ZEROG_COMPUTE_RPC);
        // Cast at the SDK boundary: the SDK ships its own ethers type
        // declarations resolved under a different resolution-mode than ours,
        // so a structurally-identical Wallet doesn't nominally match.
        const wallet = new ethers.Wallet(process.env.ZEROG_COMPUTE_PRIVATE_KEY!, provider) as any;
        return createZGComputeNetworkBroker(wallet);
      })();
    }
    return this.brokerPromise;
  }

  isConfigured(): boolean {
    return Boolean(process.env.ZEROG_COMPUTE_RPC && process.env.ZEROG_COMPUTE_PRIVATE_KEY);
  }

  /**
   * Runs a single inference call against a 0G Compute service provider.
   * Falls back to a deterministic local stub when no live broker is
   * configured, so `npm run generate` works out of the box in a sandbox.
   */
  async infer(prompt: ZgComputePrompt): Promise<ZgComputeResult> {
    if (!this.isConfigured()) {
      return {
        text: localFallbackInference(prompt),
        providerAddress: "local-fallback",
        model: "story402-heuristic-v0",
      };
    }

    const broker = await this.getBroker();
    const providerAddress = process.env.ZEROG_COMPUTE_MODEL_PROVIDER!;

    await broker.inference.acknowledgeProviderSigner(providerAddress);
    const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
    const headers = await broker.inference.getRequestHeaders(providerAddress, prompt.user);

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
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    const chatId = data.id as string | undefined;

    // Best-effort TEE-verification bookkeeping; a failure here shouldn't
    // block the caller from getting the generated hook back.
    await broker.inference.processResponse(providerAddress, chatId, text).catch(() => undefined);

    return { text, providerAddress, model };
  }
}

function localFallbackInference(prompt: ZgComputePrompt): string {
  return prompt.user;
}
