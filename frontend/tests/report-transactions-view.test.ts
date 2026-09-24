import { describe, expect, it } from 'vitest';

import { formatCivilDatePtBr } from '../src/components/dashboard/dashboard-upcoming-view';
import {
  displayOptionalText,
  formatJoinedNames,
  formatReportLaunchCount,
  mergeReportCashDetailItems,
  reportCashDetailRowKey,
  reportTransactionsBlockTitle,
  reportTransactionsEmptyMessage,
  reportTransactionsPartyColumnLabel,
  reportTransactionsSituationLabel,
  reportTransactionsUnavailableMessage,
} from '../src/components/reports/report-transactions-view';
import { REPORT_TYPE_EXPENSES, REPORT_TYPE_REVENUE } from '../src/lib/reports-query';
import type { ReportCashDetailItem } from '../src/services/reports/details.types';

function item(overrides: Partial<ReportCashDetailItem>): ReportCashDetailItem {
  return {
    date: '2026-09-15',
    description: 'Honorários',
    partyName: 'Cliente Alpha',
    categoryNames: ['Serviços'],
    costCenterNames: ['Operações'],
    situation: 'REALIZED',
    amount: '1000.00',
    installmentKind: 'RECEIVABLE',
    installmentExternalId: 'inst-1',
    settlementExternalId: 'set-1',
    ...overrides,
  };
}

describe('report-transactions-view', () => {
  it('formata data civil sem regressão de fuso', () => {
    expect(formatCivilDatePtBr('2026-09-15')).toBe('15/09/2026');
    expect(formatCivilDatePtBr('2026-01-01')).toBe('01/01/2026');
  });

  it('rótulos de bloco e situação por tipo', () => {
    expect(reportTransactionsBlockTitle(REPORT_TYPE_REVENUE, 'REALIZED')).toBe(
      'Entradas realizadas',
    );
    expect(reportTransactionsBlockTitle(REPORT_TYPE_REVENUE, 'EXPECTED')).toBe('A receber');
    expect(reportTransactionsBlockTitle(REPORT_TYPE_REVENUE, 'OVERDUE')).toBe('Vencido');
    expect(reportTransactionsBlockTitle(REPORT_TYPE_EXPENSES, 'REALIZED')).toBe(
      'Saídas realizadas',
    );
    expect(reportTransactionsBlockTitle(REPORT_TYPE_EXPENSES, 'EXPECTED')).toBe('A pagar');
    expect(reportTransactionsSituationLabel(REPORT_TYPE_REVENUE, 'REALIZED')).toBe('Realizado');
    expect(reportTransactionsSituationLabel(REPORT_TYPE_REVENUE, 'EXPECTED')).toBe('A receber');
    expect(reportTransactionsSituationLabel(REPORT_TYPE_EXPENSES, 'EXPECTED')).toBe('A pagar');
    expect(reportTransactionsPartyColumnLabel(REPORT_TYPE_REVENUE)).toBe('Cliente');
    expect(reportTransactionsPartyColumnLabel(REPORT_TYPE_EXPENSES)).toBe('Fornecedor');
  });

  it('empty, unavailable, description e nomes compostos', () => {
    expect(reportTransactionsEmptyMessage(REPORT_TYPE_REVENUE, 'REALIZED')).toMatch(
      /nenhuma entrada realizada/i,
    );
    expect(reportTransactionsEmptyMessage(REPORT_TYPE_REVENUE, 'EXPECTED')).toMatch(
      /nenhum valor a receber/i,
    );
    expect(reportTransactionsEmptyMessage(REPORT_TYPE_REVENUE, 'OVERDUE')).toMatch(
      /nenhum título vencido/i,
    );
    expect(reportTransactionsEmptyMessage(REPORT_TYPE_EXPENSES, 'REALIZED')).toMatch(
      /nenhuma saída realizada/i,
    );
    expect(reportTransactionsEmptyMessage(REPORT_TYPE_EXPENSES, 'EXPECTED')).toMatch(
      /nenhum valor a pagar/i,
    );
    expect(reportTransactionsUnavailableMessage()).toMatch(/rateio por centro de custo/i);
    expect(displayOptionalText(null)).toBe('—');
    expect(displayOptionalText('  ')).toBe('—');
    expect(displayOptionalText('Honorários')).toBe('Honorários');
    expect(formatJoinedNames([])).toBe('—');
    expect(formatJoinedNames(['Categoria A', 'Categoria B'])).toBe('Categoria A · Categoria B');
    expect(formatJoinedNames(['Centro A', 'Centro B'])).toBe('Centro A · Centro B');
    expect(formatReportLaunchCount(0)).toBe('0 lançamentos');
    expect(formatReportLaunchCount(1)).toBe('1 lançamento');
    expect(formatReportLaunchCount(47)).toBe('47 lançamentos');
  });

  it('usa chave estável e não duplica no merge', () => {
    const realized = item({ settlementExternalId: 'set-1' });
    const expected = item({
      situation: 'EXPECTED',
      installmentExternalId: 'inst-9',
      settlementExternalId: undefined,
    });
    expect(reportCashDetailRowKey(realized)).toBe('settlement:set-1');
    expect(reportCashDetailRowKey(expected)).toBe('installment:inst-9');
    const merged = mergeReportCashDetailItems(
      [realized],
      [realized, item({ settlementExternalId: 'set-2', installmentExternalId: 'inst-2' })],
    );
    expect(merged).toHaveLength(2);
    expect(merged.map(reportCashDetailRowKey)).toEqual(['settlement:set-1', 'settlement:set-2']);
  });
});
