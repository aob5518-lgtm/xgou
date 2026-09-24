import { randomBytes, randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SiweMessage } from 'siwe';
import { getAddress } from 'viem';
import { getChainConfig } from '@xgou/chains';
import { PrismaService } from '../database/prisma.service.js';
import { sha256 } from '../common/hash.js';
import type { AuditContext } from '../common/audit-context.js';
import { requiredSecret } from './access-token.guard.js';
import type { AuthenticatedUser } from './auth.types.js';

const NONCE_TTL_MS = 5 * 60 * 1000;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly csrfToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async createNonce(walletAddress: string): Promise<{ nonce: string; expiresAt: string }> {
    const normalized = getAddress(walletAddress.toLowerCase()).toLowerCase();
    const nonce = randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS);
    await this.prisma.db.authNonce.create({
      data: { walletAddress: normalized, nonceHash: sha256(nonce), expiresAt },
    });
    return { nonce, expiresAt: expiresAt.toISOString() };
  }

  async verify(messageText: string, signature: string, audit: AuditContext): Promise<SessionTokens> {
    let message: SiweMessage;
    try {
      message = new SiweMessage(messageText);
    } catch {
      throw new UnauthorizedException('malformed SIWE message');
    }
    const normalized = getAddress(message.address.toLowerCase()).toLowerCase();
    const expectedUri = process.env.SIWE_URI;
    if (!expectedUri || message.uri !== expectedUri) {
      throw new UnauthorizedException('SIWE URI does not match this application');
    }
    const expectedChainId = getChainConfig(process.env.CHAIN_ENV).id;
    if (message.chainId !== expectedChainId) {
      throw new UnauthorizedException('SIWE chain is not allowed');
    }
    const nonceRecord = await this.prisma.db.authNonce.findUnique({
      where: { nonceHash: sha256(message.nonce) },
    });
    if (
      !nonceRecord ||
      nonceRecord.walletAddress !== normalized ||
      nonceRecord.consumedAt ||
      nonceRecord.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException('nonce is invalid, expired, or already consumed');
    }

    const domain = process.env.SIWE_DOMAIN;
    if (!domain) throw new Error('SIWE_DOMAIN is required');
    let result: Awaited<ReturnType<SiweMessage['verify']>>;
    try {
      result = await message.verify({
        signature,
        domain,
        nonce: message.nonce,
        time: new Date().toISOString(),
      });
    } catch {
      throw new UnauthorizedException('signature verification failed');
    }
    if (!result.success) throw new UnauthorizedException('signature verification failed');

    const user = await this.prisma.db.$transaction(async (tx) => {
      const consumed = await tx.authNonce.updateMany({
        where: { id: nonceRecord.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new UnauthorizedException('nonce replay detected');
      const saved = await tx.user.upsert({
        where: { walletAddress: normalized },
        create: { walletAddress: normalized },
        update: {},
      });
      await tx.referralClosure.upsert({
        where: { ancestorId_descendantId: { ancestorId: saved.id, descendantId: saved.id } },
        create: { ancestorId: saved.id, descendantId: saved.id, depth: 0 },
        update: {},
      });
      await tx.auditLog.create({
        data: {
          actorId: saved.id,
          action: 'AUTH.SIWE_LOGIN',
          target: `user:${saved.id}`,
          after: { walletAddress: saved.walletAddress },
          ipHash: audit.ipHash,
          requestId: audit.requestId,
        },
      });
      return saved;
    });
    return this.issueSession({ userId: user.id, walletAddress: user.walletAddress, role: user.role });
  }

  async refresh(refreshToken: string): Promise<SessionTokens> {
    let payload: AuthenticatedUser & { sessionId: string };
    try {
      payload = await this.jwt.verifyAsync<AuthenticatedUser & { sessionId: string }>(refreshToken, {
        secret: requiredSecret('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('invalid refresh token');
    }
    const session = await this.prisma.db.refreshSession.findUnique({ where: { id: payload.sessionId } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.tokenHash !== sha256(refreshToken)) {
      throw new UnauthorizedException('refresh session is invalid');
    }
    const revoked = await this.prisma.db.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new UnauthorizedException('refresh token replay detected');
    return this.issueSession(payload, session.id);
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.db.refreshSession.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(user: AuthenticatedUser, rotatedFromId?: string): Promise<SessionTokens> {
    const sessionId = randomUUID();
    const accessToken = await this.jwt.signAsync(user, {
      secret: requiredSecret('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });
    const refreshToken = await this.jwt.signAsync({ ...user, sessionId }, {
      secret: requiredSecret('JWT_REFRESH_SECRET'),
      expiresIn: REFRESH_TTL_SECONDS,
    });
    await this.prisma.db.refreshSession.create({
      data: {
        id: sessionId,
        userId: user.userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
        rotatedFromId: rotatedFromId ?? null,
      },
    });
    return { accessToken, refreshToken, csrfToken: randomBytes(24).toString('base64url') };
  }
}
