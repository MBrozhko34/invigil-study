// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StudyAnchor -- immutable commitment registry for Invigil Study 001
/// @notice Labels are keccak256 of human-readable strings:
///   keccak256("methodology")     -> frozen METHODOLOGY.md hash   (anchored BEFORE data collection)
///   keccak256("private-tasks")   -> Merkle root of the private task corpus (anchored at freeze)
///   keccak256("day:2026-08-03")  -> Merkle root of that day's evidence JSONL
/// A label can be anchored exactly once; there is no update or delete path.
/// Tamper-evidence derives from that immutability, not from trust in the publisher.
contract StudyAnchor {
    address public immutable publisher;

    mapping(bytes32 => bytes32) public anchoredRoot;
    mapping(bytes32 => uint256) public anchoredAt;

    event Anchored(bytes32 indexed label, bytes32 root, uint256 timestamp);

    error NotPublisher();
    error AlreadyAnchored(bytes32 label);
    error ZeroRoot();
    error LengthMismatch();

    constructor() {
        publisher = msg.sender;
    }

    function anchor(bytes32 label, bytes32 root) public {
        if (msg.sender != publisher) revert NotPublisher();
        if (root == bytes32(0)) revert ZeroRoot();
        if (anchoredRoot[label] != bytes32(0)) revert AlreadyAnchored(label);
        anchoredRoot[label] = root;
        anchoredAt[label] = block.timestamp;
        emit Anchored(label, root, block.timestamp);
    }

    /// @notice Batch several daily roots into one cheap transaction.
    function anchorBatch(bytes32[] calldata labels, bytes32[] calldata roots) external {
        if (labels.length != roots.length) revert LengthMismatch();
        for (uint256 i = 0; i < labels.length; i++) {
            anchor(labels[i], roots[i]);
        }
    }
}
