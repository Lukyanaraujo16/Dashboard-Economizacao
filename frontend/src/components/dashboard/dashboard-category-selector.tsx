'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { ChevronDown, Search } from 'lucide-react';

import {
  DASHBOARD_CATEGORY_ALL_LABEL,
  groupDashboardCategories,
  matchesDashboardCategoryQuery,
} from '../../lib/dashboard-category';
import { UI_ICON_STROKE } from '../ui/icons';
import type { DashboardCategoryItem } from '../../services/dashboard/categories.types';
import styles from './dashboard-category-selector.module.css';

export type DashboardCategorySelectorProps = {
  readonly items: readonly DashboardCategoryItem[];
  readonly selectedId: string | null;
  readonly onSelect: (categoryId: string | null) => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly error?: boolean;
};

export function DashboardCategorySelector({
  items,
  selectedId,
  onSelect,
  disabled = false,
  loading = false,
  error = false,
}: DashboardCategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const searchId = useId();
  const isDisabled = disabled || loading;

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const triggerLabel = selected?.name
    ?? (selectedId !== null ? 'Categoria selecionada' : DASHBOARD_CATEGORY_ALL_LABEL);

  const filtered = useMemo(
    () => items.filter((item) => matchesDashboardCategoryQuery(item.name, query)),
    [items, query],
  );
  const groups = useMemo(() => groupDashboardCategories(filtered), [filtered]);

  const flatOptions = useMemo(() => {
    const all: { readonly id: string | null; readonly name: string }[] = [
      { id: null, name: DASHBOARD_CATEGORY_ALL_LABEL },
    ];
    for (const group of groups) {
      for (const item of group.items) {
        all.push(item);
      }
    }
    return all;
  }, [groups]);

  useEffect(() => {
    if (isDisabled) {
      setOpen(false);
    }
  }, [isDisabled]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const selectedIndex = flatOptions.findIndex((option) => option.id === selectedId);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    const handlePointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [flatOptions, open, selectedId]);

  const pick = useCallback(
    (categoryId: string | null) => {
      onSelect(categoryId);
      setOpen(false);
      setQuery('');
      triggerRef.current?.focus();
    },
    [onSelect],
  );

  const onListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => Math.min(flatOptions.length - 1, current + 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) => Math.max(0, current - 1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setActiveIndex(Math.max(0, flatOptions.length - 1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const option = flatOptions[activeIndex];
        if (option) {
          pick(option.id);
        }
      }
    },
    [activeIndex, flatOptions, pick],
  );

  if (items.length === 0 && !loading && !error) {
    return null;
  }

  const activeOption = flatOptions[activeIndex];
  const activeId = activeOption ? `${listId}-${activeOption.id ?? 'all'}` : undefined;

  return (
    <div
      ref={rootRef}
      className={styles.root}
      data-category-selector="true"
      data-category={selectedId ?? 'all'}
    >
      <span className={styles.label} id={`${listId}-label`}>
        Categoria
      </span>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Categoria: ${loading ? 'Carregando…' : triggerLabel}`}
        data-active={selectedId !== null ? 'true' : undefined}
        disabled={isDisabled}
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className={styles.triggerText}>{loading ? 'Carregando…' : triggerLabel}</span>
        <ChevronDown
          className={styles.caret}
          size={13}
          strokeWidth={UI_ICON_STROKE}
          aria-hidden="true"
        />
      </button>
      {error && items.length === 0 ? (
        <p className={styles.inlineError} role="status">
          Não foi possível carregar as categorias.
        </p>
      ) : null}
      {open ? (
        <div className={styles.popover} role="presentation">
          <div className={styles.searchRow}>
            <Search size={14} strokeWidth={UI_ICON_STROKE} aria-hidden="true" />
            <input
              ref={searchRef}
              id={searchId}
              className={styles.search}
              type="search"
              value={query}
              placeholder="Buscar categoria"
              aria-label="Buscar categoria"
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onListKeyDown}
            />
          </div>
          <ul
            id={listId}
            className={styles.list}
            role="listbox"
            aria-label="Categorias"
            aria-activedescendant={activeId}
          >
            <li role="none">
              <button
                type="button"
                id={`${listId}-all`}
                role="option"
                className={styles.option}
                aria-selected={selectedId === null}
                data-active={activeOption?.id === null ? 'true' : undefined}
                onMouseEnter={() => setActiveIndex(0)}
                onClick={() => pick(null)}
              >
                {DASHBOARD_CATEGORY_ALL_LABEL}
              </button>
            </li>
            {groups.length === 0 ? (
              <li className={styles.empty} role="presentation">
                Nenhuma categoria encontrada.
              </li>
            ) : (
              groups.map((group) => (
                <li key={group.type} role="group" aria-label={group.label} className={styles.group}>
                  <p className={styles.groupLabel}>{group.label}</p>
                  <ul className={styles.groupList} role="presentation">
                    {group.items.map((item) => {
                      const index = flatOptions.findIndex((option) => option.id === item.id);
                      return (
                        <li key={item.id} role="none">
                          <button
                            type="button"
                            id={`${listId}-${item.id}`}
                            role="option"
                            className={styles.option}
                            aria-selected={selectedId === item.id}
                            data-active={activeOption?.id === item.id ? 'true' : undefined}
                            title={item.name}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => pick(item.id)}
                          >
                            {item.name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
