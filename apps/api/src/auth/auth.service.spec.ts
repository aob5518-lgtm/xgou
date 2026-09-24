import { describe, expect, it } from 'vitest';
import { createSiweNonce } from './auth.service.js';

describe('createSiweNonce', () => {
  it('always emits an EIP-4361 compatible alphanumeric nonce', () => {
    for (let index = 0; index < 100; index += 1) {
      expect(createSiweNonce()).toMatch(/^[A-Za-z0-9]{8,}$/);
    }
  });
});
