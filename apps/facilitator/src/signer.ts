import {
  AccountId,
  PrivateKey,
  Transaction,
  createHederaClient,
  createHederaPreflightTransfer,
  createHederaSignAndSubmitTransaction,
  createHederaVerifyPayerSignature,
  fetchJson,
  hederaAccountIdsEqual,
  mirrorNodeUrlForNetwork,
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
 * @x402/hedera's default `createHederaVerifyPayerSignature` only verifies a
 * payer's signature by looking up an ALREADY-STORED public key on the
 * mirror node - it has no path for a brand-new "hollow" account, which by
 * definition has no stored key yet: Hedera only records one once that
 * account has been the signer of a successful transaction, and for a
 * viewer's very first-ever payment (exactly the scenario this platform is
 * built for - see the comment below), that hasn't happened yet. The real
 * Hedera network handles a hollow account's completing transaction by
 * verifying the attached ECDSA signature against the account's known EVM
 * alias directly, with no prior key required; this replicates that.
 *
 * The public key never needs to be recovered from the raw signature bytes
 * here (unlike apps/resource-server/src/hedera-sign.ts, which has no public
 * key to work from at all) - it's already sitting in the transaction's own
 * signature map, put there by that same hedera-sign.ts route when it built
 * this signature via `tx.addSignature(publicKey, signature)`. Reading it
 * back and checking two things is enough: (1) that key's derived EVM
 * address matches the payer account's known alias (so it wasn't signed by
 * some unrelated key), and (2) `verifyTransaction` confirms the signature
 * is cryptographically valid for that key over this transaction (so it
 * wasn't just quietly swapped in without a matching signature) - together,
 * exactly the two things a real Hedera node checks.
 */
const defaultVerifyPayerSignature = createHederaVerifyPayerSignature();

async function verifyPayerSignatureAllowingHollowAccounts(params: { payer: string; transaction: string; network: string }) {
  const result = await defaultVerifyPayerSignature(params);
  if (result.ok || result.message !== "could not resolve payer key") return result;

  const account = await fetchJson<{ evm_address?: string }>(
    `${mirrorNodeUrlForNetwork(params.network)}/api/v1/accounts/${encodeURIComponent(params.payer)}`,
  );
  if (!account.evm_address) return result;

  const tx = Transaction.fromBytes(Buffer.from(params.transaction, "base64"));
  const expectedAlias = AccountId.fromEvmAddress(0, 0, account.evm_address).toString();
  for (const [, nodeMap] of tx.getSignatures()) {
    for (const [, sigPairMap] of nodeMap) {
      for (const [publicKey] of sigPairMap) {
        const candidateAlias = AccountId.fromEvmAddress(0, 0, publicKey.toEvmAddress()).toString();
        if (hederaAccountIdsEqual(candidateAlias, expectedAlias) && publicKey.verifyTransaction(tx)) {
          return { ok: true };
        }
      }
    }
  }
  return result;
}

/**
 * The facilitator signer is the trust boundary of the whole design: it is the
 * only party that spends real HBAR on network fees, which is what lets a
 * brand-new viewer authorize a payment from an account that has never held
 * gas money. Everything here is built from @x402/hedera's reference helpers,
 * which already implement the "exact" Hedera scheme's verify/settle contract
 * (see specs/schemes/exact/scheme_exact_hedera.md in coinbase/x402) - except
 * verifyPayerSignature, which wraps that reference helper to also cover the
 * brand-new-account case the helper itself doesn't (see above).
 */
export const facilitatorSigner = toFacilitatorHederaSigner({
  getAddresses: () => [feePayerAccountId],
  signAndSubmitTransaction: createHederaSignAndSubmitTransaction(buildClient, feePayerKey),
  verifyPayerSignature: verifyPayerSignatureAllowingHollowAccounts,
  preflightTransfer: createHederaPreflightTransfer(),
});

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
