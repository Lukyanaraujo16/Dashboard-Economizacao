import { Prisma } from '../../../generated/prisma/client.js';
import {
  addCivilDays,
  civilMonthBoundsFromKey,
  civilMonthKey,
} from '../../analytics/domain/civil-calendar.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import type { ContaAzulBalanceSnapshotRepository } from '../../integrations/conta-azul/repositories/balance-snapshot.repository.js';
import { listRevenueGoalHistoryMonthKeys } from '../domain/revenue-goal-math.js';
import type { OfficialBankBalanceBase } from '../../analytics/domain/projected-bank-balance.js';
import type { DashboardCashBalanceHistoryResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from '../http/to-dashboard-overview-response.js';

/** Janela mensal do gráfico futuro: 12 meses terminando no mês selecionado. */
export const CASH_BALANCE_HISTORY_MONTHS = 12;

/** Último dia consolidado da série diária — âncora da projeção, não ledger. */
export function officialBalanceBaseFromHistory(
  history: DashboardCashBalanceHistoryResponse,
): OfficialBankBalanceBase | null {
  if (history.coverage === 'none') {
    return null;
  }
  const last = history.daily[history.daily.length - 1];
  if (!last) {
    return null;
  }
  return {
    date: new Date(`${last.date}T00:00:00.000Z`),
    balance: new Prisma.Decimal(last.balance),
    coverage: history.coverage,
  };
}

/**
 * Último saldo oficial consolidado utilizável.
 * Se o mês corrente ainda não tem dia diário, recua ao último mês com série diária.
 * Não inventa R$ 0 e não reconstrói por ledger.
 */
export async function resolveOfficialBankBalanceBase(
  service: CashBalanceHistoryService,
  input: { readonly tenantId: string; readonly now: Date },
): Promise<OfficialBankBalanceBase | null> {
  const current = await service.getCashBalanceHistory({
    tenantId: input.tenantId,
    now: input.now,
  });
  const fromCurrent = officialBalanceBaseFromHistory(current);
  if (fromCurrent) {
    return fromCurrent;
  }
  const lastMonthly = current.monthly[current.monthly.length - 1];
  if (!lastMonthly) {
    return null;
  }
  const previous = await service.getCashBalanceHistory({
    tenantId: input.tenantId,
    monthKey: lastMonthly.monthKey,
    now: input.now,
  });
  return officialBalanceBaseFromHistory(previous);
}

export type CashBalanceHistoryService = {
  getCashBalanceHistory(input: {
    readonly tenantId: string;
    readonly monthKey?: string;
    readonly now?: Date;
  }): Promise<DashboardCashBalanceHistoryResponse>;
};

/**
 * Read model de saldo bancário a partir de snapshots reais (não ledger).
 *
 * 11-B / 08-C — conta participa do dia D se:
 * - firstSnapshot <= D
 * - E (active=true hoje OU D <= lastSnapshot)
 *
 * Conta ativa: carry-forward aberto após o primeiro snapshot.
 * Conta inativa: janela [firstSnapshot, lastSnapshot]; sem carry depois.
 *
 * Dia consolidável só se TODAS as participantes daquele dia tiverem saldo conhecido.
 * Conta cujo firstSnapshot é posterior a D simplesmente não participa (não invalida D).
 * Gaps nunca viram zero. Sem retroatividade antes do primeiro snapshot.
 *
 * `availableFrom` = data do primeiro dia consolidado publicado (metadata),
 * NÃO gate prévio baseado em ativas atuais.
 *
 * `accountsIncluded`: contas distintas na janela diária do mês selecionado.
 */
export function createCashBalanceHistoryService(deps: {
  readonly snapshots: ContaAzulBalanceSnapshotRepository;
}): CashBalanceHistoryService {
  return {
    async getCashBalanceHistory(input) {
      const today = civilTodayInSaoPaulo(input.now ?? new Date());
      const endMonthKey = input.monthKey ?? civilMonthKey(today);
      const monthKeys = listRevenueGoalHistoryMonthKeys(endMonthKey, CASH_BALANCE_HISTORY_MONTHS);
      const startMonthKey = monthKeys[0]!;
      const dailyBounds = civilMonthBoundsFromKey(endMonthKey);
      const monthlyFrom = civilMonthBoundsFromKey(startMonthKey).from;
      const dailyTo = dailyBounds.to.getTime() > today.getTime() ? today : dailyBounds.to;

      const accounts = await deps.snapshots.listAccountsByTenant(input.tenantId);
      const accountById = new Map(accounts.map((account) => [account.id, account] as const));

      if (accounts.length === 0) {
        return emptyResponse(today, 0);
      }

      const allSnapshots = await deps.snapshots.listByTenantAndDateRange({
        tenantId: input.tenantId,
        from: new Date(Date.UTC(1970, 0, 1)),
        to: dailyTo,
      });

      const firstMsByAccount = new Map<string, number>();
      const lastMsByAccount = new Map<string, number>();
      const snapshotsByDate = new Map<string, Map<string, Prisma.Decimal>>();

      for (const snap of allSnapshots) {
        if (!accountById.has(snap.financialAccountId)) {
          continue;
        }
        const prevFirst = firstMsByAccount.get(snap.financialAccountId);
        if (prevFirst === undefined || snap.balanceDate.getTime() < prevFirst) {
          firstMsByAccount.set(snap.financialAccountId, snap.balanceDate.getTime());
        }
        const prevLast = lastMsByAccount.get(snap.financialAccountId);
        if (prevLast === undefined || snap.balanceDate.getTime() > prevLast) {
          lastMsByAccount.set(snap.financialAccountId, snap.balanceDate.getTime());
        }
        const dateKey = serializeCivilDate(snap.balanceDate);
        const dayMap = snapshotsByDate.get(dateKey) ?? new Map();
        dayMap.set(snap.financialAccountId, snap.balance);
        snapshotsByDate.set(dateKey, dayMap);
      }

      if (firstMsByAccount.size === 0) {
        return emptyResponse(today, 0);
      }

      const earliestAccountDate = new Date(Math.min(...[...firstMsByAccount.values()]));
      const availableToDate = dailyTo;

      const lastByAccount = new Map<string, Prisma.Decimal>();
      const daily: { date: string; balance: string }[] = [];
      const lastCompleteByMonth = new Map<string, Prisma.Decimal>();
      const participatedIds = new Set<string>();
      let firstPublishedMs: number | null = null;

      let walk = earliestAccountDate;
      while (walk.getTime() <= dailyTo.getTime()) {
        const dateKey = serializeCivilDate(walk);
        const daySnaps = snapshotsByDate.get(dateKey);
        if (daySnaps) {
          for (const [accountId, balance] of daySnaps) {
            lastByAccount.set(accountId, balance);
          }
        }

        const participants = accounts.filter((account) =>
          participatesOnDay({
            active: account.active,
            firstMs: firstMsByAccount.get(account.id),
            lastMs: lastMsByAccount.get(account.id),
            dayMs: walk.getTime(),
          }),
        );

        let complete = participants.length > 0;
        let sum = new Prisma.Decimal(0);
        for (const account of participants) {
          const known = lastByAccount.get(account.id);
          if (known === undefined) {
            complete = false;
            break;
          }
          sum = sum.plus(known);
        }

        if (complete) {
          if (firstPublishedMs === null) {
            firstPublishedMs = walk.getTime();
          }
          lastCompleteByMonth.set(civilMonthKey(walk), sum);
          if (
            walk.getTime() >= dailyBounds.from.getTime() &&
            walk.getTime() <= dailyTo.getTime()
          ) {
            for (const account of participants) {
              participatedIds.add(account.id);
            }
            daily.push({ date: dateKey, balance: serializeDecimal(sum) });
          }
        }

        walk = addCivilDays(walk, 1);
      }

      const monthly: { monthKey: string; balance: string }[] = [];
      for (const key of monthKeys) {
        const balance = lastCompleteByMonth.get(key);
        if (balance !== undefined) {
          monthly.push({ monthKey: key, balance: serializeDecimal(balance) });
        }
      }

      const pointCount = daily.length + monthly.length;
      if (pointCount === 0 || firstPublishedMs === null) {
        return emptyResponse(today, 0);
      }

      const availableFromDate = new Date(firstPublishedMs);
      const monthDailyStartMs = Math.max(
        availableFromDate.getTime(),
        dailyBounds.from.getTime(),
      );
      const dailyExpectedDays =
        monthDailyStartMs > dailyTo.getTime()
          ? 0
          : countCivilDaysInclusive(new Date(monthDailyStartMs), dailyTo);

      return {
        today: serializeCivilDate(today),
        availableFrom: serializeCivilDate(availableFromDate),
        availableTo: serializeCivilDate(availableToDate),
        pointCount,
        accountsIncluded: participatedIds.size,
        coverage: resolveCoverage({
          pointCount,
          availableFrom: availableFromDate,
          rangeFrom: monthlyFrom,
          dailyExpectedDays,
          dailyPoints: daily.length,
        }),
        daily,
        monthly,
      };
    },
  };
}

function participatesOnDay(input: {
  readonly active: boolean;
  readonly firstMs: number | undefined;
  readonly lastMs: number | undefined;
  readonly dayMs: number;
}): boolean {
  if (input.firstMs === undefined || input.dayMs < input.firstMs) {
    return false;
  }
  if (input.active) {
    return true;
  }
  return input.lastMs !== undefined && input.dayMs <= input.lastMs;
}

function emptyResponse(
  today: Date,
  accountsIncluded: number,
): DashboardCashBalanceHistoryResponse {
  return {
    today: serializeCivilDate(today),
    availableFrom: null,
    availableTo: null,
    pointCount: 0,
    accountsIncluded,
    coverage: 'none',
    daily: [],
    monthly: [],
  };
}

function countCivilDaysInclusive(from: Date, to: Date): number {
  if (to.getTime() < from.getTime()) {
    return 0;
  }
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

function resolveCoverage(input: {
  readonly pointCount: number;
  readonly availableFrom: Date;
  readonly rangeFrom: Date;
  readonly dailyExpectedDays: number;
  readonly dailyPoints: number;
}): 'none' | 'partial' | 'available' {
  if (input.pointCount === 0) {
    return 'none';
  }
  if (
    input.availableFrom.getTime() > input.rangeFrom.getTime() ||
    input.dailyPoints < input.dailyExpectedDays
  ) {
    return 'partial';
  }
  return 'available';
}
