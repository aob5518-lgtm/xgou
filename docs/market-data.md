# Market Data

`@xgou/market-data` 定义标准化 Ticker、OHLCV、OrderBook 和 24h Stats 适配器。默认 `MARKET_DATA_SOURCE=fixture` 使用可重现的历史 fixture；`public` 模式仅访问无认证公开行情接口，不需要交易所 API Key。

每条数据都带有 source pair、exchange timestamp 和 receivedAt。风控在提案执行前拒绝超过 `spotDataStaleSeconds` 的数据。Redis 用于运行时缓存与分布式周期锁。
