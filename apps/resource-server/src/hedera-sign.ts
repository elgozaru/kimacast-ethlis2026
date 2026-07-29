import type { Request, Response } from "express";
import { PrivyClient } from "@privy-io/server-auth";
import { PublicKey, Transaction } from "@hiero-ledger/sdk";
import { computeAddress, keccak256, Signature, SigningKey } from "ethers";

// The wallet-RPC authorization key is a SEPARATE credential from the app
// secret above - Privy requires an authorization signature on every POST
// to a wallet's /rpc endpoint (which secp256k1Sign uses), signed with
// this key's private half. Without it, secp256k1Sign doesn't error
// cleanly - it comes back with no signature at all (see the check below).
// Generate one: Privy Dashboard -> Authorization keys -> New key, then
// register its public half as an authorized signer for the embedded
// wallets that need raw signing (a "key quorum") - the private key below
// is what proves each individual request actually comes from that
// authorized signer.
const privy = new PrivyClient(requireEnv("PRIVY_APP_ID"), requireEnv("PRIVY_APP_SECRET"), {
  walletApi: { authorizationPrivateKey: requireEnv("PRIVY_WALLET_AUTHORIZATION_PRIVATE_KEY") },
});

/**
 * Counterpart of the viewer's browser-side lib/hedera-privy-signer.ts (in
 * apps/web). Takes the frozen, single-node, unsigned transaction bytes the
 * browser built, adds the viewer's authorization signature via Privy's
 * server Wallet API, and hands the partially-signed transaction back so the
 * browser can attach it as the `X-PAYMENT` header. Runs with this app's
 * Privy *app secret* — never ship that to the client. This lives here
 * rather than in apps/web specifically because it needs a real server
 * process to hold that secret; a static Vite build has nowhere to keep it.
 *
 * This intentionally does NOT use `Transaction.signWithSigner`, which needs
 * a full `@hiero-ledger/sdk` `Signer` implementation (getAccountId,
 * getAccountKey, getNetwork, getLedgerId, getMirrorNetwork, sign,
 * getAccountBalance, getAccountInfo, getAccountRecords, signTransaction,
 * checkTransaction, populateTransaction, call — all required, most
 * irrelevant here). Instead this uses the lower-level
 * `Transaction.addSignature(publicKey, signatureBytes)`, the same primitive
 * every external Hedera wallet integration (HashPack, WalletConnect) uses:
 * read the exact bytes Hedera wants signed off `signableNodeBodyBytesList`,
 * sign them, inject the raw signature. Confirmed against the installed
 * `@hiero-ledger/sdk@2.85.0` and `@hiero-ledger/cryptography@1.19.0` source
 * (see `primitive/ecdsa.js`'s `sign()`): an ECDSA(secp256k1) signature on
 * Hedera is the 64-byte compact (r, s) pair over `keccak256(bodyBytes)` —
 * exactly what HIP-179 specifies, and exactly what
 * `privy.walletApi.ethereum.secp256k1Sign` is built to produce.
 *
 * The browser side pins the transaction to a single node account id before
 * freezing, so `signableNodeBodyBytesList` always has exactly one entry and
 * `addSignature`'s single-`Uint8Array` form applies directly.
 *
 * `addSignature` needs a Hedera `PublicKey` object paired with the raw
 * signature bytes (Hedera transactions can be multi-sig, so it needs to
 * know which key each signature belongs to) — but that's the only reason
 * this route needs a public key at all. It does NOT come from Privy's
 * `getWallet().publicKey` field: per `@privy-io/server-auth`'s own
 * `WalletView` mapper (`dist/cjs/wallet-api/views.js`), that field is only
 * present at all when the underlying REST response includes `public_key`,
 * and for at least one wallet exercised here it never has, even well after
 * granting session-signer access (so it isn't the propagation-lag issue
 * `wallet.address` lag elsewhere in this codebase is). Recovering the
 * public key from the signature itself sidesteps that gap entirely:
 * ECDSA signatures let you recover the exact public key that produced them
 * from nothing but the digest and the (r, s) pair, given one more bit (the
 * recovery id / parity) — which we don't even need Privy to hand us, since
 * `wallet.address` (unlike `publicKey`, always present in `WalletView`) is
 * enough to pick the right one of the two candidates by computing each
 * candidate's address and matching it.
 */
export async function handleHederaSign(req: Request, res: Response) {
  try {
    const { walletId, transaction } = req.body as { walletId: string; transaction: string };

    const wallet = await privy.walletApi.getWallet({ id: walletId });

    const tx = Transaction.fromBytes(base64ToBytes(transaction));

    const [signable, ...rest] = tx.signableNodeBodyBytesList;
    if (!signable || rest.length > 0) {
      throw new Error(
        `Expected exactly one signable transaction body (got ${tx.signableNodeBodyBytesList.length}) — did the caller set a single node account id before freezing?`,
      );
    }

    const digest = keccak256(signable.signableTransactionBodyBytes); // 0x-prefixed keccak256(bodyBytes)
    const signResult = await privy.walletApi.ethereum.secp256k1Sign({
      walletId,
      hash: digest as `0x${string}`,
    });
    // The SDK's secp256k1Sign() only ever returns {signature, encoding} - if
    // Privy's API responds without a signature (e.g. this wallet's policy
    // doesn't permit raw/arbitrary-hash signing, which is common: Privy
    // gates "sign this exact hash" separately from personal_sign/typed-data
    // since it's a strictly more powerful capability), the SDK silently
    // passes that through as `signature: undefined` instead of throwing.
    // Surface the full result so this fails loudly with something
    // actionable instead of a bare "Cannot read properties of undefined".
    if (!signResult?.signature) {
      throw new Error(
        `Privy secp256k1Sign returned no signature: ${JSON.stringify(signResult)}. ` +
          `Check this wallet's signing policy in the Privy dashboard (Wallets -> Policies) - ` +
          `raw secp256k1 hash signing may need to be explicitly permitted, separately from ` +
          `personal_sign/eth_signTypedData_v4.`,
      );
    }
    const { signature } = signResult;

    const signatureBytes = hexToBytes(signature);
    // Hedera wants exactly the 64-byte (r, s) pair; drop a trailing recovery
    // byte if Privy includes one (some secp256k1 signing APIs return 65
    // bytes, Ethereum-style).
    const compactSignature =
      signatureBytes.length === 65
        ? signatureBytes.slice(0, 64)
        : signatureBytes.length === 64
          ? signatureBytes
          : (() => {
              throw new Error(`Unexpected secp256k1 signature length ${signatureBytes.length}, expected 64 or 65`);
            })();

    const publicKey = recoverPublicKey(digest, compactSignature, wallet.address);

    tx.addSignature(publicKey, compactSignature);

    res.json({ transaction: bytesToBase64(tx.toBytes()) });
  } catch (err) {
    // Not every rejection here is guaranteed to be an Error instance with a
    // .message (e.g. some SDKs reject with plain objects) - falling back
    // to (err as Error).message in that case silently evaluates to
    // undefined, and JSON.stringify({error: undefined}) produces "{}",
    // which looks like "no error message at all" to whoever's debugging
    // this. Log the raw value server-side too, since that's never subject
    // to this serialization footgun.
    console.error("[resource-server] /api/hedera/sign failed:", err);
    const message = err instanceof Error ? err.message : JSON.stringify(err) || String(err);
    res.status(500).json({ error: message });
  }
}

// An ECDSA(secp256k1) signature over a known digest determines its signer's
// public key up to one bit of ambiguity (which of the two possible curve
// points produced it) - resolved here by computing the Ethereum-style
// address for both candidates and keeping whichever matches the wallet's
// already-known address (always present on Privy's wallet response, unlike
// `publicKey` - see the comment above handleHederaSign). `r`/`s` come
// straight out of the raw signature bytes Privy returned; the recovery
// parity itself is guessed and verified, not trusted from anywhere, so
// this works even when Privy's signature has no recovery byte at all.
function recoverPublicKey(digest: string, compactSignature: Uint8Array, walletAddress: string): PublicKey {
  const r = "0x" + Buffer.from(compactSignature.slice(0, 32)).toString("hex");
  const s = "0x" + Buffer.from(compactSignature.slice(32, 64)).toString("hex");
  const wantAddress = walletAddress.toLowerCase();

  for (const v of [27, 28]) {
    const candidatePublicKey = SigningKey.recoverPublicKey(digest, Signature.from({ r, s, v }));
    if (computeAddress(candidatePublicKey).toLowerCase() !== wantAddress) continue;
    const compressed = SigningKey.computePublicKey(candidatePublicKey, true);
    return PublicKey.fromBytesECDSA(hexToBytes(compressed));
  }

  throw new Error(
    `Could not recover a public key from the signature matching wallet address ${walletAddress} - ` +
      `the signature likely doesn't correspond to this digest/wallet.`,
  );
}

function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return new Uint8Array(Buffer.from(clean, "hex"));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
