// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {RxMAnchor} from "../src/RxMAnchor.sol";

/// Minimal cheatcode interface, so the tests need no external library.
interface Vm {
    function expectRevert(bytes calldata) external;
    function expectEmit(bool, bool, bool, bool, address) external;
    function prank(address) external;
}

contract RxMAnchorTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    RxMAnchor anchor;

    event AnchorProof(uint8 agentIdScheme, bytes32 indexed agentId, bytes32 indexed proofHash, address indexed operator, bytes aux);

    bytes32 constant AGENT = keccak256("eip155:84532:0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266");
    bytes32 constant PROOF = keccak256("proof");

    function setUp() public { anchor = new RxMAnchor(); }

    function test_topic0MatchesTheErc() public pure {
        require(
            keccak256("AnchorProof(uint8,bytes32,bytes32,address,bytes)")
                == 0x9fe832d83a52f83bd7d54181e4cc7ff8b4e227cc1d3a0144376894b5df6c23cc,
            "topic0"
        );
    }

    function test_anchorWithAuxEmitsWithSenderAsOperator() public {
        address relayer = address(0xBEEF);
        bytes memory aux = hex"f0b2fcb5aabbcc";
        vm.expectEmit(true, true, true, true, address(anchor));
        emit AnchorProof(2, AGENT, PROOF, relayer, aux);
        vm.prank(relayer);
        anchor.anchorWithAux(2, AGENT, PROOF, aux);
    }

    function test_anchorEmitsEmptyAux() public {
        vm.expectEmit(true, true, true, true, address(anchor));
        emit AnchorProof(1, AGENT, PROOF, address(this), "");
        anchor.anchor(1, AGENT, PROOF);
    }

    function test_anonymousBatchAnchor() public {
        vm.expectEmit(true, true, true, true, address(anchor));
        emit AnchorProof(0, bytes32(0), PROOF, address(this), hex"bc7db884");
        anchor.anchorWithAux(0, bytes32(0), PROOF, hex"bc7db884");
    }

    function test_revertsOnZeroProofHash() public {
        vm.expectRevert(abi.encodeWithSelector(RxMAnchor.ZeroProofHash.selector));
        anchor.anchor(2, AGENT, bytes32(0));
    }

    function test_revertsOnAnonymousWithAgentId() public {
        vm.expectRevert(abi.encodeWithSelector(RxMAnchor.AnonymousWithAgentId.selector));
        anchor.anchor(0, AGENT, PROOF);
    }

    function test_revertsOnMissingAgentId() public {
        vm.expectRevert(abi.encodeWithSelector(RxMAnchor.MissingAgentId.selector));
        anchor.anchor(1, bytes32(0), PROOF);
        vm.expectRevert(abi.encodeWithSelector(RxMAnchor.MissingAgentId.selector));
        anchor.anchorWithAux(2, bytes32(0), PROOF, "");
    }

    function testFuzz_reservedSchemesRevert(uint8 scheme) public {
        if (scheme <= 2) return;
        vm.expectRevert(abi.encodeWithSelector(RxMAnchor.ReservedScheme.selector, scheme));
        anchor.anchor(scheme, AGENT, PROOF);
    }
}
