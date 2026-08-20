'use client';

import { Target } from 'lucide-react';

import { formatMoneyBrl } from '../../../lib/format-money-brl';
import { UI_ICON_STROKE } from '../../ui/icons';
import type { RevenueGoalSnapshot } from '../../../services/dashboard/revenue-goal.types';
import { presentGoalProgress } from './revenue-goal-math';
import styles from './revenue-goal-card.module.css';

export type RevenueGoalCardProps = {
  readonly monthLabel: string;
  /**
   * Snapshot real quando a API existir.
   * Hoje a Home passa `null` — empty state preparado, sem números inventados.
   */
  readonly snapshot: RevenueGoalSnapshot | null;
  /** Realizado da competência (monthly-revenue) — exibido só com meta configurada. */
  readonly realizedAmount: string | null;
};

/**
 * Widget executivo de Meta de Faturamento (fora dos 5 KPIs).
 * Sem persistência: estado "não configurada". Com snapshot: progresso + histórico compacto.
 */
export function RevenueGoalCard({ monthLabel, snapshot, realizedAmount }: RevenueGoalCardProps) {
  const target = snapshot?.targetAmount ?? null;
  const realized = snapshot?.realizedAmount ?? realizedAmount;
  const progress = presentGoalProgress(realized ?? '0', target);

  if (progress.status === 'unconfigured' || target === null || realized === null) {
    return (
      <div
        className={styles.root}
        data-revenue-goal="unconfigured"
        aria-label={`Meta de faturamento — ${monthLabel}`}
      >
        <div className={styles.emptyIcon} aria-hidden="true">
          <Target size={18} strokeWidth={UI_ICON_STROKE} />
        </div>
        <p className={styles.emptyTitle}>Meta ainda não definida</p>
        <p className={styles.emptyCopy}>
          Defina uma meta mensal para acompanhar o desempenho do faturamento.
        </p>
      </div>
    );
  }

  const history = snapshot?.history ?? [];

  return (
    <div className={styles.root} data-revenue-goal={progress.status}>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Realizado</dt>
          <dd data-tone="revenue">{formatMoneyBrl(realized)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Meta</dt>
          <dd>{formatMoneyBrl(target)}</dd>
        </div>
      </dl>

      {progress.progressPct !== null ? (
        <div
          className={styles.meter}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round(progress.progressPct))}
          aria-label={`Atingimento ${progress.achievementPercentLabel ?? ''}`}
        >
          <div
            className={styles.meterFill}
            style={{ width: `${Math.min(100, progress.progressPct)}%` }}
            data-status={progress.status}
          />
        </div>
      ) : null}

      <div className={styles.stats}>
        {progress.achievementPercentLabel ? (
          <span className={styles.stat}>
            <strong>{progress.achievementPercentLabel}</strong> atingido
          </span>
        ) : null}
        {progress.remainingLabel ? (
          <span className={styles.stat}>
            Faltam <strong>{progress.remainingLabel}</strong>
          </span>
        ) : null}
        {progress.exceededLabel ? (
          <span className={styles.stat} data-tone="exceeded">
            Superou em <strong>{progress.exceededLabel}</strong>
          </span>
        ) : null}
      </div>

      {history.length > 0 ? (
        <ul className={styles.history} aria-label="Histórico de metas">
          {history.map((point) => {
            const pointProgress = presentGoalProgress(point.realizedAmount, point.targetAmount);
            return (
              <li key={point.monthKey} className={styles.historyRow} data-status={pointProgress.status}>
                <span className={styles.historyMonth}>{point.monthKey.slice(5)}</span>
                <span className={styles.historyPct}>
                  {pointProgress.achievementPercentLabel ?? '—'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
