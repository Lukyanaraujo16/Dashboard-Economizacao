import type { Ref } from 'react';
import { Sparkles } from 'lucide-react';

import { UI_ICON_STROKE } from '../ui/icons';
import { ConsultantPresence } from './consultant-presence';
import { useConsultantWorkspace } from './consultant-workspace';
import styles from './consultant.module.css';

export type ConsultantFabProps = {
  readonly onOpen: () => void;
  readonly available?: boolean;
  readonly consultantName?: string;
  readonly unreadCount?: number;
  readonly fabRef?: Ref<HTMLButtonElement>;
};

export function ConsultantFab({
  onOpen,
  available = false,
  consultantName = 'Consultor',
  unreadCount = 0,
  fabRef,
}: ConsultantFabProps) {
  const workspace = useConsultantWorkspace();
  const baseLabel = available
    ? `Falar com ${consultantName}`
    : `Falar com ${consultantName} — indisponível`;
  const visibleCount = unreadCount > 9 ? '9+' : String(unreadCount);
  const label =
    unreadCount > 0
      ? `${baseLabel}. ${unreadCount} ${unreadCount === 1 ? 'aviso novo' : 'avisos novos'}`
      : baseLabel;

  return (
    <button
      type="button"
      ref={fabRef}
      className={styles.fab}
      data-lia-layer="overlay"
      aria-label={label}
      title={label}
      aria-haspopup={workspace ? undefined : 'dialog'}
      aria-expanded={workspace ? false : undefined}
      onClick={onOpen}
    >
      <Sparkles size={18} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
      <span className={styles.fabLabel}>{`Falar com ${consultantName}`}</span>
      {unreadCount > 0 ? (
        <span className={styles.fabBadge}>{visibleCount}</span>
      ) : null}
      <span className={styles.fabStatus}>
        <ConsultantPresence available={available} />
      </span>
    </button>
  );
}
