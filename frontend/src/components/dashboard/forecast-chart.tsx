import { formatMoneyBrl } from '../../lib/format-money-brl';
import type { DashboardForecastBucket } from '../../services/dashboard/forecast.types';
import { Typography } from '../ui';
import {
  formatMonthKeyPtBr,
  maxInflowOutflowScale,
  visualBarPercent,
} from './dashboard-forecast-view';
import styles from './forecast-chart.module.css';

export type ForecastChartProps = {
  readonly buckets: readonly DashboardForecastBucket[];
};

export function ForecastChart({ buckets }: ForecastChartProps) {
  const maxAbs = maxInflowOutflowScale(buckets);

  return (
    <div>
      <Typography as="p" variant="caption" className={styles.hint}>
        O líquido representa a diferença prevista de cada período e não o saldo bancário acumulado.
      </Typography>

      <div className={styles.scroll}>
        <div className={styles.chart} role="img" aria-hidden="true">
          {buckets.map((bucket) => (
            <div key={bucket.key} className={styles.bucket}>
              <div className={styles.bars}>
                <div className={styles.barTrack}>
                  <div
                    className={`${styles.bar} ${styles.inflow}`}
                    style={{ height: `${visualBarPercent(bucket.inflows, maxAbs)}%` }}
                  />
                </div>
                <div className={styles.barTrack}>
                  <div
                    className={`${styles.bar} ${styles.outflow}`}
                    style={{ height: `${visualBarPercent(bucket.outflows, maxAbs)}%` }}
                  />
                </div>
              </div>
              <p className={styles.month}>{formatMonthKeyPtBr(bucket.key)}</p>
              <p className={styles.net}>{formatMoneyBrl(bucket.net)}</p>
            </div>
          ))}
        </div>
      </div>

      <p className={styles.legend}>
        <span>
          <span className={`${styles.swatch} ${styles.inflow}`} />
          Entradas
        </span>
        <span>
          <span className={`${styles.swatch} ${styles.outflow}`} />
          Saídas
        </span>
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption className={styles.hint}>Fluxo previsto por mês</caption>
          <thead>
            <tr>
              <th scope="col">Mês</th>
              <th scope="col">Entradas</th>
              <th scope="col">Saídas</th>
              <th scope="col">Líquido do mês</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket) => (
              <tr key={`row-${bucket.key}`}>
                <td>{formatMonthKeyPtBr(bucket.key)}</td>
                <td>{formatMoneyBrl(bucket.inflows)}</td>
                <td>{formatMoneyBrl(bucket.outflows)}</td>
                <td>{formatMoneyBrl(bucket.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
