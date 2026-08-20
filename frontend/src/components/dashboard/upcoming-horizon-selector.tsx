import { Button } from '../ui';
import {
  DASHBOARD_UPCOMING_DAY_OPTIONS,
  type DashboardUpcomingDays,
} from '../../services/dashboard/upcoming.types';
import styles from './upcoming-list.module.css';

export type UpcomingHorizonSelectorProps = {
  readonly value: DashboardUpcomingDays;
  readonly onChange: (days: DashboardUpcomingDays) => void;
  readonly disabled?: boolean;
};

export function UpcomingHorizonSelector({
  value,
  onChange,
  disabled = false,
}: UpcomingHorizonSelectorProps) {
  return (
    <div className={styles.toolbar} role="group" aria-label="Janela da pressão de caixa">
      {DASHBOARD_UPCOMING_DAY_OPTIONS.map((days) => {
        const selected = days === value;
        return (
          <Button
            key={days}
            type="button"
            size="sm"
            variant={selected ? 'secondary' : 'ghost'}
            className={styles.chip}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(days)}
          >
            {days} dias
          </Button>
        );
      })}
    </div>
  );
}
