/**
 * CASH-9C — ingestão de transferências entre contas próprias.
 *
 * LOCAL (banco _dev/_test, NODE_ENV != production):
 *   cd backend && pnpm exec tsx scripts/cash9c-transfers-backfill.ts --tenant=<uuid|name> --confirm=LOCAL
 *   cd backend && pnpm exec tsx scripts/cash9c-transfers-backfill.ts --tenant=<uuid|name> --confirm=LOCAL --from=2026-08-01 --to=2026-08-31
 *
 * PRODUÇÃO (banco real, NODE_ENV=production, tenant por tenant):
 *   cd backend && pnpm exec tsx scripts/cash9c-transfers-backfill.ts --tenant=<uuid|name> --confirm=PRODUCTION
 *   cd backend && pnpm exec tsx scripts/cash9c-transfers-backfill.ts --tenant=<uuid|name> --confirm=PRODUCTION --from=2026-08-01 --to=2026-08-31
 *
 * Sem dry-run/report-only nesta fase — execução sempre mutável após o guard.
 * Não dispara no worker. Não imprime tokens.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { loadEnvironment } from '../src/config/env.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { createContaAzulApiClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createContaAzulTokenClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-token-client.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulTransferRepository } from '../src/modules/integrations/conta-azul/repositories/transfer.repository.js';
import { createContaAzulOAuthService } from '../src/modules/integrations/conta-azul/services/conta-azul-oauth.service.js';
import { createContaAzulRateLimiter } from '../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';
import { createContaAzulTransferSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-transfer-sync.service.js';
import {
  assertTransferBackfillAllowed,
  classifyDatabaseName,
  databaseNameFromUrl,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-backfill-guard.js';
import { formatCivilDate, parseCivilDate, addCivilYears, utcCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import {
  CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
  CONTA_AZUL_SYNC_LOOKBACK_YEARS,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createMonthlyCashFlowService } from '../src/modules/analytics/services/monthly-cash-flow.service.js';
import { monthlyBilling } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import { Prisma } from '../src/generated/prisma/client.js';

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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const tenantArg = argValue(argv, 'tenant');
  const confirm = argValue(argv, 'confirm');
  const fromArg = argValue(argv, 'from');
  const toArg = argValue(argv, 'to');
  if (!tenantArg) {
    throw new Error('CASH-9C: --tenant=uuid|name é obrigatório.');
  }

  const environment = loadEnvironment();
  if (!environment.databaseUrl) {
    throw new Error('DATABASE_URL ausente.');
  }
  const databaseName = databaseNameFromUrl(environment.databaseUrl);
  assertTransferBackfillAllowed({
    nodeEnv: environment.nodeEnv,
    confirm,
    databaseName,
  });

  const today = utcCivilDate(new Date());
  const from = fromArg
    ? parseCivilDate(fromArg, 'from')
    : addCivilYears(today, -CONTA_AZUL_SYNC_LOOKBACK_YEARS);
  const to = toArg ? parseCivilDate(toArg, 'to') : addCivilYears(today, CONTA_AZUL_SYNC_LOOKAHEAD_YEARS);
  if (from.getTime() > to.getTime()) {
    throw new Error('CASH-9C: --from deve ser anterior ou igual a --to.');
  }

  const prisma = getPrismaClient();
  try {
    const table = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'financial_transfers'
      ) AS exists
    `;
    if (!table[0]?.exists) {
      throw new Error('CASH-9C: tabela financial_transfers ausente. Aplique a migration antes do backfill.');
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
      event: 'cash9c_backfill_start',
      tenantId: tenant.id,
      tenantName: tenant.name,
      integrationId: integration.id,
      integrationStatus: integration.status,
      confirmMode: confirm,
      databaseClassification: classifyDatabaseName(databaseName),
      from: formatCivilDate(from),
      to: formatCivilDate(to),
      note: 'tokens omitidos',
    });

    const contaAzul = environment.contaAzul;
    if (!contaAzul || !environment.integrationEncryptionKey) {
      throw new Error('Conta Azul ou chave de cifração não configurada.');
    }

    const oauth = createContaAzulOAuthService({
      tenants: createTenantRepository(prisma),
      integrations: createContaAzulIntegrationRepository(prisma),
      stateStore: {
        create: async () => {
          throw new Error('O backfill CASH-9C não inicia OAuth.');
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
    const transfers = createContaAzulTransferRepository(prisma);
    const sync = createContaAzulTransferSyncService({
      transfers,
      apiClient: createContaAzulApiClient(),
    });

    const summary = await sync.sync({
      scope: {
        tenantId: tenant.id,
        integrationId: integration.id,
        syncedAt: new Date(),
      },
      from,
      to,
      requestWithAuth: async (work) => {
        const token = await oauth.getValidAccessToken(tenant.id);
        return work(token);
      },
      gatedGet: async (work) => {
        await rateLimiter.wait();
        return work();
      },
    });
    logJson({ event: 'cash9c_sync_summary', ...summary });

    const rows = await transfers.listByOccurredOn(
      { tenantId: tenant.id, integrationId: integration.id },
      from,
      to,
    );
    const projected = await prisma.financialTransaction.findMany({
      where: {
        tenantId: tenant.id,
        integrationId: integration.id,
        financialTransferId: { not: null },
        occurredOn: { gte: from, lte: to },
      },
      select: {
        externalId: true,
        installmentExternalId: true,
        transactionType: true,
        lifecycleStatus: true,
        netAmount: true,
        occurredOn: true,
        financialAccountExternalId: true,
        financialTransferId: true,
      },
    });
    logJson({
      event: 'cash9c_transfers',
      count: rows.length,
      items: rows.map((row) => ({
        externalId: row.externalId,
        occurredOn: formatCivilDate(row.occurredOn),
        amount: row.amount.toFixed(),
        source: row.sourceFinancialAccountExternalId,
        destination: row.destinationFinancialAccountExternalId,
        matchStatus: row.matchStatus,
      })),
    });
    logJson({
      event: 'cash9c_projections',
      count: projected.length,
      excludedNet: projected
        .reduce((acc, row) => acc.add(row.netAmount), new Prisma.Decimal(0))
        .toFixed(),
      items: projected.map((row) => ({
        settlementExternalId: row.externalId,
        installmentExternalId: row.installmentExternalId,
        transactionType: row.transactionType,
        lifecycleStatus: row.lifecycleStatus,
        netAmount: row.netAmount.toFixed(),
        occurredOn: formatCivilDate(row.occurredOn),
        account: row.financialAccountExternalId,
      })),
    });

    const cashFlow = createMonthlyCashFlowService({
      ledger: createLedgerReadRepository(prisma),
      receivables: createReceivableReadRepository(prisma),
      payables: createPayableReadRepository(prisma),
      categories: createFinancialCategoryReadRepository(prisma),
    });
    const flow = await cashFlow.getMonthlyCashFlow({
      tenantId: tenant.id,
      integrationId: integration.id,
      monthKey: '2026-08',
    });
    const billing = monthlyBilling(flow);
    const expenses =
      flow.realized.outflows !== null && flow.expected.payables !== null
        ? flow.realized.outflows.plus(flow.expected.payables)
        : null;
    const result =
      billing !== null && expenses !== null ? billing.minus(expenses) : null;
    logJson({
      event: 'cash9c_agosto',
      realizedInflows: flow.realized.inflows?.toFixed() ?? null,
      expectedReceivables: flow.expected.receivables?.toFixed() ?? null,
      billing: billing?.toFixed() ?? null,
      realizedOutflows: flow.realized.outflows?.toFixed() ?? null,
      expectedPayables: flow.expected.payables?.toFixed() ?? null,
      monthlyExpenses: expenses?.toFixed() ?? null,
      managerialResult: result?.toFixed() ?? null,
      identity: {
        billing: 'realized.inflows + expected.receivables',
        monthlyExpenses: 'realized.outflows + expected.payables',
        result: 'billing - monthlyExpenses',
      },
    });
  } finally {
    await disconnectPrisma();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown';
  process.stderr.write(`${JSON.stringify({ event: 'cash9c_backfill_failed', message })}\n`);
  process.exit(1);
});
