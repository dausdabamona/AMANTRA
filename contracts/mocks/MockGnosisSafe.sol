// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockGnosisSafe
 * @notice Mock implementation of Gnosis Safe for testing
 * @dev Implements the minimal interface required by AmantraLedgerV5
 */
contract MockGnosisSafe {
    address[] public owners;
    uint256 public threshold;
    uint256 public nonce;

    constructor(address[] memory _owners, uint256 _threshold) {
        require(_owners.length > 0, "Owners required");
        require(_threshold > 0 && _threshold <= _owners.length, "Invalid threshold");

        owners = _owners;
        threshold = _threshold;
    }

    function getThreshold() external view returns (uint256) {
        return threshold;
    }

    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    function isOwner(address owner) external view returns (bool) {
        for (uint i = 0; i < owners.length; i++) {
            if (owners[i] == owner) return true;
        }
        return false;
    }

    // Helper functions for testing
    function addOwner(address owner) external {
        owners.push(owner);
    }

    function setThreshold(uint256 _threshold) external {
        require(_threshold > 0 && _threshold <= owners.length, "Invalid threshold");
        threshold = _threshold;
    }

    function incrementNonce() external {
        nonce++;
    }
}
