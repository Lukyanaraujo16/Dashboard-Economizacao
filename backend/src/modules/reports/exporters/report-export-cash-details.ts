import { Prisma } from '../../../generated/prisma/client.js';
import { serializeCivilDate } from '../../dashboard/http/to-dashboard-overview-response.js';
import {
  REPORT_DETAIL_SITUATIONS,
  type ReportCashDetailsUniverse,
  type ReportDetailDirection,
  type ReportDetailSituation,
} from '../domain/report-cash-details.js';
import { parseDecimalNumber } from './revenue-export-presentation.js';

export type ReportExportCashDetailsBundle = {
  readonly realized: ReportCashDetailsUniverse;
  readonly expected: ReportCashDetailsUniverse;
  readonly overdue: ReportCashDetailsUniverse;
};

export const COST_CENTER_SPLIT_EXPORT_NOTICE =
  'Detalhamento indisponível para este filtro porque o rateio por centro de custo não está completo.';

export function emptyExportCashDetailsBundle(
  direction: ReportDetailDirection,
): ReportExportCashDetailsBundle {
  return {
    realized: emptyUniverse(direction, 'REALIZED'),
    expected: emptyUniverse(direction, 'EXPECTED'),
    overdue: emptyUniverse(direction, 'OVERDUE'),
  };
}

function emptyUniverse(
  direction: ReportDetailDirection,
  situation: ReportDetailSituation,
): ReportCashDetailsUniverse {
  return {
    available: true,
    unavailableReason: null,
    situation,
    direction,
    totalAmount: new Prisma.Decimal(0),
    items: [],
  };
}

export function resolveExportCashDetails(
  direction: ReportDetailDirection,
  bundle: ReportExportCashDetailsBundle | undefined,
): ReportExportCashDetailsBundle {
  return bundle ?? emptyExportCashDetailsBundle(direction);
}

export function exportSituationLabel(
  direction: ReportDetailDirection,
  situation: ReportDetailSituation,
): string {
  if (situation === 'REALIZED') {
    return 'Realizado';
  }
  if (situation === 'EXPECTED') {
    return direction === 'expenses' ? 'A pagar' : 'A receber';
  }
  return 'Vencido';
}

export function exportBlockTitle(
  direction: ReportDetailDirection,
  situation: ReportDetailSituation,
): string {
  if (situation === 'REALIZED') {
    return direction === 'expenses' ? 'Saídas realizadas' : 'Entradas realizadas';
  }
  if (situation === 'EXPECTED') {
    return direction === 'expenses' ? 'A pagar' : 'A receber';
  }
  return 'Vencido';
}

export function exportEmptyMessage(
  direction: ReportDetailDirection,
  situation: ReportDetailSituation,
): string {
  if (situation === 'REALIZED') {
    return direction === 'expenses'
      ? 'Nenhuma saída realizada no período.'
      : 'Nenhuma entrada realizada no período.';
  }
  if (situation === 'EXPECTED') {
    return direction === 'expenses'
      ? 'Nenhum valor a pagar no período.'
      : 'Nenhum valor a receber no período.';
  }
  return 'Nenhum título vencido no período.';
}

export function exportPartyColumnLabel(direction: ReportDetailDirection): string {
  return direction === 'expenses' ? 'Fornecedor' : 'Cliente';
}

export function formatExportCivilDate(date: Date): string {
  const iso = serializeCivilDate(date);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    return iso;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatJoinedExportNames(names: readonly string[]): string {
  const cleaned = names.map((name) => name.trim()).filter((name) => name.length > 0);
  return cleaned.length === 0 ? '—' : cleaned.join(' · ');
}

export function displayExportOptionalText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

export function exportAmountNumber(amount: Prisma.Decimal): number | null {
  return parseDecimalNumber(amount.toString());
}

export function formatLaunchCount(count: number): string {
  return count === 1 ? '1 lançamento' : `${count} lançamentos`;
}

export function exportUniverses(
  bundle: ReportExportCashDetailsBundle,
): readonly ReportCashDetailsUniverse[] {
  return [bundle.realized, bundle.expected, bundle.overdue];
}

export { REPORT_DETAIL_SITUATIONS };

export type ExportLancamentosRow = {
  readonly date: string;
  readonly description: string;
  readonly party: string;
  readonly category: string;
  readonly costCenter: string;
  readonly situation: string;
  readonly amount: number | null;
};

export type ExportPdfTransactionBlock = {
  readonly title: string;
  readonly summary: string | null;
  readonly unavailableMessage: string | null;
  readonly columns: readonly {
    readonly header: string;
    readonly width: number;
    readonly align: 'left' | 'right';
  }[];
  readonly rows: readonly (readonly string[])[];
  readonly emptyMessage: string;
};

export function buildExportPdfTransactions(
  direction: ReportDetailDirection,
  bundle: ReportExportCashDetailsBundle,
  formatMoney: (value: string | null) => string,
): { readonly title: string; readonly blocks: readonly ExportPdfTransactionBlock[] } {
  const partyHeader = exportPartyColumnLabel(direction);
  const columns = [
    { header: 'Data', width: 54, align: 'left' as const },
    { header: 'Descrição', width: 95, align: 'left' as const },
    { header: partyHeader, width: 78, align: 'left' as const },
    { header: 'Categoria', width: 72, align: 'left' as const },
    { header: 'Centro de custo', width: 72, align: 'left' as const },
    { header: 'Situação', width: 56, align: 'left' as const },
    { header: 'Valor', width: 72, align: 'right' as const },
  ];
  return {
    title: 'Lançamentos do período',
    blocks: exportUniverses(bundle).map((universe) => {
      if (!universe.available) {
        return {
          title: exportBlockTitle(direction, universe.situation),
          summary: null,
          unavailableMessage: COST_CENTER_SPLIT_EXPORT_NOTICE,
          columns,
          rows: [],
          emptyMessage: COST_CENTER_SPLIT_EXPORT_NOTICE,
        };
      }
      const total =
        universe.totalAmount === null ? null : universe.totalAmount.toString();
      return {
        title: exportBlockTitle(direction, universe.situation),
        summary: `${formatMoney(total)} · ${formatLaunchCount(universe.items.length)}`,
        unavailableMessage: null,
        columns,
        rows: universe.items.map((item) => [
          formatExportCivilDate(item.date),
          displayExportOptionalText(item.description),
          displayExportOptionalText(item.partyName),
          formatJoinedExportNames(item.categoryNames),
          formatJoinedExportNames(item.costCenterNames),
          exportSituationLabel(direction, item.situation),
          formatMoney(item.amount.toString()),
        ]),
        emptyMessage: exportEmptyMessage(direction, universe.situation),
      };
    }),
  };
}

export function buildExportLancamentosRows(
  direction: ReportDetailDirection,
  bundle: ReportExportCashDetailsBundle,
): readonly ExportLancamentosRow[] {
  const rows: ExportLancamentosRow[] = [];
  for (const universe of exportUniverses(bundle)) {
    if (!universe.available) {
      rows.push({
        date: '—',
        description: COST_CENTER_SPLIT_EXPORT_NOTICE,
        party: '—',
        category: '—',
        costCenter: '—',
        situation: exportBlockTitle(direction, universe.situation),
        amount: null,
      });
      continue;
    }
    for (const item of universe.items) {
      rows.push({
        date: formatExportCivilDate(item.date),
        description: displayExportOptionalText(item.description),
        party: displayExportOptionalText(item.partyName),
        category: formatJoinedExportNames(item.categoryNames),
        costCenter: formatJoinedExportNames(item.costCenterNames),
        situation: exportSituationLabel(direction, item.situation),
        amount: exportAmountNumber(item.amount),
      });
    }
  }
  return rows;
}
