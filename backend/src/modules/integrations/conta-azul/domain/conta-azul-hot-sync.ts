import { Prisma } from '../../../../generated/prisma/client.js';
import {
  civilMonthBounds,
  civilMonthBoundsFromKey,
  formatCivilDateKey,
  shiftCivilMonthKey,
} from '../../../analytics/domain/civil-calendar.js';
import { civilTodayInSaoPaulo } from '../../../analytics/domain/analytical-timezone.js';
import type { CostCenterDetailStatusValue } from './conta-azul-cost-center-detail-fetch.js';
import { COST_CENTER_DETAIL_RULE_VERSION } from './conta-azul-cost-center-detail-fetch.js';
import {
  buildDueDateWindows,
  type DueDateWindow,
} from './conta-azul-dates.js';
import type { MappedInstallment } from './conta-azul-financial-mappers.js';
import {
  CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
  CONTA_AZUL_SYNC_LOOKBACK_YEARS,
  CONTA_AZUL_SYNC_WINDOW_DAYS,
} from './conta-azul-sync.js';

/**
 * Alvo de revalidação dos rateios estáveis da janela quente.
 * O teto fixo de 40 e o stale de 6 h cobriam o horizonte de sete anos.
 * No hot sync o orçamento é metade da população estável por ciclo de 15 min,
 * então a população inteira é revisitada em cerca de 30 min, sem teto global.
 */
export const HOT_COST_CENTER_COVERAGE_TARGET_MS = 30 * 60 * 1000;

export const HOT_COST_CENTER_CYCLE_MS = 15 * 60 * 1000;

export type HotInstallmentBaseline = {
  readonly description: string | null;
  readonly dueDate: Date;
  readonly competenceDate: Date | null;
  readonly total: Prisma.Decimal;
  readonly paid: Prisma.Decimal;
  readonly unpaid: Prisma.Decimal;
  readonly status: string;
  readonly externalPartyId: string | null;
  readonly categoryExternalIds: readonly string[];
  readonly activeNetSum: Prisma.Decimal;
  readonly detailStatus: CostCenterDetailStatusValue;
  readonly detailSyncedAt: Date | null;
  readonly detailRuleVersion: number;
  readonly upstreamUpdatedAt: Date | null;
};

/** Mês civil anterior + mês civil atual em America/Sao_Paulo. */
export function buildHotSyncCivilWindow(now: Date): DueDateWindow {
  const current = civilMonthBounds(civilTodayInSaoPaulo(now));
  const previous = civilMonthBoundsFromKey(shiftCivilMonthKey(current.monthKey, -1));
  return {
    from: formatCivilDateKey(previous.from),
    to: formatCivilDateKey(current.to),
  };
}

/**
 * Envelope externo do horizonte histórico (5 anos + 2), numa faixa só.
 * A API aceitou esse intervalo em uma consulta junto com data_pagamento.
 * Não fatia em janelas de 90 dias.
 */
export function buildHistoricalDueHorizon(now: Date): DueDateWindow {
  const windows = buildDueDateWindows(now, {
    lookbackYears: CONTA_AZUL_SYNC_LOOKBACK_YEARS,
    lookaheadYears: CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
    windowDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
  });
  const first = windows[0];
  const last = windows[windows.length - 1];
  if (!first || !last) {
    throw new Error('Horizonte histórico de vencimento vazio.');
  }
  return { from: first.from, to: last.to };
}

/** Braço do pagamento sobrescreve o do vencimento quando o mesmo externalId aparece nos dois. */
export function dedupeHotInstallments(
  dueItems: readonly MappedInstallment[],
  paymentItems: readonly MappedInstallment[],
): MappedInstallment[] {
  const merged = new Map<string, MappedInstallment>();
  for (const item of dueItems) {
    merged.set(item.externalId, item);
  }
  for (const item of paymentItems) {
    merged.set(item.externalId, item);
  }
  return [...merged.values()];
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const a = [...left].sort();
  const b = [...right].sort();
  return a.every((id, index) => id === b[index]);
}

function sameInstant(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.getTime() === right.getTime();
}

export function hotTitleChanged(
  item: MappedInstallment,
  prior: HotInstallmentBaseline | null,
): boolean {
  if (!prior) {
    return true;
  }
  return (
    prior.description !== item.description ||
    prior.dueDate.getTime() !== item.dueDate.getTime() ||
    !sameInstant(prior.competenceDate, item.competenceDate) ||
    !prior.total.eq(item.total) ||
    !prior.paid.eq(item.paid) ||
    !prior.unpaid.eq(item.unpaid) ||
    prior.status !== item.status ||
    prior.externalPartyId !== item.externalPartyId ||
    !sameIds(prior.categoryExternalIds, item.categoryExternalIds)
  );
}

/**
 * Relê a baixa quando o estado listado não fecha com o ledger local.
 * Ausência na busca não entra aqui e não tomba nada.
 */
export function shouldRefetchHotSettlement(input: {
  readonly paid: Prisma.Decimal;
  readonly status: string;
  readonly prior: HotInstallmentBaseline | null;
}): boolean {
  if (!input.paid.gt(0)) {
    return false;
  }
  if (!input.prior) {
    return true;
  }
  if (!input.prior.paid.eq(input.paid) || input.prior.status !== input.status) {
    return true;
  }
  return !input.prior.activeNetSum.eq(input.paid);
}

export function isHotCostCenterUrgent(input: {
  readonly titleChanged: boolean;
  readonly detailStatus: CostCenterDetailStatusValue;
  readonly detailRuleVersion: number;
  readonly detailSyncedAt: Date | null;
  readonly upstreamUpdatedAt: Date | null;
  readonly currentRuleVersion?: number;
}): boolean {
  if (input.titleChanged) {
    return true;
  }
  if (input.detailStatus === 'UNKNOWN' || input.detailStatus === 'ERROR') {
    return true;
  }
  const ruleVersion = input.currentRuleVersion ?? COST_CENTER_DETAIL_RULE_VERSION;
  if (input.detailRuleVersion < ruleVersion) {
    return true;
  }
  if (input.upstreamUpdatedAt === null) {
    return false;
  }
  if (input.detailSyncedAt === null) {
    return true;
  }
  return input.upstreamUpdatedAt.getTime() > input.detailSyncedAt.getTime();
}

export function hotCostCenterRotationBudget(stableCount: number): number {
  if (stableCount <= 0) {
    return 0;
  }
  const cycles = Math.max(
    1,
    Math.ceil(HOT_COST_CENTER_COVERAGE_TARGET_MS / HOT_COST_CENTER_CYCLE_MS),
  );
  return Math.ceil(stableCount / cycles);
}

export type HotCostCenterRow = {
  readonly kind: 'RECEIVABLE' | 'PAYABLE';
  readonly externalId: string;
  readonly detailSyncedAt: Date | null;
  readonly urgent: boolean;
};

/**
 * Urgentes saem todos no mesmo ciclo. Estáveis usam o orçamento, mais antigos primeiro.
 * Não aplica o teto histórico de 40 nem espera 6 h.
 */
export function selectHotCostCenterRotation<T extends HotCostCenterRow>(
  rows: readonly T[],
  budget: number,
): { readonly urgent: T[]; readonly rotating: T[]; readonly deferred: number } {
  const urgent = rows.filter((row) => row.urgent);
  const stable = rows
    .filter((row) => !row.urgent)
    .sort((left, right) => {
      const leftAt = left.detailSyncedAt?.getTime() ?? 0;
      const rightAt = right.detailSyncedAt?.getTime() ?? 0;
      if (leftAt !== rightAt) {
        return leftAt - rightAt;
      }
      if (left.kind !== right.kind) {
        return left.kind.localeCompare(right.kind);
      }
      return left.externalId.localeCompare(right.externalId);
    });
  const rotating = stable.slice(0, Math.max(0, budget));
  return { urgent, rotating, deferred: stable.length - rotating.length };
}
