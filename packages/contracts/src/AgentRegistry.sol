// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentRegistry
/// @notice On-chain directory of deployed content-publisher agents. Links
/// each agent's controller (the creator's wallet address) to its ENS
/// subname and off-chain metadata (typically the agent-context JSON also
/// published as an ENS text record, referenced here by its 0G Storage
/// 0g://<rootHash> URI). Adapted from the same pattern used in
/// elgozaru/story-agent-market's ENS sponsor-track submission.
///
/// Registration itself is deliberately permissionless (registerAgent has
/// no access control beyond a non-zero controller) - dashboard-api decides
/// who gets to call it, matching the ENS subname minting flow it already
/// gates behind Privy-authenticated creator ownership. Once registered,
/// only that agent's own controller can update it.
contract AgentRegistry {
    struct Agent {
        address controller;
        string ensName;
        string metadataURI;
        bytes32 policyHash;
        bool active;
        uint256 createdAt;
    }

    uint256 public nextAgentId;
    mapping(uint256 => Agent) public agents;

    event AgentRegistered(
        uint256 indexed agentId,
        address indexed controller,
        string ensName,
        string metadataURI,
        bytes32 policyHash
    );

    event AgentMetadataUpdated(uint256 indexed agentId, string metadataURI, bytes32 policyHash);

    event AgentStatusChanged(uint256 indexed agentId, bool active);

    error InvalidController();
    error NotController();

    /// @notice Registers a new agent and returns its on-chain id.
    /// @param controller The address allowed to update this agent later -
    /// the creator's wallet, not dashboard-api's own operator key.
    /// @param ensName The agent's full ENS subname (e.g. "alice-tech.kymacast.eth").
    /// @param metadataURI Off-chain metadata reference, e.g. an 0g://<rootHash> URI.
    /// @param policyHash Hash of the agent's source policy / free-gated-split settings.
    function registerAgent(
        address controller,
        string calldata ensName,
        string calldata metadataURI,
        bytes32 policyHash
    ) external returns (uint256 agentId) {
        if (controller == address(0)) revert InvalidController();

        agentId = nextAgentId++;

        agents[agentId] = Agent({
            controller: controller,
            ensName: ensName,
            metadataURI: metadataURI,
            policyHash: policyHash,
            active: true,
            createdAt: block.timestamp
        });

        emit AgentRegistered(agentId, controller, ensName, metadataURI, policyHash);
    }

    function updateAgentMetadata(uint256 agentId, string calldata metadataURI, bytes32 policyHash) external {
        Agent storage agent = agents[agentId];
        if (msg.sender != agent.controller) revert NotController();

        agent.metadataURI = metadataURI;
        agent.policyHash = policyHash;

        emit AgentMetadataUpdated(agentId, metadataURI, policyHash);
    }

    function setAgentActive(uint256 agentId, bool active) external {
        Agent storage agent = agents[agentId];
        if (msg.sender != agent.controller) revert NotController();

        agent.active = active;

        emit AgentStatusChanged(agentId, active);
    }
}
