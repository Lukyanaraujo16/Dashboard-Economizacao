import { describe, expect, it } from 'vitest';

import { resolveTrustProxy } from '../src/config/trust-proxy.js';

describe('resolveTrustProxy', () => {
  it('confia apenas no hop loopback quando HOST é 127.0.0.1', () => {
    expect(resolveTrustProxy('127.0.0.1')).toEqual(['127.0.0.1', '::1']);
  });

  it('confia no hop loopback para localhost e ::1', () => {
    expect(resolveTrustProxy('localhost')).toEqual(['127.0.0.1', '::1']);
    expect(resolveTrustProxy('::1')).toEqual(['127.0.0.1', '::1']);
  });

  it('não confia em proxy quando o bind não é loopback', () => {
    expect(resolveTrustProxy('0.0.0.0')).toBe(false);
    expect(resolveTrustProxy('192.168.1.10')).toBe(false);
  });
});
