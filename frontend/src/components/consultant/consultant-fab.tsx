import { Sparkles } from 'lucide-react';

import { UI_ICON_STROKE } from '../ui/icons';
import { ConsultantPresence } from './consultant-presence';
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
    ? `Falar com ${consultantName}`
    : `Falar com ${consultantName} — indisponível`;

  return (
    <button
      type="button"
      className={styles.fab}
      aria-label={label}
      title={label}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <Sparkles size={18} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
      <span className={styles.fabLabel}>{`Falar com ${consultantName}`}</span>
      <span className={styles.fabStatus}>
        <ConsultantPresence available={available} />
      </span>
    </button>
  );
}
