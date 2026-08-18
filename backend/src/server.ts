import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { buildApp } from './app/build-app.js';
import { loadEnvironment } from './config/env.js';

const rootEnvPath = resolve(process.cwd(), '../.env');
const localEnvPath = resolve(process.cwd(), '.env');
if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
} else if (existsSync(localEnvPath)) {
  loadEnvFile(localEnvPath);
}

const environment = loadEnvironment();
const app = await buildApp();

try {
  await app.listen({ host: environment.host, port: environment.port });
} catch (error: unknown) {
  app.log.fatal({ err: error }, 'server_start_failed');
  process.exitCode = 1;
  await app.close();
}
