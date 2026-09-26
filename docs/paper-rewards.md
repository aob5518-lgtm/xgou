# Paper Rewards Operations

用户接口 `GET /v1/rewards` 返回 Paper 可用/待审核权益、周期会计、冻结 XP 份额和费用预览。当没有 finalized epoch 时，API 返回 0，不会伪造收益。

管理员接口：

- `GET /v1/admin/rewards/epochs/:id/review`
- `POST /v1/admin/rewards/epochs/:id/calculate`
- `POST /v1/admin/rewards/epochs/:id/finalize`
- `POST /v1/admin/rewards/epochs/:id/cancel`

定时器在两个 reward 开关都启用时每小时检查已结束 epoch，使用 Redis 分布式锁防止多实例重复计算。它不会自动 finalize。

Preview 中的 Withdraw 区域始终显示 `PAPER ONLY · NO REAL WITHDRAWAL`，可计算 5% fee/net preview，但没有交易、approve、contract write 或真实资金能力。
