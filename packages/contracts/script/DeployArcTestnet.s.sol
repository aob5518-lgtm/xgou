// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {BullVault} from "../src/BullVault.sol";
import {SpotStrategyVault} from "../src/SpotStrategyVault.sol";
import {FuturesStrategyVault} from "../src/FuturesStrategyVault.sol";
import {DepositRouter} from "../src/DepositRouter.sol";

interface Vm {
    function envUint(string calldata name) external view returns (uint256);
    function envAddress(string calldata name) external view returns (address);
    function addr(uint256 privateKey) external pure returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

contract DeployArcTestnet {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run()
        external
        returns (BullVault bull, SpotStrategyVault spot, FuturesStrategyVault futures, DepositRouter router)
    {
        uint256 expectedChainId = vm.envUint("XGOU_DEPLOY_CHAIN_ID");
        require(block.chainid == expectedChainId, "chain registry mismatch");
        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        address usdcAddress = vm.envAddress("XGOU_DEPLOY_USDC_ADDRESS");
        IERC20Metadata usdc = IERC20Metadata(usdcAddress);
        uint256 minimum = 10 ** usdc.decimals();

        vm.startBroadcast(privateKey);
        bull = new BullVault(usdc, deployer);
        spot = new SpotStrategyVault(usdc, deployer);
        futures = new FuturesStrategyVault(usdc, deployer);
        router = new DepositRouter(usdc, bull, spot, futures, deployer, minimum);
        bull.grantRole(bull.ROUTER_ROLE(), address(router));
        spot.grantRole(spot.ROUTER_ROLE(), address(router));
        futures.grantRole(futures.ROUTER_ROLE(), address(router));
        vm.stopBroadcast();

        require(router.bullBps() == 5_000 && router.spotBps() == 3_000 && router.futuresBps() == 2_000);
    }
}
