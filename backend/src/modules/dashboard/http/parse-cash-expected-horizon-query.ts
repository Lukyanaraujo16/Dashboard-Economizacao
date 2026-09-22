import { ValidationError } from '../../../shared/errors/application-error.js';
import {
  CASH_EXPECTED_HORIZON_VALUES,
  isCashExpectedHorizonMonths,
  type CashExpectedHorizonMonths,
} from '../../analytics/domain/cash-expected-horizon.js';

/**
 * `horizon` obrigatório: 3 | 6 | 12 (Mês atual usa monthly-cash-flow, não este endpoint).
 */
export function parseCashExpectedHorizonQuery(query: unknown): CashExpectedHorizonMonths {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw missingHorizon();
  }
  if (!('horizon' in query)) {
    throw missingHorizon();
  }
  const raw = (query as { horizon: unknown }).horizon;
  if (raw === undefined || raw === null || raw === '') {
    throw missingHorizon();
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw invalidHorizon();
  }
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw invalidHorizon();
  }
  const value = Number.parseInt(text, 10);
  if (!isCashExpectedHorizonMonths(value)) {
    throw invalidHorizon();
  }
  return value;
}

function missingHorizon(): ValidationError {
  return new ValidationError(
    `horizon é obrigatório (${CASH_EXPECTED_HORIZON_VALUES.join('|')}).`,
    {
      httpStatus: 400,
      details: [{ field: 'horizon', issue: 'required' }],
    },
  );
}

function invalidHorizon(): ValidationError {
  return new ValidationError(
    `horizon deve ser ${CASH_EXPECTED_HORIZON_VALUES.join('|')}.`,
    {
      httpStatus: 400,
      details: [{ field: 'horizon', issue: 'invalid_value' }],
    },
  );
}
