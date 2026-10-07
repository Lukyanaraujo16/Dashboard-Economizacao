/**
 * Composição não-destrutiva de estados em ai_conversations.analytical_context.
 * Preserva slots legados (counterparty / CC outflow / daily) + pending action.
 */
import {
  parseAnalyticalConversationState,
  type AnalyticalConversationState,
} from './analytical-conversation-state.js';
import {
  parseCostCenterOutflowMovementsConversationState,
  type CostCenterOutflowMovementsConversationState,
} from './cost-center-outflow-movements-conversation-state.js';
import {
  parseDailyCashMovementConversationState,
  type DailyCashMovementConversationState,
} from './daily-cash-movement-conversation-state.js';
import {
  parsePendingAnalyticalAction,
  type PendingAnalyticalAction,
} from './pending-analytical-action.js';
import {
  parseUserAnalyticalAssumptionList,
  type UserAnalyticalAssumption,
} from './user-analytical-assumption.js';

export const ADVISOR_CONVERSATION_BAG_KIND = 'ADVISOR_CONVERSATION_BAG' as const;
export const ADVISOR_CONVERSATION_BAG_VERSION = 1 as const;

export type AdvisorConversationBagSlots = {
  readonly counterparty: AnalyticalConversationState | null;
  readonly costCenterOutflowMovements: CostCenterOutflowMovementsConversationState | null;
  readonly dailyCashMovement: DailyCashMovementConversationState | null;
  readonly pendingAnalyticalAction: PendingAnalyticalAction | null;
  /** Premissas explícitas do usuário (cenário). Nunca fatos oficiais. */
  readonly userAssumptions: readonly UserAnalyticalAssumption[];
};

export type AdvisorConversationBag = {
  readonly version: typeof ADVISOR_CONVERSATION_BAG_VERSION;
  readonly kind: typeof ADVISOR_CONVERSATION_BAG_KIND;
  readonly slots: AdvisorConversationBagSlots;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function emptyAdvisorConversationBag(): AdvisorConversationBag {
  return {
    version: ADVISOR_CONVERSATION_BAG_VERSION,
    kind: ADVISOR_CONVERSATION_BAG_KIND,
    slots: {
      counterparty: null,
      costCenterOutflowMovements: null,
      dailyCashMovement: null,
      pendingAnalyticalAction: null,
      userAssumptions: [],
    },
  };
}

/**
 * Aceita bag v1 OU legado root (um único estado antigo).
 * Parsers antigos continuam válidos via unwrap helpers.
 */
export function parseAdvisorConversationBag(value: unknown): AdvisorConversationBag {
  if (value === null || value === undefined) {
    return emptyAdvisorConversationBag();
  }
  if (isRecord(value) && value.kind === ADVISOR_CONVERSATION_BAG_KIND) {
    if (value.version !== ADVISOR_CONVERSATION_BAG_VERSION || !isRecord(value.slots)) {
      return emptyAdvisorConversationBag();
    }
    const slots = value.slots;
    return {
      version: ADVISOR_CONVERSATION_BAG_VERSION,
      kind: ADVISOR_CONVERSATION_BAG_KIND,
      slots: {
        counterparty: parseAnalyticalConversationState(slots.counterparty ?? null),
        costCenterOutflowMovements: parseCostCenterOutflowMovementsConversationState(
          slots.costCenterOutflowMovements ?? null,
        ),
        dailyCashMovement: parseDailyCashMovementConversationState(
          slots.dailyCashMovement ?? null,
        ),
        pendingAnalyticalAction: parsePendingAnalyticalAction(
          slots.pendingAnalyticalAction ?? null,
        ),
        userAssumptions: parseUserAnalyticalAssumptionList(slots.userAssumptions ?? []),
      },
    };
  }

  // Legado: root é um único estado de família.
  const counterparty = parseAnalyticalConversationState(value);
  if (counterparty !== null) {
    return {
      ...emptyAdvisorConversationBag(),
      slots: { ...emptyAdvisorConversationBag().slots, counterparty },
    };
  }
  const costCenterOutflowMovements = parseCostCenterOutflowMovementsConversationState(value);
  if (costCenterOutflowMovements !== null) {
    return {
      ...emptyAdvisorConversationBag(),
      slots: { ...emptyAdvisorConversationBag().slots, costCenterOutflowMovements },
    };
  }
  const dailyCashMovement = parseDailyCashMovementConversationState(value);
  if (dailyCashMovement !== null) {
    return {
      ...emptyAdvisorConversationBag(),
      slots: { ...emptyAdvisorConversationBag().slots, dailyCashMovement },
    };
  }
  const pendingAnalyticalAction = parsePendingAnalyticalAction(value);
  if (pendingAnalyticalAction !== null) {
    return {
      ...emptyAdvisorConversationBag(),
      slots: { ...emptyAdvisorConversationBag().slots, pendingAnalyticalAction },
    };
  }
  return emptyAdvisorConversationBag();
}

export function mergeAdvisorConversationBag(
  current: AdvisorConversationBag,
  patch: Partial<AdvisorConversationBagSlots>,
): AdvisorConversationBag {
  return {
    version: ADVISOR_CONVERSATION_BAG_VERSION,
    kind: ADVISOR_CONVERSATION_BAG_KIND,
    slots: {
      counterparty:
        patch.counterparty === undefined ? current.slots.counterparty : patch.counterparty,
      costCenterOutflowMovements:
        patch.costCenterOutflowMovements === undefined
          ? current.slots.costCenterOutflowMovements
          : patch.costCenterOutflowMovements,
      dailyCashMovement:
        patch.dailyCashMovement === undefined
          ? current.slots.dailyCashMovement
          : patch.dailyCashMovement,
      pendingAnalyticalAction:
        patch.pendingAnalyticalAction === undefined
          ? current.slots.pendingAnalyticalAction
          : patch.pendingAnalyticalAction,
      userAssumptions:
        patch.userAssumptions === undefined
          ? current.slots.userAssumptions
          : patch.userAssumptions,
    },
  };
}

/**
 * Serializa para JSON persistível (Prisma InputJsonValue-compatible).
 */
export function serializeAdvisorConversationBag(bag: AdvisorConversationBag): object {
  return JSON.parse(
    JSON.stringify({
      version: bag.version,
      kind: bag.kind,
      slots: {
        counterparty: bag.slots.counterparty,
        costCenterOutflowMovements: bag.slots.costCenterOutflowMovements,
        dailyCashMovement: bag.slots.dailyCashMovement,
        pendingAnalyticalAction: bag.slots.pendingAnalyticalAction,
        userAssumptions: bag.slots.userAssumptions,
      },
    }),
  ) as object;
}
