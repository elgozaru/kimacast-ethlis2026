import "dotenv/config";

export interface OnboardedWallet {
  smartAccountAddress: string;
  ownerUserId: string;
  fundingMethod: "apple_pay" | "google_pay";
}

/**
 * Onboards a viewer who taps "unlock for $0.05" with no wallet at all.
 *
 * Flow:
 *  1. Privy issues/authenticates an embedded signer for the viewer (email,
 *     phone, or passkey - no seed phrase) and lets them fund it via Apple
 *     Pay / Google Pay, converting fiat to the stablecoin/HBAR needed.
 *  2. ZeroDev wraps that Privy signer in an ERC-4337 smart account so the
 *     viewer gets gas sponsorship and a session key scoped to "pay up to
 *     $X to Story402 paywalls" - they never sign a raw blockchain tx.
 *  3. The resulting smart-account address is what actually pays the x402
 *     invoice in payments/x402.ts.
 *
 * This module only defines the interface + the calls that would be made;
 * it does not itself hold user funds or private keys.
 */
export class WalletOnboarding {
  isConfigured(): boolean {
    return Boolean(process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET && process.env.ZERODEV_PROJECT_ID);
  }

  async onboard(viewerId: string, fundingMethod: "apple_pay" | "google_pay"): Promise<OnboardedWallet> {
    if (!this.isConfigured()) {
      return {
        smartAccountAddress: `0xstub${viewerId.slice(0, 8).padEnd(8, "0")}`,
        ownerUserId: viewerId,
        fundingMethod,
      };
    }

    const { PrivyClient } = await import("@privy-io/server-auth");
    const privy = new PrivyClient(process.env.PRIVY_APP_ID!, process.env.PRIVY_APP_SECRET!);

    // Looks up (or would have already created, client-side, via Privy's
    // Apple/Google Pay funding widget) the viewer's embedded wallet.
    const user = await privy.getUser(viewerId);
    const embeddedWallet = user.linkedAccounts.find((a: any) => a.type === "wallet" && a.walletClientType === "privy");
    if (!embeddedWallet) {
      throw new Error(`onboard: viewer ${viewerId} has no Privy embedded wallet yet`);
    }

    const { createKernelAccount } = await import("@zerodev/sdk");
    const smartAccount = await createKernelAccount(embeddedWallet as any, {
      projectId: process.env.ZERODEV_PROJECT_ID!,
    } as any);

    return {
      smartAccountAddress: (smartAccount as any).address,
      ownerUserId: viewerId,
      fundingMethod,
    };
  }
}
