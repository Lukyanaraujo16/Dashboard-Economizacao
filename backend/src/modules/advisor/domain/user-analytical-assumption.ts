/**
 * Premissas explícitas do usuário para análise condicional (cenário).
 * NÃO são fatos oficiais do ledger/ERP/dashboard.
 */

export const USER_ANALYTICAL_ASSUMPTION_KIND = 'USER_ANALYTICAL_ASSUMPTION' as const;
export const USER_ANALYTICAL_ASSUMPTION_VERSION = 1 as const;

export const USER_ASSUMPTION_VALUE_KINDS = ['AMOUNT', 'PERCENT', 'DELTA_AMOUNT'] as const;
export type UserAssumptionValueKind = (typeof USER_ASSUMPTION_VALUE_KINDS)[number];

export const USER_ASSUMPTION_CADENCES = [
  'MONTHLY',
  'ONE_OFF',
  'ANNUAL',
  'UNSPECIFIED',
] as const;
export type UserAssumptionCadence = (typeof USER_ASSUMPTION_CADENCES)[number];

export const USER_ASSUMPTION_ROLES = [
  'COST',
  'REVENUE',
  'INFLOW',
  'OUTFLOW',
  'GENERIC',
] as const;
export type UserAssumptionRole = (typeof USER_ASSUMPTION_ROLES)[number];

export const USER_ASSUMPTION_STATUSES = ['ACTIVE', 'SUPERSEDED'] as const;
export type UserAssumptionStatus = (typeof USER_ASSUMPTION_STATUSES)[number];

export type UserAnalyticalAssumption = {
  readonly version: typeof USER_ANALYTICAL_ASSUMPTION_VERSION;
  readonly kind: typeof USER_ANALYTICAL_ASSUMPTION_KIND;
  readonly id: string;
  readonly createdAt: string;
  readonly createdFromMessageId: string;
  readonly valueKind: UserAssumptionValueKind;
  /** AMOUNT/DELTA em BRL; PERCENT em pontos percentuais (10 = 10%). */
  readonly value: number;
  readonly currency: 'BRL' | null;
  readonly cadence: UserAssumptionCadence;
  readonly role: UserAssumptionRole;
  /** Rótulo operacional curto (prosa do usuário), sem IDs/SQL. */
  readonly label: string;
  readonly status: UserAssumptionStatus;
  readonly replacesAssumptionId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseUserAnalyticalAssumption(value: unknown): UserAnalyticalAssumption | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    'tenantId' in value ||
    'costCenterId' in value ||
    'userId' in value ||
    'conversationId' in value ||
    'sql' in value
  ) {
    return null;
  }
  if (
    value.version !== USER_ANALYTICAL_ASSUMPTION_VERSION ||
    value.kind !== USER_ANALYTICAL_ASSUMPTION_KIND
  ) {
    return null;
  }
  if (typeof value.id !== 'string' || value.id.trim() === '' || value.id.length > 80) {
    return null;
  }
  if (typeof value.createdAt !== 'string' || typeof value.createdFromMessageId !== 'string') {
    return null;
  }
  if (
    typeof value.valueKind !== 'string' ||
    !(USER_ASSUMPTION_VALUE_KINDS as readonly string[]).includes(value.valueKind)
  ) {
    return null;
  }
  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    return null;
  }
  if (value.valueKind === 'PERCENT') {
    if (value.value <= 0 || value.value > 100) {
      return null;
    }
  } else if (value.value <= 0 || value.value > 1_000_000_000) {
    return null;
  }
  if (value.currency !== null && value.currency !== 'BRL') {
    return null;
  }
  if (value.valueKind === 'PERCENT' && value.currency !== null) {
    return null;
  }
  if (value.valueKind !== 'PERCENT' && value.currency !== 'BRL') {
    return null;
  }
  if (
    typeof value.cadence !== 'string' ||
    !(USER_ASSUMPTION_CADENCES as readonly string[]).includes(value.cadence)
  ) {
    return null;
  }
  if (
    typeof value.role !== 'string' ||
    !(USER_ASSUMPTION_ROLES as readonly string[]).includes(value.role)
  ) {
    return null;
  }
  if (typeof value.label !== 'string') {
    return null;
  }
  const label = value.label.trim();
  if (label === '' || label.length > 120) {
    return null;
  }
  if (
    typeof value.status !== 'string' ||
    !(USER_ASSUMPTION_STATUSES as readonly string[]).includes(value.status)
  ) {
    return null;
  }
  if (
    value.replacesAssumptionId !== null &&
    (typeof value.replacesAssumptionId !== 'string' || value.replacesAssumptionId.length > 80)
  ) {
    return null;
  }
  return {
    version: USER_ANALYTICAL_ASSUMPTION_VERSION,
    kind: USER_ANALYTICAL_ASSUMPTION_KIND,
    id: value.id.trim(),
    createdAt: value.createdAt,
    createdFromMessageId: value.createdFromMessageId.trim(),
    valueKind: value.valueKind as UserAssumptionValueKind,
    value: value.value,
    currency: value.currency,
    cadence: value.cadence as UserAssumptionCadence,
    role: value.role as UserAssumptionRole,
    label,
    status: value.status as UserAssumptionStatus,
    replacesAssumptionId: value.replacesAssumptionId,
  };
}

export function parseUserAnalyticalAssumptionList(
  value: unknown,
): readonly UserAnalyticalAssumption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: UserAnalyticalAssumption[] = [];
  for (const raw of value.slice(0, 8)) {
    const parsed = parseUserAnalyticalAssumption(raw);
    if (parsed !== null) {
      out.push(parsed);
    }
  }
  return out;
}

export function createUserAnalyticalAssumption(input: {
  readonly id: string;
  readonly createdFromMessageId: string;
  readonly valueKind: UserAssumptionValueKind;
  readonly value: number;
  readonly cadence: UserAssumptionCadence;
  readonly role: UserAssumptionRole;
  readonly label: string;
  readonly replacesAssumptionId?: string | null;
  readonly now?: Date;
}): UserAnalyticalAssumption | null {
  const now = input.now ?? new Date();
  return parseUserAnalyticalAssumption({
    version: USER_ANALYTICAL_ASSUMPTION_VERSION,
    kind: USER_ANALYTICAL_ASSUMPTION_KIND,
    id: input.id,
    createdAt: now.toISOString(),
    createdFromMessageId: input.createdFromMessageId,
    valueKind: input.valueKind,
    value: input.value,
    currency: input.valueKind === 'PERCENT' ? null : 'BRL',
    cadence: input.cadence,
    role: input.role,
    label: input.label,
    status: 'ACTIVE',
    replacesAssumptionId: input.replacesAssumptionId ?? null,
  });
}

export function listActiveUserAssumptions(
  assumptions: readonly UserAnalyticalAssumption[],
): readonly UserAnalyticalAssumption[] {
  return assumptions.filter((row) => row.status === 'ACTIVE');
}

/**
 * Aplica nova assumption: se replacesAssumptionId apontar para ACTIVE, marca SUPERSEDED.
 * Sem replace explícito, supersede a ACTIVE mais recente com mesmo role+cadence+valueKind.
 */
export function applyUserAssumptionToList(
  current: readonly UserAnalyticalAssumption[],
  next: UserAnalyticalAssumption,
): readonly UserAnalyticalAssumption[] {
  const replaceId =
    next.replacesAssumptionId ??
    [...current]
      .reverse()
      .find(
        (row) =>
          row.status === 'ACTIVE' &&
          row.role === next.role &&
          row.cadence === next.cadence &&
          row.valueKind === next.valueKind,
      )?.id ??
    null;

  const updated = current.map((row) =>
    replaceId !== null && row.id === replaceId && row.status === 'ACTIVE'
      ? { ...row, status: 'SUPERSEDED' as const }
      : row,
  );
  return [...updated, next].slice(-8);
}

export function formatUserAssumptionEvidenceText(
  assumption: UserAnalyticalAssumption,
): string {
  const lines = [
    'provenance: USER_ASSUMPTION',
    'NOTE: Not an official ledger/ERP/dashboard fact. Conditional scenario input only.',
    `assumptionId: ${assumption.id}`,
    `valueKind: ${assumption.valueKind}`,
    `cadence: ${assumption.cadence}`,
    `role: ${assumption.role}`,
    `label: ${assumption.label}`,
  ];
  if (assumption.valueKind === 'PERCENT') {
    lines.push(`assumptionPercent: ${assumption.value}`);
    lines.push(`assumptionPercentDisplay: ${formatBrPercent(assumption.value)}`);
  } else {
    lines.push(`assumptionAmount: ${assumption.value.toFixed(2)}`);
    lines.push(`assumptionAmountBrl: ${formatBrMoney(assumption.value)}`);
  }
  return lines.join('\n');
}

export function formatBrMoney(value: number): string {
  const fixed = value.toFixed(2);
  const [intPart, dec] = fixed.split('.') as [string, string];
  const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${withDots},${dec}`;
}

function formatBrPercent(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${String(rounded).replace('.', ',')}%`;
}

/**
 * Gate estrutural de custo: só tenta extract se há magnitude monetária/percentual.
 * Não é catálogo de frases de premissa.
 */
export function messageHasAssumptionMagnitudeCue(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < 3) {
    return false;
  }
  if (/R\$\s*\d/i.test(trimmed)) {
    return true;
  }
  if (/\d{1,3}(?:[.,]\d{1,4})?\s*%/.test(trimmed)) {
    return true;
  }
  // "5 mil" / "5.000" como magnitude — não frases de intenção.
  if (/\b\d{1,3}(?:[.,]\d{3})+\b/.test(trimmed)) {
    return true;
  }
  if (/\b\d+\s*mil\b/i.test(trimmed)) {
    return true;
  }
  return false;
}
