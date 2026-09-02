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
  /** Abre o detalhe CASH correspondente ao mini-bloco (HOME-POLISH-2). */
  readonly onMetricActivate?: (metricId: string) => void;
};

const METRIC_EXPAND_LABEL: Record<string, string> = {
  'cash-received': 'Abrir detalhe de Já recebido',
  'cash-receivable': 'Abrir detalhe de A receber',
  'cash-paid': 'Abrir detalhe de Despesas (pago)',
  'cash-payable': 'Abrir detalhe de Contas a pagar',
  'cash-result': 'Abrir detalhe de Resultado',
  'cash-coverage': 'Abrir detalhe de Faturamento',
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
 * Mini-blocos podem navegar para o modal CASH correspondente (POLISH-2).
 */
export function CashExecutiveReading({
  model,
  emptyMessage = 'Sem movimentação de caixa para leitura neste mês.',
  className,
  onMetricActivate,
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
          const canActivate = Boolean(onMetricActivate) && metric.id in METRIC_EXPAND_LABEL;
          const activateLabel = METRIC_EXPAND_LABEL[metric.id] ?? `Abrir detalhe de ${metric.label}`;

          return (
            <li key={metric.id} className={styles.metricItem} data-signal={metric.id}>
              {canActivate ? (
                <button
                  type="button"
                  className={cx(styles.metric, styles.metricClickable)}
                  data-tone={tone}
                  data-stop-expand
                  aria-label={activateLabel}
                  onClick={() => onMetricActivate?.(metric.id)}
                >
                  <div className={styles.metricHeader}>
                    <span className={styles.icon} aria-hidden="true">
                      <Icon size={14} strokeWidth={UI_ICON_STROKE} />
                    </span>
                    <span className={styles.label}>{metric.label}</span>
                  </div>
                  <p className={styles.value}>{metric.value}</p>
                  <p className={styles.hint}>{metric.hint}</p>
                </button>
              ) : (
                <div className={styles.metric} data-tone={tone}>
                  <div className={styles.metricHeader}>
                    <span className={styles.icon} aria-hidden="true">
                      <Icon size={14} strokeWidth={UI_ICON_STROKE} />
                    </span>
                    <span className={styles.label}>{metric.label}</span>
                  </div>
                  <p className={styles.value}>{metric.value}</p>
                  <p className={styles.hint}>{metric.hint}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {model.status ? <StatusStrip status={model.status} /> : null}
    </div>
  );
}
