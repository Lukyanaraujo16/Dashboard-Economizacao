'use client';

import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
const TODOS_KEY = '__todos__';

type TabItem = {
  readonly key: string;
  readonly id: string | null;
  readonly label: string;
  readonly inactive?: boolean;
};

/**
 * Tabs horizontais de centro de custo (CC1.3).
 * 0 centros → não renderiza (pai deve ocultar).
 * Overflow → setas + scroll; tab ativa trazida para viewport.
 */
export function DashboardCostCenterSelector({
  items,
  selectedId,
  onSelect,
  disabled = false,
  loading = false,
}: DashboardCostCenterSelectorProps) {
  const listId = useId();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const isDisabled = disabled || loading;

  const tabs: readonly TabItem[] = [
    { key: TODOS_KEY, id: null, label: TODOS_LABEL },
    ...items.map((item) => ({
      key: item.id,
      id: item.id,
      label: item.name,
      inactive: !item.active,
    })),
  ];

  const selectedKey = selectedId === null ? TODOS_KEY : selectedId;

  const refreshOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(max - el.scrollLeft > 1);
  }, []);

  useLayoutEffect(() => {
    refreshOverflow();
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    const onScroll = () => refreshOverflow();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => refreshOverflow()) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    };
  }, [refreshOverflow, tabs.length]);

  useLayoutEffect(() => {
    const node = tabRefs.current.get(selectedKey);
    const scroller = scrollerRef.current;
    if (!node || !scroller) {
      return;
    }
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({
        inline: 'nearest',
        block: 'nearest',
        behavior: reduceMotion ? 'auto' : 'smooth',
      });
    }
    refreshOverflow();
  }, [selectedKey, refreshOverflow]);

  const scrollByDir = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const delta = Math.max(120, Math.floor(el.clientWidth * 0.7)) * dir;
    el.scrollBy({ left: delta, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, []);

  const focusTab = useCallback((key: string) => {
    tabRefs.current.get(key)?.focus();
  }, []);

  const onTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (isDisabled) {
        return;
      }
      let next = index;
      if (event.key === 'ArrowRight') {
        next = Math.min(tabs.length - 1, index + 1);
      } else if (event.key === 'ArrowLeft') {
        next = Math.max(0, index - 1);
      } else if (event.key === 'Home') {
        next = 0;
      } else if (event.key === 'End') {
        next = tabs.length - 1;
      } else {
        return;
      }
      event.preventDefault();
      const target = tabs[next];
      if (!target) {
        return;
      }
      focusTab(target.key);
      onSelect(target.id);
    },
    [focusTab, isDisabled, onSelect, tabs],
  );

  if (items.length === 0) {
    return null;
  }

  const showArrows = canScrollLeft || canScrollRight;

  return (
    <section
      className={styles.root}
      aria-label="Centro de custo"
      data-cost-center-selector="true"
      data-cost-center-tabs="true"
    >
      {showArrows ? (
        <button
          type="button"
          className={styles.arrow}
          aria-label="Centros anteriores"
          disabled={isDisabled || !canScrollLeft}
          onClick={() => scrollByDir(-1)}
        >
          <ChevronLeft size={14} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
        </button>
      ) : null}

      <div
        ref={scrollerRef}
        className={styles.scroller}
        data-cost-center-tabs-scroller="true"
      >
        <div className={styles.tablist} role="tablist" aria-label="Centros de custo" id={listId}>
          {tabs.map((tab, index) => {
            const selected = tab.key === selectedKey;
            return (
              <button
                key={tab.key}
                ref={(node) => {
                  if (node) {
                    tabRefs.current.set(tab.key, node);
                  } else {
                    tabRefs.current.delete(tab.key);
                  }
                }}
                type="button"
                role="tab"
                id={`${listId}-${tab.key}`}
                className={styles.tab}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                title={tab.label}
                disabled={isDisabled}
                data-inactive={tab.inactive ? 'true' : undefined}
                onClick={() => onSelect(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                <span className={styles.tabLabel}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {showArrows ? (
        <button
          type="button"
          className={styles.arrow}
          aria-label="Próximos centros"
          disabled={isDisabled || !canScrollRight}
          onClick={() => scrollByDir(1)}
        >
          <ChevronRight size={14} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
