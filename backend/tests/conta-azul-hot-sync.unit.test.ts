import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  buildHistoricalDueHorizon,
  buildHotSyncCivilWindow,
  dedupeHotInstallments,
  hotCostCenterRotationBudget,
  hotTitleChanged,
  HOT_COST_CENTER_CYCLE_MS,
  isHotCostCenterUrgent,
  selectHotCostCenterRotation,
  shouldRefetchHotSettlement,
  type HotInstallmentBaseline,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-hot-sync.js';
import type { MappedInstallment } from '../src/modules/integrations/conta-azul/domain/conta-azul-financial-mappers.js';
import { COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC } from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-detail-fetch.js';

function installment(partial: Partial<MappedInstallment> & Pick<MappedInstallment, 'externalId'>): MappedInstallment {
  return {
    externalId: partial.externalId,
    description: partial.description ?? null,
    dueDate: partial.dueDate ?? new Date(Date.UTC(2026, 9, 10)),
    competenceDate: partial.competenceDate ?? null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: partial.upstreamUpdatedAt ?? null,
    status: partial.status ?? 'OPEN',
    upstreamStatus: null,
    total: partial.total ?? new Prisma.Decimal(10),
    paid: partial.paid ?? new Prisma.Decimal(0),
    unpaid: partial.unpaid ?? new Prisma.Decimal(10),
    externalPartyId: partial.externalPartyId ?? null,
    externalPartyName: partial.externalPartyName ?? null,
    categoryExternalIds: partial.categoryExternalIds ?? [],
  };
}

function baseline(partial: Partial<HotInstallmentBaseline> = {}): HotInstallmentBaseline {
  return {
    description: null,
    dueDate: new Date(Date.UTC(2026, 9, 10)),
    competenceDate: null,
    total: new Prisma.Decimal(10),
    paid: new Prisma.Decimal(0),
    unpaid: new Prisma.Decimal(10),
    status: 'OPEN',
    externalPartyId: null,
    categoryExternalIds: [],
    activeNetSum: new Prisma.Decimal(0),
    detailStatus: 'FETCHED',
    detailSyncedAt: new Date('2026-10-15T12:00:00.000Z'),
    detailRuleVersion: 1,
    upstreamUpdatedAt: null,
    ...partial,
  };
}

describe('Janela quente civil', () => {
  it('outubro usa setembro e outubro', () => {
    const window = buildHotSyncCivilWindow(new Date('2026-10-15T15:00:00.000Z'));
    expect(window).toEqual({ from: '2026-09-01', to: '2026-10-31' });
  });

  it('primeiro instante de outubro em São Paulo ainda não é setembro', () => {
    expect(buildHotSyncCivilWindow(new Date('2026-10-01T02:30:00.000Z'))).toEqual({
      from: '2026-08-01',
      to: '2026-09-30',
    });
    expect(buildHotSyncCivilWindow(new Date('2026-10-01T03:00:00.000Z'))).toEqual({
      from: '2026-09-01',
      to: '2026-10-31',
    });
  });

  it('último dia do mês permanece no mês corrente', () => {
    expect(buildHotSyncCivilWindow(new Date('2026-10-31T15:00:00.000Z'))).toEqual({
      from: '2026-09-01',
      to: '2026-10-31',
    });
  });

  it('dezembro vira para janeiro', () => {
    expect(buildHotSyncCivilWindow(new Date('2026-12-15T15:00:00.000Z'))).toEqual({
      from: '2026-11-01',
      to: '2026-12-31',
    });
    expect(buildHotSyncCivilWindow(new Date('2027-01-15T15:00:00.000Z'))).toEqual({
      from: '2026-12-01',
      to: '2027-01-31',
    });
  });

  it('fevereiro bissexto e comum', () => {
    expect(buildHotSyncCivilWindow(new Date('2024-02-10T15:00:00.000Z')).to).toBe('2024-02-29');
    expect(buildHotSyncCivilWindow(new Date('2025-02-10T15:00:00.000Z')).to).toBe('2025-02-28');
  });

  it('horizonte de vencimento da busca por pagamento é uma faixa só', () => {
    const horizon = buildHistoricalDueHorizon(new Date('2026-10-15T15:00:00.000Z'));
    expect(horizon.from).toBe('2021-10-15');
    expect(horizon.to).toBe('2028-10-15');
  });
});

describe('População quente', () => {
  it('deduplica por externalId e mantém o item só do braço de pagamento', () => {
    const due = [installment({ externalId: 'a', description: 'velho' })];
    const payment = [
      installment({ externalId: 'a', description: 'novo' }),
      installment({
        externalId: 'fora',
        dueDate: new Date(Date.UTC(2026, 7, 15)),
        paid: new Prisma.Decimal(10),
      }),
    ];
    const merged = dedupeHotInstallments(due, payment);
    expect(merged.map((item) => item.externalId).sort()).toEqual(['a', 'fora']);
    expect(merged.find((item) => item.externalId === 'a')?.description).toBe('novo');
    expect(merged.find((item) => item.externalId === 'fora')?.dueDate.toISOString()).toBe(
      '2026-08-15T00:00:00.000Z',
    );
  });
});

describe('Baixa quente', () => {
  it('relê parcela nova, paga alterada e soma divergente', () => {
    const paid = new Prisma.Decimal(10);
    expect(
      shouldRefetchHotSettlement({ paid, status: 'PAID', prior: null }),
    ).toBe(true);
    expect(
      shouldRefetchHotSettlement({
        paid,
        status: 'PAID',
        prior: baseline({ paid: new Prisma.Decimal(4), status: 'PARTIAL', activeNetSum: paid }),
      }),
    ).toBe(true);
    expect(
      shouldRefetchHotSettlement({
        paid,
        status: 'PAID',
        prior: baseline({ paid, status: 'PAID', activeNetSum: new Prisma.Decimal(4) }),
      }),
    ).toBe(true);
  });

  it('não relê quando pago, status e soma local fecham', () => {
    const paid = new Prisma.Decimal(10);
    expect(
      shouldRefetchHotSettlement({
        paid,
        status: 'PAID',
        prior: baseline({ paid, status: 'PAID', activeNetSum: paid }),
      }),
    ).toBe(false);
    expect(
      shouldRefetchHotSettlement({ paid: new Prisma.Decimal(0), status: 'OPEN', prior: null }),
    ).toBe(false);
  });

  it('página vazia não é sinal de exclusão neste módulo', () => {
    expect(dedupeHotInstallments([], []).length).toBe(0);
  });
});

describe('Centro de custo da janela quente', () => {
  it('urgente no mesmo ciclo, inclusive lote maior que o teto histórico', () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      kind: 'RECEIVABLE' as const,
      externalId: `u-${index}`,
      detailSyncedAt: null,
      urgent: true,
    }));
    const selected = selectHotCostCenterRotation(rows, hotCostCenterRotationBudget(0));
    expect(selected.urgent).toHaveLength(50);
    expect(selected.urgent.length).toBeGreaterThan(COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC);
    expect(selected.rotating).toHaveLength(0);
  });

  it('título alterado, erro e desconhecido são urgentes sem esperar 6 h', () => {
    expect(hotTitleChanged(installment({ externalId: 'n' }), null)).toBe(true);
    expect(
      hotTitleChanged(installment({ externalId: 'd', description: 'novo' }), baseline()),
    ).toBe(true);
    expect(
      isHotCostCenterUrgent({
        titleChanged: false,
        detailStatus: 'ERROR',
        detailRuleVersion: 1,
        detailSyncedAt: new Date(),
        upstreamUpdatedAt: null,
      }),
    ).toBe(true);
    expect(
      isHotCostCenterUrgent({
        titleChanged: false,
        detailStatus: 'UNKNOWN',
        detailRuleVersion: 0,
        detailSyncedAt: null,
        upstreamUpdatedAt: null,
      }),
    ).toBe(true);
    expect(
      isHotCostCenterUrgent({
        titleChanged: true,
        detailStatus: 'FETCHED',
        detailRuleVersion: 1,
        detailSyncedAt: new Date(),
        upstreamUpdatedAt: null,
      }),
    ).toBe(true);
  });

  it('população dentro do orçamento é toda revisada', () => {
    const rows = [0, 1, 2].map((index) => ({
      kind: 'PAYABLE' as const,
      externalId: `s-${index}`,
      detailSyncedAt: new Date(Date.UTC(2026, 9, index + 1)),
      urgent: false,
    }));
    const selected = selectHotCostCenterRotation(rows, rows.length);
    expect(selected.rotating).toHaveLength(3);
    expect(selected.deferred).toBe(0);
  });

  it('acima do orçamento reveza pelo detailSyncedAt mais antigo e não passa fome', () => {
    expect(HOT_COST_CENTER_CYCLE_MS).toBe(15 * 60 * 1000);
    const population = 100;
    expect(hotCostCenterRotationBudget(population)).toBe(50);
    expect(hotCostCenterRotationBudget(population)).toBeGreaterThan(
      COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC,
    );
    let rows = Array.from({ length: 4 }, (_, index) => ({
      kind: 'RECEIVABLE' as const,
      externalId: `e-${index}`,
      detailSyncedAt: new Date(Date.UTC(2026, 8, index + 1)),
      urgent: false,
    }));
    const seen = new Set<string>();
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const selected = selectHotCostCenterRotation(rows, hotCostCenterRotationBudget(rows.length));
      expect(selected.rotating).toHaveLength(2);
      const now = new Date(Date.UTC(2026, 10, cycle + 1));
      const taken = new Set(selected.rotating.map((row) => row.externalId));
      for (const id of taken) {
        seen.add(id);
      }
      rows = rows.map((row) =>
        taken.has(row.externalId) ? { ...row, detailSyncedAt: now } : row,
      );
    }
    expect([...seen].sort()).toEqual(['e-0', 'e-1', 'e-2', 'e-3']);
  });
});
