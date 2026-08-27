/**
 * CASH-7 — bootstrap/backfill explícito do ledger de baixas.
 *
 * Uso (somente LOCAL):
 *   cd backend && pnpm exec tsx scripts/cash7-ledger-backfill.ts --tenant=<uuid|name> --confirm=LOCAL
 *   cd backend && pnpm exec tsx scripts/cash7-ledger-backfill.ts --tenant=<uuid|name> --confirm=LOCAL --dry-run
 *   cd backend && pnpm exec tsx scripts/cash7-ledger-backfill.ts --tenant=<uuid|name> --confirm=LOCAL --report-only
 *
 * NÃO dispara automaticamente. NÃO executa produção.
 * Não imprime tokens.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { loadEnvironment } from '../src/config/env.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import {
  ContaAzulApiError,
  createContaAzulApiClient,
} from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createContaAzulTokenClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-token-client.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulOAuthService } from '../src/modules/integrations/conta-azul/services/conta-azul-oauth.service.js';
import { createContaAzulRateLimiter } from '../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';
import { createContaAzulLedgerBackfillService } from '../src/modules/integrations/conta-azul/services/conta-azul-ledger-backfill.service.js';
import {
  assertLedgerBackfillAllowed,
  databaseNameFromUrl,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-backfill-guard.js';
import { isInstallmentLedgerCovered } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-coverage.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createMonthlyCashFlowService } from '../src/modules/analytics/services/monthly-cash-flow.service.js';
import { monthlyBilling } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import { formatCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import {
  CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
  CONTA_AZUL_SYNC_LOOKBACK_YEARS,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';

const rootEnvPath = resolve(process.cwd(), '../.env');
if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function argValue(argv: readonly string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

function logJson(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function resolveTenantId(
  prisma: ReturnType<typeof getPrismaClient>,
  tenant: string,
): Promise<{ readonly id: string; readonly name: string; readonly displayName: string }> {
  if (UUID_RE.test(tenant)) {
    const byId = await prisma.tenant.findFirst({
      where: { id: tenant },
      select: { id: true, name: true, displayName: true },
    });
    if (byId) {
      return byId;
    }
  }
  const byName = await prisma.tenant.findFirst({
    where: { OR: [{ name: tenant }, { displayName: tenant }] },
    select: { id: true, name: true, displayName: true },
  });
  if (!byName) {
    throw new Error(`tenant_not_found:${tenant}`);
  }
  return byName;
}

function monthKeysAround(today: Date): readonly string[] {
  const keys: string[] = [];
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  for (let delta = -12; delta <= 0; delta += 1) {
    const date = new Date(Date.UTC(y, m + delta, 1));
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

async function coverageReport(
  prisma: ReturnType<typeof getPrismaClient>,
  tenantId: string,
  integrationId: string,
): Promise<Record<string, unknown>> {
  const ledger = createContaAzulLedgerRepository(prisma);
  const paid = await ledger.listPaidInstallments({ tenantId, integrationId });
  let covered = 0;
  let uncovered = 0;
  let paidSum = new Prisma.Decimal(0);
  let coveredGross = new Prisma.Decimal(0);
  for (const row of paid) {
    paidSum = paidSum.add(row.paid);
    const existing = await ledger.listByInstallment({ tenantId, integrationId }, row.externalId);
    if (isInstallmentLedgerCovered({ paid: row.paid, rows: existing })) {
      covered += 1;
      coveredGross = coveredGross.add(row.paid);
    } else {
      uncovered += 1;
    }
  }

  const oldestReceivable = await prisma.receivable.aggregate({
    where: { tenantId, integrationId },
    _min: { dueDate: true },
  });
  const oldestPayable = await prisma.payable.aggregate({
    where: { tenantId, integrationId },
    _min: { dueDate: true },
  });
  const ledgerRows = await prisma.financialTransaction.findMany({
    where: { tenantId, integrationId, lifecycleStatus: 'ACTIVE' },
    select: {
      occurredOn: true,
      transactionType: true,
      netAmount: true,
      grossAmount: true,
    },
  });
  const byType = {
    RECEIPT: { count: 0, gross: new Prisma.Decimal(0), net: new Prisma.Decimal(0) },
    DISBURSEMENT: { count: 0, gross: new Prisma.Decimal(0), net: new Prisma.Decimal(0) },
  };
  const byMonthMap = new Map<
    string,
    { receipts: number; disbursements: number; netIn: Prisma.Decimal; netOut: Prisma.Decimal }
  >();
  for (const row of ledgerRows) {
    const bucket = byType[row.transactionType];
    bucket.count += 1;
    bucket.gross = bucket.gross.add(row.grossAmount);
    bucket.net = bucket.net.add(row.netAmount);
    const month = formatCivilDate(row.occurredOn).slice(0, 7);
    const monthBucket = byMonthMap.get(month) ?? {
      receipts: 0,
      disbursements: 0,
      netIn: new Prisma.Decimal(0),
      netOut: new Prisma.Decimal(0),
    };
    if (row.transactionType === 'RECEIPT') {
      monthBucket.receipts += 1;
      monthBucket.netIn = monthBucket.netIn.add(row.netAmount);
    } else {
      monthBucket.disbursements += 1;
      monthBucket.netOut = monthBucket.netOut.add(row.netAmount);
    }
    byMonthMap.set(month, monthBucket);
  }

  const cashFlow = createMonthlyCashFlowService({
    ledger: createLedgerReadRepository(prisma),
    receivables: createReceivableReadRepository(prisma),
    payables: createPayableReadRepository(prisma),
  });
  const months: Record<string, unknown> = {};
  for (const monthKey of monthKeysAround(new Date())) {
    const flow = await cashFlow.getMonthlyCashFlow({ tenantId, monthKey });
    const billing = monthlyBilling(flow);
    const monthlyExpenses =
      flow.realized.outflows === null || flow.expected.payables === null
        ? null
        : flow.realized.outflows.add(flow.expected.payables).toString();
    const managerialResult =
      billing === null || monthlyExpenses === null
        ? null
        : new Prisma.Decimal(billing).sub(monthlyExpenses).toString();
    months[monthKey] = {
      billing: billing?.toString() ?? null,
      realizedInflows: flow.realized.inflows?.toString() ?? null,
      expectedReceivables: flow.expected.receivables?.toString() ?? null,
      overdueReceivables: flow.overdue.receivables?.toString() ?? null,
      realizedOutflows: flow.realized.outflows?.toString() ?? null,
      expectedPayables: flow.expected.payables?.toString() ?? null,
      overduePayables: flow.overdue.payables?.toString() ?? null,
      monthlyExpenses,
      managerialResult,
    };
  }

  return {
    paidInstallments: paid.length,
    coveredInstallments: covered,
    uncoveredInstallments: uncovered,
    coverageCountPercent: paid.length === 0 ? null : Math.round((covered / paid.length) * 10000) / 100,
    paidSum: paidSum.toString(),
    coveredGross: coveredGross.toString(),
    oldestReceivableDue: oldestReceivable._min.dueDate
      ? formatCivilDate(oldestReceivable._min.dueDate)
      : null,
    oldestPayableDue: oldestPayable._min.dueDate ? formatCivilDate(oldestPayable._min.dueDate) : null,
    syncHorizonYears: {
      lookback: CONTA_AZUL_SYNC_LOOKBACK_YEARS,
      lookahead: CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
    },
    ledgerByType: [
      {
        type: 'RECEIPT',
        count: byType.RECEIPT.count,
        gross: byType.RECEIPT.gross.toString(),
        net: byType.RECEIPT.net.toString(),
      },
      {
        type: 'DISBURSEMENT',
        count: byType.DISBURSEMENT.count,
        gross: byType.DISBURSEMENT.gross.toString(),
        net: byType.DISBURSEMENT.net.toString(),
      },
    ],
    ledgerByMonth: [...byMonthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({
        month,
        receipts: value.receipts,
        disbursements: value.disbursements,
        netIn: value.netIn.toString(),
        netOut: value.netOut.toString(),
      })),
    monthlyCashFlow: months,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const tenantArg = argValue(argv, 'tenant');
  const confirm = argValue(argv, 'confirm');
  const dryRun = hasFlag(argv, 'dry-run');
  const reportOnly = hasFlag(argv, 'report-only');
  if (!tenantArg) {
    throw new Error('CASH-7: --tenant=uuid|name é obrigatório.');
  }

  const environment = loadEnvironment();
  if (!environment.databaseUrl) {
    throw new Error('DATABASE_URL ausente.');
  }
  const databaseName = databaseNameFromUrl(environment.databaseUrl);
  assertLedgerBackfillAllowed({
    nodeEnv: environment.nodeEnv,
    confirm,
    databaseName,
  });

  const prisma = getPrismaClient();
  try {
    const table = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'financial_transactions'
      ) AS exists
    `;
    if (!table[0]?.exists) {
      throw new Error('CASH-7: tabela financial_transactions ausente. Aplique a migration no DEV local.');
    }

    const tenant = await resolveTenantId(prisma, tenantArg);
    const integration = await prisma.integration.findFirst({
      where: { tenantId: tenant.id, provider: 'CONTA_AZUL' },
      select: { id: true, status: true },
    });
    if (!integration) {
      throw new Error('integration_not_found');
    }
    if (integration.status !== 'CONNECTED') {
      throw new Error(`integration_not_connected:${integration.status}`);
    }

    logJson({
      event: 'cash7_backfill_start',
      tenantId: tenant.id,
      tenantName: tenant.name,
      integrationId: integration.id,
      integrationStatus: integration.status,
      databaseSuffix: databaseName.endsWith('_dev') ? '_dev' : '_test',
      dryRun,
      reportOnly,
      note: 'tokens omitidos',
    });

    if (reportOnly) {
      logJson({ event: 'cash7_coverage', ...(await coverageReport(prisma, tenant.id, integration.id)) });
      return;
    }

    const contaAzul = environment.contaAzul;
    if (!contaAzul || !environment.integrationEncryptionKey) {
      throw new Error('Conta Azul ou chave de cifração não configurada.');
    }

    const tenants = createTenantRepository(prisma);
    const integrations = createContaAzulIntegrationRepository(prisma);
    const oauth = createContaAzulOAuthService({
      tenants,
      integrations,
      stateStore: {
        create: async () => {
          throw new Error('O backfill CASH-7 não inicia OAuth.');
        },
        consume: async () => null,
      },
      tokenClient: createContaAzulTokenClient({
        clientId: contaAzul.clientId,
        clientSecret: contaAzul.clientSecret,
      }),
      contaAzul,
      encryptionKey: environment.integrationEncryptionKey,
      autoSyncIntervalMinutes: environment.autoSyncIntervalMinutes,
    });
    const rateLimiter = createContaAzulRateLimiter();
    const apiClient = createContaAzulApiClient();
    const ledger = createContaAzulLedgerRepository(prisma);
    const backfill = createContaAzulLedgerBackfillService({ prisma, ledger, apiClient });

    const summary = await backfill.run({
      scope: {
        tenantId: tenant.id,
        integrationId: integration.id,
        syncedAt: new Date(),
      },
      dryRun,
      requestWithAuth: async (work) => {
        let token = await oauth.getValidAccessToken(tenant.id);
        try {
          return await work(token);
        } catch (error) {
          if (!(error instanceof ContaAzulApiError) || error.kind !== 'unauthorized') {
            throw error;
          }
          token = await oauth.forceRefresh(tenant.id);
          await rateLimiter.wait();
          return work(token);
        }
      },
      gatedGet: async (work) => {
        await rateLimiter.wait();
        return work();
      },
    });
    logJson({ event: 'cash7_backfill_summary', ...summary });
    logJson({ event: 'cash7_coverage', ...(await coverageReport(prisma, tenant.id, integration.id)) });
  } finally {
    await disconnectPrisma();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  process.stderr.write(`${JSON.stringify({ event: 'cash7_backfill_failed', message })}\n`);
  process.exit(1);
});
