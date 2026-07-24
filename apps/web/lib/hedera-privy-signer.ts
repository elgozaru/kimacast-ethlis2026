import { AccountId, Hbar, TransactionId, TransferTransaction } from "@hiero-ledger/sdk";
import { createHederaClient } from "@x402/hedera";
import type { PaymentRequirements } from "@x402/core/types";
import { hederaAliasFromEvmAddress } from "./hedera";
import { bytesToBase64 } from "./base64";

/**
 * Implements @x402/hedera's `ClientHederaSigner` interface
 * (accountId + createPartiallySignedTransferTransaction) on top of a Privy
 * embedded wallet instead of a locally-held Hedera PrivateKey. The viewer
 * never has a Hedera SDK key: Privy custodies the secp256k1 key inside its
 * secure enclave/iframe and only ever returns signatures, never key
 * material, matching how the rest of this codebase treats the viewer's
 * wallet.
 */
export class PrivyHederaSigner {
  readonly accountId: string;

  constructor(
    private readonly evmAddress: string,
    private readonly privyWalletId: string,
  ) {
    this.accountId = hederaAliasFromEvmAddress(evmAddress);
  }

  async createPartiallySignedTransferTransaction(requirements: PaymentRequirements): Promise<string> {
    const feePayer = requirements.extra?.feePayer as string | undefined;
    if (!feePayer) {
      throw new Error(
        "paymentRequirements.extra.feePayer is missing — the facilitator must publish its fee-payer account (see ExactHederaScheme.getExtra on the facilitator)",
      );
    }

    const client = createHederaClient(requirements.network);
    const unsigned = new TransferTransaction()
      .setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)))
      .addHbarTransfer(this.accountId, Hbar.fromTinybars(-BigInt(requirements.amount)))
      .addHbarTransfer(requirements.payTo, Hbar.fromTinybars(BigInt(requirements.amount)))
      .freezeWith(client);

    const unsignedBase64 = bytesToBase64(unsigned.toBytes());

    // The actual secp256k1 signature happens server-side, authenticated with
    // this app's Privy secret — see app/api/hedera/sign/route.ts. Privy's
    // embedded-wallet browser SDK exposes an EIP-1193 provider
    // (personal_sign / eth_signTypedData), but those both hash an
    // Ethereum-prefixed message; Hedera needs a signature over the raw
    // transaction body bytes (HIP-179 / HIP-19204), so this goes through
    // Privy's raw-signing capability instead, which today is a
    // server-authenticated call.
    const res = await fetch("/api/hedera/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletId: this.privyWalletId, transaction: unsignedBase64 }),
    });
    if (!res.ok) throw new Error(`Hedera signing failed: ${await res.text()}`);
    const { transaction } = (await res.json()) as { transaction: string };
    return transaction;
  }
}
