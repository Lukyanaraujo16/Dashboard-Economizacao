import { formatMoneyBrl } from '../../lib/format-money-brl';
import type { UpcomingListRow } from './dashboard-upcoming-view';
import {
  formatCivilDatePtBr,
  upcomingKindLabel,
  upcomingStatusLabel,
} from './dashboard-upcoming-view';
import styles from './upcoming-list.module.css';

export type UpcomingListProps = {
  readonly rows: readonly UpcomingListRow[];
};

export function UpcomingList({ rows }: UpcomingListProps) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Tipo</th>
            <th scope="col">Vencimento</th>
            <th scope="col">Valor em aberto</th>
            <th scope="col">Situação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.kind}-${row.id}`}>
              <td>{upcomingKindLabel(row.kind)}</td>
              <td>{formatCivilDatePtBr(row.dueDate)}</td>
              <td className={styles.amount}>{formatMoneyBrl(row.unpaid)}</td>
              <td>{upcomingStatusLabel(row.status, row.kind)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
