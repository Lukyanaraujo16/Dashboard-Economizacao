import type { Ref } from 'react';
import { Sparkles } from 'lucide-react';

import { UI_ICON_STROKE } from '../ui/icons';
import { ConsultantPresence } from './consultant-presence';
import { proactiveBalloonCopy, visibleUnreadCount } from './consultant-proactive-manifest';
import { useConsultantWorkspace } from './consultant-workspace';
import styles from './consultant.module.css';

export type ConsultantFabProps = {
  readonly onOpen: () => void;
  readonly available?: boolean;
  readonly consultantName?: string;
  readonly unreadCount?: number;
  readonly showBalloon?: boolean;
  readonly pulse?: boolean;
  readonly onDismissBalloon?: () => void;
  readonly fabRef?: Ref<HTMLButtonElement>;
};

export function ConsultantFab({
  onOpen,
  available = false,
  consultantName = 'Consultor',
  unreadCount = 0,
  showBalloon = false,
  pulse = false,
  onDismissBalloon,
  fabRef,
}: ConsultantFabProps) {
  const workspace = useConsultantWorkspace();
  const baseLabel = available
    ? `Falar com ${consultantName}`
    : `Falar com ${consultantName} — indisponível`;
  const visibleCount = visibleUnreadCount(unreadCount);
  const label =
    unreadCount > 0
      ? `${baseLabel}. ${unreadCount} ${unreadCount === 1 ? 'aviso novo' : 'avisos novos'}`
      : baseLabel;

  return (
    <div className={styles.fabCluster} data-lia-layer="overlay">
      {showBalloon && unreadCount > 0 ? (
        <aside className={styles.liaBalloon} aria-label="A Lia tem algo novo" onClick={onOpen}>
          <button
            type="button"
            className={styles.liaBalloonClose}
            aria-label="Fechar aviso da Lia"
            onClick={(event) => {
              event.stopPropagation();
              onDismissBalloon?.();
            }}
          >
            ×
          </button>
          <p className={styles.liaBalloonTitle}>Lia</p>
          <p className={styles.liaBalloonCopy}>{proactiveBalloonCopy(unreadCount)}</p>
          <div className={styles.liaBalloonActions}>
            <button
              type="button"
              className={styles.liaBalloonOpen}
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              Ver agora
            </button>
          </div>
        </aside>
      ) : null}
      <div className={styles.fabAnchor}>
        <button
          type="button"
          ref={fabRef}
          className={pulse ? `${styles.fab} ${styles.fabPulse}` : styles.fab}
          data-lia-layer="overlay"
          aria-label={label}
          title={label}
          aria-haspopup={workspace ? undefined : 'dialog'}
          aria-expanded={workspace ? false : undefined}
          onClick={onOpen}
        >
          <Sparkles size={18} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
          <span className={styles.fabLabel}>{`Falar com ${consultantName}`}</span>
          <span className={styles.fabStatus}>
            <ConsultantPresence available={available} />
          </span>
        </button>
        {unreadCount > 0 ? (
          <span className={styles.fabBadge} aria-hidden="true">
            {visibleCount}
          </span>
        ) : null}
      </div>
    </div>
  );
}
