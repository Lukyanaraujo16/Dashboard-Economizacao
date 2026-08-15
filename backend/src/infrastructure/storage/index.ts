import type { Environment } from '../../config/env.js';
import type { FileStorage } from './file-storage.js';
import { createLocalFileStorage } from './local-file-storage.js';

export type { FileStorage, StoredObject } from './file-storage.js';
export { createLocalFileStorage } from './local-file-storage.js';
export { assertSafeStorageKey, isSafeStorageKey } from './storage-key.js';

export function createFileStorage(environment: Environment): FileStorage {
  return createLocalFileStorage(environment.storagePath);
}
