import { ethers } from "ethers";

const ENS_REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e"; // same address on every network

const REGISTRY_ABI = [
  "function owner(bytes32 node) view returns (address)",
  "function setSubnodeRecord(bytes32 node, bytes32 label, address owner, address resolver, uint64 ttl) external",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
];

const RESOLVER_ABI = ["function setText(bytes32 node, string key, string value) external"];

export function isConfigured(): boolean {
  return Boolean(process.env.ETH_RPC_URL && process.env.ENS_OPERATOR_PRIVATE_KEY && process.env.ENS_PARENT_DOMAIN);
}

/// Mints one subname under the platform's parent ENS domain (e.g.
/// "food-alice.kymacast.eth") and sets its text records in one call.
///
/// This calls the classic ENS Registry directly - NOT NameWrapper - because
/// creating a subdomain has never required wrapping: setSubnodeRecord is
/// available on the base Registry for any unwrapped parent, callable by
/// whoever the Registry's owner(parentNode) is (confirmed for kymacast.eth
/// via a real Sepolia tx this session - see docs/SETUP.md). The platform
/// signs with ENS_OPERATOR_PRIVATE_KEY, a dedicated key that is NOT the
/// domain owner's personal wallet; it only works once the domain owner has
/// called ENSRegistry.setApprovalForAll(operatorAddress, true) from their
/// own wallet - see scripts/generate-ens-operator-key.ts for that one-time
/// setup step. The platform key is never given ownership of the parent
/// domain itself, only operator rights, which the owner can revoke at any
/// time by calling setApprovalForAll(operatorAddress, false).
///
/// The subname's Registry owner is set to the operator's OWN address, not
/// the creator's wallet - the platform needs continued write access to
/// keep updating each agent's text records over time (reputation,
/// agent-context) as it evolves per ENS performance/feedback, without
/// depending on the creator's wallet being available for every future
/// update. The creator's own wallet address is recorded separately, inside
/// the agent-context text record's "owner" field (see routes/agents.ts).
export async function mintSubname(
  label: string,
  textRecords: Record<string, string>,
): Promise<{ subname: string; node: string; txHash: string }> {
  const parentDomain = requireEnv("ENS_PARENT_DOMAIN");
  const resolverAddress = process.env.ENS_RESOLVER_ADDRESS || "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5"; // Sepolia PublicResolver

  const provider = new ethers.JsonRpcProvider(requireEnv("ETH_RPC_URL"));
  const operator = new ethers.Wallet(requireEnv("ENS_OPERATOR_PRIVATE_KEY"), provider);
  const registry = new ethers.Contract(ENS_REGISTRY_ADDRESS, REGISTRY_ABI, operator);

  const parentNode = ethers.namehash(parentDomain);
  const labelHash = ethers.id(label); // keccak256(label), what setSubnodeRecord expects
  const subname = `${label}.${parentDomain}`;
  const node = ethers.namehash(subname);

  const approved = await registry.isApprovedForAll(await getParentOwner(registry, parentNode), operator.address);
  if (!approved) {
    throw new Error(
      `ENS operator key ${operator.address} is not an approved operator for ${parentDomain}. ` +
        `The domain owner must call ENSRegistry.setApprovalForAll("${operator.address}", true) once ` +
        `before subname minting will work - see docs/SETUP.md "ENS subname automation".`,
    );
  }

  const tx = await registry.setSubnodeRecord(parentNode, labelHash, operator.address, resolverAddress, 0n);
  await tx.wait();

  const resolver = new ethers.Contract(resolverAddress, RESOLVER_ABI, operator);
  for (const [key, value] of Object.entries(textRecords)) {
    const textTx = await resolver.setText(node, key, value);
    await textTx.wait();
  }

  return { subname, node, txHash: tx.hash };
}

async function getParentOwner(registry: ethers.Contract, parentNode: string): Promise<string> {
  return registry.owner(parentNode);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
