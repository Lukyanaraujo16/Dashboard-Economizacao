import {
  displayAdvisorNominalName,
  isGenericAdvisorNominalKey,
  normalizeAdvisorNominalKey,
} from './advisor-nominal-text.js';

export const ADVISOR_NOMINAL_IDENTITIES = ['IDENTIFIED', 'UNKNOWN', 'AMBIGUOUS'] as const;
export type AdvisorNominalIdentityStatus = (typeof ADVISOR_NOMINAL_IDENTITIES)[number];

export const ADVISOR_NOMINAL_SOURCE_KINDS = [
  'STRUCTURED_PARTY',
  'NORMALIZED_DESCRIPTION',
] as const;
export type AdvisorNominalSourceKind = (typeof ADVISOR_NOMINAL_SOURCE_KINDS)[number];

export type AdvisorNominalSourceMovement = {
  readonly description: string | null;
  readonly partyId: string | null;
  readonly partyName: string | null;
};

export type AdvisorNominalIdentity = {
  readonly status: AdvisorNominalIdentityStatus;
  readonly groupKey: string | null;
  readonly normalizedKey: string | null;
  readonly displayName: string | null;
  readonly sourceKind: AdvisorNominalSourceKind | null;
};

/**
 * Precedência comprovada pela auditoria:
 * partyId estruturado > description normalizável > UNKNOWN.
 * Description nunca unifica entidades só porque os nomes se parecem.
 */
export function identifyAdvisorNominalDimension(
  movement: AdvisorNominalSourceMovement,
): AdvisorNominalIdentity {
  const partyId = movement.partyId?.trim() || null;
  if (partyId !== null) {
    const officialName = movement.partyName?.trim() || null;
    const fallbackName =
      officialName ??
      (movement.description ? displayAdvisorNominalName(movement.description) : null);
    if (fallbackName === null || fallbackName === '') {
      return unknownIdentity();
    }
    return {
      status: 'IDENTIFIED',
      groupKey: `party:${partyId}`,
      normalizedKey: normalizeAdvisorNominalKey(fallbackName),
      displayName: fallbackName,
      sourceKind: 'STRUCTURED_PARTY',
    };
  }

  const description = movement.description?.trim() || null;
  if (description === null) {
    return unknownIdentity();
  }
  const normalizedKey = normalizeAdvisorNominalKey(description);
  if (isGenericAdvisorNominalKey(normalizedKey)) {
    return unknownIdentity();
  }
  return {
    status: 'IDENTIFIED',
    groupKey: `desc:${normalizedKey}`,
    normalizedKey,
    displayName: displayAdvisorNominalName(description),
    sourceKind: 'NORMALIZED_DESCRIPTION',
  };
}

function unknownIdentity(): AdvisorNominalIdentity {
  return {
    status: 'UNKNOWN',
    groupKey: null,
    normalizedKey: null,
    displayName: null,
    sourceKind: null,
  };
}
