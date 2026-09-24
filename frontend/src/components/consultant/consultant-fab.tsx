import { MessageCircle } from 'lucide-react';

import { UI_ICON_STROKE } from '../ui/icons';
import { cx } from '../ui/utils/cx';
import styles from './consultant.module.css';

export type ConsultantFabProps = {
  readonly onOpen: () => void;
  readonly available?: boolean;
  readonly consultantName?: string;
};

export function ConsultantFab({
  onOpen,
  available = false,
  consultantName = 'Consultor',
}: ConsultantFabProps) {
  const label = available
    ? `Abrir o ${consultantName} — Consultor disponível`
    : `Abrir o ${consultantName}`;

  return (
    <button
      type="button"
      className={styles.fab}
      aria-label={label}
      title={available ? 'Consultor disponível' : consultantName}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <MessageCircle size={20} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
      <span
        className={cx(styles.fabStatus, available && styles.fabStatusAvailable)}
        aria-hidden="true"
      />
    </button>
  );
}
