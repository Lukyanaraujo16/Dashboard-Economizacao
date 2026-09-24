import { formatCivilDatePtBr } from '../dashboard/dashboard-upcoming-view';
import { formatMoneyBrl } from '../../lib/format-money-brl';
import type { ReportType } from '../../lib/reports-query';
import type { ReportCashDetailItem } from '../../services/reports/details.types';
import { Badge } from '../ui';
import {
  displayOptionalText,
  formatJoinedNames,
  reportCashDetailRowKey,
  reportTransactionsPartyColumnLabel,
  reportTransactionsSituationBadgeVariant,
  reportTransactionsSituationLabel,
} from './report-transactions-view';
import styles from './reports-page.module.css';

export type ReportTransactionsTableProps = {
  readonly type: ReportType;
  readonly items: readonly ReportCashDetailItem[];
  readonly caption: string;
};

export function ReportTransactionsTable({
  type,
  items,
  caption,
}: ReportTransactionsTableProps) {
  const partyLabel = reportTransactionsPartyColumnLabel(type);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.transactionsTable}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Descrição</th>
            <th scope="col">{partyLabel}</th>
            <th scope="col" className={styles.hideOnNarrow}>
              Categoria
            </th>
            <th scope="col" className={styles.hideOnNarrow}>
              Centro de custo
            </th>
            <th scope="col">Situação</th>
            <th scope="col" className={styles.amountHead}>
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const rowKey = reportCashDetailRowKey(item);
            return (
              <tr key={rowKey} data-transaction-row={rowKey}>
                <td>{formatCivilDatePtBr(item.date)}</td>
                <td className={styles.descriptionCell}>{displayOptionalText(item.description)}</td>
                <td>{displayOptionalText(item.partyName)}</td>
                <td className={styles.hideOnNarrow}>{formatJoinedNames(item.categoryNames)}</td>
                <td className={styles.hideOnNarrow}>{formatJoinedNames(item.costCenterNames)}</td>
                <td>
                  <Badge variant={reportTransactionsSituationBadgeVariant(item.situation)}>
                    {reportTransactionsSituationLabel(type, item.situation)}
                  </Badge>
                </td>
                <td className={styles.amountCell}>{formatMoneyBrl(item.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
