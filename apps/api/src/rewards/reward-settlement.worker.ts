import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisRuntimeService } from '../spot-agent/redis-runtime.service.js';
import { RewardSettlementService } from './reward-settlement.service.js';

@Injectable()
export class RewardSettlementWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RewardSettlementWorker.name);
  private timer?: NodeJS.Timeout;
  constructor(private readonly redis: RedisRuntimeService, private readonly rewards: RewardSettlementService) {}

  onModuleInit(): void {
    if (process.env.REWARD_SETTLEMENT_ENABLED !== 'true' || process.env.REWARD_AUTO_CALCULATE_ENABLED !== 'true') return;
    const seconds = Number(process.env.REWARD_SETTLEMENT_INTERVAL_SECONDS ?? 3600);
    this.timer = setInterval(() => { void this.tick(); }, seconds * 1_000);
    void this.tick();
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  private async tick(): Promise<void> {
    const epochs = await this.rewards.endedEpochs();
    for (const epoch of epochs) {
      const lock = `xgou:reward:settlement:${String(epoch.number)}`;
      if (!(await this.redis.acquire(lock, 300))) continue;
      try { await this.rewards.calculate(epoch.id); }
      catch (error) { this.logger.error(error); }
      finally { await this.redis.release(lock); }
    }
  }
}
