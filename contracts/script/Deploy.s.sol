// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {RxMAnchor} from "../src/RxMAnchor.sol";

interface Vm { function startBroadcast() external; function stopBroadcast() external; }

/// forge script script/Deploy.s.sol --rpc-url <rpc> --account <keystore-name> --broadcast
/// Use a keystore account (cast wallet import), never a raw private key on the command line.
contract Deploy {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (RxMAnchor deployed) {
        vm.startBroadcast();
        deployed = new RxMAnchor();
        vm.stopBroadcast();
    }
}
