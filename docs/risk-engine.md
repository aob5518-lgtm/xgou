# Spot Risk Engine

Risk Engine 与策略和交易适配器独立。每个 TradeProposal 都必须生成持久化 RiskDecision，只有 `APPROVED` 或 `REDUCED` 才能交给 Paper Exchange。

风控检查包括：白名单、行情时效、流动性、波动率、滑点、单资产与总敞口、单笔名义价值、现金与 20% 储备、日/周亏损与回撤。Circuit Breaker 支持 `RUNNING / REDUCED_RISK / PAUSED / RISK_OFF`；减仓和退出在 Risk Off 中仍允许执行。
