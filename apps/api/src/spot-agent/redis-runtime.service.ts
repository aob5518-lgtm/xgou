import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';

@Injectable()
export class RedisRuntimeService implements OnModuleDestroy {
  private client: RedisClientType | null = null;

  async acquire(key: string, ttlSeconds: number): Promise<boolean> {
    if (process.env.SPOT_PAPER_TRADING_ENABLED !== 'true') return false;
    const client = await this.connected();
    return (await client.set(key, process.pid.toString(), { NX: true, EX: ttlSeconds })) === 'OK';
  }

  async release(key: string): Promise<void> {
    if (!this.client?.isOpen) return;
    await this.client.del(key);
  }

  async get(key: string): Promise<unknown> {
    if (process.env.SPOT_PAPER_TRADING_ENABLED !== 'true') return null;
    const value = await (await this.connected()).get(key);
    return value === null ? null : JSON.parse(value) as unknown;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (process.env.SPOT_PAPER_TRADING_ENABLED !== 'true') return;
    await (await this.connected()).set(key, JSON.stringify(value), { EX: ttlSeconds });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) await this.client.quit();
  }

  private async connected(): Promise<RedisClientType> {
    if (!this.client) this.client = createClient({ url: process.env.REDIS_URL ?? 'redis://localhost:6379' });
    if (!this.client.isOpen) await this.client.connect();
    return this.client;
  }
}
