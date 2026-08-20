'use client';

import { Target } from 'lucide-react';

import { formatMoneyBrl } from '../../../lib/format-money-brl';
import { Button } from '../../ui';
import { UI_ICON_STROKE } from '../../ui/icons';
import type {
  RevenueGoalHistoryPoint,
  RevenueGoalSnapshot,
} from '../../../services/dashboard/revenue-goal.types';
import {
  goalProgressStatusFromApi,
  presentApiGoalProgress,
  revenueGoalHistoryCaption,
} from './revenue-goal-math';
import styles from './revenue-goal-card.module.css';

const COMPACT_HISTORY_LIMIT = 4;

export type RevenueGoalCardProps = {
  readonly monthLabel: string;
  /** Snapshot da API; `null` enquanto a competência ainda não carregou. */
  readonly snapshot: RevenueGoalSnapshot | null;
  readonly onEdit?: () => void;
  /** Competências exibidas no histórico compacto; o diálogo usa o histórico inteiro. */
  readonly historyLimit?: number;
};

/**
 * Widget executivo de Meta de Faturamento (fora dos 5 KPIs).
 * Sem meta cadastrada: estado "não configurada" com CTA. Com meta: progresso + histórico.
 */
export function RevenueGoalCard({
  monthLabel,
  snapshot,
  onEdit,
  historyLimit = COMPACT_HISTORY_LIMIT,
}: RevenueGoalCardProps) {
  const progress = snapshot === null ? null : presentApiGoalProgress(snapshot);
  const target = snapshot?.target ?? null;

  const editButton = onEdit ? (
    <Button variant="secondary" size="sm" data-stop-expand onClick={onEdit}>
      {target === null ? 'Definir meta' : 'Editar meta'}
    </Button>
  ) : null;

  if (
    snapshot === null ||
    progress === null ||
    progress.status === 'unconfigured' ||
    target === null
  ) {
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
        {editButton ? <div className={styles.actions}>{editButton}</div> : null}
      </div>
    );
  }

  return (
    <div className={styles.root} data-revenue-goal={progress.status}>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Realizado</dt>
          <dd data-tone="revenue">{formatMoneyBrl(snapshot.actual)}</dd>
        </div>
        <div className={styles.fact}>
          <dt>Meta</dt>
          <dd>{formatMoneyBrl(target)}</dd>
        </div>
      </dl>

      {progress.progressPct !== null && progress.status !== 'planned' ? (
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
        {progress.statusLabel ? (
          <span className={styles.statusLine} data-status={progress.status}>
            {progress.statusLabel}
          </span>
        ) : null}
        {progress.achievementPercentLabel && progress.status !== 'planned' ? (
          <span className={styles.stat}>
            <strong>{progress.achievementPercentLabel}</strong> atingido
          </span>
        ) : null}
        {progress.remainingLabel && progress.status === 'behind' ? (
          <span className={styles.stat}>
            Faltam <strong>{progress.remainingLabel}</strong>
          </span>
        ) : null}
        {progress.remainingLabel && progress.status === 'missed' ? (
          <span className={styles.stat}>
            Ficou abaixo em <strong>{progress.remainingLabel}</strong>
          </span>
        ) : null}
        {progress.exceededLabel ? (
          <span className={styles.stat} data-tone="exceeded">
            Superou em <strong>{progress.exceededLabel}</strong>
          </span>
        ) : null}
      </div>

      <RevenueGoalHistoryList points={snapshot.history} limit={historyLimit} />

      {editButton ? <div className={styles.actions}>{editButton}</div> : null}
    </div>
  );
}

export type RevenueGoalHistoryListProps = {
  readonly points: readonly RevenueGoalHistoryPoint[];
  /** Sem limite = histórico inteiro (diálogo expandido). */
  readonly limit?: number;
};

/** Histórico por competência — mais recente primeiro, com o status temporal da API. */
export function RevenueGoalHistoryList({ points, limit }: RevenueGoalHistoryListProps) {
  const ordered = [...points].reverse();
  const visible = limit === undefined ? ordered : ordered.slice(0, limit);

  if (visible.length === 0) {
    return null;
  }

  return (
    <ul className={styles.history} aria-label="Histórico de metas">
      {visible.map((point) => {
        const visual = goalProgressStatusFromApi(point.status);
        return (
          <li key={point.monthKey} className={styles.historyRow} data-status={visual}>
            <span className={styles.historyMonth}>{point.monthKey.slice(5)}</span>
            <span className={styles.historyAmount}>{formatMoneyBrl(point.actual)}</span>
            <span className={styles.historyPct}>{revenueGoalHistoryCaption(point.status)}</span>
          </li>
        );
      })}
    </ul>
  );
}
