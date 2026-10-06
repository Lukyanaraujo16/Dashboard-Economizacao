import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { ANALYTICAL_CAPABILITY_REGISTRY } from '../src/modules/advisor/domain/analytical/analytical-capability-registry.js';
import { validateAnalyticalCapability } from '../src/modules/advisor/domain/analytical/validate-analytical-capability.js';
import { parseAnalyticalConversationState } from '../src/modules/advisor/domain/analytical-conversation-state.js';
import { composeAdvisorDailyCashMovementAnswer } from '../src/modules/advisor/domain/compose-advisor-daily-cash-movement-answer.js';
import {
  parseDailyCashMovementConversationState,
  type DailyCashMovementConversationState,
} from '../src/modules/advisor/domain/daily-cash-movement-conversation-state.js';
import {
  resolveAdvisorCivilDay,
  resolveAdvisorDailyMovementDirection,
} from '../src/modules/advisor/domain/resolve-advisor-daily-cash-movement.js';
import { runAdvisorDailyCashMovement } from '../src/modules/advisor/domain/run-advisor-daily-cash-movement.js';
import type { CashRealizedDayDetails } from '../src/modules/analytics/domain/cash-realized-day-details.js';

const NOW = new Date('2026-08-26T15:00:00.000Z');
const EDGE = new Date('2026-08-26T02:00:00.000Z');

const CENTERS = [
  { id: 'cc-lar', name: 'Laranjeiras', active: true },
  { id: 'cc-jac', name: 'Jacaraípe', active: true },
];

function fact(input?: Partial<CashRealizedDayDetails>): CashRealizedDayDetails {
  return {
    date: '2026-08-25',
    direction: 'inflows',
    completeness: 'COMPLETE',
    total: new Prisma.Decimal('30'),
    returnedSum: new Prisma.Decimal('30'),
    difference: new Prisma.Decimal('0'),
    hasMore: false,
    itemCount: 1,
    limit: 40,
    items: [
      {
        occurredOn: new Date('2026-08-25T00:00:00.000Z'),
        attributedAmount: new Prisma.Decimal('30'),
        partyName: 'Empresa A',
        description: 'Atendimentos',
        displayLabel: 'Empresa A',
        categoryNames: ['Convênio'],
        costCenterLabel: null,
      },
    ],
    ...input,
  };
}

function harness(result: CashRealizedDayDetails | ((tenantId: string) => CashRealizedDayDetails)) {
  const calls: { tenantId: string; date: string; direction: string; costCenterId?: string }[] = [];
  return {
    calls,
    details: {
      getCashRealizedDayDetails: async (input: {
        tenantId: string;
        date: string;
        direction: 'inflows' | 'outflows';
        costCenterId?: string;
      }) => {
        calls.push(input);
        return typeof result === 'function' ? result(input.tenantId) : result;
      },
    },
    costCenters: {
      listByTenant: async (tenantId: string) => {
        if (tenantId !== 'tenant-a') {
          return [];
        }
        return CENTERS;
      },
    },
  };
}

async function ask(
  content: string,
  options?: {
    readonly prior?: DailyCashMovementConversationState | null;
    readonly tenantId?: string;
    readonly referenceMonthKey?: string | null;
    readonly now?: Date;
    readonly result?: CashRealizedDayDetails;
  },
) {
  const runtime = harness(options?.result ?? fact());
  const answered = await runAdvisorDailyCashMovement({
    content,
    referenceMonthKey: options?.referenceMonthKey === undefined ? '2026-08' : options.referenceMonthKey,
    now: options?.now ?? NOW,
    priorState: options?.prior ?? null,
    tenantId: options?.tenantId ?? 'tenant-a',
    details: runtime.details,
    costCenters: runtime.costCenters,
  });
  return { answered, calls: runtime.calls };
}

describe('Lia — movimentos do dia', () => {
  it('publica uma capability DAY e o registry continua deny-by-default', () => {
    expect(ANALYTICAL_CAPABILITY_REGISTRY).toHaveLength(34);
    expect(
      ANALYTICAL_CAPABILITY_REGISTRY.filter((item) => item.periodKinds.includes('DAY')).map(
        (item) => item.key,
      ),
    ).toEqual(['realized_cash.day.movements']);
    expect(
      validateAnalyticalCapability({
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'INFLOW',
        period: { kind: 'DAY', date: '2026-08-25' },
        operation: 'MOVEMENTS',
      }).ok,
    ).toBe(true);
    expect(
      validateAnalyticalCapability({
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'INFLOW',
        period: { kind: 'DAY', date: '2026-08-25' },
        operation: 'VALUE',
      }).ok,
    ).toBe(false);
    expect(
      validateAnalyticalCapability({
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'OUTFLOW',
        period: { kind: 'MONTH', monthKey: '2026-08' },
        operation: 'MOVEMENTS',
      }).ok,
    ).toBe(true);
    expect(
      validateAnalyticalCapability({
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'INFLOW',
        dimension: 'COUNTERPARTY',
        period: { kind: 'YTD', year: 2026, rangeKey: '2026-YTD' },
        operation: 'RANKING_WINNER',
        filters: { categoryReference: 'cat' },
        limit: 1,
      }).ok,
    ).toBe(true);
    expect(
      validateAnalyticalCapability({
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'INFLOW',
        dimension: 'COUNTERPARTY',
        period: { kind: 'YEAR', year: 2026, rangeKey: '2026', isPartialYear: false },
        operation: 'RANKING_WINNER',
        filters: { categoryReference: 'cat' },
        limit: 1,
      }).ok,
    ).toBe(true);
  });

  it('resolve datas determinísticas e rejeita data impossível', () => {
    expect(resolveAdvisorCivilDay({ content: '25/08', referenceMonthKey: '2026-08', now: NOW })).toEqual({
      status: 'RESOLVED',
      date: '2026-08-25',
    });
    expect(
      resolveAdvisorCivilDay({ content: '25/08/2024', referenceMonthKey: '2026-08', now: NOW }),
    ).toEqual({ status: 'RESOLVED', date: '2024-08-25' });
    expect(resolveAdvisorCivilDay({ content: 'dia 25', referenceMonthKey: '2026-08', now: NOW })).toEqual({
      status: 'RESOLVED',
      date: '2026-08-25',
    });
    expect(
      resolveAdvisorCivilDay({ content: '25 de agosto', referenceMonthKey: '2026-09', now: NOW }),
    ).toEqual({ status: 'RESOLVED', date: '2026-08-25' });
    expect(
      resolveAdvisorCivilDay({
        content: '25 de agosto de 2026',
        referenceMonthKey: '2027-01',
        now: NOW,
      }),
    ).toEqual({ status: 'RESOLVED', date: '2026-08-25' });
    expect(resolveAdvisorCivilDay({ content: 'hoje', referenceMonthKey: '2026-01', now: EDGE })).toEqual({
      status: 'RESOLVED',
      date: '2026-08-25',
    });
    expect(resolveAdvisorCivilDay({ content: 'ontem', referenceMonthKey: null, now: EDGE })).toEqual({
      status: 'RESOLVED',
      date: '2026-08-24',
    });
    expect(resolveAdvisorCivilDay({ content: 'anteontem', referenceMonthKey: null, now: EDGE })).toEqual({
      status: 'RESOLVED',
      date: '2026-08-23',
    });
    expect(
      resolveAdvisorCivilDay({ content: '31/02/2026', referenceMonthKey: '2026-08', now: NOW }).status,
    ).toBe('INVALID');
    expect(resolveAdvisorDailyMovementDirection('o que recebi')).toBe('INFLOW');
    expect(resolveAdvisorDailyMovementDirection('quem me pagou')).toBe('INFLOW');
    expect(resolveAdvisorDailyMovementDirection('de onde veio')).toBe('INFLOW');
    expect(resolveAdvisorDailyMovementDirection('o que paguei')).toBe('OUTFLOW');
    expect(resolveAdvisorDailyMovementDirection('para onde foi')).toBe('OUTFLOW');
    expect(resolveAdvisorDailyMovementDirection('com o que gastei')).toBe('OUTFLOW');
    expect(resolveAdvisorDailyMovementDirection('qual foi meu faturamento')).toBeNull();
  });

  it('responde o que recebi e o que paguei sem herdar centro', async () => {
    const received = await ask('O que recebi no dia 25 de agosto de 2026?');
    expect(received.calls[0]).toMatchObject({
      tenantId: 'tenant-a',
      date: '2026-08-25',
      direction: 'inflows',
    });
    expect(received.calls[0]?.costCenterId).toBeUndefined();
    expect(received.answered?.answer).toContain('entraram');
    expect(received.answered?.answer).toContain('Empresa A');
    expect(received.answered?.answer).toContain('Os recebimentos foram');

    const paid = await ask('O que paguei no dia 25 de agosto de 2026?', {
      result: fact({ direction: 'outflows' }),
    });
    expect(paid.calls[0]?.direction).toBe('outflows');
    expect(paid.answered?.answer).toContain('pagamentos');
  });

  it('centro explícito, follow-up e todos os centros', async () => {
    const first = await ask('O que paguei no dia 25 de agosto em Laranjeiras?', {
      result: fact({ direction: 'outflows' }),
    });
    expect(first.calls[0]?.costCenterId).toBe('cc-lar');
    expect(first.answered?.state?.costCenterQuery).toBe('laranjeiras');
    expect(first.answered?.state?.date).toBe('2026-08-25');
    expect(first.answered?.state?.direction).toBe('OUTFLOW');

    const follow = await ask('E em Jacaraípe?', {
      prior: first.answered?.state ?? null,
      result: fact({ direction: 'outflows' }),
    });
    expect(follow.calls[0]).toMatchObject({
      date: '2026-08-25',
      direction: 'outflows',
      costCenterId: 'cc-jac',
    });

    const all = await ask('e em todos os centros?', {
      prior: follow.answered?.state ?? null,
      result: fact({ direction: 'outflows' }),
    });
    expect(all.calls[0]?.costCenterId).toBeUndefined();
    expect(all.answered?.state?.costCenterQuery).toBeNull();
    expect(all.answered?.state?.direction).toBe('OUTFLOW');

    const fresh = await ask('O que recebi dia 25?', { prior: first.answered?.state ?? null });
    expect(fresh.calls[0]?.costCenterId).toBeUndefined();
  });

  it('não executa data inválida, centro inexistente nem inventa lançamento', async () => {
    const invalid = await ask('O que recebi em 31/02/2026?');
    expect(invalid.calls).toHaveLength(0);
    expect(invalid.answered?.answer).toMatch(/não existe/i);

    const missing = await ask('O que paguei dia 25 em Centro Fantasma?');
    expect(missing.calls).toHaveLength(0);
    expect(missing.answered?.answer).toMatch(/Não encontrei o centro/);

    const unavailable = await ask('O que recebi dia 25?', {
      result: fact({
        completeness: 'UNAVAILABLE',
        total: null,
        returnedSum: null,
        difference: null,
        items: [],
        itemCount: 0,
      }),
    });
    expect(unavailable.answered?.answer).not.toMatch(/R\$\s*0/);
    expect(unavailable.answered?.answer).toMatch(/não consigo detalhar/i);

    const partial = composeAdvisorDailyCashMovementAnswer({
      kind: 'DAILY_CASH_MOVEMENTS',
      status: 'PARTIAL',
      date: '2026-08-25',
      direction: 'INFLOW',
      costCenterName: null,
      total: '100',
      returnedSum: '40',
      difference: '60',
      hasMore: true,
      items: [
        {
          displayLabel: 'Empresa A',
          description: null,
          categoryName: 'Convênio',
          amount: '40',
          costCenterLabel: null,
        },
      ],
    });
    expect(partial).toMatch(/apenas parte/);
    expect(partial).not.toMatch(/Os recebimentos foram/);
    expect(partial).not.toMatch(/foram estes/);

    const fallback = composeAdvisorDailyCashMovementAnswer({
      kind: 'DAILY_CASH_MOVEMENTS',
      status: 'COMPLETE',
      date: '2026-08-25',
      direction: 'OUTFLOW',
      costCenterName: null,
      total: '5',
      returnedSum: '5',
      difference: '0',
      hasMore: false,
      items: [
        {
          displayLabel: 'Sem contraparte identificada',
          description: null,
          categoryName: null,
          amount: '5',
          costCenterLabel: null,
        },
      ],
    });
    expect(fallback).toContain('Sem contraparte identificada');
    expect(fallback).not.toMatch(/fornecedor|cliente/i);
  });

  it('isola tenant e conversa e não reutiliza o estado de contraparte', async () => {
    const other = await ask('O que recebi dia 25?', { tenantId: 'tenant-b' });
    expect(other.calls[0]?.tenantId).toBe('tenant-b');
    expect(other.calls[0]?.costCenterId).toBeUndefined();

    const state = {
      version: 1 as const,
      kind: 'DAILY_CASH_MOVEMENT' as const,
      direction: 'OUTFLOW' as const,
      date: '2026-08-25',
      costCenterQuery: 'laranjeiras',
      tenantId: 'tenant-b',
    };
    expect(parseDailyCashMovementConversationState(state)).toBeNull();
    expect(parseAnalyticalConversationState(state)).toBeNull();
    const clean = parseDailyCashMovementConversationState({
      version: 1,
      kind: 'DAILY_CASH_MOVEMENT',
      direction: 'OUTFLOW',
      date: '2026-08-25',
      costCenterQuery: 'laranjeiras',
    });
    const follow = await ask('E em Jacaraípe?', { prior: clean, tenantId: 'tenant-a' });
    expect(follow.calls[0]?.tenantId).toBe('tenant-a');
    expect(follow.calls[0]?.costCenterId).toBe('cc-jac');
  });

  it('não força DAY em pergunta de faturamento mensal', async () => {
    const monthly = await ask('Qual foi meu faturamento em agosto?');
    expect(monthly.answered).toBeNull();
    expect(monthly.calls).toHaveLength(0);
  });
});
