export * from '../generated/client/client.js';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/client.js';

export const createDatabaseClient = (connectionString: string): PrismaClient => {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
};
