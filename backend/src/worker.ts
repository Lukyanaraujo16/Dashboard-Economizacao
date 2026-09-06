import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { loadEnvironment } from './config/env.js';
import { createBullmqRedisOptions } from './infrastructure/jobs/bullmq-connection.js';
import { createContaAzulManualSyncPublisher } from './infrastructure/jobs/conta-azul-manual-sync.queue.js';
import { createContaAzulManualSyncWorker } from './infrastructure/jobs/conta-azul-manual-sync.worker.js';
import { createContaAzulPlanSyncsScheduler } from './infrastructure/jobs/conta-azul-plan-syncs.queue.js';
import { createContaAzulPlanSyncsWorker } from './infrastructure/jobs/conta-azul-plan-syncs.worker.js';
import { getPrismaClient } from './infrastructure/database/prisma.js';
import { createContaAzulApiClient } from './modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createContaAzulTokenClient } from './modules/integrations/conta-azul/connector/conta-azul-token-client.js';
import { createContaAzulFinancialRepository } from './modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from './modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulCostCenterRepository } from './modules/integrations/conta-azul/repositories/cost-center.repository.js';
import { createContaAzulLedgerRepository } from './modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulSyncCursorRepository } from './modules/integrations/conta-azul/repositories/sync-cursor.repository.js';
import { createContaAzulSyncRunRepository } from './modules/integrations/conta-azul/repositories/sync-run.repository.js';
import { createContaAzulAutoSyncPlanner } from './modules/integrations/conta-azul/services/conta-azul-auto-sync.planner.js';
import { createContaAzulOAuthService } from './modules/integrations/conta-azul/services/conta-azul-oauth.service.js';
import { createContaAzulRateLimiter } from './modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';
import { createContaAzulCostCenterSyncService } from './modules/integrations/conta-azul/services/conta-azul-cost-center-sync.service.js';
import { createContaAzulLedgerSyncService } from './modules/integrations/conta-azul/services/conta-azul-ledger-sync.service.js';
import { createContaAzulTransferSyncService } from './modules/integrations/conta-azul/services/conta-azul-transfer-sync.service.js';
import { createContaAzulManualSyncEngine } from './modules/integrations/conta-azul/services/conta-azul-sync.engine.js';
import { createContaAzulSyncReconciler } from './modules/integrations/conta-azul/services/conta-azul-sync-reconcile.js';
import { createTenantRepository } from './modules/tenant/repositories/tenant.repository.js';
import { createContaAzulTransferRepository } from './modules/integrations/conta-azul/repositories/transfer.repository.js';

const rootEnvPath = resolve(process.cwd(), '../.env');
const localEnvPath = resolve(process.cwd(), '.env');
if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
} else if (existsSync(localEnvPath)) {
  loadEnvFile(localEnvPath);
}

function logAutoSync(
  event: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  process.stdout.write(`${JSON.stringify({ event, ...fields })}\n`);
}

const environment = loadEnvironment();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const syncRuns = createContaAzulSyncRunRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const costCenters = createContaAzulCostCenterRepository(prisma);
const apiClient = createContaAzulApiClient();
const costCenterSync = createContaAzulCostCenterSyncService({
  costCenters,
  apiClient,
});
const ledger = createContaAzulLedgerRepository(prisma);
const ledgerSync = createContaAzulLedgerSyncService({
  prisma,
  ledger,
  apiClient,
});
const transferSync = createContaAzulTransferSyncService({
  transfers: createContaAzulTransferRepository(prisma),
  apiClient,
});
const cursors = createContaAzulSyncCursorRepository(prisma);
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
  autoSyncIntervalMinutes: environment.autoSyncIntervalMinutes,
});

const engine = createContaAzulManualSyncEngine({
  tenants,
  integrations,
  syncRuns,
  financial,
  cursors,
  apiClient,
  costCenterSync,
  ledgerSync,
  transferSync,
  getValidAccessToken: (tenantId) => oauth.getValidAccessToken(tenantId),
  forceRefresh: (tenantId) => oauth.forceRefresh(tenantId),
  rateLimiter: createContaAzulRateLimiter(),
});

const connection = createBullmqRedisOptions(environment.redisUrl);
const worker = createContaAzulManualSyncWorker({
  connection,
  nodeEnv: environment.nodeEnv,
  engine,
  syncRuns,
});

const publisher = createContaAzulManualSyncPublisher({
  connection,
  nodeEnv: environment.nodeEnv,
});
const planner = createContaAzulAutoSyncPlanner({
  integrations,
  syncRuns,
  cursors,
  publisher,
  intervalMinutes: environment.autoSyncIntervalMinutes,
  log: (event, fields) => logAutoSync(event, fields),
});
const planScheduler = createContaAzulPlanSyncsScheduler({
  connection,
  nodeEnv: environment.nodeEnv,
});
const planWorker = createContaAzulPlanSyncsWorker({
  connection,
  nodeEnv: environment.nodeEnv,
  planner,
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
worker.on('active', (job) => {
  if (job?.data?.trigger === 'SCHEDULED') {
    logAutoSync('conta_azul_auto_sync_started', {
      tenantId: job.data.tenantId,
      integrationId: job.data.integrationId,
      syncRunId: job.data.syncRunId,
    });
  }
});
worker.on('completed', (job) => {
  if (job?.data?.trigger === 'SCHEDULED') {
    logAutoSync('conta_azul_auto_sync_succeeded', {
      tenantId: job.data.tenantId,
      integrationId: job.data.integrationId,
      syncRunId: job.data.syncRunId,
    });
  }
});
worker.on('failed', (job, error) => {
  if (job?.data?.trigger === 'SCHEDULED') {
    logAutoSync('conta_azul_auto_sync_failed', {
      tenantId: job.data.tenantId,
      integrationId: job.data.integrationId,
      syncRunId: job.data.syncRunId,
      errorCode:
        error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'sync_upstream_unavailable',
    });
  }
});
worker.on('error', () => {
  process.stderr.write('Worker Conta Azul: erro de conexão com a fila.\n');
});

planWorker.on('ready', () => {
  process.stdout.write('Planner Conta Azul pronto; scheduler global conta-azul-plan-syncs.\n');
  void planScheduler.upsert().catch(() => {
    process.stderr.write('Worker Conta Azul: falha ao registrar o Job Scheduler global.\n');
  });
});
planWorker.on('error', () => {
  process.stderr.write('Planner Conta Azul: erro de conexão com a fila.\n');
});

async function shutdown(): Promise<void> {
  await worker.close();
  await planWorker.close();
  await publisher.close();
  await planScheduler.close();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

process.stdout.write(
  'Worker Conta Azul (conta-azul-manual-sync + conta-azul-plan-syncs) iniciado.\n',
);
