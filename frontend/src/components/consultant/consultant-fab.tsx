import { MessageCircle } from 'lucide-react';

import { UI_ICON_STROKE } from '../ui/icons';
import styles from './consultant.module.css';

export type ConsultantFabProps = {
  readonly onOpen: () => void;
};

export function ConsultantFab({ onOpen }: ConsultantFabProps) {
  return (
    <button
      type="button"
      className={styles.fab}
      aria-label="Abrir o Consultor"
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <MessageCircle size={20} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
    </button>
  );
}
