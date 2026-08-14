import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { resolveTestDatabaseUrl } from '../helpers/test-database.js';

const localEnvPath = resolve(process.cwd(), '../.env');
if (existsSync(localEnvPath)) {
  loadEnvFile(localEnvPath);
}

process.env.DATABASE_URL = resolveTestDatabaseUrl(process.env);
process.env.NODE_ENV = 'test';
