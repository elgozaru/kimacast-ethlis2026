// Imported through @x402/hedera's own re-exports (not a direct
// @hiero-ledger/sdk dependency) so this file's Transaction/AccountId
// classes are the exact same copy createHederaClient's Client is built
// against — mixing a separately-installed @hiero-ledger/sdk copy in here
// trips the SDK's instanceof/string-brand checks at runtime. See the
// "Hedera SDK primitives" note in the @x402/hedera README.
import { AccountId, Hbar, TransactionId, TransferTransaction, createHederaClient } from "@x402/hedera";
import type { PaymentRequirements } from "@x402/core/types";
import { hederaAliasFromEvmAddress } from "./hedera";
import { bytesToBase64 } from "./base64";

/**
 * A well-known Hedera council node, present on both networks, used as the
 * transaction's sole node account id. Pinning to exactly one node (instead
 * of letting the SDK fan out to every node on the network) keeps this to a
 * single signed transaction, which is what makes the simple
 * `Transaction.addSignature(publicKey, signatureBytes)` API usable on the
 * resource-server's /api/hedera/sign — that call requires the signature
 * array to match the transaction count 1:1. Production code that wants
 * resilience against one node being briefly down should round-robin a
 * small pool instead of hardcoding "0.0.3".
 */
const SINGLE_NODE_ACCOUNT_ID = "0.0.3";

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
      .setNodeAccountIds([AccountId.fromString(SINGLE_NODE_ACCOUNT_ID)])
      .addHbarTransfer(this.accountId, Hbar.fromTinybars((-BigInt(requirements.amount)).toString()))
      .addHbarTransfer(requirements.payTo, Hbar.fromTinybars(requirements.amount))
      .freezeWith(client);

    const unsignedBase64 = bytesToBase64(unsigned.toBytes());

    // The actual secp256k1 signature happens server-side (apps/resource-server's
    // /api/hedera/sign), authenticated with that app's Privy secret. Privy's
    // embedded-wallet browser SDK exposes an EIP-1193 provider
    // (personal_sign / eth_signTypedData), but those both hash an
    // Ethereum-prefixed message; Hedera needs a signature over the raw,
    // un-prefixed transaction body bytes (HIP-179), so this goes through
    // Privy's `walletApi.ethereum.secp256k1Sign` primitive instead, which is
    // a server-authenticated call (see @privy-io/server-auth). This is a
    // relative fetch — Vite's dev proxy (see vite.config.ts) and any
    // production reverse proxy route it to the resource-server.
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
