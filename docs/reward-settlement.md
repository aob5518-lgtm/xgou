# Paper Reward Settlement

Phase 4 只计算 `PAPER` reward entitlement，不移动 USDC，不写链，不创建真实提现。结算周期为 UTC 周一 00:00 至下周一 00:00，状态机为 `OPEN -> CALCULATING -> REVIEW -> FINALIZED`，审核员也可将 `REVIEW` 取消为 `CANCELLED`。

唯一允许的收益来源是 Spot 与 Futures 的累计已实现会计指标相对 Epoch Start Baseline 的差值：

`net = gross realized + funding - fees - slippage - liquidation penalty`

未实现盈亏、用户本金、Deposit、XP 和 Referral 不会进入 Reward Pool。计算时会冻结两个策略的来源快照和所有用户 XP 快照；重试不会生成第二份 allocation。自动任务最多计算到 `REVIEW`，只有 `ADMIN` / `RISK_MANAGER` 可 finalize。

安全开关默认为：

```env
REWARD_MODE=PAPER
REWARD_SETTLEMENT_ENABLED=false
REWARD_AUTO_CALCULATE_ENABLED=false
REAL_REWARD_DISTRIBUTION_ENABLED=false
```

`REWARD_MODE=REAL` 或打开真实分发会直接拒绝启动。finalized epoch 及其输入/分配由 PostgreSQL trigger 保护，不可覆写。

## Epoch 时间语义

每个 RewardEpoch 创建时，同一数据库事务会为 Spot 和 Futures 写入不可变的
`EpochSettlementBaseline`。`SettlementSourceSnapshot` 保存计算后的 epoch delta；
finalized cursor 只用于 exactly-once 和 reconciliation，不再作为唯一时间边界。
历史 epoch 如果缺少已验证的 baseline，结算必须进入 `REVIEW` 并记录
`MISSING_EPOCH_BASELINE`，不得猜测历史数字。

XP 以 Epoch 结束时间为排他边界（`effectiveAt < endsAt`）重建。
`Participation.effectiveAt` 是 Principal XP 的 canonical timestamp。ReferralEdge、
ReferralClosure、direct referral qualification participation 和 descendant Principal XP
都必须在同一边界前存在。Dynamic XP 仍为解锁层级内 descendant Principal XP 的 1%，
解锁深度仍为 `min(validDirects * 3, 30)`，且不递归计入 Dynamic XP。
