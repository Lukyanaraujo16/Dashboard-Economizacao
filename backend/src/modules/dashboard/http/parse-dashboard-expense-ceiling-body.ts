import type { Prisma } from '../../../generated/prisma/client.js';
import { ValidationError } from '../../../shared/errors/application-error.js';
import { isValidMonthKey } from '../../analytics/domain/civil-calendar.js';
import { parseExpenseCeilingAmount } from '../domain/expense-ceiling-math.js';

export type DashboardExpenseCeilingCommand = {
  readonly monthKey: string;
  readonly ceilingAmount: Prisma.Decimal;
};

/**
 * Corpo de `PUT /dashboard/expense-ceiling`.
 * `month` é obrigatório. `ceiling` só aceita decimal-string positivo.
 */
export function parseDashboardExpenseCeilingBody(body: unknown): DashboardExpenseCeilingCommand {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Corpo da requisição inválido.', {
      httpStatus: 400,
      details: [{ field: 'body', issue: 'invalid_format' }],
    });
  }

  const raw = body as { month?: unknown; ceiling?: unknown; tenantId?: unknown };

  if ('tenantId' in raw) {
    throw new ValidationError('tenantId não é aceito nesta rota.', {
      httpStatus: 400,
      details: [{ field: 'tenantId', issue: 'not_allowed' }],
    });
  }

  if (typeof raw.month !== 'string' || !isValidMonthKey(raw.month.trim())) {
    throw new ValidationError('month deve estar no formato YYYY-MM.', {
      httpStatus: 400,
      details: [{ field: 'month', issue: 'invalid_format' }],
    });
  }

  const ceilingAmount = parseExpenseCeilingAmount(raw.ceiling);
  if (ceilingAmount === null) {
    throw new ValidationError('ceiling deve ser um valor decimal maior que zero.', {
      httpStatus: 400,
      details: [{ field: 'ceiling', issue: 'invalid_amount' }],
    });
  }

  return { monthKey: raw.month.trim(), ceilingAmount };
}
