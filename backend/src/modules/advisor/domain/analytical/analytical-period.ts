import { civilDateUtcFromKey } from '../../../analytics/domain/civil-calendar.js';
import {
  ANALYTICAL_CIVIL_TIME_ZONE,
  type AnalyticalPeriodKind,
} from './analytical-keys.js';

/**
 * Período tipado. Bounds YTD/YEAR são metadados de resolução oficial —
 * não transformam o contrato em from/to livre.
 * Autoridade civil: America/Sao_Paulo.
 */
export type AnalyticalMonthPeriod = {
  readonly kind: 'MONTH';
  readonly monthKey: string;
};

/** Janela inclusiva de meses civis terminando em `endMonthKey`. */
export type AnalyticalMonthWindowPeriod = {
  readonly kind: 'MONTH_WINDOW';
  readonly endMonthKey: string;
  readonly count: number;
};

export type AnalyticalYtdPeriod = {
  readonly kind: 'YTD';
  readonly year: number;
  readonly rangeKey: string;
  /** Bounds oficiais já resolvidos; nunca input arbitrário do provider. */
  readonly from?: Date;
  readonly to?: Date;
  readonly asOf?: Date;
};

export type AnalyticalYearPeriod = {
  readonly kind: 'YEAR';
  readonly year: number;
  readonly rangeKey: string;
  readonly isPartialYear: false;
  readonly from?: Date;
  readonly to?: Date;
};

export type AnalyticalCurrentPeriod = {
  readonly kind: 'CURRENT';
  readonly asOf: Date;
  readonly timeZone: typeof ANALYTICAL_CIVIL_TIME_ZONE;
};

export type AnalyticalComparisonPeriod = {
  readonly kind: 'COMPARISON';
  readonly left: AnalyticalPeriod;
  readonly right: AnalyticalPeriod;
};

/** Um dia civil de baixa. `date` é YYYY-MM-DD, materializado com Date.UTC. */
export type AnalyticalDayPeriod = {
  readonly kind: 'DAY';
  readonly date: string;
};

export type AnalyticalPeriod =
  | AnalyticalMonthPeriod
  | AnalyticalMonthWindowPeriod
  | AnalyticalYtdPeriod
  | AnalyticalYearPeriod
  | AnalyticalCurrentPeriod
  | AnalyticalComparisonPeriod
  | AnalyticalDayPeriod;

export function analyticalPeriodKind(period: AnalyticalPeriod): AnalyticalPeriodKind {
  return period.kind;
}

export function isAnalyticalMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isAnalyticalCivilDate(value: string): boolean {
  return civilDateUtcFromKey(value) !== null;
}

export function isAnalyticalComparisonPeriod(
  period: AnalyticalPeriod,
): period is AnalyticalComparisonPeriod {
  return period.kind === 'COMPARISON';
}
