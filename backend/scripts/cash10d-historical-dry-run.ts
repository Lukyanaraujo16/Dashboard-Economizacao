/**
 * CORREÇÃO 10-D — auditoria histórica READ-ONLY / DRY-RUN.
 *
 * NÃO muta banco. NÃO chama Conta Azul. NÃO faz backfill/tombstone/rematch persistido.
 *
 * Uso:
 *   cd backend && pnpm exec tsx scripts/cash10d-historical-dry-run.ts
 *
 * Saída: JSON consolidado em stdout (sem tokens/secrets).
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { decideTransferMatches } from '../src/modules/integrations/conta-azul/domain/conta-azul-transfer-match.js';
import { projectLocalTombstoneCandidates } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-tombstone-projection.js';
import { formatCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import {
  classifyDatabaseName,
  databaseNameFromUrl,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-backfill-guard.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createMonthlyCashFlowService } from '../src/modules/analytics/services/monthly-cash-flow.service.js';
import { monthlyBilling } from '../src/modules/analytics/domain/monthly-cash-flow.js';

const rootEnvPath = resolve(process.cwd(), '../.env');
if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

const PRIORITY = ['Clínica Life', 'Agência Blooty', 'Marielle Brito'];

type Dec = (n: Prisma.Decimal | number | string | null | undefined) => string;

const dec: Dec = (n) => {
  if (n === null || n === undefined) {
    return '0';
  }
  return new Prisma.Decimal(n).toFixed(2);
};

function monthKeyOf(date: Date): string {
  return formatCivilDate(date).slice(0, 7);
}

function money(n: Prisma.Decimal): number {
  return Number(n.toFixed(2));
}

async function main(): Promise<void> {
  const prisma = getPrismaClient();
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const databaseName = databaseNameFromUrl(databaseUrl);
  const databaseClass = classifyDatabaseName(databaseName);
  const cashFlow = createMonthlyCashFlowService({
    ledger: createLedgerReadRepository(prisma),
    receivables: createReceivableReadRepository(prisma),
    payables: createPayableReadRepository(prisma),
    categories: createFinancialCategoryReadRepository(prisma),
  });

  try {
    const tenants = await prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, displayName: true },
      orderBy: { displayName: 'asc' },
    });

    const ordered = [...tenants].sort((a, b) => {
      const an = a.displayName || a.name;
      const bn = b.displayName || b.name;
      const ai = PRIORITY.findIndex((p) => an.includes(p) || p.includes(an));
      const bi = PRIORITY.findIndex((p) => bn.includes(p) || p.includes(bn));
      const aw = ai === -1 ? 99 : ai;
      const bw = bi === -1 ? 99 : bi;
      if (aw !== bw) {
        return aw - bw;
      }
      return an.localeCompare(bn, 'pt-BR');
    });

    const report: Record<string, unknown> = {
      event: 'cash10d_historical_dry_run',
      mode: 'READ_ONLY',
      contaAzulCalled: false,
      mutations: false,
      databaseName,
      databaseClass,
      generatedAt: new Date().toISOString(),
      note:
        'Lifecycle dry-run é LOCAL-ONLY (sem lista upstream Conta Azul). wouldTombstone = candidatos over_covered com padrão de reemissão; R3 completo exige sync com API. Números de produção citados na auditoria 10 só são validáveis se o banco local for snapshot completo.',
      dataLimitations: {
        requiresFullProdSnapshotForLifeBlootyValidation: true,
        knownMissingTenantsIfAbsent: ['Agência Blooty'],
        knownLifeStaleInstallments: [
          '792e421e-65de-4116-84d4-203edf3ae454',
          '00fcc4f3-1ec7-458f-8560-b68aaa283711',
        ],
      },
      tenants: [] as unknown[],
      totals: {},
    };

    const global = {
      tenantsWithStaleCandidates: 0,
      installmentsWouldTombstone: 0,
      falseMatchesRemoved: 0,
      linksChanged: 0,
      transfersUnmatched: 0,
      transfersAmbiguous: 0,
      transfersMatched: 0,
      emptyTransferCatalog: [] as string[],
    };

    for (const tenant of ordered) {
      const label = tenant.displayName || tenant.name;
      const integration = await prisma.integration.findFirst({
        where: { tenantId: tenant.id },
        select: { id: true, status: true, lastSuccessfulSyncAt: true },
      });
      if (!integration) {
        (report.tenants as unknown[]).push({
          tenant: label,
          tenantId: tenant.id,
          integration: null,
          skip: 'sem integração',
        });
        continue;
      }

      const scope = { tenantId: tenant.id, integrationId: integration.id };

      // --- Lifecycle local projection ---
      const settlements = await prisma.financialTransaction.findMany({
        where: scope,
        select: {
          id: true,
          externalId: true,
          installmentExternalId: true,
          installmentKind: true,
          transactionType: true,
          occurredOn: true,
          netAmount: true,
          grossAmount: true,
          financialAccountExternalId: true,
          lifecycleStatus: true,
          financialTransferId: true,
          paymentMethod: true,
        },
        orderBy: [{ installmentExternalId: 'asc' }, { occurredOn: 'asc' }, { externalId: 'asc' }],
      });

      const paidByInstallment = new Map<string, Prisma.Decimal>();
      const receivables = await prisma.receivable.findMany({
        where: scope,
        select: { externalId: true, paid: true },
      });
      const payables = await prisma.payable.findMany({
        where: scope,
        select: { externalId: true, paid: true },
      });
      for (const row of receivables) {
        paidByInstallment.set(`RECEIVABLE:${row.externalId}`, row.paid);
      }
      for (const row of payables) {
        paidByInstallment.set(`PAYABLE:${row.externalId}`, row.paid);
      }

      const byInstallment = new Map<string, typeof settlements>();
      for (const row of settlements) {
        const key = `${row.installmentKind}:${row.installmentExternalId}`;
        const list = byInstallment.get(key) ?? [];
        list.push(row);
        byInstallment.set(key, list);
      }

      let installmentsEvaluated = 0;
      let wouldTombstone = 0;
      let overCovered = 0;
      let underCovered = 0;
      let covered = 0;
      let legitimateMulti = 0;
      let projectedInflowRemoved = new Prisma.Decimal(0);
      let projectedOutflowRemoved = new Prisma.Decimal(0);
      const staleCases: unknown[] = [];
      const lifeHighlight: unknown[] = [];

      const projectedDeletedIds = new Set<string>();

      for (const [key, rows] of byInstallment) {
        const active = rows.filter((r) => r.lifecycleStatus === 'ACTIVE');
        if (active.length === 0) {
          continue;
        }
        installmentsEvaluated += 1;
        const [kind, installmentExternalId] = key.split(':') as ['RECEIVABLE' | 'PAYABLE', string];
        const paid = paidByInstallment.get(key) ?? new Prisma.Decimal(0);
        const projection = projectLocalTombstoneCandidates({
          paid,
          rows: rows.map((r) => ({
            id: r.id,
            externalId: r.externalId,
            installmentExternalId: r.installmentExternalId,
            installmentKind: r.installmentKind as 'RECEIVABLE' | 'PAYABLE',
            transactionType: r.transactionType as 'RECEIPT' | 'DISBURSEMENT',
            occurredOn: r.occurredOn,
            netAmount: r.netAmount,
            grossAmount: r.grossAmount,
            financialAccountExternalId: r.financialAccountExternalId,
            lifecycleStatus: r.lifecycleStatus as 'ACTIVE' | 'DELETED',
          })),
        });
        const coverage = projection.coverage;
        if (coverage === 'over_covered') {
          overCovered += 1;
        } else if (coverage === 'under_covered') {
          underCovered += 1;
        } else if (coverage === 'covered') {
          covered += 1;
          if (active.length > 1) {
            legitimateMulti += 1;
          }
        }

        if (projection.mode === 'NONE') {
          continue;
        }

        if (projection.mode === 'HOLD_NO_IDENTICAL_PAIR') {
          staleCases.push({
            installmentExternalId,
            kind,
            coverage,
            paid: dec(paid),
            activeCount: active.length,
            activeSum: dec(active.reduce((a, r) => a.add(r.netAmount), new Prisma.Decimal(0))),
            mode: 'HOLD_NO_IDENTICAL_PAIR',
            note: 'over_covered sem padrão idêntico; exige reconcile R3 com upstream',
            externalIds: active.map((r) => r.externalId),
          });
          continue;
        }

        const candidateIds = [...projection.wouldDeleteIds];
        const candidateAmount = projection.projectedRemovedNet;
        for (const id of candidateIds) {
          projectedDeletedIds.add(id);
        }

        wouldTombstone += candidateIds.length;
        const sample = active[0]!;
        if (sample.transactionType === 'RECEIPT') {
          projectedInflowRemoved = projectedInflowRemoved.add(candidateAmount);
        } else {
          projectedOutflowRemoved = projectedOutflowRemoved.add(candidateAmount);
        }

        const caseRow = {
          installmentExternalId,
          kind,
          paid: dec(paid),
          activeCount: active.length,
          wouldTombstoneCount: candidateIds.length,
          projectedRemovedNet: dec(candidateAmount),
          transactionType: sample.transactionType,
          occurredOn: formatCivilDate(sample.occurredOn),
          externalIds: active.map((r) => ({
            externalId: r.externalId,
            net: dec(r.netAmount),
            wouldDelete: candidateIds.includes(r.id),
          })),
        };
        staleCases.push(caseRow);

        const amt = money(candidateAmount);
        if (
          /life/i.test(label) &&
          (Math.abs(amt - 2550.82) < 0.01 ||
            Math.abs(amt - 536.04) < 0.01 ||
            active.some((r) => Math.abs(money(r.netAmount) - 2550.82) < 0.01) ||
            active.some((r) => Math.abs(money(r.netAmount) - 536.04) < 0.01))
        ) {
          lifeHighlight.push(caseRow);
        }
      }

      if (wouldTombstone > 0) {
        global.tenantsWithStaleCandidates += 1;
        global.installmentsWouldTombstone += wouldTombstone;
      }

      // --- Transfer rematch (10-A) ---
      const transfers = await prisma.financialTransfer.findMany({
        where: scope,
        select: {
          id: true,
          externalId: true,
          occurredOn: true,
          amount: true,
          sourceFinancialAccountExternalId: true,
          destinationFinancialAccountExternalId: true,
          matchStatus: true,
        },
        orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
      });

      const settlementsForMatch = settlements.map((r) => ({
        id: r.id,
        occurredOn: r.occurredOn,
        netAmount: r.netAmount,
        financialAccountExternalId: r.financialAccountExternalId,
        lifecycleStatus: (projectedDeletedIds.has(r.id)
          ? 'DELETED'
          : r.lifecycleStatus) as 'ACTIVE' | 'DELETED',
        transactionType: r.transactionType as 'RECEIPT' | 'DISBURSEMENT',
      }));

      const decisions = decideTransferMatches(
        transfers.map((t) => ({
          id: t.id,
          occurredOn: t.occurredOn,
          amount: t.amount,
          sourceFinancialAccountExternalId: t.sourceFinancialAccountExternalId,
          destinationFinancialAccountExternalId: t.destinationFinancialAccountExternalId,
        })),
        settlementsForMatch,
      );

      const currentLinks = new Map(
        settlements
          .filter((s) => s.financialTransferId)
          .map((s) => [s.financialTransferId!, s.id]),
      );

      let matched = 0;
      let unmatched = 0;
      let ambiguous = 0;
      let linksRemoved = 0;
      let linksAdded = 0;
      let falseMatchFixed = 0;
      const rematchDetails: unknown[] = [];
      const life1313: unknown[] = [];

      for (const d of decisions) {
        if (d.status === 'MATCHED') {
          matched += 1;
        } else if (d.status === 'UNMATCHED') {
          unmatched += 1;
        } else {
          ambiguous += 1;
        }

        const transfer = transfers.find((t) => t.id === d.transferId)!;
        const currentSettlementId = currentLinks.get(transfer.id) ?? null;
        const projectedSettlementId = d.status === 'MATCHED' ? d.settlementId : null;
        const currentStatus = transfer.matchStatus;

        if (currentSettlementId && !projectedSettlementId) {
          linksRemoved += 1;
          if (currentStatus === 'MATCHED') {
            falseMatchFixed += 1;
          }
        }
        if (!currentSettlementId && projectedSettlementId) {
          linksAdded += 1;
        }
        if (
          currentSettlementId &&
          projectedSettlementId &&
          currentSettlementId !== projectedSettlementId
        ) {
          linksRemoved += 1;
          linksAdded += 1;
        }
        if (currentStatus !== d.status || currentSettlementId !== projectedSettlementId) {
          const detail = {
            transferExternalId: transfer.externalId,
            amount: dec(transfer.amount),
            occurredOn: formatCivilDate(transfer.occurredOn),
            currentStatus,
            projectedStatus: d.status,
            currentSettlementId,
            projectedSettlementId,
          };
          rematchDetails.push(detail);
          if (
            /life/i.test(label) &&
            Math.abs(money(transfer.amount) - 1313) < 0.01
          ) {
            life1313.push(detail);
          }
        }
      }

      global.falseMatchesRemoved += falseMatchFixed;
      global.linksChanged += rematchDetails.length;
      global.transfersUnmatched += unmatched;
      global.transfersAmbiguous += ambiguous;
      global.transfersMatched += matched;
      if (transfers.length === 0) {
        global.emptyTransferCatalog.push(label);
      }

      // Transfers por mês
      const transfersByMonth = new Map<string, number>();
      for (const t of transfers) {
        const mk = monthKeyOf(t.occurredOn);
        transfersByMonth.set(mk, (transfersByMonth.get(mk) ?? 0) + 1);
      }

      // Settlement months
      const months = new Set<string>();
      for (const s of settlements) {
        months.add(monthKeyOf(s.occurredOn));
      }
      for (const t of transfers) {
        months.add(monthKeyOf(t.occurredOn));
      }
      const monthKeys = [...months].sort();

      // --- Home projection by month ---
      const homeByMonth: unknown[] = [];
      const now = new Date('2026-09-06T12:00:00.000Z');

      // Pré-cálculo: impacto realized por rematch (settlements que saem/entram do exclusão transfer)
      // Settlement MATCHED (tem financialTransferId) NÃO entra no realized.
      // False match removido → settlement volta ao realized (+faturamento se RECEIPT).
      // Novo match → settlement sai do realized.

      for (const mk of monthKeys) {
        const flow = await cashFlow.getMonthlyCashFlow({
          tenantId: tenant.id,
          integrationId: integration.id,
          monthKey: mk,
          now,
        });
        const fatAtual = flow.realized.inflows;
        const despAtual = flow.realized.outflows;
        const resAtual =
          fatAtual !== null && despAtual !== null ? fatAtual.minus(despAtual) : null;
        const billing = monthlyBilling(flow);

        // Lifecycle impact in this month
        let lifeIn = new Prisma.Decimal(0);
        let lifeOut = new Prisma.Decimal(0);
        for (const s of settlements) {
          if (!projectedDeletedIds.has(s.id)) {
            continue;
          }
          if (monthKeyOf(s.occurredOn) !== mk) {
            continue;
          }
          // Só afeta Home se atualmente ACTIVE e sem transfer link
          if (s.lifecycleStatus !== 'ACTIVE') {
            continue;
          }
          if (s.financialTransferId) {
            continue; // já fora do realized
          }
          if (s.transactionType === 'RECEIPT') {
            lifeIn = lifeIn.add(s.netAmount);
          } else {
            lifeOut = lifeOut.add(s.netAmount);
          }
        }

        // Rematch impact in this month
        let rematchIn = new Prisma.Decimal(0);
        let rematchOut = new Prisma.Decimal(0);
        for (const d of decisions) {
          const transfer = transfers.find((t) => t.id === d.transferId)!;
          if (monthKeyOf(transfer.occurredOn) !== mk) {
            continue;
          }
          const currentSettlementId = currentLinks.get(transfer.id) ?? null;
          const projectedSettlementId = d.status === 'MATCHED' ? d.settlementId : null;

          // Link removido: settlement volta ao realized
          if (currentSettlementId && currentSettlementId !== projectedSettlementId) {
            const s = settlements.find((x) => x.id === currentSettlementId);
            if (s && s.lifecycleStatus === 'ACTIVE' && !projectedDeletedIds.has(s.id)) {
              if (s.transactionType === 'RECEIPT') {
                rematchIn = rematchIn.add(s.netAmount);
              } else {
                rematchOut = rematchOut.add(s.netAmount);
              }
            }
          }
          // Link adicionado: settlement sai do realized
          if (projectedSettlementId && projectedSettlementId !== currentSettlementId) {
            const s = settlements.find((x) => x.id === projectedSettlementId);
            if (s && s.lifecycleStatus === 'ACTIVE' && !projectedDeletedIds.has(s.id)) {
              if (s.transactionType === 'RECEIPT') {
                rematchIn = rematchIn.minus(s.netAmount);
              } else {
                rematchOut = rematchOut.minus(s.netAmount);
              }
            }
          }
        }

        const fatProj =
          fatAtual === null ? null : fatAtual.minus(lifeIn).plus(rematchIn);
        const despProj =
          despAtual === null ? null : despAtual.minus(lifeOut).plus(rematchOut);
        const resProj =
          fatProj !== null && despProj !== null ? fatProj.minus(despProj) : null;

        homeByMonth.push({
          monthKey: mk,
          faturamentoAtual: fatAtual === null ? null : dec(fatAtual),
          faturamentoProjetado: fatProj === null ? null : dec(fatProj),
          faturamentoDelta: fatAtual === null || fatProj === null ? null : dec(fatProj.minus(fatAtual)),
          despesasAtual: despAtual === null ? null : dec(despAtual),
          despesasProjetada: despProj === null ? null : dec(despProj),
          despesasDelta:
            despAtual === null || despProj === null ? null : dec(despProj.minus(despAtual)),
          resultadoAtual: resAtual === null ? null : dec(resAtual),
          resultadoProjetado: resProj === null ? null : dec(resProj),
          resultadoDelta:
            resAtual === null || resProj === null ? null : dec(resProj.minus(resAtual)),
          billingAtual: billing === null ? null : dec(billing),
          effects: {
            A_lifecycleInflowsRemoved: dec(lifeIn),
            A_lifecycleOutflowsRemoved: dec(lifeOut),
            B_rematchInflowsDelta: dec(rematchIn),
            B_rematchOutflowsDelta: dec(rematchOut),
          },
        });
      }

      // Known gaps (evidence-based notes, no invention)
      const transferGaps: unknown[] = [];
      if (/blooty/i.test(label)) {
        const aug = transfersByMonth.get('2026-08') ?? 0;
        transferGaps.push({
          evidence: 'known_prod_audit',
          monthKey: '2026-08',
          localTransferCount: aug,
          note:
            'Catálogo local de agosto = 0 apesar do Extrato Conta Azul conhecido com transferências. Backfill 10-B/script necessário; sem chamada CA nesta etapa.',
        });
      }
      if (/life/i.test(label)) {
        const augTransfers = transfers.filter((t) => monthKeyOf(t.occurredOn) === '2026-08');
        const has860 = augTransfers.some((t) => Math.abs(money(t.amount) - 860) < 0.01);
        const has1350 = augTransfers.some((t) => Math.abs(money(t.amount) - 1350.02) < 0.01);
        const knownStalePresent = await Promise.all(
          [
            '792e421e-65de-4116-84d4-203edf3ae454',
            '00fcc4f3-1ec7-458f-8560-b68aaa283711',
          ].map(async (installmentExternalId) => ({
            installmentExternalId,
            activeCount: await prisma.financialTransaction.count({
              where: {
                ...scope,
                installmentExternalId,
                lifecycleStatus: 'ACTIVE',
              },
            }),
          })),
        );
        transferGaps.push({
          evidence: 'known_prod_audit',
          monthKey: '2026-08',
          localTransferCount: augTransfers.length,
          knownMissing: [
            { date: '2026-08-27', amount: '860.00', presentLocally: has860 },
            { date: '2026-08-31', amount: '1350.02', presentLocally: has1350 },
          ],
          knownStaleInstallmentsInLocalDb: knownStalePresent,
        });
      }

      (report.tenants as unknown[]).push({
        tenant: label,
        tenantId: tenant.id,
        integrationId: integration.id,
        integrationStatus: integration.status,
        lastSuccessfulSyncAt: integration.lastSuccessfulSyncAt?.toISOString() ?? null,
        catalog: {
          settlements: settlements.length,
          settlementsActive: settlements.filter((s) => s.lifecycleStatus === 'ACTIVE').length,
          settlementsDeleted: settlements.filter((s) => s.lifecycleStatus === 'DELETED').length,
          transfers: transfers.length,
          transfersByMonth: Object.fromEntries([...transfersByMonth.entries()].sort()),
          monthsCovered: monthKeys,
        },
        lifecycleDryRun: {
          installmentsEvaluated,
          overCovered,
          underCovered,
          covered,
          legitimateMultiActiveCovered: legitimateMulti,
          wouldTombstone,
          skippedUnderCovered: underCovered,
          skippedFetchFailure: 0,
          noteFetch:
            'skippedFetchFailure=0 porque não houve chamada Conta Azul; R3 completo fica para sync mutável.',
          projectedInflowRemovedFromRealized: dec(projectedInflowRemoved),
          projectedOutflowRemovedFromRealized: dec(projectedOutflowRemoved),
          staleCases: staleCases.slice(0, 50),
          staleCasesTruncated: staleCases.length > 50,
          lifeHighlight,
        },
        transferRematchDryRun: {
          matched,
          unmatched,
          ambiguous,
          linksRemoved,
          linksAdded,
          falseMatchFixed,
          changes: rematchDetails.slice(0, 80),
          changesTruncated: rematchDetails.length > 80,
          life1313,
        },
        transferCatalogGaps: transferGaps,
        homeProjectionByMonth: homeByMonth,
      });
    }

    report.totals = global;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await disconnectPrisma();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      event: 'cash10d_historical_dry_run_failed',
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exit(1);
});
