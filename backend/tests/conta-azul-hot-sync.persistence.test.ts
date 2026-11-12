import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import {
  ContaAzulApiError,
  type ContaAzulApiClient,
  type ContaAzulInstallmentSearchQuery,
} from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import {
  buildHistoricalDueHorizon,
  buildHistoricalDueWindows,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-hot-sync.js';
import { CONTA_AZUL_MAX_DUE_RANGE_DAYS } from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { createContaAzulCostCenterRepository } from '../src/modules/integrations/conta-azul/repositories/cost-center.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulSyncRunRepository } from '../src/modules/integrations/conta-azul/repositories/sync-run.repository.js';
import { createContaAzulCostCenterSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-cost-center-sync.service.js';
import { createContaAzulLedgerSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-ledger-sync.service.js';
import { createContaAzulRateLimiter } from '../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';
import { createContaAzulManualSyncEngine } from '../src/modules/integrations/conta-azul/services/conta-azul-sync.engine.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const NOW = new Date('2026-10-15T15:00:00.000Z');
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const syncRuns = createContaAzulSyncRunRepository(prisma);
const costCenters = createContaAzulCostCenterRepository(prisma);
const ledger = createContaAzulLedgerRepository(prisma);

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedConnected(name: string, withBaseline: boolean) {
  const environment = loadEnvironment();
  const tenant = await tenants.create({ name, displayName: name });
  const integration = await integrations.persistConnectedTokens({
    tenantId: tenant.id,
    encryptedAccessToken: encryptSecret('access', environment.integrationEncryptionKey!),
    encryptedRefreshToken: encryptSecret('refresh', environment.integrationEncryptionKey!),
    accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    tokenType: 'Bearer',
    at: new Date(),
  });
  await integrations.upsertExternalAccount({
    integrationId: integration.id,
    externalAccountId: `erp-${name}`,
    externalCompanyName: name,
    metadata: null,
  });
  if (withBaseline) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { lastSuccessfulSyncAt: new Date('2026-10-01T12:00:00.000Z') },
    });
  }
  return { tenant, integration };
}

function installment(input: {
  readonly id: string;
  readonly due: string;
  readonly paid?: string;
  readonly partyId?: string;
  readonly partyName?: string;
  readonly partyField?: 'cliente' | 'fornecedor';
}) {
  const paid = input.paid ?? '0.00';
  const partyField = input.partyField ?? 'cliente';
  return {
    id: input.id,
    descricao: 'Lancamento',
    data_vencimento: input.due,
    status_traduzido: paid === '0.00' ? 'EM_ABERTO' : 'RECEBIDO',
    total: '10.00',
    pago: paid,
    nao_pago: paid === '0.00' ? '10.00' : '0.00',
    [partyField]: input.partyId ? { id: input.partyId, nome: input.partyName } : undefined,
    categorias: [{ id: 'cat-1' }],
  };
}

function baixa(installmentId: string) {
  return [
    {
      id: `baixa-${installmentId}`,
      id_parcela: installmentId,
      data_pagamento: '2026-10-02',
      tipo_evento_financeiro: 'RECEITA',
      versao: 1,
      valor_composicao: {
        valor_bruto: '10.00',
        valor_liquido: '10.00',
      },
    },
  ];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reproduz a validação da API (12/11/2026): vencimento acima de 365 dias → HTTP 400. */
function assertDueRangeAccepted(query: ContaAzulInstallmentSearchQuery): void {
  const days =
    (Date.parse(`${query.dataVencimentoAte}T00:00:00Z`) -
      Date.parse(`${query.dataVencimentoDe}T00:00:00Z`)) /
      DAY_MS +
    1;
  if (days > CONTA_AZUL_MAX_DUE_RANGE_DAYS) {
    throw new ContaAzulApiError('unavailable', 'A Conta Azul recusou a consulta.', {
      httpStatus: 400,
      endpoint: '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
      upstreamCode: 'due_date_range_exceeded',
    });
  }
}

function dueInQuery(query: ContaAzulInstallmentSearchQuery, due: string): boolean {
  return query.dataVencimentoDe <= due && due <= query.dataVencimentoAte;
}

describe('Hot sync agendado', () => {
  it('une vencimento quente e pagamento com vencimento amplo, sem as 29 janelas', async () => {
    const { tenant, integration } = await seedConnected('hot-discovery', true);
    const other = await seedConnected('hot-other', false);
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: NOW },
      [
        {
          externalId: 'r-january',
          description: 'fechado',
          dueDate: new Date(Date.UTC(2026, 0, 15)),
          competenceDate: null,
          upstreamCreatedAt: null,
          upstreamUpdatedAt: null,
          status: 'OPEN',
          upstreamStatus: null,
          total: new Prisma.Decimal(3),
          paid: new Prisma.Decimal(0),
          unpaid: new Prisma.Decimal(3),
          externalPartyId: null,
          externalPartyName: null,
          categoryExternalIds: [],
        },
      ],
    );
    await financial.upsertReceivables(
      { tenantId: other.tenant.id, integrationId: other.integration.id, syncedAt: NOW },
      [
        {
          externalId: 'r-other',
          description: 'outro',
          dueDate: new Date(Date.UTC(2026, 9, 1)),
          competenceDate: null,
          upstreamCreatedAt: null,
          upstreamUpdatedAt: null,
          status: 'OPEN',
          upstreamStatus: null,
          total: new Prisma.Decimal(1),
          paid: new Prisma.Decimal(0),
          unpaid: new Prisma.Decimal(1),
          externalPartyId: null,
          externalPartyName: null,
          categoryExternalIds: [],
        },
      ],
    );
    await financial.upsertParties(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: NOW },
      [
        { externalId: 'p-new', name: 'Paciente', document: 'doc', active: true, profiles: ['CUSTOMER'] },
        { externalId: 'p-keep', name: 'Mantida', document: null, active: true, profiles: ['CUSTOMER'] },
      ],
    );

    const searches: Array<Record<string, string | number | undefined>> = [];
    const peopleQueries: Array<string | undefined> = [];
    const details: string[] = [];
    const settlements: string[] = [];
    let waits = 0;
    const rateLimiter = createContaAzulRateLimiter(0, async () => undefined);
    const waitForSlot = rateLimiter.wait.bind(rateLimiter);
    rateLimiter.wait = async () => {
      waits += 1;
      await waitForSlot();
    };
    const horizon = buildHistoricalDueHorizon(NOW);
    const client: ContaAzulApiClient = {
      getConnectedCompany: async () => ({}),
      getCategories: async () => ({
        itens_totais: 1,
        itens: [{ id: 'cat-1', nome: 'Receitas', tipo: 'RECEITA' }],
      }),
      getFinancialAccounts: async () => ({
        itens_totais: 1,
        itens: [{ id: 'acc-1', nome: 'Caixa', tipo: 'CONTA_CORRENTE', ativo: true }],
      }),
      getFinancialAccountCurrentBalance: async () => ({ saldo_atual: 10 }),
      getPeople: async (_token, query) => {
        peopleQueries.push(query.dataAlteracaoDe);
        return {
          itens_totais: 1,
          itens: [{ id: 'p-listed', nome: 'Listada', ativo: true, perfis: ['CLIENTE'] }],
        };
      },
      getCostCenters: async () => ({ itens_totais: 0, itens: [] }),
      searchReceivables: async (_token, query) => {
        assertDueRangeAccepted(query);
        searches.push({ kind: 'receivables', ...query });
        if (query.pagina > 1) {
          return { itens_totais: 2, itens: [] };
        }
        if (query.dataPagamentoDe) {
          if (!dueInQuery(query, '2026-08-15')) {
            return { itens_totais: 0, itens: [] };
          }
          return {
            itens_totais: 1,
            itens: [
              installment({
                id: 'r-outside',
                due: '2026-08-15',
                paid: '10.00',
                partyId: 'p-new',
                partyName: 'Bradesco',
              }),
            ],
          };
        }
        return {
          itens_totais: 1,
          itens: [installment({ id: 'r-inside', due: '2026-10-10', partyId: 'p-new', partyName: 'Bradesco' })],
        };
      },
      searchPayables: async (_token, query) => {
        assertDueRangeAccepted(query);
        searches.push({ kind: 'payables', ...query });
        if (query.pagina > 1 || query.dataPagamentoDe) {
          return { itens_totais: 0, itens: [] };
        }
        return {
          itens_totais: 1,
          itens: [
            installment({
              id: 'ap-inside',
              due: '2026-10-03',
              partyField: 'fornecedor',
              partyId: 'p-new',
              partyName: 'Bradesco',
            }),
          ],
        };
      },
      getInstallmentDetail: async (_token, id) => {
        details.push(id);
        return { id, evento: { rateio: [] } };
      },
      getInstallmentSettlements: async (_token, id) => {
        settlements.push(id);
        return id === 'r-outside' ? baixa(id) : [];
      },
      getSettlementById: async () => ({ kind: 'not_found' as const }),
      searchTransfers: async () => ({ itens_totais: 0, itens: [] }),
    };

    let millis = NOW.getTime();
    const engine = createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: client,
      costCenterSync: createContaAzulCostCenterSyncService({ costCenters, apiClient: client }),
      ledgerSync: createContaAzulLedgerSyncService({ prisma, ledger, apiClient: client }),
      getValidAccessToken: async () => 'access',
      rateLimiter,
      clock: () => new Date(millis),
    });

    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: NOW,
      triggerType: 'SCHEDULED',
    });
    await engine.execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });

    const receivableSearches = searches.filter((query) => query.kind === 'receivables');
    const dueSearches = receivableSearches.filter((query) => query.dataPagamentoDe === undefined);
    const paymentSearches = receivableSearches.filter((query) => query.dataPagamentoDe === '2026-09-01');
    expect(dueSearches).toHaveLength(1);
    expect(dueSearches[0]).toMatchObject({
      dataVencimentoDe: '2026-09-01',
      dataVencimentoAte: '2026-10-31',
    });
    const dueHorizonWindows = buildHistoricalDueWindows(NOW);
    expect(paymentSearches).toHaveLength(dueHorizonWindows.length);
    expect(
      paymentSearches.map((query) => ({ from: query.dataVencimentoDe, to: query.dataVencimentoAte })),
    ).toEqual(dueHorizonWindows);
    expect(paymentSearches[0]).toMatchObject({
      dataPagamentoDe: '2026-09-01',
      dataPagamentoAte: '2026-10-31',
      dataVencimentoDe: horizon.from,
    });
    expect(paymentSearches[paymentSearches.length - 1]).toMatchObject({
      dataVencimentoAte: horizon.to,
    });
    expect(receivableSearches).toHaveLength(1 + dueHorizonWindows.length);
    const payablePaymentSearches = searches.filter(
      (query) => query.kind === 'payables' && query.dataPagamentoDe === '2026-09-01',
    );
    expect(payablePaymentSearches).toHaveLength(dueHorizonWindows.length);

    const outside = await prisma.receivable.findFirstOrThrow({
      where: { integrationId: integration.id, externalId: 'r-outside' },
    });
    const inside = await prisma.receivable.findFirstOrThrow({
      where: { integrationId: integration.id, externalId: 'r-inside' },
    });
    const january = await prisma.receivable.findFirstOrThrow({
      where: { integrationId: integration.id, externalId: 'r-january' },
    });
    expect(outside.lifecycleStatus).toBe('ACTIVE');
    expect(inside.lifecycleStatus).toBe('ACTIVE');
    expect(january.lifecycleStatus).toBe('ACTIVE');
    expect(january.description).toBe('fechado');

    const party = await prisma.party.findFirstOrThrow({
      where: { integrationId: integration.id, externalId: 'p-new' },
    });
    const kept = await prisma.party.findFirstOrThrow({
      where: { integrationId: integration.id, externalId: 'p-keep' },
    });
    expect(party.name).toBe('Bradesco');
    expect(party.document).toBe('doc');
    expect(kept.active).toBe(true);
    expect(peopleQueries.every((value) => typeof value === 'string' && value.length > 0)).toBe(true);

    const otherRow = await prisma.receivable.findFirstOrThrow({
      where: { integrationId: other.integration.id, externalId: 'r-other' },
    });
    expect(otherRow.description).toBe('outro');

    expect(details.sort()).toEqual(['ap-inside', 'r-inside', 'r-outside']);
    expect(settlements).toContain('r-outside');
    expect(waits).toBeGreaterThanOrEqual(details.length);
    const transactions = await prisma.financialTransaction.count({
      where: { integrationId: integration.id, installmentExternalId: 'r-outside' },
    });
    expect(transactions).toBe(1);

    millis += 60_000;
    details.length = 0;
    const second = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: new Date(millis),
      triggerType: 'SCHEDULED',
    });
    await engine.execute({
      syncRunId: second.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(details.length).toBe(2);
    expect(await prisma.receivable.count({ where: { integrationId: integration.id, externalId: 'r-inside' } })).toBe(1);
    expect(
      await prisma.financialTransaction.count({
        where: { integrationId: integration.id, installmentExternalId: 'r-outside' },
      }),
    ).toBe(1);

    millis += 60_000;
    details.length = 0;
    const third = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: new Date(millis),
      triggerType: 'SCHEDULED',
    });
    await engine.execute({
      syncRunId: third.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(details.length).toBeGreaterThan(0);
  });

  describe('S2 — horizonte de pagamento fatiado em janelas de até 365 dias', () => {
    function baseClient(overrides: Partial<ContaAzulApiClient>): ContaAzulApiClient {
      return {
        getConnectedCompany: async () => ({}),
        getCategories: async () => ({ itens_totais: 0, itens: [] }),
        getFinancialAccounts: async () => ({ itens_totais: 0, itens: [] }),
        getFinancialAccountCurrentBalance: async () => ({ saldo_atual: 0 }),
        getPeople: async () => ({ itens_totais: 0, itens: [] }),
        getCostCenters: async () => ({ itens_totais: 0, itens: [] }),
        searchReceivables: async () => ({ itens_totais: 0, itens: [] }),
        searchPayables: async () => ({ itens_totais: 0, itens: [] }),
        getInstallmentDetail: async (_token, id) => ({ id, evento: { rateio: [] } }),
        getInstallmentSettlements: async () => [],
        getSettlementById: async () => ({ kind: 'not_found' as const }),
        searchTransfers: async () => ({ itens_totais: 0, itens: [] }),
        ...overrides,
      };
    }

    async function runScheduled(name: string, client: ContaAzulApiClient) {
      const { tenant, integration } = await seedConnected(name, true);
      const run = await syncRuns.createPending({
        tenantId: tenant.id,
        integrationId: integration.id,
        startedAt: NOW,
        triggerType: 'SCHEDULED',
      });
      const execution = createContaAzulManualSyncEngine({
        tenants,
        integrations,
        syncRuns,
        financial,
        apiClient: client,
        getValidAccessToken: async () => 'access-token-secreto',
        rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
        clock: () => NOW,
      }).execute({ syncRunId: run.id, tenantId: tenant.id, integrationId: integration.id });
      return { tenant, integration, run, execution };
    }

    it('fronteiras inclusivas: sem lacuna, sem duplicidade, com paginação por janela e dedupe entre braços', async () => {
      const windows = buildHistoricalDueWindows(NOW);
      const boundaryEnd = windows[2]!.to;
      const boundaryStart = windows[3]!.from;
      const paged = windows[5]!;
      const payablesPaymentWindows: string[] = [];
      const pagesByWindow = new Map<string, number[]>();
      const receivablesInPaymentArm = [
        installment({ id: 'r-edge-end', due: boundaryEnd, paid: '10.00' }),
        installment({ id: 'r-edge-start', due: boundaryStart, paid: '10.00' }),
        installment({ id: 'r-first-day', due: windows[0]!.from, paid: '10.00' }),
        installment({ id: 'r-last-day', due: windows[windows.length - 1]!.to, paid: '10.00' }),
        ...Array.from({ length: 101 }, (_, index) =>
          installment({ id: `r-page-${index}`, due: paged.from, paid: '10.00' }),
        ),
        // Também volta no braço de vencimento quente: deve virar uma linha só.
        { ...installment({ id: 'r-both', due: '2026-10-05', paid: '10.00' }), descricao: 'versao-pagamento' },
      ];
      const client = baseClient({
        searchReceivables: async (_token, query) => {
          assertDueRangeAccepted(query);
          if (!query.dataPagamentoDe) {
            return query.pagina === 1
              ? {
                  itens_totais: 1,
                  itens: [{ ...installment({ id: 'r-both', due: '2026-10-05' }), descricao: 'versao-vencimento' }],
                }
              : { itens_totais: 1, itens: [] };
          }
          const key = `${query.dataVencimentoDe}..${query.dataVencimentoAte}`;
          pagesByWindow.set(key, [...(pagesByWindow.get(key) ?? []), query.pagina]);
          const inWindow = receivablesInPaymentArm.filter((item) => dueInQuery(query, item.data_vencimento));
          const page = inWindow.slice((query.pagina - 1) * 100, query.pagina * 100);
          return { itens_totais: inWindow.length, itens: page };
        },
        searchPayables: async (_token, query) => {
          assertDueRangeAccepted(query);
          if (query.dataPagamentoDe) {
            payablesPaymentWindows.push(`${query.dataVencimentoDe}..${query.dataVencimentoAte}`);
          }
          return { itens_totais: 0, itens: [] };
        },
      });

      const { integration, run, execution } = await runScheduled('s2-boundaries', client);
      await execution;

      expect((await syncRuns.findById(run.id))?.status).toBe('SUCCESS');
      const rows = await prisma.receivable.findMany({
        where: { integrationId: integration.id },
        select: { externalId: true, description: true },
      });
      const ids = rows.map((row) => row.externalId);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(
        expect.arrayContaining(['r-edge-end', 'r-edge-start', 'r-first-day', 'r-last-day', 'r-both']),
      );
      expect(ids.filter((id) => id.startsWith('r-page-'))).toHaveLength(101);
      expect(rows).toHaveLength(receivablesInPaymentArm.length);
      expect(rows.find((row) => row.externalId === 'r-both')?.description).toBe('versao-pagamento');
      expect(pagesByWindow.get(`${paged.from}..${paged.to}`)).toEqual([1, 2]);
      expect(payablesPaymentWindows).toEqual(windows.map((window) => `${window.from}..${window.to}`));
    });

    it('recusa 400 da origem vira sync_upstream_rejected com diagnóstico seguro da etapa', async () => {
      const writes: string[] = [];
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        writes.push(String(chunk));
        return true;
      });
      try {
        const client = baseClient({
          searchReceivables: async (_token, query) => {
            if (query.dataPagamentoDe) {
              throw new ContaAzulApiError('unavailable', 'A Conta Azul recusou a consulta.', {
                httpStatus: 400,
                endpoint: '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
                upstreamCode: 'due_date_range_exceeded',
              });
            }
            return { itens_totais: 0, itens: [] };
          },
        });
        const { tenant, integration, run, execution } = await runScheduled('s2-rejected', client);
        await expect(execution).rejects.toMatchObject({ code: 'sync_upstream_rejected' });

        const stored = await syncRuns.findById(run.id);
        expect(stored).toMatchObject({ status: 'FAILED', errorCode: 'sync_upstream_rejected' });
        const lines = writes
          .flatMap((chunk) => chunk.split('\n'))
          .filter((line) => line.includes('conta_azul_sync_failure_diagnostic'));
        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0]!)).toEqual({
          event: 'conta_azul_sync_failure_diagnostic',
          syncRunId: run.id,
          tenantId: tenant.id,
          integrationId: integration.id,
          trigger: 'SCHEDULED',
          stage: 'hot_receivables_payment',
          errorCode: 'sync_upstream_rejected',
          failureKind: 'unavailable',
          httpStatus: 400,
          endpoint: '/v1/financeiro/eventos-financeiros/contas-a-receber/buscar',
          upstreamCode: 'due_date_range_exceeded',
        });
        expect(lines[0]).not.toMatch(/access-token-secreto|Bearer|dataVencimento|data_vencimento/);
        const integrationRow = await prisma.integration.findUniqueOrThrow({ where: { id: integration.id } });
        expect(integrationRow.status).toBe('CONNECTED');
      } finally {
        spy.mockRestore();
      }
    });
  });

  it('manual continua varrendo o horizonte amplo de vencimento', async () => {
    const { tenant, integration } = await seedConnected('hot-manual', false);
    const dueFrom = new Set<string>();
    const client: ContaAzulApiClient = {
      getConnectedCompany: async () => ({}),
      getCategories: async () => ({ itens_totais: 0, itens: [] }),
      getFinancialAccounts: async () => ({ itens_totais: 0, itens: [] }),
      getFinancialAccountCurrentBalance: async () => ({ saldo_atual: 0 }),
      getPeople: async () => ({ itens_totais: 0, itens: [] }),
      getCostCenters: async () => ({ itens_totais: 0, itens: [] }),
      searchReceivables: async (_token, query) => {
        if (!query.dataPagamentoDe) {
          dueFrom.add(query.dataVencimentoDe);
        }
        return { itens_totais: 0, itens: [] };
      },
      searchPayables: async () => ({ itens_totais: 0, itens: [] }),
      getInstallmentDetail: async () => ({ id: 'x', evento: { rateio: [] } }),
      getInstallmentSettlements: async () => [],
      getSettlementById: async () => ({ kind: 'not_found' as const }),
      searchTransfers: async () => ({ itens_totais: 0, itens: [] }),
    };
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: NOW,
      triggerType: 'MANUAL',
    });
    await createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: client,
      getValidAccessToken: async () => 'access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
      clock: () => NOW,
    }).execute({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(dueFrom.size).toBeGreaterThan(20);
  });
});
