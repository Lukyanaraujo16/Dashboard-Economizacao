import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FileStorage } from './file-storage.js';
import { assertSafeStorageKey } from './storage-key.js';

function resolveSafePath(root: string, storageKey: string): string {
  assertSafeStorageKey(storageKey);
  const rootResolved = path.resolve(root);
  const target = path.resolve(rootResolved, storageKey);
  const relative = path.relative(rootResolved, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('storageKey inválida.');
  }
  return target;
}

export function createLocalFileStorage(root: string): FileStorage {
  const rootResolved = path.resolve(root);

  return {
    async put(storageKey, body) {
      const target = resolveSafePath(rootResolved, storageKey);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    },

    async get(storageKey) {
      const target = resolveSafePath(rootResolved, storageKey);
      return readFile(target);
    },

    async delete(storageKey) {
      const target = resolveSafePath(rootResolved, storageKey);
      try {
        await unlink(target);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return;
        }
        throw error;
      }
    },
  };
}
