import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  ADVISOR_MOVEMENT_TEXT_MAX,
  clipAdvisorToolText,
  rankAdvisorCashMovementLines,
  serializeAdvisorCashMovementLines,
  type AdvisorCashMovementSourceLine,
} from '../src/modules/advisor/index.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function line(
  overrides: Partial<AdvisorCashMovementSourceLine> & Pick<AdvisorCashMovementSourceLine, 'amount' | 'date'>,
): AdvisorCashMovementSourceLine {
  return {
    description: overrides.description ?? null,
    partyName: overrides.partyName ?? null,
    categoryNames: overrides.categoryNames ?? ['Atendimentos Convênio'],
    costCenterNames: overrides.costCenterNames ?? ['Unidade Centro'],
    tieBreak: overrides.tieBreak,
    amount: overrides.amount,
    date: overrides.date,
  };
}

describe('Janela cash_movement_lines (F13.8.1D2)', () => {
  it('ordena maiores entradas por AMOUNT_DESC no backend', () => {
    const window = rankAdvisorCashMovementLines({
      monthKey: '2026-08',
      direction: 'INFLOW',
      sort: 'AMOUNT_DESC',
      requestedLimit: 2,
      effectiveLimit: 2,
      source: {
        available: true,
        items: [
          line({
            amount: dec('100'),
            date: new Date('2026-08-10T00:00:00.000Z'),
            partyName: 'Cliente A',
            description: 'Recebimento menor',
            tieBreak: 's-1',
          }),
          line({
            amount: dec('900'),
            date: new Date('2026-08-02T00:00:00.000Z'),
            partyName: 'Cliente B',
            description: 'Recebimento maior',
            tieBreak: 's-2',
          }),
          line({
            amount: dec('500'),
            date: new Date('2026-08-20T00:00:00.000Z'),
            partyName: 'Cliente C',
            description: 'Recebimento médio',
            tieBreak: 's-3',
          }),
        ],
      },
    });
    expect(window.status).toBe('OK');
    expect(window.scope).toBe('PERIOD');
    expect(window.returnedCount).toBe(2);
    expect(window.hasMore).toBe(true);
    expect(window.lines.map((item) => item.amount.toString())).toEqual(['900', '500']);
    expect(window.lines[0]?.partyName).toBe('Cliente B');
    expect(window.lines[0]?.categoryNames).toEqual(['Atendimentos Convênio']);
    expect(window.lines[0]?.costCenterNames).toEqual(['Unidade Centro']);
  });

  it('ordena saídas por DATE_DESC quando solicitado', () => {
    const window = rankAdvisorCashMovementLines({
      monthKey: '2026-08',
      direction: 'OUTFLOW',
      sort: 'DATE_DESC',
      requestedLimit: 5,
      effectiveLimit: 5,
      source: {
        available: true,
        items: [
          line({
            amount: dec('10'),
            date: new Date('2026-08-01T00:00:00.000Z'),
            description: 'antigo',
            tieBreak: 'a',
          }),
          line({
            amount: dec('99'),
            date: new Date('2026-08-28T00:00:00.000Z'),
            description: 'recente',
            tieBreak: 'b',
          }),
        ],
      },
    });
    expect(window.lines.map((item) => item.description)).toEqual(['recente', 'antigo']);
  });

  it('aplica default/max e limita description sem PII técnica', () => {
    const huge = 'x'.repeat(ADVISOR_MOVEMENT_TEXT_MAX + 40);
    const window = rankAdvisorCashMovementLines({
      monthKey: '2026-08',
      direction: 'INFLOW',
      sort: 'AMOUNT_DESC',
      requestedLimit: 5,
      effectiveLimit: 5,
      source: {
        available: true,
        items: [
          line({
            amount: dec('10'),
            date: new Date('2026-08-15T00:00:00.000Z'),
            description: huge,
            partyName: 'Party limitada',
          }),
        ],
      },
    });
    expect(window.lines[0]?.description?.length).toBe(ADVISOR_MOVEMENT_TEXT_MAX + 1);
    expect(window.lines[0]?.description?.endsWith('…')).toBe(true);
    const serialized = serializeAdvisorCashMovementLines(window);
    const blob = JSON.stringify(serialized);
    expect(blob).not.toContain('cpf');
    expect(blob).not.toContain('cnpj');
    expect(blob).not.toContain('email');
    expect(blob).not.toContain('installmentExternalId');
    expect(blob).not.toContain('settlementExternalId');
    expect(serialized.notAPartyRanking).toBe(true);
    expect(serialized.notAConvenioRanking).toBe(true);
    expect(serialized.populationComplete).toBe(false);
    expect(serialized.windowKind).toBe('TOP_N_INDIVIDUAL_MOVEMENTS');
  });

  it('EMPTY_RESULT não é UNAVAILABLE e UNAVAILABLE não vira zero', () => {
    const empty = rankAdvisorCashMovementLines({
      monthKey: '2026-08',
      direction: 'INFLOW',
      sort: 'AMOUNT_DESC',
      requestedLimit: 5,
      effectiveLimit: 5,
      source: { available: true, items: [] },
    });
    expect(empty.status).toBe('EMPTY_RESULT');
    expect(empty.returnedCount).toBe(0);
    expect(empty.hasMore).toBe(false);

    const unavailable = rankAdvisorCashMovementLines({
      monthKey: '2026-08',
      direction: 'OUTFLOW',
      sort: 'AMOUNT_DESC',
      requestedLimit: 5,
      effectiveLimit: 5,
      source: { available: false, items: [] },
    });
    expect(unavailable.status).toBe('UNAVAILABLE');
    expect(unavailable.lines).toEqual([]);
    expect(JSON.stringify(serializeAdvisorCashMovementLines(unavailable))).not.toContain('"amount":"0"');
  });

  it('clipAdvisorToolText preserva ausência e não inventa texto', () => {
    expect(clipAdvisorToolText(null)).toBeNull();
    expect(clipAdvisorToolText('   ')).toBeNull();
    expect(clipAdvisorToolText('ok')).toBe('ok');
  });
});
