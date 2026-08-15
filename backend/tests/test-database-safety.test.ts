import { describe, expect, it, vi } from 'vitest';

import {
  assertTestDatabaseUrl,
  cleanTestDatabase,
  resolveTestDatabaseUrl,
} from './helpers/test-database.js';

const TEST_URL = 'postgresql://placeholder:placeholder@127.0.0.1:5432/dashboard_economizacao_test';
const DEV_URL = 'postgresql://placeholder:placeholder@127.0.0.1:5432/dashboard_economizacao_dev';

function createCleanerMock() {
  return {
    userCredential: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    user: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    tenantBranding: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    storedFile: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    tenant: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

describe('isolamento do banco de testes', () => {
  it('aceita URL explícita com banco _test', () => {
    expect(() => assertTestDatabaseUrl(TEST_URL)).not.toThrow();
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: TEST_URL })).toBe(TEST_URL);
  });

  it('deriva banco _test apenas a partir de banco _dev', () => {
    expect(resolveTestDatabaseUrl({ DATABASE_URL: DEV_URL })).toContain(
      '/dashboard_economizacao_test',
    );
  });

  it('rejeita banco DEV com erro explícito e não executa cleanup', async () => {
    const cleaner = createCleanerMock();

    await expect(cleanTestDatabase(cleaner, DEV_URL)).rejects.toThrow(
      'não possui o sufixo obrigatório "_test"',
    );
    expect(cleaner.userCredential.deleteMany).not.toHaveBeenCalled();
    expect(cleaner.user.deleteMany).not.toHaveBeenCalled();
    expect(cleaner.tenant.deleteMany).not.toHaveBeenCalled();
  });
});
