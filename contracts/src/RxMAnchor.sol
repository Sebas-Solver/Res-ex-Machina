// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @title RxMAnchor
/// @notice Minimal anchoring contract compatible with the ERC-8263 draft ("Onchain Proof Layer for AI Agents").
/// @dev Stateless by design: no owner, no storage, no fees, no upgrade path. It only checks the canonical-form
///      guards of the draft and emits one AnchorProof event per call. Meaning (which hash, which signature) is
///      defined off chain by profiles such as rxm-pog-v2; `operator` is the submitter and is NOT an authorization.
contract RxMAnchor {
    event AnchorProof(
        uint8 agentIdScheme,
        bytes32 indexed agentId,
        bytes32 indexed proofHash,
        address indexed operator,
        bytes aux
    );

    error ZeroProofHash();
    error AnonymousWithAgentId();
    error MissingAgentId();
    error ReservedScheme(uint8 scheme);

    uint8 internal constant ANONYMOUS = 0x00;
    uint8 internal constant URI_HASH = 0x02;

    /// @notice Anchor with empty aux.
    function anchor(uint8 agentIdScheme, bytes32 agentId, bytes32 proofHash) external {
        _check(agentIdScheme, agentId, proofHash);
        emit AnchorProof(agentIdScheme, agentId, proofHash, msg.sender, "");
    }

    /// @notice Anchor with opaque aux bytes (rxm-pog-v2 puts a 4-byte selector and the agent signature here).
    function anchorWithAux(uint8 agentIdScheme, bytes32 agentId, bytes32 proofHash, bytes calldata aux) external {
        _check(agentIdScheme, agentId, proofHash);
        emit AnchorProof(agentIdScheme, agentId, proofHash, msg.sender, aux);
    }

    function _check(uint8 scheme, bytes32 agentId, bytes32 proofHash) private pure {
        if (proofHash == bytes32(0)) revert ZeroProofHash();
        if (scheme > URI_HASH) revert ReservedScheme(scheme);
        if (scheme == ANONYMOUS) {
            if (agentId != bytes32(0)) revert AnonymousWithAgentId();
        } else if (agentId == bytes32(0)) {
            revert MissingAgentId();
        }
    }
}
