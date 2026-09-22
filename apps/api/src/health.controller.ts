import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './database/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health(): Promise<{ status: 'ok'; database: 'up' }> {
    await this.prisma.db.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'up' };
  }
}
