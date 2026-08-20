import type { Prisma } from '../../../generated/prisma/client.js';
import { ValidationError } from '../../../shared/errors/application-error.js';
import { isValidMonthKey } from '../../analytics/domain/civil-calendar.js';
import { parseRevenueGoalTargetAmount } from '../domain/revenue-goal-math.js';

export type DashboardRevenueGoalCommand = {
  readonly monthKey: string;
  readonly targetAmount: Prisma.Decimal;
};

/**
 * Corpo de `PUT /dashboard/revenue-goal`.
 * `month` é obrigatório e explícito — a gravação nunca infere a competência.
 * `target` só aceita decimal-string positivo; número em ponto flutuante é recusado.
 */
export function parseDashboardRevenueGoalBody(body: unknown): DashboardRevenueGoalCommand {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Corpo da requisição inválido.', {
      httpStatus: 400,
      details: [{ field: 'body', issue: 'invalid_format' }],
    });
  }

  const raw = body as { month?: unknown; target?: unknown; tenantId?: unknown };

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

  const targetAmount = parseRevenueGoalTargetAmount(raw.target);
  if (targetAmount === null) {
    throw new ValidationError('target deve ser um valor decimal maior que zero.', {
      httpStatus: 400,
      details: [{ field: 'target', issue: 'invalid_amount' }],
    });
  }

  return { monthKey: raw.month.trim(), targetAmount };
}
