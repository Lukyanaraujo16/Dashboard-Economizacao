import type { ReactNode } from 'react';

import { IconBarChart3, IconList, IconTriangleAlert } from '../ui/icons';
import { cx } from '../ui/utils/cx';
import styles from './panel-icon.module.css';

export type PanelIconKind = 'chart' | 'list' | 'alert';

export type PanelIconProps = {
  readonly kind: PanelIconKind;
  readonly className?: string;
};

const GLYPHS: Record<PanelIconKind, () => ReactNode> = {
  chart: () => <IconBarChart3 size={20} />,
  list: () => <IconList size={20} />,
  alert: () => <IconTriangleAlert size={20} />,
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
