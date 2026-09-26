# Paper Reward Settlement

Phase 4 只计算 `PAPER` reward entitlement，不移动 USDC，不写链，不创建真实提现。结算周期为 UTC 周一 00:00 至下周一 00:00，状态机为 `OPEN -> CALCULATING -> REVIEW -> FINALIZED`，审核员也可将 `REVIEW` 取消为 `CANCELLED`。

唯一允许的收益来源是 Spot 与 Futures 的累计已实现会计指标相对上次 finalized cursor 的差值：

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
