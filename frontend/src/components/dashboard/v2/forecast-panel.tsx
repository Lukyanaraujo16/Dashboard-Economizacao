import { formatMoneyBrl } from '../../../lib/format-money-brl';
import { cx } from '../../ui/utils/cx';
import {
  allForecastBucketsZero,
  decimalAbsScaled,
  formatMonthKeyPtBr,
  maxInflowOutflowScale,
  visualBarPercent,
} from '../dashboard-forecast-view';
import styles from './forecast-panel.module.css';

export type ForecastPanelBucket = {
  readonly key: string;
  readonly inflows: string;
  readonly outflows: string;
  readonly net: string;
};

export type ForecastPanelProps = {
  readonly buckets: readonly ForecastPanelBucket[];
  readonly emptyMessage?: string;
  readonly className?: string;
};

/** Maior valor previsto do período — seleção de um bucket, sem recalcular valores. */
function peakBucket(
  buckets: readonly ForecastPanelBucket[],
  field: 'inflows' | 'outflows',
): ForecastPanelBucket | undefined {
  let peak: ForecastPanelBucket | undefined;
  let peakScaled = 0n;
  for (const bucket of buckets) {
    const scaled = decimalAbsScaled(bucket[field]);
    if (peak === undefined || scaled > peakScaled) {
      peak = bucket;
      peakScaled = scaled;
    }
  }
  return peak;
}

/** Fluxo previsto por mês em barras densas + resumo compacto do período. */
export function ForecastPanel({
  buckets,
  emptyMessage = 'Sem lançamentos previstos no horizonte.',
  className,
}: ForecastPanelProps) {
  if (buckets.length === 0 || allForecastBucketsZero(buckets)) {
    return <p className={cx(styles.empty, className)}>{emptyMessage}</p>;
  }

  const scale = maxInflowOutflowScale(buckets);
  const topInflow = peakBucket(buckets, 'inflows');
  const topOutflow = peakBucket(buckets, 'outflows');

  return (
    <div className={cx(styles.root, className)}>
      <dl className={styles.summary}>
        <div className={styles.summaryItem}>
          <dt className={styles.summaryLabel}>Meses previstos</dt>
          <dd className={styles.summaryValue}>{buckets.length}</dd>
        </div>
        {topInflow ? (
          <div className={styles.summaryItem}>
            <dt className={styles.summaryLabel}>Maior entrada prevista</dt>
            <dd className={styles.summaryValue}>
              {formatMoneyBrl(topInflow.inflows)}
              <span className={styles.summaryMeta}>{formatMonthKeyPtBr(topInflow.key)}</span>
            </dd>
          </div>
        ) : null}
        {topOutflow ? (
          <div className={styles.summaryItem}>
            <dt className={styles.summaryLabel}>Maior saída prevista</dt>
            <dd className={styles.summaryValue}>
              {formatMoneyBrl(topOutflow.outflows)}
              <span className={styles.summaryMeta}>{formatMonthKeyPtBr(topOutflow.key)}</span>
            </dd>
          </div>
        ) : null}
      </dl>

      <ul className={styles.legend}>
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.inflowSwatch)} aria-hidden="true" />
          Entradas
        </li>
        <li className={styles.legendItem}>
          <span className={cx(styles.swatch, styles.outflowSwatch)} aria-hidden="true" />
          Saídas
        </li>
      </ul>

      <div className={styles.scroll}>
        <ul className={styles.chart}>
          {buckets.map((bucket) => (
            <li
              key={bucket.key}
              className={styles.bucket}
              tabIndex={0}
              aria-label={`${formatMonthKeyPtBr(bucket.key)}: entradas ${formatMoneyBrl(
                bucket.inflows,
              )}, saídas ${formatMoneyBrl(bucket.outflows)}, líquido ${formatMoneyBrl(bucket.net)}`}
            >
              <div className={styles.bars}>
                <span className={styles.barTrack}>
                  <span
                    className={cx(styles.bar, styles.inflowBar)}
                    style={{ height: `${visualBarPercent(bucket.inflows, scale)}%` }}
                  />
                </span>
                <span className={styles.barTrack}>
                  <span
                    className={cx(styles.bar, styles.outflowBar)}
                    style={{ height: `${visualBarPercent(bucket.outflows, scale)}%` }}
                  />
                </span>
              </div>
              <p className={styles.month}>{formatMonthKeyPtBr(bucket.key)}</p>
              <p className={styles.net}>{formatMoneyBrl(bucket.net)}</p>
              <div className={styles.detail} aria-hidden="true">
                <p className={styles.detailRow}>
                  <span>Entradas</span>
                  <span className={styles.detailValue}>{formatMoneyBrl(bucket.inflows)}</span>
                </p>
                <p className={styles.detailRow}>
                  <span>Saídas</span>
                  <span className={styles.detailValue}>{formatMoneyBrl(bucket.outflows)}</span>
                </p>
                <p className={styles.detailRow}>
                  <span>Líquido</span>
                  <span className={styles.detailValue}>{formatMoneyBrl(bucket.net)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className={styles.caption}>
        O líquido é a diferença prevista de cada mês e não o saldo bancário acumulado.
      </p>
    </div>
  );
}
