'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button, IconButton } from '../ui';
import { UI_ICON_STROKE } from '../ui/icons';
import {
  dashboardMonthPhase,
  listDashboardMonthKeysForYear,
  monthShortLabelPtBr,
  shiftDashboardMonthKey,
  type DashboardMonthPhase,
} from '../../lib/dashboard-month';
import styles from './dashboard-month-selector.module.css';

export type DashboardMonthSelectorProps = {
  readonly selectedMonthKey: string;
  readonly todayMonthKey: string;
  readonly onSelect: (monthKey: string) => void;
  readonly disabled?: boolean;
  /** Rótulo do agrupamento (ex.: De / Até nos Relatórios). */
  readonly groupLabel?: string;
};

function phaseHint(phase: DashboardMonthPhase): string {
  if (phase === 'future') {
    return 'Previsto';
  }
  if (phase === 'past') {
    return 'Competência';
  }
  return 'Atual';
}

/** AGO 2026 — rótulo compacto do mês selecionado. */
function compactMonthLabel(monthKey: string): string {
  const short = monthShortLabelPtBr(monthKey);
  if (short === monthKey) {
    return monthKey;
  }
  return `${short.toUpperCase()} ${monthKey.slice(0, 4)}`;
}

export function DashboardMonthSelector({
  selectedMonthKey,
  todayMonthKey,
  onSelect,
  disabled = false,
  groupLabel = 'Visão mensal por competência',
}: DashboardMonthSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId();

  const selectedYear = Number(selectedMonthKey.slice(0, 4));
  const hasYear = Number.isInteger(selectedYear);
  const months = hasYear ? listDashboardMonthKeysForYear(selectedYear) : [];
  const selectedPhase = dashboardMonthPhase(selectedMonthKey, todayMonthKey);
  const atToday = selectedMonthKey === todayMonthKey;

  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);

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
    (monthKey: string) => {
      onSelect(monthKey);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onSelect],
  );

  return (
    <section
      ref={rootRef}
      className={styles.root}
      aria-label={groupLabel}
      data-selected-phase={selectedPhase}
    >
      <IconButton
        size="sm"
        variant="ghost"
        aria-label="Mês anterior"
        disabled={disabled}
        onClick={() => onSelect(shiftDashboardMonthKey(selectedMonthKey, -1))}
      >
        <ChevronLeft size={16} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
      </IconButton>

      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        disabled={disabled || !hasYear}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className={styles.triggerLabel} aria-live="polite">
          {compactMonthLabel(selectedMonthKey)}
        </span>
        <ChevronDown
          className={styles.triggerCaret}
          size={13}
          strokeWidth={UI_ICON_STROKE}
          aria-hidden="true"
        />
      </button>

      <IconButton
        size="sm"
        variant="ghost"
        aria-label="Próximo mês"
        disabled={disabled}
        onClick={() => onSelect(shiftDashboardMonthKey(selectedMonthKey, 1))}
      >
        <ChevronRight size={16} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
      </IconButton>

      {atToday ? null : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={styles.today}
          aria-label="Voltar ao mês atual"
          disabled={disabled}
          onClick={() => pick(todayMonthKey)}
        >
          Hoje
        </Button>
      )}

      {open ? (
        <div id={popoverId} className={styles.popover}>
          <div className={styles.popoverHead}>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Ano anterior"
              onClick={() => onSelect(shiftDashboardMonthKey(selectedMonthKey, -12))}
            >
              <ChevronLeft size={14} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
            </IconButton>
            <p className={styles.popoverYear} aria-live="polite">
              {selectedYear}
            </p>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label="Próximo ano"
              onClick={() => onSelect(shiftDashboardMonthKey(selectedMonthKey, 12))}
            >
              <ChevronRight size={14} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
            </IconButton>
          </div>

          <div className={styles.monthGrid} role="group" aria-label={`Meses de ${selectedYear}`}>
            {months.map((monthKey) => {
              const phase = dashboardMonthPhase(monthKey, todayMonthKey);
              const selected = monthKey === selectedMonthKey;
              return (
                <button
                  key={monthKey}
                  type="button"
                  className={styles.monthOption}
                  data-phase={phase}
                  aria-pressed={selected}
                  aria-label={`${monthShortLabelPtBr(monthKey)} ${selectedYear}, ${phaseHint(phase)}`}
                  onClick={() => pick(monthKey)}
                >
                  {monthShortLabelPtBr(monthKey).toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
