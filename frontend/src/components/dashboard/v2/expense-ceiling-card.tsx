'use client';

import { Wallet } from 'lucide-react';

import { formatDelinquencyRate, formatMoneyBrl, isDecimalZero } from '../../../lib/format-money-brl';
import type { ExpenseCeilingSnapshot } from '../../../services/dashboard/expense-ceiling.types';
import { Button } from '../../ui';
import { UI_ICON_STROKE } from '../../ui/icons';
import styles from './expense-ceiling-card.module.css';

export type ExpenseCeilingCardProps = {
  readonly monthLabel: string;
  readonly snapshot: ExpenseCeilingSnapshot | null;
  readonly onEdit?: () => void;
};

const STATUS_LABEL: Record<ExpenseCeilingSnapshot['status'], string | null> = {
  NO_TARGET: null,
  IN_PROGRESS: 'Dentro do teto',
  CONTAINED: 'Dentro do teto',
  ACHIEVED: 'Teto atingido',
  EXCEEDED: 'Teto ultrapassado',
  PLANNED: 'Teto planejado',
  UNAVAILABLE: 'Despesas indisponíveis',
};

export function ExpenseCeilingCard({ monthLabel, snapshot, onEdit }: ExpenseCeilingCardProps) {
  const ceiling = snapshot?.ceiling ?? null;
  const editButton = onEdit ? (
    <Button variant="secondary" size="sm" data-stop-expand onClick={onEdit}>
      {ceiling === null ? 'Definir teto' : 'Editar teto'}
    </Button>
  ) : null;

  if (snapshot == null || snapshot.status === 'NO_TARGET' || ceiling === null) {
    return (
      <div
        className={styles.root}
        data-expense-ceiling="unconfigured"
        aria-label={`Teto de gastos — ${monthLabel}`}
      >
        <div className={styles.emptyIcon} aria-hidden="true">
          <Wallet size={18} strokeWidth={UI_ICON_STROKE} />
        </div>
        <p className={styles.emptyTitle}>Teto ainda não definido</p>
        <p className={styles.emptyCopy}>
          Defina um teto mensal para acompanhar as despesas do mês.
        </p>
        {editButton ? <div className={styles.actions}>{editButton}</div> : null}
      </div>
    );
  }

  const statusLabel = STATUS_LABEL[snapshot.status];
  const showMeter = snapshot.consumedRate !== null && snapshot.status !== 'PLANNED';
  const percent = snapshot.consumedRate === null ? null : Number(snapshot.consumedRate);

  return (
    <div className={styles.root} data-expense-ceiling={snapshot.status}>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Despesas do mês</dt>
          <dd data-tone="expense">
            {snapshot.monthlyExpenses === null ? '—' : formatMoneyBrl(snapshot.monthlyExpenses)}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>Teto</dt>
          <dd>{formatMoneyBrl(ceiling)}</dd>
        </div>
      </dl>

      {showMeter && percent !== null && Number.isFinite(percent) ? (
        <div
          className={styles.meter}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round(percent))}
          aria-label={`Consumo ${formatDelinquencyRate(snapshot.consumedRate)}`}
        >
          <div
            className={styles.meterFill}
            data-status={snapshot.status}
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      ) : null}

      <div className={styles.stats}>
        {statusLabel ? (
          <span className={styles.statusLine} data-status={snapshot.status}>
            {statusLabel}
          </span>
        ) : null}
        {snapshot.consumedRate !== null && snapshot.status !== 'PLANNED' ? (
          <span className={styles.stat}>
            <strong>{formatDelinquencyRate(snapshot.consumedRate)}</strong> consumido
          </span>
        ) : null}
        {snapshot.available !== null &&
        !isDecimalZero(snapshot.available) &&
        (snapshot.status === 'IN_PROGRESS' || snapshot.status === 'CONTAINED') ? (
          <span className={styles.stat}>
            Disponível <strong>{formatMoneyBrl(snapshot.available)}</strong>
          </span>
        ) : null}
        {snapshot.exceeded !== null && snapshot.status === 'EXCEEDED' ? (
          <span className={styles.stat} data-tone="exceeded">
            Excedido em <strong>{formatMoneyBrl(snapshot.exceeded)}</strong>
          </span>
        ) : null}
        {snapshot.status === 'UNAVAILABLE' ? (
          <span className={styles.stat}>
            As despesas oficiais deste mês estão indisponíveis.
          </span>
        ) : null}
        {snapshot.status === 'PLANNED' ? (
          <span className={styles.stat}>O consumo deste mês ainda não é julgado.</span>
        ) : null}
      </div>

      {editButton ? <div className={styles.actions}>{editButton}</div> : null}
    </div>
  );
}
