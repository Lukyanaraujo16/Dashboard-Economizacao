import { describe, expect, it } from 'vitest';

import type { FileStorage } from '../src/infrastructure/storage/file-storage.js';
import { createAdminBrandingService } from '../src/modules/branding/services/admin-branding.service.js';
import { PNG_1X1 } from './helpers/image-fixtures.js';

describe('compensação storage vs persistência', () => {
  it('remove objeto novo se o banco falhar após put', async () => {
    const stored = new Map<string, Buffer>();
    const storage: FileStorage = {
      async put(storageKey, body) {
        stored.set(storageKey, body);
      },
      async get(storageKey) {
        const body = stored.get(storageKey);
        if (!body) {
          throw new Error('missing');
        }
        return body;
      },
      async delete(storageKey) {
        stored.delete(storageKey);
      },
    };

    const service = createAdminBrandingService({
      tenants: {
        findById: async (id: string) => ({
          id,
          name: 'acme',
          displayName: 'Acme',
          status: 'ACTIVE' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          deactivatedAt: null,
        }),
      } as never,
      branding: {
        findByTenantId: async () => null,
        setLogo: async () => {
          throw new Error('db fail');
        },
      } as never,
      files: {
        create: async () => {
          throw new Error('db fail');
        },
      } as never,
      storage,
    });

    await expect(
      service.uploadLogo('11111111-1111-4111-8111-111111111111', PNG_1X1, 'image/png'),
    ).rejects.toThrow('db fail');
    expect(stored.size).toBe(0);
  });
});
