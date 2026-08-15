import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { resolveTestDatabaseUrl } from '../helpers/test-database.js';
import { resolveTestStoragePath } from '../helpers/test-storage.js';

const localEnvPath = resolve(process.cwd(), '../.env');
if (existsSync(localEnvPath)) {
  loadEnvFile(localEnvPath);
}

process.env.DATABASE_URL = resolveTestDatabaseUrl(process.env);
process.env.TEST_STORAGE_PATH = resolveTestStoragePath(process.env);
process.env.STORAGE_PATH = process.env.TEST_STORAGE_PATH;
process.env.NODE_ENV = 'test';
