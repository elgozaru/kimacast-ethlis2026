import { ethers } from "ethers";

/// Generates a fresh, dedicated Ethereum key for the platform's ENS subname
/// automation. Deliberately NOT the domain owner's personal wallet key -
/// this key only ever needs "operator" rights (ENSRegistry.setApprovalForAll),
/// never the domain's actual ownership, so a compromised server can't lose
/// the domain itself, only the ability to mint new subnames (which the
/// owner can revoke at any time).
///
/// Run with: npx tsx scripts/generate-ens-operator-key.ts
/// The private key is printed ONCE, to this terminal only - never pasted
/// into chat, a commit, or anywhere else. Put it directly into
/// apps/dashboard-api/.env as ENS_OPERATOR_PRIVATE_KEY.
const wallet = ethers.Wallet.createRandom();

console.log("Generated a new ENS operator key.\n");
console.log(`Address:     ${wallet.address}`);
console.log(`Private key: ${wallet.privateKey}\n`);
console.log("Next steps:");
console.log(`1. Put the private key in apps/dashboard-api/.env as ENS_OPERATOR_PRIVATE_KEY (never share it further).`);
console.log(`2. Send this address a small amount of Sepolia ETH for gas (a faucet, not from a key you care about).`);
console.log(
  `3. From the wallet that owns kymacast.eth (or that owns testpayment.kymacast.eth's parent), call:\n` +
    `   ENSRegistry.setApprovalForAll("${wallet.address}", true)\n` +
    `   on 0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e (Sepolia) - e.g. via Etherscan's ` +
    `"Write Contract" tab, connecting the domain-owner wallet.\n` +
    `   This grants operator rights only, NOT ownership - revocable any time by calling it again with false.`,
);
