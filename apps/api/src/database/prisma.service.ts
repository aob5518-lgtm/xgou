import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createDatabaseClient } from '@xgou/database';

const requiredDatabaseUrl = (): string => {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is required');
  return value;
};

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly db = createDatabaseClient(requiredDatabaseUrl());

  async onModuleInit(): Promise<void> {
    await this.db.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}
