import { Prisma } from '../../../generated/prisma/client.js';
import {
  addCivilDays,
  civilMonthBoundsFromKey,
  civilMonthKey,
} from '../../analytics/domain/civil-calendar.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import type { ContaAzulBalanceSnapshotRepository } from '../../integrations/conta-azul/repositories/balance-snapshot.repository.js';
import { listRevenueGoalHistoryMonthKeys } from '../domain/revenue-goal-math.js';
import type { DashboardCashBalanceHistoryResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from '../http/to-dashboard-overview-response.js';

/** Janela mensal do gráfico futuro: 12 meses terminando no mês selecionado. */
export const CASH_BALANCE_HISTORY_MONTHS = 12;

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
 * Cohort MVP: contas com `active=true` agora.
 * Dia consolidável só se TODAS as contas do cohort tiverem saldo conhecido
 * (snapshot do dia ou carry-forward após o primeiro snapshot da conta).
 * Sem backfill antes do primeiro snapshot; soma incompleta nunca vira ponto.
 *
 * Limitação: schema sem active-at-date histórico; `accountActiveAtCapture`
 * registra o estado na captura, mas o consolidado usa o cohort ativo atual.
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

      const activeAccounts = await deps.snapshots.listActiveAccountsByTenant(input.tenantId);
      const accountsIncluded = activeAccounts.length;
      const activeIds = [...activeAccounts.map((account) => account.id)];

      if (accountsIncluded === 0) {
        return emptyResponse(today, accountsIncluded);
      }

      const allSnapshots = await deps.snapshots.listByTenantAndDateRange({
        tenantId: input.tenantId,
        from: new Date(Date.UTC(1970, 0, 1)),
        to: dailyTo,
      });

      const firstMsByAccount = new Map<string, number>();
      const snapshotsByDate = new Map<string, Map<string, Prisma.Decimal>>();

      for (const snap of allSnapshots) {
        if (!activeIds.includes(snap.financialAccountId)) {
          continue;
        }
        const prev = firstMsByAccount.get(snap.financialAccountId);
        if (prev === undefined || snap.balanceDate.getTime() < prev) {
          firstMsByAccount.set(snap.financialAccountId, snap.balanceDate.getTime());
        }
        const dateKey = serializeCivilDate(snap.balanceDate);
        const dayMap = snapshotsByDate.get(dateKey) ?? new Map();
        dayMap.set(snap.financialAccountId, snap.balance);
        snapshotsByDate.set(dateKey, dayMap);
      }

      for (const accountId of activeIds) {
        if (!firstMsByAccount.has(accountId)) {
          return emptyResponse(today, accountsIncluded);
        }
      }

      const availableFromDate = new Date(
        Math.max(...[...firstMsByAccount.values()]),
      );
      const earliestAccountDate = new Date(
        Math.min(...[...firstMsByAccount.values()]),
      );
      const availableToDate = dailyTo;

      const lastByAccount = new Map<string, Prisma.Decimal>();
      const daily: { date: string; balance: string }[] = [];
      const lastCompleteByMonth = new Map<string, Prisma.Decimal>();

      // Aquecer carry-forward desde o primeiro snapshot individual (antes de availableFrom).
      let walk = earliestAccountDate;
      while (walk.getTime() <= dailyTo.getTime()) {
        const dateKey = serializeCivilDate(walk);
        const daySnaps = snapshotsByDate.get(dateKey);
        if (daySnaps) {
          for (const [accountId, balance] of daySnaps) {
            lastByAccount.set(accountId, balance);
          }
        }

        let complete = true;
        let sum = new Prisma.Decimal(0);
        for (const accountId of activeIds) {
          const firstMs = firstMsByAccount.get(accountId);
          if (firstMs === undefined || walk.getTime() < firstMs) {
            complete = false;
            break;
          }
          const known = lastByAccount.get(accountId);
          if (known === undefined) {
            complete = false;
            break;
          }
          sum = sum.plus(known);
        }

        if (complete && walk.getTime() >= availableFromDate.getTime()) {
          lastCompleteByMonth.set(civilMonthKey(walk), sum);
          if (
            walk.getTime() >= dailyBounds.from.getTime() &&
            walk.getTime() <= dailyTo.getTime()
          ) {
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
      const dailyWindowFrom =
        availableFromDate.getTime() > dailyBounds.from.getTime()
          ? availableFromDate
          : dailyBounds.from;
      const dailyExpectedDays = countCivilDaysInclusive(dailyWindowFrom, dailyTo);
      const coverage = resolveCoverage({
        pointCount,
        availableFrom: availableFromDate,
        rangeFrom: monthlyFrom,
        dailyExpectedDays,
        dailyPoints: daily.length,
      });

      return {
        today: serializeCivilDate(today),
        availableFrom: serializeCivilDate(availableFromDate),
        availableTo: serializeCivilDate(availableToDate),
        pointCount,
        accountsIncluded,
        coverage,
        daily,
        monthly,
      };
    },
  };
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
