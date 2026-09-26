# Arc Testnet Role Risk

The Arc Testnet deployer currently retains `DEFAULT_ADMIN_ROLE`, `TREASURY_ROLE`, and `PAUSER_ROLE`. This is an explicitly documented **testnet-only** exception so the verified Phase 2B deployment is not disrupted.

Production must not copy this topology. Admin belongs to a multisig, Treasury to an MPC/custody executor, Risk/Pauser to an independent multisig or Risk Ops identity, and Executor to a constrained service identity. An Agent receives no chain role and never receives a Treasury key. Production readiness fails when a deployer EOA retains Admin, Treasury, or Executor, or when one principal concentrates those roles.
