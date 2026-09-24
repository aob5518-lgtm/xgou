import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';

describe('API module graph', () => {
  beforeEach(() => {
    process.env.CHAIN_ENV = 'arc-testnet';
    process.env.CHAIN_INDEXER_ENABLED = 'false';
    process.env.RECONCILIATION_ENABLED = 'false';
  });

  it('initializes every controller and guard dependency', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ db: {}, onModuleInit: vi.fn(), onModuleDestroy: vi.fn() })
      .compile();
    const app = module.createNestApplication();

    await expect(app.init()).resolves.toBeDefined();
    await app.close();
  });
});
