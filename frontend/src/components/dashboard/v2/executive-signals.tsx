import {
  BarChart3,
  PieChart,
  Scale,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';

import { UI_ICON_STROKE } from '../../ui/icons';
import { cx } from '../../ui/utils/cx';
import styles from './executive-signals.module.css';

export type ExecutiveSignal = {
  readonly id: string;
  readonly body: string;
};

export type ExecutiveSignalsProps = {
  readonly signals: readonly ExecutiveSignal[];
  readonly emptyMessage?: string;
  readonly className?: string;
  /** `wide` = multi-coluna em faixas largas (Home CASH-4C-FINAL). */
  readonly layout?: 'stack' | 'wide';
};

/**
 * Ênfase cromática do ícone — texto permanece neutro.
 * Tons de série usam tokens `--color-series-*` já existentes.
 */
export type SignalTone =
  | 'neutral'
  | 'muted'
  | 'warning'
  | 'negative'
  | 'positive'
  | 'revenue'
  | 'expense'
  | 'receivable'
  | 'result';

const SIGNAL_ICONS: Record<string, LucideIcon> = {
  'revenue-expense-total': BarChart3,
  'revenue-expense-balance': Scale,
  'top-revenue-category': TrendingUp,
  'top-expense-category': PieChart,
  'expense-classification-gap': TriangleAlert,
};

/**
 * Tom derivado do próprio texto do sinal de saldo da competência.
 * Só reconhece as três formulações produzidas pelo backend; qualquer outra
 * redação permanece neutra em vez de arriscar uma leitura errada.
 */
function balanceTone(body: string): SignalTone {
  if (body.includes('superam as receitas')) {
    return 'negative';
  }
  if (body.includes('superam as despesas')) {
    return 'positive';
  }
  if (body.includes('equilibradas')) {
    return 'muted';
  }
  return 'neutral';
}

export function signalTone(signal: ExecutiveSignal): SignalTone {
  if (signal.id === 'revenue-expense-balance') {
    return balanceTone(signal.body);
  }
  if (signal.id === 'expense-classification-gap') {
    return 'warning';
  }
  if (signal.id === 'top-revenue-category') {
    return 'receivable';
  }
  if (signal.id === 'top-expense-category') {
    return 'expense';
  }
  if (signal.id === 'revenue-expense-total') {
    return 'result';
  }
  return 'neutral';
}

/** Separa a primeira frase (leitura rápida) do restante, sem alterar o texto. */
function splitLead(body: string): { readonly lead: string; readonly detail: string } {
  const match = /^(.+?\.)\s+(.+)$/s.exec(body.trim());
  const lead = match?.[1];
  const detail = match?.[2];
  if (!lead || !detail) {
    return { lead: body.trim(), detail: '' };
  }
  return { lead, detail };
}

export function ExecutiveSignals({
  signals,
  emptyMessage = 'Sem sinais para a competência do mês.',
  className,
  layout = 'stack',
}: ExecutiveSignalsProps) {
  if (signals.length === 0) {
    return <p className={cx(styles.empty, className)}>{emptyMessage}</p>;
  }

  return (
    <ul className={cx(styles.list, className)} data-layout={layout}>
      {signals.map((signal) => {
        const Icon = SIGNAL_ICONS[signal.id] ?? BarChart3;
        const tone = signalTone(signal);
        const { lead, detail } = splitLead(signal.body);

        return (
          <li key={signal.id} className={styles.item} data-signal={signal.id} data-tone={tone}>
            <span className={styles.icon} aria-hidden="true">
              <Icon size={14} strokeWidth={UI_ICON_STROKE} />
            </span>
            <div className={styles.copy}>
              <p className={styles.lead}>{lead}</p>
              {detail ? <p className={styles.detail}>{detail}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
