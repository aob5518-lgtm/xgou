# Role Separation

Production roles are independent: Admin is a multisig; Treasury is MPC/custody; Risk and Pauser are a separate multisig/Risk Ops; Executor is a limited service identity; Agent has no on-chain role. Production forbids a single EOA from holding Admin, Treasury, and Executor. Treasury requires at least 2-of-3; 1-of-1 is development-only. High-risk actions require independent approvals and the requester cannot satisfy their own threshold.
