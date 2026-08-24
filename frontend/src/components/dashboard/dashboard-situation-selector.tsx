'use client';

import { useId } from 'react';
import { ChevronDown } from 'lucide-react';

import {
  DASHBOARD_SITUATION_ALL_LABEL,
  DASHBOARD_SITUATION_LABELS,
  DASHBOARD_SITUATIONS,
  type DashboardSituation,
} from '../../lib/dashboard-situation';
import { UI_ICON_STROKE } from '../ui/icons';
import styles from './dashboard-situation-selector.module.css';

export type DashboardSituationSelectorProps = {
  readonly selected: DashboardSituation | null;
  readonly onSelect: (situation: DashboardSituation | null) => void;
  readonly disabled?: boolean;
};

export function DashboardSituationSelector({
  selected,
  onSelect,
  disabled = false,
}: DashboardSituationSelectorProps) {
  const selectId = useId();
  const active = selected !== null;

  return (
    <div
      className={styles.root}
      data-situation-selector="true"
      data-situation={selected ?? 'all'}
    >
      <label className={styles.label} htmlFor={selectId}>
        Situação
      </label>
      <div className={styles.control}>
        <select
          id={selectId}
          className={styles.select}
          value={selected ?? ''}
          disabled={disabled}
          aria-label="Situação"
          data-active={active ? 'true' : undefined}
          onChange={(event) => {
            const value = event.target.value;
            onSelect(value === '' ? null : (value as DashboardSituation));
          }}
        >
          <option value="">{DASHBOARD_SITUATION_ALL_LABEL}</option>
          {DASHBOARD_SITUATIONS.map((situation) => (
            <option key={situation} value={situation}>
              {DASHBOARD_SITUATION_LABELS[situation]}
            </option>
          ))}
        </select>
        <ChevronDown
          className={styles.caret}
          size={13}
          strokeWidth={UI_ICON_STROKE}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
