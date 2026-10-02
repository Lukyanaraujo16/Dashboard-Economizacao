import { describe, expect, it } from 'vitest';

import { sanitizeAuditMetadata } from '../src/modules/audit/domain/sanitize-audit-metadata.js';
import { sanitizeSyncCounts } from '../src/modules/audit/domain/sanitize-sync-counts.js';

describe('sanitização da auditoria administrativa', () => {
  it('remove senha, hash, token, segredo e prompt', () => {
    const sanitized = sanitizeAuditMetadata({
      fields: ['name', 'email'],
      password: 'Segredo#Auditoria99',
      passwordHash: '$argon2id$hash',
      token: 'sess-token',
      accessToken: 'ya29.secret',
      apiKey: 'sk-live-secret',
      prompt: 'prompt completo da Lia',
      content: 'texto da base de conhecimento',
      minimumAmount: '1500.00',
    });

    expect(sanitized).toEqual({ fields: ['name', 'email'] });
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain('Segredo#Auditoria99');
    expect(serialized).not.toContain('argon2');
    expect(serialized).not.toContain('sess-token');
    expect(serialized).not.toContain('sk-live');
    expect(serialized).not.toContain('prompt completo');
    expect(serialized).not.toContain('1500');
  });

  it('mantém só contagens numéricas já persistidas', () => {
    expect(
      sanitizeSyncCounts({
        categories: 4,
        parties: 0,
        accessToken: 'tok-secret',
        prompt: 'PROMPT_COMPLETO_SIGILOSO',
        amount: 99.5,
      }),
    ).toEqual({ categories: 4, parties: 0 });
  });
});
