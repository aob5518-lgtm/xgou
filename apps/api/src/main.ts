import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { validateEnvironmentSecurity } from '@xgou/key-management';

const bootstrap = async (): Promise<void> => {
  validateEnvironmentSecurity({
    nodeEnvironment: process.env.NODE_ENV,
    executionMode: process.env.EXECUTION_MODE,
    keyProvider: process.env.KEY_PROVIDER,
    credentialProvider: process.env.CREDENTIAL_PROVIDER,
    liveTransportEnabled: process.env.LIVE_EXCHANGE_TRANSPORT_ENABLED,
    mainnetEnabled: process.env.MAINNET_ENABLED,
    chainEnvironment: process.env.CHAIN_ENV,
    realTradingEnabled: process.env.REAL_TRADING_ENABLED,
    realWithdrawalsEnabled: process.env.REAL_WITHDRAWALS_ENABLED,
    realRewardDistributionEnabled: process.env.REAL_REWARD_DISTRIBUTION_ENABLED,
  });
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0');
};

void bootstrap();
