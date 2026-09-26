# Frozen XP Reward Allocation

结算时调用现有 XP 引擎，将 Principal XP、Dynamic XP、Total XP、有效直推数、解锁层级与 Network Principal XP 冻结到 `XpSnapshot`。Reward allocation 只读这份 epoch 快照，不会在 finalize 时重新读取实时 XP。

`userGrossReward = rewardPool * userTotalXp / globalTotalXp`

所有运算使用 `decimal.js` / PostgreSQL Decimal，指定精度向下取整，末位用户承接余数，保证 allocation sum 等于 pool。如 Reward Pool > 0 但全网有效 XP = 0，epoch 停留 `REVIEW` 并标记 `ZERO_EFFECTIVE_XP`，禁止 finalize。

5% `rewardWithdrawalFee` 在 Phase 4 只保存为 preview；`grossReward` 是完整权益，费用不会在结算时真实扣除。
