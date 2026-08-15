import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { createLocalFileStorage } from '../src/infrastructure/storage/local-file-storage.js';
import { isSafeStorageKey } from '../src/infrastructure/storage/storage-key.js';
import { PNG_1X1 } from './helpers/image-fixtures.js';
import { assertTestStoragePath, cleanTestStorage } from './helpers/test-storage.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const fileId = '22222222-2222-4222-8222-222222222222';
const validKey = `tenants/${tenantId}/branding/${fileId}.png`;

describe('LocalFileStorage', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function createRoot() {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'dashboard-economizacao-'));
    const root = path.join(parent, 'storage_test');
    await mkdir(root);
    roots.push(root);
    roots.push(parent);
    return root;
  }

  it('put cria arquivo e get lê o conteúdo', async () => {
    const root = await createRoot();
    const storage = createLocalFileStorage(root);
    await storage.put(validKey, PNG_1X1);
    const stored = await readFile(path.join(root, validKey));
    expect(stored.equals(PNG_1X1)).toBe(true);
    expect((await storage.get(validKey)).equals(PNG_1X1)).toBe(true);
  });

  it('delete remove arquivo e é idempotente', async () => {
    const root = await createRoot();
    const storage = createLocalFileStorage(root);
    await storage.put(validKey, PNG_1X1);
    await storage.delete(validKey);
    await expect(storage.get(validKey)).rejects.toThrow();
    await expect(storage.delete(validKey)).resolves.toBeUndefined();
  });

  it('storageKey é opaca e segura', () => {
    expect(isSafeStorageKey(validKey)).toBe(true);
    expect(isSafeStorageKey(`tenants/${tenantId}/branding/${randomUUID()}.webp`)).toBe(true);
    expect(isSafeStorageKey(`platform/branding/logo/${randomUUID()}.png`)).toBe(true);
    expect(isSafeStorageKey(`platform/branding/favicon/${randomUUID()}.webp`)).toBe(true);
    expect(isSafeStorageKey(`platform/branding/logo/not-a-uuid.png`)).toBe(false);
  });

  it('rejeita path traversal', async () => {
    const root = await createRoot();
    const storage = createLocalFileStorage(root);
    await expect(storage.put('../escape.png', PNG_1X1)).rejects.toThrow('storageKey inválida');
    await expect(storage.put('/etc/passwd', PNG_1X1)).rejects.toThrow('storageKey inválida');
    await expect(
      storage.put(`tenants/${tenantId}/branding/../${fileId}.png`, PNG_1X1),
    ).rejects.toThrow('storageKey inválida');
  });

  it('fail-safe do test root rejeita diretórios perigosos', () => {
    expect(() => assertTestStoragePath('/')).toThrow('perigoso');
    expect(() => assertTestStoragePath('/tmp/storage_dev')).toThrow('_test');
    expect(() =>
      assertTestStoragePath(path.join(os.tmpdir(), 'dashboard-storage_test')),
    ).not.toThrow();
  });

  it('cleanTestStorage só apaga root _test', async () => {
    const root = await createRoot();
    const storage = createLocalFileStorage(root);
    await storage.put(validKey, PNG_1X1);
    await cleanTestStorage(root);
    await expect(readFile(path.join(root, validKey))).rejects.toThrow();
  });
});
