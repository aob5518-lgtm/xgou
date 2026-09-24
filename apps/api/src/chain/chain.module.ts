import { Module } from '@nestjs/common';
import { ArcChainAdapter } from './arc-chain.adapter.js';
import { DeploymentRegistryService } from './deployment-registry.service.js';

@Module({
  providers: [ArcChainAdapter, DeploymentRegistryService],
  exports: [ArcChainAdapter, DeploymentRegistryService],
})
export class ChainModule {}
