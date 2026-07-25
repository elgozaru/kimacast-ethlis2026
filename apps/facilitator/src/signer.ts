import {
  PrivateKey,
  createHederaClient,
  createHederaPreflightTransfer,
  createHederaSignAndSubmitTransaction,
  createHederaVerifyPayerSignature,
  toFacilitatorHederaSigner,
} from "@x402/hedera";
// PrivateKey comes from @x402/hedera's own re-export, not a direct
// @hiero-ledger/sdk dependency: @x402/hedera pins its own copy of the SDK
// internally, and passing a PrivateKey built from a *different* installed
// copy into that pinned copy's Client.setOperator() trips the SDK's
// instanceof/string-brand checks at runtime ("t.startsWith is not a
// function") — see the "Hedera SDK primitives" section of the @x402/hedera
// README. Always resolve Hedera SDK classes through @x402/hedera when a
// @x402/hedera value (like the Client from createHederaClient) is involved.

const feePayerAccountId = requireEnv("HEDERA_FACILITATOR_ACCOUNT_ID");
const feePayerKey = PrivateKey.fromStringECDSA(requireEnv("HEDERA_FACILITATOR_PRIVATE_KEY"));

/**
 * One Hedera SDK client per CAIP-2 network, reused across requests instead of
 * opening a new gRPC connection pool per settlement.
 */
const clients = new Map<string, ReturnType<typeof createHederaClient>>();
function buildClient(network: string) {
  let client = clients.get(network);
  if (!client) {
    client = createHederaClient(network).setOperator(feePayerAccountId, feePayerKey);
    clients.set(network, client);
  }
  return client;
}

/**
 * The facilitator signer is the trust boundary of the whole design: it is the
 * only party that spends real HBAR on network fees, which is what lets a
 * brand-new viewer authorize a payment from an account that has never held
 * gas money. Everything here is built from @x402/hedera's reference helpers,
 * which already implement the "exact" Hedera scheme's verify/settle contract
 * (see specs/schemes/exact/scheme_exact_hedera.md in coinbase/x402).
 */
export const facilitatorSigner = toFacilitatorHederaSigner({
  getAddresses: () => [feePayerAccountId],
  signAndSubmitTransaction: createHederaSignAndSubmitTransaction(buildClient, feePayerKey),
  verifyPayerSignature: createHederaVerifyPayerSignature(),
  preflightTransfer: createHederaPreflightTransfer(),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
