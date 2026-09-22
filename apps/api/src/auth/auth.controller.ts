import { Body, Controller, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { requestNonceSchema, verifySiweSchema } from '@xgou/shared';
import { parseBody } from '../common/zod.js';
import { auditContextFromRequest } from '../common/audit-context.js';
import { AuthService, type SessionTokens } from './auth.service.js';

const REFRESH_COOKIE = 'xgou_refresh';
const CSRF_COOKIE = 'xgou_csrf';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('nonce')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  nonce(@Body() body: unknown): Promise<{ nonce: string; expiresAt: string }> {
    return this.auth.createNonce(parseBody(requestNonceSchema, body).walletAddress);
  }

  @Post('verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verify(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string }> {
    const input = parseBody(verifySiweSchema, body);
    return this.writeSession(
      response,
      await this.auth.verify(input.message, input.signature, auditContextFromRequest(request)),
    );
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<{ accessToken: string }> {
    const token = request.cookies[REFRESH_COOKIE] as string | undefined;
    const csrfCookie = request.cookies[CSRF_COOKIE] as string | undefined;
    const csrfHeader = request.header('x-csrf-token');
    if (!token || !csrfCookie || csrfHeader !== csrfCookie) throw new UnauthorizedException('CSRF validation failed');
    return this.writeSession(response, await this.auth.refresh(token));
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<{ success: true }> {
    const token = request.cookies[REFRESH_COOKIE] as string | undefined;
    const csrfCookie = request.cookies[CSRF_COOKIE] as string | undefined;
    if (!token || !csrfCookie || request.header('x-csrf-token') !== csrfCookie) {
      throw new UnauthorizedException('CSRF validation failed');
    }
    await this.auth.revoke(token);
    response.clearCookie(REFRESH_COOKIE);
    response.clearCookie(CSRF_COOKIE);
    return { success: true };
  }

  private writeSession(response: Response, tokens: SessionTokens): { accessToken: string } {
    const secure = process.env.NODE_ENV === 'production';
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    response.cookie(CSRF_COOKIE, tokens.csrfToken, {
      httpOnly: false,
      secure,
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken: tokens.accessToken };
  }
}
