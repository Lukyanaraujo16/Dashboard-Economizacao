import { buildApp } from './app/build-app.js';
import { loadEnvironment } from './config/env.js';
import { loadRootEnvFile } from './config/load-env-file.js';

loadRootEnvFile();

const environment = loadEnvironment();
const app = await buildApp();

try {
  await app.listen({ host: environment.host, port: environment.port });
} catch (error: unknown) {
  app.log.fatal({ err: error }, 'server_start_failed');
  process.exitCode = 1;
  await app.close();
}
