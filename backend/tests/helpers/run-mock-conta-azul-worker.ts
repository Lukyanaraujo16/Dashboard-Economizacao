import { createBullmqRedisOptions } from '../../src/infrastructure/jobs/bullmq-connection.js';
import { createContaAzulManualSyncWorker } from '../../src/infrastructure/jobs/conta-azul-manual-sync.worker.js';
import { getPrismaClient } from '../../src/infrastructure/database/prisma.js';
import { createContaAzulFinancialRepository } from '../../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulSyncRunRepository } from '../../src/modules/integrations/conta-azul/repositories/sync-run.repository.js';
import { createContaAzulRateLimiter } from '../../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';
import { createContaAzulManualSyncEngine } from '../../src/modules/integrations/conta-azul/services/conta-azul-sync.engine.js';
import { createTenantRepository } from '../../src/modules/tenant/repositories/tenant.repository.js';
import { createMockContaAzulApiClient } from './conta-azul-mock-api.js';

process.env.NODE_ENV = 'test';

const hangCategoriesMs = Number(process.env.MOCK_SYNC_HANG_MS ?? '0');
const lockDurationMs = Number(process.env.MOCK_LOCK_DURATION_MS ?? '2000');
const stalledIntervalMs = Number(process.env.MOCK_STALLED_INTERVAL_MS ?? '1000');
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

const prisma = getPrismaClient();
const engine = createContaAzulManualSyncEngine({
  tenants: createTenantRepository(prisma),
  integrations: createContaAzulIntegrationRepository(prisma),
  syncRuns: createContaAzulSyncRunRepository(prisma),
  financial: createContaAzulFinancialRepository(prisma),
  apiClient: createMockContaAzulApiClient({ hangCategoriesMs }),
  getValidAccessToken: async () => 'mock-access',
  rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
});

const worker = createContaAzulManualSyncWorker({
  connection: createBullmqRedisOptions(redisUrl),
  nodeEnv: 'test',
  engine,
  syncRuns: createContaAzulSyncRunRepository(prisma),
  lockDurationMs,
  stalledIntervalMs,
  maxStalledCount: 1,
});

worker.on('ready', () => {
  process.stdout.write('MOCK_WORKER_READY\n');
});

process.on('SIGTERM', () => {
  void worker.close().then(() => process.exit(0));
});
