import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { sha256 } from './hash.js';

export interface AuditContext {
  readonly requestId: string;
  readonly ipHash: string;
}

export const auditContextFromRequest = (request: Request): AuditContext => {
  const salt = process.env.IP_HASH_SALT;
  if (!salt) throw new Error('IP_HASH_SALT is required');
  return {
    requestId: request.header('x-request-id') ?? randomUUID(),
    ipHash: sha256(`${salt}:${request.ip ?? 'unknown'}`),
  };
};
