import { describe, expect, it } from 'vitest';

import {
  formatCivilDatePtBr,
  mergeUpcomingRows,
  upcomingEmptyMessage,
  upcomingStatusLabel,
} from '../src/components/dashboard/dashboard-upcoming-view';
import {
  decimalAbsScaled,
  formatMonthKeyPtBr,
  maxInflowOutflowScale,
  visualBarPercent,
} from '../src/components/dashboard/dashboard-forecast-view';

describe('dashboard-upcoming-view', () => {
  it('mescla AR/AP por dueDate e id sem alterar valores', () => {
    const rows = mergeUpcomingRows(
      [
        { id: 'b', dueDate: '2026-08-20', unpaid: '8.5', status: 'OPEN' },
        { id: 'a', dueDate: '2026-08-19', unpaid: '1', status: 'OVERDUE' },
      ],
      [{ id: 'c', dueDate: '2026-08-19', unpaid: '4', status: 'PARTIALLY_PAID' }],
    );
    expect(rows.map((row) => row.id)).toEqual(['a', 'c', 'b']);
    expect(rows[0]?.unpaid).toBe('1');
    expect(rows[1]?.kind).toBe('payable');
  });

  it('traduz status e empty dinâmico', () => {
    expect(upcomingStatusLabel('OPEN', 'receivable')).toBe('Em aberto');
    expect(upcomingStatusLabel('OVERDUE', 'payable')).toBe('Atrasado');
    expect(upcomingStatusLabel('PARTIALLY_PAID', 'receivable')).toBe('Parcialmente recebido');
    expect(upcomingStatusLabel('PARTIALLY_PAID', 'payable')).toBe('Parcialmente pago');
    expect(upcomingEmptyMessage(7)).toBe('Nenhum vencimento nos próximos 7 dias.');
    expect(upcomingEmptyMessage(15)).toBe('Nenhum vencimento nos próximos 15 dias.');
    expect(formatCivilDatePtBr('2026-08-19')).toBe('19/08/2026');
  });
});

describe('dashboard-forecast-view', () => {
  it('formata YYYY-MM em pt-BR e escala barras sem usar net', () => {
    expect(formatMonthKeyPtBr('2026-08')).toBe('ago/2026');
    const max = maxInflowOutflowScale([
      { key: '2026-08', inflows: '10', outflows: '4', net: '999' },
      { key: '2026-09', inflows: '0', outflows: '0', net: '0' },
    ]);
    expect(max).toBe(decimalAbsScaled('10'));
    expect(visualBarPercent('10', max)).toBe(100);
    expect(visualBarPercent('4', max)).toBe(40);
    expect(visualBarPercent('0', max)).toBe(0);
  });
});
