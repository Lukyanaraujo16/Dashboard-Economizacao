'use client';

import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Percent,
  Scale,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

import { UI_ICON_STROKE } from '../ui/icons';
import { cx } from '../ui/utils/cx';
import type {
  CashExecutiveMetric,
  CashExecutiveReadingModel,
  CashExecutiveStatus,
} from './dashboard-cash-executive-reading';
import type { SignalTone } from './v2/executive-signals';
import styles from './cash-executive-reading.module.css';

const METRIC_ICONS: Record<string, LucideIcon> = {
  'cash-received': ArrowDownLeft,
  'cash-receivable': Clock3,
  'cash-paid': ArrowUpRight,
  'cash-payable': CircleDollarSign,
  'cash-result': Scale,
  'cash-coverage': Percent,
};

export type CashExecutiveReadingProps = {
  readonly model: CashExecutiveReadingModel;
  readonly emptyMessage?: string;
  readonly className?: string;
};

function metricTone(metric: CashExecutiveMetric): SignalTone {
  return metric.tone;
}

function StatusStrip({ status }: { readonly status: CashExecutiveStatus }) {
  const Icon =
    status.kind === 'overdue'
      ? TriangleAlert
      : status.kind === 'clear'
        ? CheckCircle2
        : TriangleAlert;
  return (
    <p
      className={styles.status}
      data-status={status.kind}
      data-signal={status.id}
      role="status"
    >
      <span className={styles.statusIcon} aria-hidden="true">
        <Icon size={14} strokeWidth={UI_ICON_STROKE} />
      </span>
      <span className={styles.statusBody}>{status.body}</span>
    </p>
  );
}

/**
 * Leitura executiva de caixa — métricas curtas + status discreto (FINAL-UI).
 * Não altera fórmulas; só a apresentação.
 */
export function CashExecutiveReading({
  model,
  emptyMessage = 'Sem movimentação de caixa para leitura neste mês.',
  className,
}: CashExecutiveReadingProps) {
  if (model.metrics.length === 0 && model.status === null) {
    return <p className={cx(styles.empty, className)}>{emptyMessage}</p>;
  }

  if (model.metrics.length === 0 && model.status) {
    return (
      <div className={cx(styles.root, className)} data-cash-executive="true">
        <StatusStrip status={model.status} />
      </div>
    );
  }

  return (
    <div className={cx(styles.root, className)} data-cash-executive="true">
      <ul className={styles.grid} data-layout="metrics">
        {model.metrics.map((metric) => {
          const Icon = METRIC_ICONS[metric.id] ?? CircleDollarSign;
          const tone = metricTone(metric);
          return (
            <li
              key={metric.id}
              className={styles.metric}
              data-signal={metric.id}
              data-tone={tone}
            >
              <div className={styles.metricHeader}>
                <span className={styles.icon} aria-hidden="true">
                  <Icon size={14} strokeWidth={UI_ICON_STROKE} />
                </span>
                <span className={styles.label}>{metric.label}</span>
              </div>
              <p className={styles.value}>{metric.value}</p>
              <p className={styles.hint}>{metric.hint}</p>
            </li>
          );
        })}
      </ul>
      {model.status ? <StatusStrip status={model.status} /> : null}
    </div>
  );
}
