/**
 * CC1.2 — dry-run de enriquecimento (somente leitura).
 * Estima quantos GET /parcelas/{id} seriam feitos vs skipped.
 * NÃO chama Conta Azul. NÃO altera dados.
 *
 * Uso:
 *   cd backend && pnpm exec tsx scripts/cc12-enrichment-dry-run.ts --tenant=clinica-life
 *   cd backend && pnpm exec tsx scripts/cc12-enrichment-dry-run.ts --tenant=<uuid>
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { loadEnvironment } from '../src/config/env.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import {
  COST_CENTER_DETAIL_RULE_VERSION,
  shouldFetchCostCenterDetail,
  type CostCenterDetailStatusValue,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-detail-fetch.js';

const rootEnvPath = resolve(process.cwd(), '../.env');
if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseTenant(argv: readonly string[]): string {
  for (const arg of argv) {
    if (arg.startsWith('--tenant=')) return arg.slice('--tenant='.length);
  }
  return 'clinica-life';
}

async function resolveTenantId(
  prisma: ReturnType<typeof getPrismaClient>,
  tenant: string,
): Promise<string> {
  if (UUID_RE.test(tenant)) {
    const byId = await prisma.tenant.findFirst({ where: { id: tenant }, select: { id: true } });
    if (byId) return byId.id;
  }
  const byName = await prisma.tenant.findFirst({ where: { name: tenant }, select: { id: true } });
  if (!byName) throw new Error(`tenant_not_found:${tenant}`);
  return byName.id;
}

async function main(): Promise<void> {
  const tenantArg = parseTenant(process.argv.slice(2));
  loadEnvironment();
  const prisma = getPrismaClient();
  try {
    const tenantId = await resolveTenantId(prisma, tenantArg);
    const integration = await prisma.integration.findFirst({
      where: { tenantId, provider: 'CONTA_AZUL' },
      select: { id: true },
    });
    if (!integration) throw new Error('integration_not_found');

    const select = {
      costCenterDetailStatus: true,
      costCenterDetailSyncedAt: true,
      costCenterDetailRuleVersion: true,
      upstreamUpdatedAt: true,
    } as const;

    const [receivables, payables] = await Promise.all([
      prisma.receivable.findMany({
        where: { tenantId, integrationId: integration.id },
        select,
      }),
      prisma.payable.findMany({
        where: { tenantId, integrationId: integration.id },
        select,
      }),
    ]);

    const byReason: Record<string, number> = {};
    let wouldFetch = 0;
    let wouldSkip = 0;
    const byStatus: Record<string, number> = {};

    for (const row of [...receivables, ...payables]) {
      const status = row.costCenterDetailStatus as CostCenterDetailStatusValue;
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      const decision = shouldFetchCostCenterDetail({
        status,
        detailSyncedAt: row.costCenterDetailSyncedAt,
        detailRuleVersion: row.costCenterDetailRuleVersion,
        upstreamUpdatedAt: row.upstreamUpdatedAt,
        currentRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
      });
      byReason[decision.reason] = (byReason[decision.reason] ?? 0) + 1;
      if (decision.shouldFetch) wouldFetch += 1;
      else wouldSkip += 1;
    }

    const total = receivables.length + payables.length;
    const estSecondsAt8Rps = wouldFetch === 0 ? 0 : Math.ceil(wouldFetch / 8);

    process.stdout.write(
      `${JSON.stringify(
        {
          mode: 'dry_run_readonly',
          tenantId,
          ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
          totalInstallments: total,
          receivables: receivables.length,
          payables: payables.length,
          byStatus,
          wouldFetch,
          wouldSkip,
          byReason,
          estimatedDetailSecondsAt8rps: estSecondsAt8Rps,
          note: 'Nao chama Conta Azul. Nao altera dados. Sync real requer autorizacao.',
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await disconnectPrisma();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
