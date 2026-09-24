import arcTestnet from './arc-testnet.json' with { type: 'json' };

export function getArcTestnetDeployment() {
  if (!arcTestnet.deployed || !arcTestnet.depositRouter || !arcTestnet.bullVault || !arcTestnet.spotVault || !arcTestnet.futuresVault) {
    throw new Error('Arc Testnet contracts have not been deployed');
  }
  return arcTestnet;
}

export function getArcTestnetDeploymentState() {
  return arcTestnet;
}
