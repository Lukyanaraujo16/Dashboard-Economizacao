import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { loadEnvironment } from './config/env.js';
import { createBullmqRedisOptions } from './infrastructure/jobs/bullmq-connection.js';
import { createContaAzulManualSyncPublisher } from './infrastructure/jobs/conta-azul-manual-sync.queue.js';
import { createContaAzulManualSyncWorker } from './infrastructure/jobs/conta-azul-manual-sync.worker.js';
import { getPrismaClient } from './infrastructure/database/prisma.js';
import { createContaAzulApiClient } from './modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createContaAzulTokenClient } from './modules/integrations/conta-azul/connector/conta-azul-token-client.js';
import { createContaAzulFinancialRepository } from './modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from './modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulSyncRunRepository } from './modules/integrations/conta-azul/repositories/sync-run.repository.js';
import { createContaAzulOAuthService } from './modules/integrations/conta-azul/services/conta-azul-oauth.service.js';
import { createContaAzulRateLimiter } from './modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';
import { createContaAzulManualSyncEngine } from './modules/integrations/conta-azul/services/conta-azul-sync.engine.js';
import { createContaAzulSyncReconciler } from './modules/integrations/conta-azul/services/conta-azul-sync-reconcile.js';
import { createTenantRepository } from './modules/tenant/repositories/tenant.repository.js';

const rootEnvPath = resolve(process.cwd(), '../.env');
const localEnvPath = resolve(process.cwd(), '.env');
if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
} else if (existsSync(localEnvPath)) {
  loadEnvFile(localEnvPath);
}

const environment = loadEnvironment();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const syncRuns = createContaAzulSyncRunRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const contaAzul = environment.contaAzul;

if (!contaAzul || !environment.integrationEncryptionKey) {
  process.stderr.write('Worker Conta Azul: integração ou cifração não configurada.\n');
  process.exit(1);
}

const tokenClient = createContaAzulTokenClient({
  clientId: contaAzul.clientId,
  clientSecret: contaAzul.clientSecret,
});

const oauth = createContaAzulOAuthService({
  tenants,
  integrations,
  stateStore: {
    create: async () => {
      throw new Error('O worker não inicia OAuth.');
    },
    consume: async () => null,
  },
  tokenClient,
  contaAzul,
  encryptionKey: environment.integrationEncryptionKey,
});

const engine = createContaAzulManualSyncEngine({
  tenants,
  integrations,
  syncRuns,
  financial,
  apiClient: createContaAzulApiClient(),
  getValidAccessToken: (tenantId) => oauth.getValidAccessToken(tenantId),
  rateLimiter: createContaAzulRateLimiter(),
});

const worker = createContaAzulManualSyncWorker({
  connection: createBullmqRedisOptions(environment.redisUrl),
  nodeEnv: environment.nodeEnv,
  engine,
  syncRuns,
});

const publisher = createContaAzulManualSyncPublisher({
  connection: createBullmqRedisOptions(environment.redisUrl),
  nodeEnv: environment.nodeEnv,
});
const reconciler = createContaAzulSyncReconciler({
  syncRuns,
  getJobState: (syncRunId) => publisher.getJobState(syncRunId),
});

worker.on('ready', () => {
  process.stdout.write(
    'Worker Conta Azul pronto; aguardando jobs na fila conta-azul-manual-sync.\n',
  );
  void reconciler.reconcileActive().catch(() => {
    process.stderr.write('Worker Conta Azul: falha ao reconciliar runs órfãos.\n');
  });
});
worker.on('error', () => {
  process.stderr.write('Worker Conta Azul: erro de conexão com a fila.\n');
});

async function shutdown(): Promise<void> {
  await worker.close();
  await publisher.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

process.stdout.write('Worker Conta Azul (conta-azul-manual-sync) iniciado.\n');
