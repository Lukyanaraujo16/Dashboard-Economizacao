import { civilDateUtcFromKey } from '../../analytics/domain/civil-calendar.js';
import type { AnalyticalDirection } from './analytical/analytical-keys.js';

/**
 * Estado de movimento diário, separado do analytical_context de COUNTERPARTY.
 * Não guarda tenant, conversa nem id interno de centro de custo.
 */
export type DailyCashMovementConversationState = {
  readonly version: 1;
  readonly kind: 'DAILY_CASH_MOVEMENT';
  readonly direction: Extract<AnalyticalDirection, 'INFLOW' | 'OUTFLOW'>;
  readonly date: string;
  readonly costCenterQuery: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseDailyCashMovementConversationState(
  value: unknown,
): DailyCashMovementConversationState | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    'tenantId' in value ||
    'conversationId' in value ||
    'costCenterId' in value ||
    'userId' in value
  ) {
    return null;
  }
  if (value.version !== 1 || value.kind !== 'DAILY_CASH_MOVEMENT') {
    return null;
  }
  if (value.direction !== 'INFLOW' && value.direction !== 'OUTFLOW') {
    return null;
  }
  if (typeof value.date !== 'string' || civilDateUtcFromKey(value.date) === null) {
    return null;
  }
  if (value.costCenterQuery !== null && typeof value.costCenterQuery !== 'string') {
    return null;
  }
  const costCenterQuery =
    typeof value.costCenterQuery === 'string' ? value.costCenterQuery.trim() : null;
  if (costCenterQuery !== null && (costCenterQuery === '' || costCenterQuery.length > 80)) {
    return null;
  }
  return {
    version: 1,
    kind: 'DAILY_CASH_MOVEMENT',
    direction: value.direction,
    date: value.date,
    costCenterQuery,
  };
}

export function dailyCashMovementState(input: {
  readonly direction: 'INFLOW' | 'OUTFLOW';
  readonly date: string;
  readonly costCenterQuery: string | null;
}): DailyCashMovementConversationState {
  return {
    version: 1,
    kind: 'DAILY_CASH_MOVEMENT',
    direction: input.direction,
    date: input.date,
    costCenterQuery: input.costCenterQuery,
  };
}
