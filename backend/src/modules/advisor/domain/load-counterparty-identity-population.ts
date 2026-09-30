import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { civilMonthBoundsFromKey } from '../../analytics/domain/civil-calendar.js';
import type { LedgerReadRepository } from '../../finance/repositories/ledger-read.repository.js';
import type { PartyReadRepository } from '../../finance/repositories/party-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import type { AnalyticalPeriod } from './analytical/analytical-period.js';
import {
  assessCounterpartyOperation,
  resolveCounterpartyPeriodCoverage,
  type CounterpartyMovementInput,
  type CounterpartyProfileRole,
  type CounterpartyWinnerAssessment,
} from './counterparty-identity-quality.js';
import type { AnalyticalQuery } from './analytical/analytical-query.js';
import { civilYearBounds, civilYtdBounds } from './resolve-advisor-civil-range.js';

export type CounterpartyIdentityService = {
  load(input: {
    readonly tenantId: string;
    readonly direction: 'INFLOW' | 'OUTFLOW';
    readonly period: AnalyticalPeriod;
    readonly now?: Date;
  }): Promise<readonly CounterpartyMovementInput[]>;
};

export function createCounterpartyIdentityService(deps: {
  readonly ledger: LedgerReadRepository;
  readonly receivables: ReceivableReadRepository;
  readonly payables: PayableReadRepository;
  readonly parties: PartyReadRepository;
}): CounterpartyIdentityService {
  return {
    async load(input) {
      const bounds = counterpartyPeriodBounds(input.period, input.now);
      if (bounds === null) {
        return [];
      }
      const scope = { tenantId: input.tenantId };
      const settlements = await deps.ledger.listActiveForCounterpartyIdentity({
        ...scope,
        from: bounds.from,
        to: bounds.to,
      });
      const wantedType = input.direction === 'INFLOW' ? 'RECEIPT' : 'DISBURSEMENT';
      const wantedKind = input.direction === 'INFLOW' ? 'RECEIVABLE' : 'PAYABLE';
      const rows = settlements.filter((row) => row.transactionType === wantedType);
      const externalIds = [
        ...new Set(
          rows
            .filter((row) => row.installmentKind === wantedKind)
            .map((row) => row.installmentExternalId),
        ),
      ];
      const installments =
        wantedKind === 'RECEIVABLE'
          ? await deps.receivables.findByExternalIds(scope, externalIds)
          : await deps.payables.findByExternalIds(scope, externalIds);
      const installmentByKey = new Map(
        installments.map((row) => [`${row.integrationId}:${row.externalId}`, row] as const),
      );
      const partyIds = [
        ...new Set(
          installments
            .map((row) => row.partyId)
            .filter((id): id is string => id !== null && id.trim() !== ''),
        ),
      ];
      const identities = await deps.parties.findIdentitiesByIds(scope, partyIds);
      const partyById = new Map(identities.map((row) => [row.id, row] as const));

      return rows.map((row): CounterpartyMovementInput => {
        if (row.installmentKind !== wantedKind) {
          return {
            amount: row.netAmount.toFixed(4),
            sameScope: false,
            partyId: null,
            displayName: null,
            profiles: [],
            origin: 'MISSING',
          };
        }
        const installment = installmentByKey.get(`${row.integrationId}:${row.installmentExternalId}`);
        if (installment === undefined || installment.partyId === null) {
          return {
            amount: row.netAmount.toFixed(4),
            sameScope: false,
            partyId: null,
            displayName: null,
            profiles: [],
            origin: installment === undefined ? 'MISSING' : wantedKind,
          };
        }
        const party = partyById.get(installment.partyId);
        if (
          party === undefined ||
          party.tenantId !== input.tenantId ||
          party.integrationId !== row.integrationId
        ) {
          return {
            amount: row.netAmount.toFixed(4),
            sameScope: false,
            partyId: null,
            displayName: null,
            profiles: [],
            origin: wantedKind,
          };
        }
        return {
          amount: row.netAmount.toFixed(4),
          sameScope: true,
          partyId: party.id,
          displayName: party.name,
          profiles: party.profiles,
          origin: wantedKind,
        };
      });
    },
  };
}

export async function assessOfficialCounterpartyWinner(input: {
  readonly service: CounterpartyIdentityService;
  readonly tenantId: string;
  readonly query: AnalyticalQuery;
  readonly now?: Date;
}): Promise<CounterpartyWinnerAssessment> {
  const profile = input.query.filters?.partyProfile;
  const direction = input.query.direction;
  if ((profile !== 'CUSTOMER' && profile !== 'SUPPLIER') || (direction !== 'INFLOW' && direction !== 'OUTFLOW')) {
    throw new Error('EXECUTOR_DEPENDENCY_MISSING:counterpartyProfile');
  }
  const role: CounterpartyProfileRole = profile;
  const movements = await input.service.load({
    tenantId: input.tenantId,
    direction,
    period: input.query.period,
    now: input.now,
  });
  return assessCounterpartyOperation({
    movements,
    partyProfile: role,
    direction,
    period: input.query.period,
    periodCoverage: resolveCounterpartyPeriodCoverage(),
    query: input.query,
  });
}

export function counterpartyPeriodBounds(
  period: AnalyticalPeriod,
  now?: Date,
): { readonly from: Date; readonly to: Date } | null {
  if (period.kind === 'MONTH') {
    const bounds = civilMonthBoundsFromKey(period.monthKey);
    return { from: bounds.from, to: bounds.to };
  }
  if (period.kind === 'YEAR') {
    if (period.from !== undefined && period.to !== undefined) {
      return { from: period.from, to: period.to };
    }
    return civilYearBounds(period.year);
  }
  if (period.kind === 'YTD') {
    if (period.from !== undefined && period.to !== undefined) {
      return { from: period.from, to: period.to };
    }
    const ytd = civilYtdBounds(period.asOf ?? civilTodayInSaoPaulo(now ?? new Date()));
    return { from: ytd.from, to: ytd.to };
  }
  return null;
}
