// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {XgouVault} from "./XgouVault.sol";

contract BullVault is XgouVault {
    constructor(IERC20 asset, address admin) XgouVault(asset, "BULL", admin) {}
}
