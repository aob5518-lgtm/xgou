// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {XgouVault} from "./XgouVault.sol";

contract DepositRouter is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant BPS_DENOMINATOR = 10_000;
    bytes32 public constant ALLOCATOR_ROLE = keccak256("ALLOCATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    IERC20 public immutable supportedAsset;
    XgouVault public immutable bullVault;
    XgouVault public immutable spotVault;
    XgouVault public immutable futuresVault;
    uint256 public minDepositAmount;
    uint16 public bullBps;
    uint16 public spotBps;
    uint16 public futuresBps;

    mapping(bytes32 referenceKey => bool processed) public processedReferences;

    event DepositAllocated(
        bytes32 indexed depositId,
        address indexed user,
        address indexed asset,
        uint256 amount,
        uint256 bullAmount,
        uint256 spotAmount,
        uint256 futuresAmount,
        bytes32 clientReference,
        uint256 timestamp
    );
    event AllocationUpdated(uint16 bullBps, uint16 spotBps, uint16 futuresBps);
    event MinimumDepositUpdated(uint256 previousAmount, uint256 newAmount);

    constructor(
        IERC20 asset_,
        XgouVault bullVault_,
        XgouVault spotVault_,
        XgouVault futuresVault_,
        address admin,
        uint256 minDepositAmount_
    ) {
        require(
            address(asset_) != address(0) && address(bullVault_) != address(0) && address(spotVault_) != address(0)
                && address(futuresVault_) != address(0) && admin != address(0),
            "zero address"
        );
        require(minDepositAmount_ > 0, "zero minimum");
        supportedAsset = asset_;
        bullVault = bullVault_;
        spotVault = spotVault_;
        futuresVault = futuresVault_;
        minDepositAmount = minDepositAmount_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ALLOCATOR_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _setAllocation(5_000, 3_000, 2_000);
    }

    function deposit(address asset, uint256 amount, bytes32 clientReference)
        external
        nonReentrant
        whenNotPaused
        returns (bytes32 depositId)
    {
        require(asset == address(supportedAsset), "unsupported asset");
        require(amount >= minDepositAmount, "amount below minimum");
        require(clientReference != bytes32(0), "zero reference");
        bytes32 referenceKey = keccak256(abi.encode(msg.sender, clientReference));
        require(!processedReferences[referenceKey], "duplicate reference");
        processedReferences[referenceKey] = true;

        depositId = keccak256(abi.encode(block.chainid, address(this), msg.sender, clientReference));
        uint256 bullAmount = amount * bullBps / BPS_DENOMINATOR;
        uint256 spotAmount = amount * spotBps / BPS_DENOMINATOR;
        uint256 futuresAmount = amount - bullAmount - spotAmount;

        emit DepositAllocated(
            depositId,
            msg.sender,
            asset,
            amount,
            bullAmount,
            spotAmount,
            futuresAmount,
            clientReference,
            block.timestamp
        );

        supportedAsset.safeTransferFrom(msg.sender, address(this), amount);
        _route(bullVault, bullAmount);
        _route(spotVault, spotAmount);
        _route(futuresVault, futuresAmount);
    }

    function setAllocation(uint16 bullBps_, uint16 spotBps_, uint16 futuresBps_) external onlyRole(ALLOCATOR_ROLE) {
        _setAllocation(bullBps_, spotBps_, futuresBps_);
    }

    function setMinDepositAmount(uint256 newAmount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newAmount > 0, "zero minimum");
        emit MinimumDepositUpdated(minDepositAmount, newAmount);
        minDepositAmount = newAmount;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _setAllocation(uint16 bullBps_, uint16 spotBps_, uint16 futuresBps_) internal {
        require(uint256(bullBps_) + spotBps_ + futuresBps_ == BPS_DENOMINATOR, "invalid allocation");
        bullBps = bullBps_;
        spotBps = spotBps_;
        futuresBps = futuresBps_;
        emit AllocationUpdated(bullBps_, spotBps_, futuresBps_);
    }

    function _route(XgouVault vault, uint256 amount) internal {
        if (amount == 0) return;
        supportedAsset.forceApprove(address(vault), amount);
        vault.depositFromRouter(amount);
    }
}
