# Reward HWM and Loss Carryforward

Reward HWM 是独立的结算水位，不复用交易策略的 NAV drawdown HWM。每个 epoch 先合并 Spot/Futures 已实现净盈亏，亏损进入 Loss Carryforward；后续盈利必须先弥补累计亏损，并且只有超过 Reward HWM 的新高利润才可分配。

默认 risk reserve 可为 0，计算顺序为：已实现净盈亏 → LCF 抵扣 → HWM 新高 → risk reserve → Reward Pool。

验收序列：`+1000, -600, +450, +500`，对应 Reward Pool 必须为 `1000, 0, 0, 350`。只有 finalize 成功才推进 cursor、HWM 和 LCF；REVIEW/CANCELLED 不改变下一周的起点。
