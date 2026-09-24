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
        require(router.hasRole(router.DEFAULT_ADMIN_ROLE(), deployer), "router admin missing");
        require(router.hasRole(router.PAUSER_ROLE(), deployer), "router pauser missing");
        require(bull.hasRole(bull.DEFAULT_ADMIN_ROLE(), deployer), "bull admin missing");
        require(spot.hasRole(spot.DEFAULT_ADMIN_ROLE(), deployer), "spot admin missing");
        require(futures.hasRole(futures.DEFAULT_ADMIN_ROLE(), deployer), "futures admin missing");
        require(bull.hasRole(bull.TREASURY_ROLE(), deployer), "bull treasury missing");
        require(spot.hasRole(spot.TREASURY_ROLE(), deployer), "spot treasury missing");
        require(futures.hasRole(futures.TREASURY_ROLE(), deployer), "futures treasury missing");
        require(bull.hasRole(bull.PAUSER_ROLE(), deployer), "bull pauser missing");
        require(spot.hasRole(spot.PAUSER_ROLE(), deployer), "spot pauser missing");
        require(futures.hasRole(futures.PAUSER_ROLE(), deployer), "futures pauser missing");
        require(bull.hasRole(bull.ROUTER_ROLE(), address(router)), "bull router missing");
        require(spot.hasRole(spot.ROUTER_ROLE(), address(router)), "spot router missing");
        require(futures.hasRole(futures.ROUTER_ROLE(), address(router)), "futures router missing");
    }
}
