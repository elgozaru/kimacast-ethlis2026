import { ethers } from "ethers";

const AGENT_REGISTRY_ABI = [
  "function registerAgent(address controller, string ensName, string metadataURI, bytes32 policyHash) external returns (uint256 agentId)",
  "function updateAgentMetadata(uint256 agentId, string metadataURI, bytes32 policyHash) external",
  "function setAgentActive(uint256 agentId, bool active) external",
  "event AgentRegistered(uint256 indexed agentId, address indexed controller, string ensName, string metadataURI, bytes32 policyHash)",
];

export function isConfigured(): boolean {
  return Boolean(process.env.AGENT_REGISTRY_ADDRESS);
}

function getContract(): ethers.Contract {
  const provider = new ethers.JsonRpcProvider(requireEnv("ETH_RPC_URL"));
  // Reuses the same operator key ENS subname minting signs with (see
  // ens/subname.ts) - both are dashboard-api acting on the creator's
  // behalf, gated the same way (Privy-authenticated agent ownership).
  const operator = new ethers.Wallet(requireEnv("ENS_OPERATOR_PRIVATE_KEY"), provider);
  return new ethers.Contract(requireEnv("AGENT_REGISTRY_ADDRESS"), AGENT_REGISTRY_ABI, operator);
}

/// Registers a new agent on AgentRegistry.sol (packages/contracts). Not
/// required for the platform to function - the ENS subname minted
/// alongside this is what actually makes the agent addressable/payable -
/// this is a separate, independently-queryable on-chain ledger, primarily
/// useful for the ENS sponsor-track bounty. Callers should treat a failure
/// here as non-fatal to the overall deploy (see routes/agents.ts).
export async function registerAgent(
  controllerAddress: string,
  ensName: string,
  metadataURI: string,
  policyHash: string,
): Promise<{ agentId: string; txHash: string }> {
  const contract = getContract();
  const tx = await contract.registerAgent(controllerAddress, ensName, metadataURI, policyHash);
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log: any) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed: any) => parsed?.name === "AgentRegistered");

  if (!event) throw new Error("registerAgent: AgentRegistered event not found in receipt");

  return { agentId: event.args.agentId.toString(), txHash: tx.hash };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
