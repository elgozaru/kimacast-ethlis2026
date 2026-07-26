// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

/// Deploy with:
///   forge script script/DeployAgentRegistry.s.sol:DeployAgentRegistry \
///     --rpc-url $ETH_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
/// Then put the printed address in apps/dashboard-api/.env as
/// AGENT_REGISTRY_ADDRESS.
contract DeployAgentRegistry is Script {
    function run() external returns (AgentRegistry registry) {
        vm.startBroadcast();
        registry = new AgentRegistry();
        vm.stopBroadcast();

        console.log("AgentRegistry deployed at:", address(registry));
    }
}
