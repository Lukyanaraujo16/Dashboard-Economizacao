/**
 * CC1.1-FIX — backfill local EVENT_SCOPED_SINGLE_CENTER (AP OVER → amount = payable.total).
 *
 * Somente dados locais. Sem Conta Azul. Sem full sync.
 *
 * Uso:
 *   cd backend && pnpm exec tsx scripts/cc1-1-fix-event-scoped-backfill.ts --dry-run
 *   cd backend && pnpm exec tsx scripts/cc1-1-fix-event-scoped-backfill.ts --apply
 *   cd backend && pnpm exec tsx scripts/cc1-1-fix-event-scoped-backfill.ts --apply  # 2ª vez = 0
 *
 * Flags:
 *   --tenant=<name|uuid>  (default: clinica-life)
 *   --dry-run | --apply
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { Prisma } from '../src/generated/prisma/client.js';
import { loadEnvironment } from '../src/config/env.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { COST_CENTER_ALLOCATION_MONEY_EPSILON } from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-allocation-normalize.js';

const rootEnvPath = resolve(process.cwd(), '../.env');
if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

type Candidate = {
  allocationId: string;
  payableId: string;
  tenantId: string;
  beforeAmount: Prisma.Decimal;
  afterAmount: Prisma.Decimal;
  competenceMonth: string | null;
};

function parseArgs(argv: readonly string[]): {
  mode: 'dry-run' | 'apply';
  tenant: string;
} {
  let mode: 'dry-run' | 'apply' | null = null;
  let tenant = 'clinica-life';
  for (const arg of argv) {
    if (arg === '--dry-run') mode = 'dry-run';
    else if (arg === '--apply') mode = 'apply';
    else if (arg.startsWith('--tenant=')) tenant = arg.slice('--tenant='.length);
  }
  if (mode === null) {
    throw new Error('Informe --dry-run ou --apply');
  }
  return { mode, tenant };
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveTenantId(
  prisma: ReturnType<typeof getPrismaClient>,
  tenant: string,
): Promise<string> {
  if (UUID_RE.test(tenant)) {
    const byId = await prisma.tenant.findFirst({
      where: { id: tenant },
      select: { id: true },
    });
    if (byId) return byId.id;
  }
  const byName = await prisma.tenant.findFirst({
    where: { name: tenant },
    select: { id: true },
  });
  if (!byName) {
    throw new Error(`tenant_not_found:${tenant}`);
  }
  return byName.id;
}

/**
 * Candidatos: AP OVER com exatamente 1 allocation e amount > payable.total + ε.
 * Não toca AR, MATCH, PARTIAL, NO_ALLOCATION, multi-centro.
 */
export async function listEventScopedSingleCenterOverCandidates(
  prisma: ReturnType<typeof getPrismaClient>,
  tenantId: string,
): Promise<Candidate[]> {
  const payables = await prisma.payable.findMany({
    where: { tenantId },
    select: {
      id: true,
      total: true,
      competenceDate: true,
      costCenterAllocations: {
        select: { id: true, amount: true, tenantId: true },
      },
    },
  });

  const candidates: Candidate[] = [];
  for (const payable of payables) {
    const rows = payable.costCenterAllocations;
    if (rows.length !== 1) continue;
    const only = rows[0]!;
    if (only.tenantId !== tenantId) continue;
    if (!only.amount.greaterThan(payable.total.plus(COST_CENTER_ALLOCATION_MONEY_EPSILON))) {
      continue;
    }
    const competenceMonth =
      payable.competenceDate === null
        ? null
        : payable.competenceDate.toISOString().slice(0, 7);
    candidates.push({
      allocationId: only.id,
      payableId: payable.id,
      tenantId,
      beforeAmount: only.amount,
      afterAmount: payable.total,
      competenceMonth,
    });
  }
  return candidates;
}

export async function applyEventScopedSingleCenterBackfill(
  prisma: ReturnType<typeof getPrismaClient>,
  candidates: readonly Candidate[],
): Promise<number> {
  let updated = 0;
  for (const row of candidates) {
    const result = await prisma.installmentCostCenterAllocation.updateMany({
      where: {
        id: row.allocationId,
        tenantId: row.tenantId,
        payableId: row.payableId,
        // Idempotência: só altera se ainda estiver OVER
        amount: { gt: row.afterAmount },
      },
      data: {
        amount: row.afterAmount,
      },
    });
    updated += result.count;
  }
  return updated;
}

async function main(): Promise<void> {
  const { mode, tenant } = parseArgs(process.argv.slice(2));
  loadEnvironment();
  const prisma = getPrismaClient();

  try {
    const tenantId = await resolveTenantId(prisma, tenant);
    const candidates = await listEventScopedSingleCenterOverCandidates(prisma, tenantId);

    const beforeSum = candidates.reduce(
      (acc, row) => acc.plus(row.beforeAmount),
      new Prisma.Decimal(0),
    );
    const afterSum = candidates.reduce(
      (acc, row) => acc.plus(row.afterAmount),
      new Prisma.Decimal(0),
    );
    const byMonth = new Map<string, number>();
    for (const row of candidates) {
      const key = row.competenceMonth ?? 'null';
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
    }

    const summary = {
      mode,
      tenantId,
      candidates: candidates.length,
      beforeSumAllocationsTouched: money(beforeSum),
      afterSumAllocationsTouched: money(afterSum),
      deltaReduction: money(beforeSum.minus(afterSum)),
      byCompetenceMonth: Object.fromEntries([...byMonth.entries()].sort()),
      applied: 0,
    };

    if (mode === 'dry-run') {
      process.stdout.write(`${JSON.stringify({ ...summary, note: 'dry_run_no_writes' })}\n`);
      return;
    }

    const applied = await applyEventScopedSingleCenterBackfill(prisma, candidates);
    process.stdout.write(`${JSON.stringify({ ...summary, applied })}\n`);
  } finally {
    await disconnectPrisma();
  }
}

const isDirectRun =
  process.argv[1]?.includes('cc1-1-fix-event-scoped-backfill') === true;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
