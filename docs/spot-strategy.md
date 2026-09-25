# Spot Swing V1

Phase 3A 只启用现货多头 Paper Trading。策略对 `BTC/USDC`、`ETH/USDC`、`SOL/USDC` 计算 EMA20/50、RSI14、ATR14、成交量均线、波动率、动量和趋势强度。信号为 `BUY / REDUCE / EXIT / HOLD`，禁止做空。

策略周期默认 60 秒，由 Redis `SET NX EX` 分布式锁保证单实例执行，`StrategyCycle(strategyId, cycleId)` 再提供数据库级幂等。

启用需同时将 `SPOT_PAPER_TRADING_ENABLED=true` 并将策略状态切换为 `PAPER`。默认值为 `false / DRAFT`。

## Runtime correctness

每个可运行 cycle（`PAPER`、`PAUSED`、`RISK_OFF`）都会先对所有 OPEN position 获取最新 ticker 并完成 Mark-to-Market，再计算 NAV、HWM、drawdown、UTC daily PnL 与 UTC Monday weekly PnL。`PAUSED` 和 `RISK_OFF` 禁止 BUY，但在健康且未过期的行情上仍允许经过 Risk Engine 的 REDUCE / EXIT。

Stop loss、take profit、mark timestamp、日/周 NAV baseline 与 CircuitBreakerState 均持久化，因此 API/Worker 重启不会重置风险状态。行情失败会自动进入带 `DATA_FEED_*` 原因的 PAUSED；行情恢复后仅自动数据暂停可恢复，人工 PAUSED 和 RISK_OFF 不会被自动解除。
