import { NextRequest, NextResponse } from "next/server";
import { PrivyClient } from "@privy-io/server-auth";
import { PublicKey, Transaction } from "@hiero-ledger/sdk";
import { keccak256 } from "ethers";

const privy = new PrivyClient(process.env.PRIVY_APP_ID!, process.env.PRIVY_APP_SECRET!);

/**
 * Server-side counterpart of lib/hedera-privy-signer.ts. Takes the frozen,
 * unsigned transaction bytes the browser built, adds the viewer's
 * authorization signature via Privy's server Wallet API, and hands the
 * partially-signed transaction back so the browser can attach it as the
 * `X-PAYMENT` header. This runs with this app's Privy *app secret* — never
 * ship that to the client.
 *
 * VERIFY BEFORE SHIPPING: the exact Privy Wallet API RPC method for a raw
 * secp256k1 digest signature (as opposed to personal_sign/eth_signTypedData)
 * may have a different name/shape than `secp256k1_sign` below — confirm
 * against Privy's current Wallet API reference for embedded EVM wallets.
 * Similarly, `Transaction.signWithSigner`'s `Signer` interface should be
 * checked against the installed `@hiero-ledger/sdk` version; the object
 * below implements the subset that a single-key HBAR transfer needs.
 */
export async function POST(req: NextRequest) {
  const { walletId, transaction } = (await req.json()) as { walletId: string; transaction: string };

  const wallet = await privy.walletApi.getWallet({ id: walletId });
  const publicKey = PublicKey.fromStringECDSA(wallet.publicKey!);

  const tx = Transaction.fromBytes(Buffer.from(transaction, "base64"));

  await tx.signWithSigner({
    getAccountId: () => undefined,
    getAccountKey: () => publicKey,
    getNetwork: () => ({}),
    getLedgerId: () => undefined,
    getMirrorNetwork: () => [],
    async sign(messages: Uint8Array[]) {
      return Promise.all(
        messages.map(async (bodyBytes) => {
          // HIP-179: ECDSA signatures are computed over keccak256(bodyBytes),
          // and the wire format is the raw 64-byte (r, s) pair.
          const digest = keccak256(bodyBytes).slice(2);
          const { signature } = await privy.walletApi.rpc({
            walletId,
            method: "secp256k1_sign",
            params: { hash: `0x${digest}` },
          } as any);
          return { accountId: undefined, publicKey, signature: Buffer.from(signature.slice(2), "hex") };
        }),
      );
    },
  } as any);

  return NextResponse.json({ transaction: Buffer.from(tx.toBytes()).toString("base64") });
}
