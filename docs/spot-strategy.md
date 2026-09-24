# Spot Swing V1

Phase 3A 只启用现货多头 Paper Trading。策略对 `BTC/USDC`、`ETH/USDC`、`SOL/USDC` 计算 EMA20/50、RSI14、ATR14、成交量均线、波动率、动量和趋势强度。信号为 `BUY / REDUCE / EXIT / HOLD`，禁止做空。

策略周期默认 60 秒，由 Redis `SET NX EX` 分布式锁保证单实例执行，`StrategyCycle(strategyId, cycleId)` 再提供数据库级幂等。

启用需同时将 `SPOT_PAPER_TRADING_ENABLED=true` 并将策略状态切换为 `PAPER`。默认值为 `false / DRAFT`。
