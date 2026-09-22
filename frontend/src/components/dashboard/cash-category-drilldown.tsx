import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { formatDelinquencyRate, formatMoneyBrl } from '../../lib/format-money-brl';
import { getDashboardCashRealizedDetails } from '../../services/dashboard/cash-realized-details';
import type {
  CashRealizedCategoryKind,
  CashRealizedDetailsDirection,
  DashboardCashRealizedDetailItem,
} from '../../services/dashboard/cash-realized-details.types';
import { DashboardCashRealizedDetailsRequestError } from '../../services/dashboard/cash-realized-details.types';
import type { DashboardCashRealizedCategoryComposition } from '../../services/dashboard/monthly-cash-flow.types';
import { cx } from '../ui/utils/cx';
import { formatCivilDatePtBr } from './dashboard-upcoming-view';
import {
  cashRealizedDetailsCacheKey,
  groupCashRealizedDetailsByCounterparty,
  mergeCashRealizedDetailPages,
  sumAttributedAmounts,
} from './cash-realized-details-view';
import { maxAbs, parseAmount } from './v2/chart-math';
import styles from './cash-category-drilldown.module.css';

const PAGE_LIMIT = 100;

export type CashCategoryDrilldownProps = {
  readonly composition: DashboardCashRealizedCategoryComposition;
  readonly direction: CashRealizedDetailsDirection;
  readonly monthKey: string;
  readonly tenantId: string;
  readonly costCenterId: string | null;
  readonly categoryId: string | null;
  readonly colorVar?: string;
  readonly emptyMessage?: string;
  readonly sectionTitle?: string;
};

type CategoryLoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'ready';
      readonly total: string | null;
      readonly itemCount: number;
      readonly items: readonly DashboardCashRealizedDetailItem[];
      readonly available: boolean;
    }
  | { readonly kind: 'error'; readonly message: string };

type CacheEntry = {
  readonly total: string | null;
  readonly itemCount: number;
  readonly items: readonly DashboardCashRealizedDetailItem[];
  readonly available: boolean;
};

function barPercent(amount: string, scale: number): number {
  if (scale <= 0) {
    return 0;
  }
  const ratio = (Math.abs(parseAmount(amount)) / scale) * 100;
  return Math.min(100, Math.max(0, ratio));
}

function categoryIdentityKey(kind: string, key: string): string {
  return `${kind}::${key}`;
}

export function CashCategoryDrilldown({
  composition,
  direction,
  monthKey,
  tenantId,
  costCenterId,
  categoryId,
  colorVar = '--color-series-revenue',
  emptyMessage = 'Sem movimentação categorizada neste recorte.',
  sectionTitle,
}: CashCategoryDrilldownProps) {
  const items = composition.items;
  const scale = maxAbs(items.map((item) => parseAmount(item.amount)));
  const style = { '--ranking-color': `var(${colorVar})` } as CSSProperties;

  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const [loadByCategory, setLoadByCategory] = useState<ReadonlyMap<string, CategoryLoadState>>(
    () => new Map(),
  );
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const inflightRef = useRef<Map<string, AbortController>>(new Map());
  const contextStamp = useMemo(
    () =>
      [tenantId, monthKey, direction, costCenterId ?? '', categoryId ?? ''].join('|'),
    [tenantId, monthKey, direction, costCenterId, categoryId],
  );

  useEffect(() => {
    setExpandedCategoryId(null);
    setExpandedGroups(new Set());
    setLoadByCategory(new Map());
    cacheRef.current.clear();
    for (const controller of inflightRef.current.values()) {
      controller.abort();
    }
    inflightRef.current.clear();
  }, [contextStamp]);

  const setCategoryState = useCallback((identity: string, state: CategoryLoadState) => {
    setLoadByCategory((prev) => {
      const next = new Map(prev);
      next.set(identity, state);
      return next;
    });
  }, []);

  const fetchPage = useCallback(
    async (
      category: { readonly kind: CashRealizedCategoryKind; readonly key: string },
      offset: number,
      append: boolean,
    ) => {
      const identity = categoryIdentityKey(category.kind, category.key);
      const cacheKey = cashRealizedDetailsCacheKey({
        tenantId,
        monthKey,
        direction,
        categoryKind: category.kind,
        categoryKey: category.key,
        costCenterId,
        categoryId,
      });

      if (!append) {
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          setCategoryState(identity, { kind: 'ready', ...cached });
          return;
        }
      }

      const existingController = inflightRef.current.get(identity);
      if (existingController && !append) {
        return;
      }

      const controller = new AbortController();
      inflightRef.current.set(identity, controller);
      setCategoryState(identity, { kind: 'loading' });

      try {
        const page = await getDashboardCashRealizedDetails({
          monthKey,
          costCenterId,
          categoryId,
          direction,
          categoryKey: category.key,
          categoryKind: category.kind,
          limit: PAGE_LIMIT,
          offset,
        });
        if (controller.signal.aborted) {
          return;
        }

        const previous = append ? (cacheRef.current.get(cacheKey)?.items ?? []) : [];
        const mergedItems = mergeCashRealizedDetailPages(previous, page.items);
        const entry: CacheEntry = {
          total: page.total,
          itemCount: page.itemCount,
          items: mergedItems,
          available: page.available,
        };
        cacheRef.current.set(cacheKey, entry);
        setCategoryState(identity, { kind: 'ready', ...entry });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof DashboardCashRealizedDetailsRequestError
            ? error.message
            : 'Não foi possível carregar o detalhe da categoria.';
        setCategoryState(identity, { kind: 'error', message });
      } finally {
        if (inflightRef.current.get(identity) === controller) {
          inflightRef.current.delete(identity);
        }
      }
    },
    [tenantId, monthKey, direction, costCenterId, categoryId, setCategoryState],
  );

  const toggleCategory = useCallback(
    (category: {
      readonly kind: CashRealizedCategoryKind;
      readonly key: string;
    }) => {
      const identity = categoryIdentityKey(category.kind, category.key);
      if (expandedCategoryId === identity) {
        setExpandedCategoryId(null);
        return;
      }
      setExpandedCategoryId(identity);
      setExpandedGroups(new Set());
      void fetchPage(category, 0, false);
    },
    [expandedCategoryId, fetchPage],
  );

  const toggleGroup = useCallback((groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  if (items.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <div
      className={styles.root}
      style={style}
      data-cash-category-drilldown={sectionTitle ?? 'categories'}
    >
      <ol className={styles.list}>
        {items.map((item, index) => {
          const kind = item.kind as CashRealizedCategoryKind;
          const identity = categoryIdentityKey(kind, item.key);
          const expanded = expandedCategoryId === identity;
          const loadState = loadByCategory.get(identity) ?? { kind: 'idle' as const };
          const groups =
            loadState.kind === 'ready'
              ? groupCashRealizedDetailsByCounterparty(loadState.items)
              : [];
          const loadedCount = loadState.kind === 'ready' ? loadState.items.length : 0;
          const hasMore =
            loadState.kind === 'ready' && loadState.itemCount > loadedCount;
          const groupsSum =
            loadState.kind === 'ready' && loadedCount === loadState.itemCount
              ? sumAttributedAmounts(groups.map((group) => group.attributedAmount))
              : null;

          return (
            <li key={identity} className={styles.item}>
              <div className={styles.categoryRow}>
                <span className={styles.rank} aria-hidden="true">
                  {index + 1}
                </span>
                <button
                  type="button"
                  className={styles.categoryToggle}
                  aria-expanded={expanded}
                  aria-controls={`cash-cat-panel-${identity}`}
                  id={`cash-cat-btn-${identity}`}
                  onClick={() => toggleCategory({ kind, key: item.key })}
                >
                  <span className={styles.chevron} aria-hidden="true">
                    <span className={styles.chevronGlyph} />
                  </span>
                  <span className={styles.categoryContent}>
                    <span className={styles.labelRow}>
                      <span className={styles.name}>{item.name}</span>
                      <span className={styles.value}>{formatMoneyBrl(item.amount)}</span>
                    </span>
                    <span className={styles.track}>
                      <span
                        className={styles.bar}
                        style={{ width: `${barPercent(item.amount, scale)}%` }}
                        aria-hidden="true"
                      />
                    </span>
                  </span>
                  <span className={styles.percentage}>
                    {formatDelinquencyRate(item.percentage)}
                  </span>
                </button>
              </div>

              {expanded ? (
                <div
                  className={styles.panel}
                  id={`cash-cat-panel-${identity}`}
                  role="region"
                  aria-labelledby={`cash-cat-btn-${identity}`}
                >
                  {loadState.kind === 'loading' || loadState.kind === 'idle' ? (
                    <p className={styles.status}>Carregando composição…</p>
                  ) : null}
                  {loadState.kind === 'error' ? (
                    <div className={styles.errorRow}>
                      <p className={styles.error}>{loadState.message}</p>
                      <button
                        type="button"
                        className={styles.retry}
                        onClick={() => void fetchPage({ kind, key: item.key }, 0, false)}
                      >
                        Tentar novamente
                      </button>
                    </div>
                  ) : null}
                  {loadState.kind === 'ready' &&
                  (!loadState.available || loadState.itemCount === 0) ? (
                    <p className={styles.status}>Sem lançamentos nesta categoria.</p>
                  ) : null}
                  {loadState.kind === 'ready' && loadState.itemCount > 0 ? (
                    <>
                      <ul className={styles.groupList}>
                        {groups.map((group) => {
                          const groupKey = `${identity}::${group.label}`;
                          const groupOpen = expandedGroups.has(groupKey);
                          return (
                            <li key={groupKey} className={styles.groupItem}>
                              <button
                                type="button"
                                className={styles.groupToggle}
                                aria-expanded={groupOpen}
                                onClick={() => toggleGroup(groupKey)}
                              >
                                <span className={styles.chevron} aria-hidden="true">
                                  <span className={styles.chevronGlyph} />
                                </span>
                                <span className={styles.groupName}>{group.label}</span>
                                <span className={styles.groupValue}>
                                  {formatMoneyBrl(group.attributedAmount)}
                                </span>
                              </button>
                              {groupOpen ? (
                                <ul className={styles.settlementList}>
                                  {group.items.map((settlement) => (
                                    <li
                                      key={settlement.settlementExternalId}
                                      className={styles.settlementItem}
                                    >
                                      <span className={styles.settlementMeta}>
                                        {formatCivilDatePtBr(settlement.occurredOn)}
                                        {settlement.description?.trim()
                                          ? ` · ${settlement.description.trim()}`
                                          : ''}
                                      </span>
                                      <span className={styles.settlementValue}>
                                        {formatMoneyBrl(settlement.attributedAmount)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      {hasMore ? (
                        <button
                          type="button"
                          className={styles.loadMore}
                          onClick={() =>
                            void fetchPage({ kind, key: item.key }, loadedCount, true)
                          }
                        >
                          Carregar mais ({loadedCount} de {loadState.itemCount})
                        </button>
                      ) : null}
                      {groupsSum !== null ? (
                        <p className={cx(styles.status, styles.srOnly)}>
                          Soma dos grupos {groupsSum}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
