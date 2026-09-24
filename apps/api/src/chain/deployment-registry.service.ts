import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { getArcTestnetDeployment, getArcTestnetDeploymentState, type ArcTestnetDeployment } from '@xgou/contracts/deployments';
import { getChainConfig } from '@xgou/chains';

@Injectable()
export class DeploymentRegistryService {
  get(): ArcTestnetDeployment {
    const chain = getChainConfig(process.env.CHAIN_ENV);
    try {
      const deployment = getArcTestnetDeployment();
      if (deployment.chainId !== chain.id || deployment.usdc.toLowerCase() !== chain.usdc.address.toLowerCase()) {
        throw new Error('deployment registry does not match chain registry');
      }
      return deployment;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'deployment unavailable';
      throw new ServiceUnavailableException(`Arc Testnet deposits are disabled: ${message}`);
    }
  }

  state() { return getArcTestnetDeploymentState(); }
}
