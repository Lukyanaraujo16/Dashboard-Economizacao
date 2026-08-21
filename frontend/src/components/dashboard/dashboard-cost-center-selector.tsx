'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { UI_ICON_STROKE } from '../ui/icons';
import type { DashboardCostCenterItem } from '../../services/dashboard/cost-centers.types';
import styles from './dashboard-cost-center-selector.module.css';

export type DashboardCostCenterSelectorProps = {
  readonly items: readonly DashboardCostCenterItem[];
  readonly selectedId: string | null;
  readonly onSelect: (costCenterId: string | null) => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
};

const TODOS_LABEL = 'Todos';

export function DashboardCostCenterSelector({
  items,
  selectedId,
  onSelect,
  disabled = false,
  loading = false,
}: DashboardCostCenterSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listId = useId();

  const selected = selectedId === null ? null : items.find((item) => item.id === selectedId);
  const triggerLabel = selected?.name ?? TODOS_LABEL;
  const isDisabled = disabled || loading;

  useEffect(() => {
    if (isDisabled) {
      setOpen(false);
    }
  }, [isDisabled]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const pick = useCallback(
    (costCenterId: string | null) => {
      onSelect(costCenterId);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onSelect],
  );

  return (
    <section
      ref={rootRef}
      className={styles.root}
      aria-label="Centro de custo"
      data-cost-center-selector="true"
    >
      {/* Mobile / compact: native select */}
      <div className={styles.nativeWrap}>
        <select
          className={styles.nativeSelect}
          aria-label="Filtrar por centro de custo"
          disabled={isDisabled}
          value={selectedId ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            pick(value === '' ? null : value);
          }}
        >
          <option value="">{TODOS_LABEL}</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: custom dropdown aligned with month selector */}
      <div className={styles.desktop}>
        <button
          ref={triggerRef}
          type="button"
          className={styles.trigger}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={`Centro de custo: ${triggerLabel}`}
          disabled={isDisabled}
          onClick={() => setOpen((previous) => !previous)}
        >
          <span className={styles.triggerLabel} aria-live="polite">
            {triggerLabel}
          </span>
          <ChevronDown
            className={styles.triggerCaret}
            size={13}
            strokeWidth={UI_ICON_STROKE}
            aria-hidden="true"
          />
        </button>

        {open ? (
          <ul id={listId} className={styles.popover} role="listbox" aria-label="Centros de custo">
            <li role="presentation">
              <button
                type="button"
                className={styles.option}
                role="option"
                aria-selected={selectedId === null}
                onClick={() => pick(null)}
              >
                {TODOS_LABEL}
              </button>
            </li>
            {items.map((item) => (
              <li key={item.id} role="presentation">
                <button
                  type="button"
                  className={styles.option}
                  role="option"
                  aria-selected={item.id === selectedId}
                  data-inactive={item.active ? undefined : 'true'}
                  onClick={() => pick(item.id)}
                >
                  {item.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
