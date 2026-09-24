# Paper Trading

Paper Exchange 使用行情中间价、非零基础滑点、流动性冲击和默认 10 bps 手续费生成虚拟成交。持仓使用加权平均成本，持续计算已实现/未实现 PnL、NAV、High Water Mark 和 Drawdown。

`REAL_TRADING_ENABLED=false` 时 LiveExchangeAdapter 无法初始化；Phase 3A 不包含任何交易所密钥、SpotVault 提款、链上资金转移或真实订单代码。策略账本与 Backend Ledger 独立，不改写用户本金账本。
