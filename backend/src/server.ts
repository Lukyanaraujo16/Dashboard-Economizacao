import { buildApp } from './app/build-app.js';
import { loadEnvironment } from './config/env.js';

const environment = loadEnvironment();
const app = buildApp();

try {
  await app.listen({ host: environment.host, port: environment.port });
} catch (error: unknown) {
  app.log.fatal({ err: error }, 'server_start_failed');
  process.exitCode = 1;
  await app.close();
}
