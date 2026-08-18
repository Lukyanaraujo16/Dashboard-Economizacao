import { describe, expect, it } from 'vitest';

import { sanitizeLoggedRequestUrl } from '../src/http/sanitize-logged-request-url.js';

describe('sanitizeLoggedRequestUrl', () => {
  it('redige code e state do callback OAuth', () => {
    const sanitized = sanitizeLoggedRequestUrl(
      '/integrations/conta-azul/callback?code=SECRET_CODE&state=SECRET_STATE',
    );
    expect(sanitized).toBe(
      '/integrations/conta-azul/callback?code=%5BREDACTED%5D&state=%5BREDACTED%5D',
    );
    expect(sanitized).not.toContain('SECRET_CODE');
    expect(sanitized).not.toContain('SECRET_STATE');
  });

  it('preserva URL sem query', () => {
    expect(sanitizeLoggedRequestUrl('/health')).toBe('/health');
  });
});
