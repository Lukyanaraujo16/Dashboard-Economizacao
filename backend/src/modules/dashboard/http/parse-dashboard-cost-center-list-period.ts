import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import {
  civilMonthBounds,
  civilMonthBoundsFromKey,
  isValidMonthKey,
} from '../../analytics/domain/civil-calendar.js';
import { ValidationError } from '../../../shared/errors/application-error.js';

/**
 * Período civil para listagem de cost centers.
 * Preferência: `month=YYYY-MM` (Dashboard).
 * Relatórios: `from`+`to` (YYYY-MM), mesma convenção de Relatórios.
 * Ausente: mês civil atual em America/Sao_Paulo.
 */
export type DashboardCostCenterListPeriod = {
  readonly from: Date;
  readonly to: Date;
  readonly monthKey: string | null;
  readonly fromKey: string;
  readonly toKey: string;
};

export function parseDashboardCostCenterListPeriod(query: unknown): DashboardCostCenterListPeriod {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    return defaultCurrentMonthPeriod();
  }

  const record = query as Record<string, unknown>;
  const month = readOptionalMonthKey(record.month, 'month');
  const from = readOptionalMonthKey(record.from, 'from');
  const to = readOptionalMonthKey(record.to, 'to');

  if (month !== null && (from !== null || to !== null)) {
    throw new ValidationError('Use month ou from/to, não ambos.', {
      httpStatus: 400,
      details: [{ field: 'month', issue: 'conflicting_period' }],
    });
  }

  if (month !== null) {
    const bounds = civilMonthBoundsFromKey(month);
    return {
      from: bounds.from,
      to: bounds.to,
      monthKey: bounds.monthKey,
      fromKey: bounds.monthKey,
      toKey: bounds.monthKey,
    };
  }

  if (from !== null || to !== null) {
    if (from === null || to === null) {
      throw new ValidationError('from e to devem ser informados juntos no formato YYYY-MM.', {
        httpStatus: 400,
        details: [{ field: from === null ? 'from' : 'to', issue: 'missing_pair' }],
      });
    }
    const fromBounds = civilMonthBoundsFromKey(from);
    const toBounds = civilMonthBoundsFromKey(to);
    if (fromBounds.from.getTime() > toBounds.to.getTime()) {
      throw new ValidationError('from não pode ser posterior a to.', {
        httpStatus: 400,
        details: [{ field: 'from', issue: 'range_inverted' }],
      });
    }
    return {
      from: fromBounds.from,
      to: toBounds.to,
      monthKey: null,
      fromKey: from,
      toKey: to,
    };
  }

  return defaultCurrentMonthPeriod();
}

function defaultCurrentMonthPeriod(): DashboardCostCenterListPeriod {
  const bounds = civilMonthBounds(civilTodayInSaoPaulo(new Date()));
  return {
    from: bounds.from,
    to: bounds.to,
    monthKey: bounds.monthKey,
    fromKey: bounds.monthKey,
    toKey: bounds.monthKey,
  };
}

function readOptionalMonthKey(raw: unknown, field: string): string | null {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (typeof raw !== 'string') {
    throw invalidMonth(field);
  }
  const trimmed = raw.trim();
  if (!isValidMonthKey(trimmed)) {
    throw invalidMonth(field);
  }
  return trimmed;
}

function invalidMonth(field: string): ValidationError {
  return new ValidationError(`${field} deve estar no formato YYYY-MM.`, {
    httpStatus: 400,
    details: [{ field, issue: 'invalid_format' }],
  });
}
