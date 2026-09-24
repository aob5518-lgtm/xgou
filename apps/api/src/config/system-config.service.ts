import { Injectable } from '@nestjs/common';
import {
  SYSTEM_CONFIG_DEFAULTS,
  systemConfigSchema,
  type SystemConfig,
} from '@xgou/shared';
import { PrismaService } from '../database/prisma.service.js';

export interface EffectiveSystemConfig {
  readonly version: number;
  readonly values: SystemConfig;
}

@Injectable()
export class SystemConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async current(): Promise<EffectiveSystemConfig> {
    const record = await this.prisma.db.systemConfigVersion.findFirst({
      where: { effectiveAt: { lte: new Date() } },
      orderBy: { version: 'desc' },
    });
    if (!record) return { version: 0, values: systemConfigSchema.parse(SYSTEM_CONFIG_DEFAULTS) };
    const stored =
      typeof record.values === 'object' && record.values !== null && !Array.isArray(record.values)
        ? (record.values as Record<string, unknown>)
        : {};
    return {
      version: record.version,
      values: systemConfigSchema.parse({ ...SYSTEM_CONFIG_DEFAULTS, ...stored }),
    };
  }

  async byVersion(version: number): Promise<EffectiveSystemConfig> {
    const record = await this.prisma.db.systemConfigVersion.findUnique({ where: { version } });
    if (!record) throw new Error(`system config version ${String(version)} was not found`);
    const stored =
      typeof record.values === 'object' && record.values !== null && !Array.isArray(record.values)
        ? (record.values as Record<string, unknown>)
        : {};
    return {
      version: record.version,
      values: systemConfigSchema.parse({ ...SYSTEM_CONFIG_DEFAULTS, ...stored }),
    };
  }
}
