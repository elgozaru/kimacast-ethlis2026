# packages/contracts

`AgentRegistry.sol` — an on-chain directory of deployed content-publisher
agents, linking each agent's controller (creator wallet), ENS subname, and
off-chain metadata (an 0G Storage `0g://<rootHash>` URI, typically the same
`agent-context` JSON also published as an ENS text record). Registration
is permissionless at the contract level; `apps/dashboard-api` gates who
gets to call it behind Privy-authenticated agent ownership, the same way
it already gates ENS subname minting.

Adapted from the same pattern used in `elgozaru/story-agent-market`'s ENS
sponsor-track submission — see that repo's `packages/contracts/src/AgentRegistry.sol`.
Not required for the platform to function (subname creation itself only
ever needed the standard ENS Registry, confirmed working without this
contract), but useful for that bounty track specifically, and as a
public, independently-queryable "which agents exist" ledger.

## Setup

This is a [Foundry](https://book.getfoundry.sh/) project. Install Foundry
(`curl -L https://foundry.paradigm.xyz | bash && foundryup`), then:

```bash
cd packages/contracts
forge install foundry-rs/forge-std --no-commit  # needed by script/DeployAgentRegistry.s.sol
forge build
forge test
```

## Deploy

```bash
forge script script/DeployAgentRegistry.s.sol:DeployAgentRegistry \
  --rpc-url $ETH_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
```

Put the printed address in `apps/dashboard-api/.env` as
`AGENT_REGISTRY_ADDRESS`. Use a dedicated deployer key, not the ENS
operator key or your personal wallet - this only needs to pay gas to
deploy the contract once; it isn't used again afterward (each
`registerAgent`/`updateAgentMetadata` call is signed by dashboard-api's ENS
operator key on the agent controller's behalf, same as ENS subname
minting).
