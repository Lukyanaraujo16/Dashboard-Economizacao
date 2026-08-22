import { describe, expect, it } from 'vitest';

import { loadEnvironment, resolveAllowInsecureHttpSession } from '../src/config/env.js';
import {
  buildSessionCookieOptions,
  isSessionCookieSecure,
} from '../src/modules/auth/config/session-config.js';

const AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const ENCRYPTION_KEY = 'a'.repeat(64);
const REDIS_URL = 'redis://127.0.0.1:6379';
const STORAGE_PATH = '/var/lib/dashboard-economizacao/storage';

function productionSource(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    AUTH_SECRET,
    APP_URL: 'http://203.0.113.10',
    REDIS_URL,
    STORAGE_PATH,
    INTEGRATION_ENCRYPTION_KEY: ENCRYPTION_KEY,
    ...overrides,
  };
}

describe('ALLOW_INSECURE_HTTP_SESSION', () => {
  it('default é seguro (false)', () => {
    expect(
      resolveAllowInsecureHttpSession({
        flag: undefined,
        nodeEnv: 'production',
        appUrl: 'http://203.0.113.10',
      }),
    ).toBe(false);
  });

  it('aceita true somente em production com APP_URL http', () => {
    expect(
      resolveAllowInsecureHttpSession({
        flag: 'true',
        nodeEnv: 'production',
        appUrl: 'http://203.0.113.10',
      }),
    ).toBe(true);
  });

  it('recusa a flag quando APP_URL é https', () => {
    expect(
      resolveAllowInsecureHttpSession({
        flag: 'true',
        nodeEnv: 'production',
        appUrl: 'https://piloto.example.com',
      }),
    ).toBe(false);
  });

  it('ignora a flag fora de production', () => {
    expect(
      resolveAllowInsecureHttpSession({
        flag: 'true',
        nodeEnv: 'development',
        appUrl: 'http://127.0.0.1:3000',
      }),
    ).toBe(false);
  });

  it('loadEnvironment aplica a regra e o cookie Secure acompanha', () => {
    const httpPilot = loadEnvironment(productionSource({ ALLOW_INSECURE_HTTP_SESSION: 'true' }));
    expect(httpPilot.allowInsecureHttpSession).toBe(true);
    expect(isSessionCookieSecure(httpPilot)).toBe(false);
    expect(buildSessionCookieOptions(httpPilot).cookie.secure).toBe(false);

    const httpsPilot = loadEnvironment(
      productionSource({
        APP_URL: 'https://piloto.example.com',
        ALLOW_INSECURE_HTTP_SESSION: 'true',
      }),
    );
    expect(httpsPilot.allowInsecureHttpSession).toBe(false);
    expect(isSessionCookieSecure(httpsPilot)).toBe(true);
    expect(buildSessionCookieOptions(httpsPilot).cookie.secure).toBe(true);

    const productionDefault = loadEnvironment(
      productionSource({ ALLOW_INSECURE_HTTP_SESSION: undefined, APP_URL: 'https://app.example.com' }),
    );
    expect(productionDefault.allowInsecureHttpSession).toBe(false);
    expect(isSessionCookieSecure(productionDefault)).toBe(true);
  });
});
