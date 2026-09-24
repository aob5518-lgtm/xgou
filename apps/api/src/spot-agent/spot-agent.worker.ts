import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisRuntimeService } from './redis-runtime.service.js';
import { SpotAgentService } from './spot-agent.service.js';

@Injectable()
export class SpotAgentWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SpotAgentWorker.name);
  private timer?: NodeJS.Timeout;
  constructor(private readonly redis: RedisRuntimeService, private readonly agent: SpotAgentService) {}

  onModuleInit(): void {
    if (process.env.SPOT_PAPER_TRADING_ENABLED !== 'true') return;
    const seconds = Number(process.env.SPOT_STRATEGY_CYCLE_SECONDS ?? 60);
    this.timer = setInterval(() => { void this.tick(); }, seconds * 1_000);
    void this.tick();
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  private async tick(): Promise<void> {
    const lock = 'xgou:spot-agent:cycle-lock';
    if (!(await this.redis.acquire(lock, 55))) return;
    try { await this.agent.runCycle(); } catch (error) { this.logger.error(error); } finally { await this.redis.release(lock); }
  }
}
