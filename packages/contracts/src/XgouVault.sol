// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

abstract contract XgouVault is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IERC20 public immutable asset;
    string public domain;

    event RouterDeposit(address indexed router, uint256 amount);
    event TreasuryWithdrawal(address indexed treasury, address indexed recipient, uint256 amount);

    constructor(IERC20 asset_, string memory domain_, address admin) {
        require(address(asset_) != address(0) && admin != address(0), "zero address");
        asset = asset_;
        domain = domain_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(TREASURY_ROLE, admin);
    }

    function depositFromRouter(uint256 amount) external nonReentrant onlyRole(ROUTER_ROLE) whenNotPaused {
        require(amount > 0, "zero amount");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit RouterDeposit(msg.sender, amount);
    }

    function withdrawToTreasury(address recipient, uint256 amount)
        external
        nonReentrant
        onlyRole(TREASURY_ROLE)
        whenNotPaused
    {
        require(recipient != address(0), "zero recipient");
        asset.safeTransfer(recipient, amount);
        emit TreasuryWithdrawal(msg.sender, recipient, amount);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
