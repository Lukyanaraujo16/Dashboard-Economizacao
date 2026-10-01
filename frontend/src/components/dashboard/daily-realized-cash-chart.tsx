'use client';

import { cx } from '../ui/utils/cx';
import { isFlatSeries, Sparkline, type SparklinePointSelection } from './v2';
import type { DailyPoint } from './v2/chart-math';
import { CashRealizedDayPanel } from './cash-realized-day-panel';
import styles from './cash-realized-day-panel.module.css';

export type DailyRealizedCashChartProps = {
  readonly dailyPoints: readonly DailyPoint[];
  readonly accumulatedPoints: readonly DailyPoint[];
  readonly colorVar: string;
  readonly dailyLabel: string;
  readonly accumulatedLabel: string;
  readonly dailyAriaLabel: string;
  readonly accumulatedAriaLabel: string;
  readonly dailyCaption: string;
  readonly accumulatedCaption: string;
  readonly direction: 'inflows' | 'outflows';
  readonly selectedDate: string | null;
  readonly onSelectDate: (date: string) => void;
  readonly costCenterId: string | null;
  readonly categoryId: string | null;
  readonly chartClassName?: string;
  readonly labelClassName?: string;
};

export function DailyRealizedCashChart({
  dailyPoints,
  accumulatedPoints,
  colorVar,
  dailyLabel,
  accumulatedLabel,
  dailyAriaLabel,
  accumulatedAriaLabel,
  dailyCaption,
  accumulatedCaption,
  direction,
  selectedDate,
  onSelectDate,
  costCenterId,
  categoryId,
  chartClassName,
  labelClassName,
}: DailyRealizedCashChartProps) {
  const selectable = !isFlatSeries(dailyPoints);
  return (
    <>
      <p className={labelClassName}>{dailyLabel}</p>
      {selectable ? (
        <p className={styles.hint} data-cash-day-hint="true">
          Selecione um dia para ver os lançamentos
        </p>
      ) : null}
      <div className={chartClassName}>
        <Sparkline
          points={dailyPoints}
          colorVar={colorVar}
          interactive
          ariaLabel={dailyAriaLabel}
          valueCaption={dailyCaption}
          selectedDate={selectable ? selectedDate : null}
          onPointSelect={
            selectable
              ? (point: SparklinePointSelection) => {
                  onSelectDate(point.date);
                }
              : undefined
          }
        />
      </div>
      {selectedDate !== null && selectable ? (
        <CashRealizedDayPanel
          date={selectedDate}
          direction={direction}
          costCenterId={costCenterId}
          categoryId={categoryId}
        />
      ) : null}
      <p className={cx(labelClassName, selectedDate !== null && selectable && styles.followingSection)}>
        {accumulatedLabel}
      </p>
      <div className={chartClassName}>
        <Sparkline
          points={accumulatedPoints}
          colorVar={colorVar}
          interactive
          ariaLabel={accumulatedAriaLabel}
          valueCaption={accumulatedCaption}
        />
      </div>
    </>
  );
}
