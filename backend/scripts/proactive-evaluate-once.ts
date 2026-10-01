/**
 * Avaliação proativa local, sem worker e sem Conta Azul.
 *
 * Desenvolvimento (_dev ou _test, NODE_ENV diferente de production):
 *   cd backend && pnpm exec tsx scripts/proactive-evaluate-once.ts --tenant-id=<uuid>
 *   cd backend && pnpm exec tsx scripts/proactive-evaluate-once.ts --tenant-id=<uuid> --bootstrap
 *
 * Não imprime segredo, documento nem valor financeiro.
 * Não publica mensagem externa. Não sobe o worker.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { loadEnvironment } from '../src/config/env.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createProactiveTriggerRepository } from '../src/modules/advisor/repositories/proactive-trigger.repository.js';
import { createProactiveEvaluationRuntime } from '../src/modules/advisor/services/proactive-evaluation.runtime.js';
import { runProactiveTenantEvaluation } from '../src/modules/advisor/services/proactive-evaluation.service.js';
import { createProactiveTriggerBootstrap } from '../src/modules/advisor/services/proactive-trigger-bootstrap.service.js';

const rootEnvPath = resolve(process.cwd(), '../.env');
if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : null;
}

function databaseName(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
}

const tenantId = argument('tenant-id');
if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
  process.stderr.write('Informe --tenant-id=<uuid> de um banco local _dev ou _test.\n');
  process.exit(1);
}

const environment = loadEnvironment();
if (environment.nodeEnv === 'production') {
  process.stderr.write('Comando bloqueado em production.\n');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  process.stderr.write('DATABASE_URL ausente.\n');
  process.exit(1);
}
const name = databaseName(databaseUrl);
if (!name.endsWith('_dev') && !name.endsWith('_test')) {
  process.stderr.write('Comando permitido apenas em banco local _dev ou _test.\n');
  process.exit(1);
}

const prisma = getPrismaClient();
const runtime = createProactiveEvaluationRuntime(prisma, environment);

const summary = await (async () => {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  if (!tenant) {
    process.stderr.write('Tenant não encontrado neste banco local.\n');
    process.exit(1);
  }

  let bootstrap: { created: number; preserved: number; alreadyBootstrapped: boolean } | null = null;
  if (process.argv.includes('--bootstrap')) {
    bootstrap = await createProactiveTriggerBootstrap({
      prisma,
      triggers: createProactiveTriggerRepository(prisma),
    }).ensureDefaultPackage(tenantId);
  }

  const evaluation = await runProactiveTenantEvaluation(
    {
      engine: runtime.engine,
      insights: runtime.insights,
      enqueueNarration: async () => undefined,
    },
    tenantId,
  );

  const awaiting = await runtime.insights.listAwaitingNarration(tenantId);
  const failed = await prisma.aiInsight.findMany({
    where: { tenantId, narrationStatus: 'NARRATION_FAILED' },
    select: { id: true },
  });
  let narrated = 0;
  let narrationFailed = 0;
  for (const insight of [...awaiting, ...failed]) {
    try {
      const outcome = await runtime.narrate({ tenantId, insightId: insight.id });
      if (outcome === 'narrated') {
        narrated += 1;
      }
    } catch {
      narrationFailed += 1;
    }
  }

  return {
    bootstrap,
    evaluated: evaluation.evaluated,
    eventsCreated: evaluation.created,
    eventsReused: evaluation.reused,
    narrated,
    narrationFailed,
  };
})();

process.stdout.write(`${JSON.stringify({ event: 'proactive_evaluate_once', tenantId, ...summary })}\n`);
await disconnectPrisma();
