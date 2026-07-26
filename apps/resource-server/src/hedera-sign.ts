import type { Request, Response } from "express";
import { PrivyClient } from "@privy-io/server-auth";
import { PublicKey, Transaction } from "@hiero-ledger/sdk";
import { keccak256 } from "ethers";

const privy = new PrivyClient(requireEnv("PRIVY_APP_ID"), requireEnv("PRIVY_APP_SECRET"));

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
 */
export async function handleHederaSign(req: Request, res: Response) {
  try {
    const { walletId, transaction } = req.body as { walletId: string; transaction: string };

    const wallet = await privy.walletApi.getWallet({ id: walletId });
    // Privy returns the embedded wallet's compressed secp256k1 public key as
    // a hex string (optionally 0x-prefixed) — the exact format
    // PublicKey.fromStringECDSA expects.
    const publicKey = PublicKey.fromStringECDSA(wallet.publicKey!);

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

    tx.addSignature(publicKey, compactSignature);

    res.json({ transaction: bytesToBase64(tx.toBytes()) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
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
