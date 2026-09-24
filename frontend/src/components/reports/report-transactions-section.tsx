'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { REPORT_TYPE_EXPENSES, type ReportType } from '../../lib/reports-query';
import {
  getReportsExpensesDetails,
  getReportsRevenueDetails,
  ReportsCashDetailsRequestError,
} from '../../services/reports/details';
import type {
  ReportCashDetailSituation,
  ReportCashDetailsResponse,
} from '../../services/reports/details.types';
import { FinancialSection } from '../financial';
import {
  ReportTransactionsBlock,
  type ReportTransactionsBlockState,
} from './report-transactions-block';
import {
  mergeReportCashDetailItems,
  REPORT_DETAIL_SITUATIONS,
  REPORT_TRANSACTIONS_PAGE_SIZE,
  reportTransactionsLoadErrorMessage,
  reportTransactionsSectionTitle,
} from './report-transactions-view';
import styles from './reports-page.module.css';

export type ReportTransactionsFilters = {
  readonly type: ReportType;
  readonly from: string;
  readonly to: string;
  readonly costCenterId: string | null;
  readonly categoryId: string | null;
};

export type ReportTransactionsSectionProps = {
  readonly filters: ReportTransactionsFilters;
};

type BlocksState = Record<ReportCashDetailSituation, ReportTransactionsBlockState>;

function initialLoadingBlocks(): BlocksState {
  return {
    REALIZED: { kind: 'loading' },
    EXPECTED: { kind: 'loading' },
    OVERDUE: { kind: 'loading' },
  };
}

function filtersKey(filters: ReportTransactionsFilters): string {
  return `${filters.type}|${filters.from}|${filters.to}|${filters.costCenterId ?? ''}|${filters.categoryId ?? ''}`;
}

function toReadyState(page: ReportCashDetailsResponse): ReportTransactionsBlockState {
  return {
    kind: 'ready',
    available: page.available,
    unavailableReason: page.unavailableReason,
    totalAmount: page.totalAmount,
    itemCount: page.itemCount,
    items: page.items,
    loadingMore: false,
    loadMoreError: null,
  };
}

function errorMessage(type: ReportType, error: unknown): string {
  if (error instanceof ReportsCashDetailsRequestError) {
    return error.message;
  }
  return reportTransactionsLoadErrorMessage(type);
}

async function fetchDetails(
  filters: ReportTransactionsFilters,
  situation: ReportCashDetailSituation,
  offset: number,
): Promise<ReportCashDetailsResponse> {
  const options = {
    from: filters.from,
    to: filters.to,
    situation,
    costCenterId: filters.costCenterId,
    categoryId: filters.categoryId,
    limit: REPORT_TRANSACTIONS_PAGE_SIZE,
    offset,
  };
  return filters.type === REPORT_TYPE_EXPENSES
    ? getReportsExpensesDetails(options)
    : getReportsRevenueDetails(options);
}

export function ReportTransactionsSection({ filters }: ReportTransactionsSectionProps) {
  const [blocks, setBlocks] = useState<BlocksState>(initialLoadingBlocks);
  const generationRef = useRef(0);
  const filtersRef = useRef(filters);
  const blocksRef = useRef(blocks);
  filtersRef.current = filters;
  blocksRef.current = blocks;
  const requestKey = filtersKey(filters);

  const loadSituation = useCallback(async (situation: ReportCashDetailSituation, generation: number) => {
    const currentFilters = filtersRef.current;
    try {
      const page = await fetchDetails(currentFilters, situation, 0);
      if (generationRef.current !== generation) {
        return;
      }
      setBlocks((current) => ({
        ...current,
        [situation]: toReadyState(page),
      }));
    } catch (error) {
      if (generationRef.current !== generation) {
        return;
      }
      setBlocks((current) => ({
        ...current,
        [situation]: { kind: 'error', message: errorMessage(currentFilters.type, error) },
      }));
    }
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    setBlocks(initialLoadingBlocks());
    void Promise.allSettled(
      REPORT_DETAIL_SITUATIONS.map((situation) => loadSituation(situation, generation)),
    );
  }, [loadSituation, requestKey]);

  const retry = useCallback(
    (situation: ReportCashDetailSituation) => {
      const generation = generationRef.current;
      setBlocks((current) => ({
        ...current,
        [situation]: { kind: 'loading' },
      }));
      void loadSituation(situation, generation);
    },
    [loadSituation],
  );

  const loadMore = useCallback(async (situation: ReportCashDetailSituation) => {
    const generation = generationRef.current;
    const currentFilters = filtersRef.current;
    const current = blocksRef.current[situation];
    if (current.kind !== 'ready' || current.loadingMore || !current.available) {
      return;
    }
    if (current.items.length >= current.itemCount) {
      return;
    }
    const offset = current.items.length;
    setBlocks((prev) => {
      const block = prev[situation];
      if (block.kind !== 'ready') {
        return prev;
      }
      return {
        ...prev,
        [situation]: { ...block, loadingMore: true, loadMoreError: null },
      };
    });
    try {
      const page = await fetchDetails(currentFilters, situation, offset);
      if (generationRef.current !== generation) {
        return;
      }
      setBlocks((prev) => {
        const block = prev[situation];
        if (block.kind !== 'ready') {
          return prev;
        }
        return {
          ...prev,
          [situation]: {
            ...block,
            available: page.available,
            unavailableReason: page.unavailableReason,
            totalAmount: page.totalAmount,
            itemCount: page.itemCount,
            items: mergeReportCashDetailItems(block.items, page.items),
            loadingMore: false,
            loadMoreError: null,
          },
        };
      });
    } catch (error) {
      if (generationRef.current !== generation) {
        return;
      }
      setBlocks((prev) => {
        const block = prev[situation];
        if (block.kind !== 'ready') {
          return prev;
        }
        return {
          ...prev,
          [situation]: {
            ...block,
            loadingMore: false,
            loadMoreError: errorMessage(currentFilters.type, error),
          },
        };
      });
    }
  }, []);

  return (
    <FinancialSection
      id="relatorios-lancamentos"
      title={reportTransactionsSectionTitle()}
      subtitle="Lançamentos que compõem os valores do período visualizado."
      className={styles.transactionsSection}
    >
      <div className={styles.transactionsStack} data-report-transactions="true">
        {REPORT_DETAIL_SITUATIONS.map((situation) => (
          <ReportTransactionsBlock
            key={situation}
            type={filters.type}
            situation={situation}
            state={blocks[situation]}
            onRetry={() => retry(situation)}
            onLoadMore={() => void loadMore(situation)}
          />
        ))}
      </div>
    </FinancialSection>
  );
}
