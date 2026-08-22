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
// Homologação real preenche o .env da raiz. A suíte usa fixtures oficiais,
// não as credenciais/APP_URL do ambiente DEV.
delete process.env.APP_URL;
delete process.env.CONTA_AZUL_CLIENT_ID;
delete process.env.CONTA_AZUL_CLIENT_SECRET;
delete process.env.CONTA_AZUL_REDIRECT_URI;
delete process.env.INTEGRATION_ENCRYPTION_KEY;
delete process.env.ALLOW_INSECURE_HTTP_SESSION;
