import { cx } from '../ui/utils/cx';
import styles from './consultant.module.css';

type ConsultantPresenceProps = {
  readonly available: boolean;
  readonly className?: string;
};

export function ConsultantPresence({ available, className }: ConsultantPresenceProps) {
  return (
    <span
      className={cx(styles.presence, available && styles.presenceAvailable, className)}
      data-testid="consultant-presence"
      data-available={available ? 'true' : 'false'}
      aria-hidden="true"
    >
      {available ? <span className={styles.presenceHalo} /> : null}
      <span className={styles.presenceDot} />
    </span>
  );
}
