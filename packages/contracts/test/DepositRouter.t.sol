// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {DepositRouter} from "../src/DepositRouter.sol";
import {BullVault} from "../src/BullVault.sol";
import {SpotStrategyVault} from "../src/SpotStrategyVault.sol";
import {FuturesStrategyVault} from "../src/FuturesStrategyVault.sol";
import {XgouVault} from "../src/XgouVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

interface Vm {
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert(bytes calldata reason) external;
}

contract ReentrantUSDC is MockUSDC {
    DepositRouter public target;
    bool public attempted;
    bool public blocked;

    function setTarget(DepositRouter target_) external {
        target = target_;
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (!attempted && address(target) != address(0)) {
            attempted = true;
            (bool success,) =
                address(target).call(abi.encodeCall(target.deposit, (address(this), uint256(1), bytes32(uint256(999)))));
            blocked = !success;
        }
        return super.transferFrom(from, to, value);
    }
}

contract DepositRouterTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address private constant USER = address(0xBEEF);

    MockUSDC private usdc;
    BullVault private bull;
    SpotStrategyVault private spot;
    FuturesStrategyVault private futures;
    DepositRouter private router;

    function setUp() public {
        usdc = new MockUSDC();
        bull = new BullVault(IERC20(address(usdc)), address(this));
        spot = new SpotStrategyVault(IERC20(address(usdc)), address(this));
        futures = new FuturesStrategyVault(IERC20(address(usdc)), address(this));
        router = new DepositRouter(
            IERC20(address(usdc)),
            XgouVault(address(bull)),
            XgouVault(address(spot)),
            XgouVault(address(futures)),
            address(this),
            1
        );
        bull.grantRole(bull.ROUTER_ROLE(), address(router));
        spot.grantRole(spot.ROUTER_ROLE(), address(router));
        futures.grantRole(futures.ROUTER_ROLE(), address(router));
        usdc.mint(USER, 20_000e6);
        vm.prank(USER);
        usdc.approve(address(router), type(uint256).max);
    }

    function testDepositTenThousandSplitsExactly() public {
        _deposit(10_000e6, bytes32(uint256(1)));
        _assertBalances(5_000e6, 3_000e6, 2_000e6);
    }

    function testDepositOneHundredSplitsExactly() public {
        _deposit(100e6, bytes32(uint256(2)));
        _assertBalances(50e6, 30e6, 20e6);
    }

    function testDepositOneUsdcSplitsExactly() public {
        _deposit(1e6, bytes32(uint256(3)));
        _assertBalances(500_000, 300_000, 200_000);
    }

    function testSmallestUnitAndRoundingRemainder() public {
        _deposit(7, bytes32(uint256(4)));
        _assertBalances(3, 2, 2);
    }

    function testRejectsZeroAmount() public {
        vm.startPrank(USER);
        vm.expectRevert(bytes("amount below minimum"));
        router.deposit(address(usdc), 0, bytes32(uint256(5)));
        vm.stopPrank();
    }

    function testRejectsUnsupportedToken() public {
        MockUSDC other = new MockUSDC();
        vm.startPrank(USER);
        vm.expectRevert(bytes("unsupported asset"));
        router.deposit(address(other), 1e6, bytes32(uint256(6)));
        vm.stopPrank();
    }

    function testRejectsDuplicateClientReferenceForUser() public {
        bytes32 clientRef = bytes32(uint256(7));
        _deposit(1e6, clientRef);
        vm.startPrank(USER);
        vm.expectRevert(bytes("duplicate reference"));
        router.deposit(address(usdc), 1e6, clientRef);
        vm.stopPrank();
    }

    function testPausedRouterRejectsDeposit() public {
        router.pause();
        vm.startPrank(USER);
        vm.expectRevert(abi.encodeWithSignature("EnforcedPause()"));
        router.deposit(address(usdc), 1e6, bytes32(uint256(8)));
        vm.stopPrank();
    }

    function testUnauthorizedAllocationChangeReverts() public {
        vm.startPrank(USER);
        vm.expectRevert(
            abi.encodeWithSignature("AccessControlUnauthorizedAccount(address,bytes32)", USER, router.ALLOCATOR_ROLE())
        );
        router.setAllocation(4_000, 4_000, 2_000);
        vm.stopPrank();
    }

    function testAllocationMustConserveBps() public {
        vm.expectRevert(bytes("invalid allocation"));
        router.setAllocation(5_000, 3_000, 1_999);
    }

    function testReentrancyIsBlocked() public {
        ReentrantUSDC reentrant = new ReentrantUSDC();
        BullVault localBull = new BullVault(IERC20(address(reentrant)), address(this));
        SpotStrategyVault localSpot = new SpotStrategyVault(IERC20(address(reentrant)), address(this));
        FuturesStrategyVault localFutures = new FuturesStrategyVault(IERC20(address(reentrant)), address(this));
        DepositRouter localRouter = new DepositRouter(
            IERC20(address(reentrant)),
            XgouVault(address(localBull)),
            XgouVault(address(localSpot)),
            XgouVault(address(localFutures)),
            address(this),
            1
        );
        localBull.grantRole(localBull.ROUTER_ROLE(), address(localRouter));
        localSpot.grantRole(localSpot.ROUTER_ROLE(), address(localRouter));
        localFutures.grantRole(localFutures.ROUTER_ROLE(), address(localRouter));
        reentrant.setTarget(localRouter);
        reentrant.mint(USER, 1e6);
        vm.startPrank(USER);
        reentrant.approve(address(localRouter), 1e6);
        localRouter.deposit(address(reentrant), 1e6, bytes32(uint256(9)));
        vm.stopPrank();
        _assertTrue(reentrant.attempted(), "reentry not attempted");
        _assertTrue(reentrant.blocked(), "reentry was not blocked");
    }

    function _deposit(uint256 amount, bytes32 clientRef) private {
        vm.prank(USER);
        router.deposit(address(usdc), amount, clientRef);
    }

    function _assertBalances(uint256 bullAmount, uint256 spotAmount, uint256 futuresAmount) private view {
        _assertEq(usdc.balanceOf(address(bull)), bullAmount, "bull balance");
        _assertEq(usdc.balanceOf(address(spot)), spotAmount, "spot balance");
        _assertEq(usdc.balanceOf(address(futures)), futuresAmount, "futures balance");
        _assertEq(usdc.balanceOf(address(router)), 0, "router retains funds");
    }

    function _assertEq(uint256 actual, uint256 expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function _assertTrue(bool condition, string memory message) private pure {
        require(condition, message);
    }
}
