import type { ReactNode } from 'react';

import { cx } from '../ui/utils/cx';
import styles from './panel-icon.module.css';

export type PanelIconKind = 'chart' | 'list' | 'alert';

export type PanelIconProps = {
  readonly kind: PanelIconKind;
  readonly className?: string;
};

function ChartGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M8 15v-3M12 15V8M16 15v-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ListGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M9 7h10M9 12h10M9 17h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="5" cy="7" r="1" fill="currentColor" />
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="5" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

function AlertGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path d="M12 8v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="16.5" r="1" fill="currentColor" />
      <path
        d="M12 4.5 20 18.5H4L12 4.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const GLYPHS: Record<PanelIconKind, () => ReactNode> = {
  chart: ChartGlyph,
  list: ListGlyph,
  alert: AlertGlyph,
};

/** Ícone neutro decorativo para estados vazios de painéis financeiros. */
export function PanelIcon({ kind, className }: PanelIconProps) {
  const Glyph = GLYPHS[kind];
  return (
    <span className={cx(styles.root, className)} aria-hidden="true" data-panel-icon={kind}>
      <Glyph />
    </span>
  );
}
