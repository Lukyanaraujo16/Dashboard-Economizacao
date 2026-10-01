import { AdvisorDomainError } from './advisor-domain-error.js';

/**
 * Catálogo certificado da F14.
 * O administrador escolhe um tipo e preenche só os parâmetros deste arquivo.
 * Não há fórmula, SQL nem expressão livre.
 * Os números de sugestão não são aplicados a tenant nenhum.
 */

export const PROACTIVE_TRIGGER_TYPES = [
  'REVENUE_GOAL_PERCENTAGE',
  'EXPENSE_CEILING_PERCENTAGE',
  'EXPENSE_CEILING_EXCEEDED',
  'TITLE_DUE_SOON',
] as const;

export type ProactiveTriggerType = (typeof PROACTIVE_TRIGGER_TYPES)[number];

export const PROACTIVE_TITLE_KINDS = ['RECEIVABLE', 'PAYABLE'] as const;

export type ProactiveTitleKind = (typeof PROACTIVE_TITLE_KINDS)[number];

/** Limite estrutural de daysAhead. Não é janela financeira de produto. */
const DAYS_AHEAD_MAX = 366;

const PERCENTAGE_TYPES = new Set<ProactiveTriggerType>([
  'REVENUE_GOAL_PERCENTAGE',
  'EXPENSE_CEILING_PERCENTAGE',
]);

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_KEY = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const SUBJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const AMOUNT_PATTERN = /^\d{1,15}(\.\d{1,4})?$/;
const SOURCE_METRIC = /^[a-z0-9_.]{1,64}$/;
const PAYLOAD_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/;
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'token',
  'password',
  'secret',
  'credential',
  'authorization',
  'accesstoken',
  'refreshtoken',
]);

/**
 * Sugestões para uma futura tela administrativa.
 * Não são seed, não são backfill e não ativam alerta.
 */
export const PROACTIVE_TRIGGER_SUGGESTED_DEFAULTS = {
  revenueGoalPercentages: [80, 90, 100],
  expenseCeilingPercentages: [80, 90, 100],
  expenseCeilingExceeded: true,
  titleDueSoon: {
    daysAhead: 3,
    minimumAmount: '5000',
    titleKind: 'PAYABLE',
  },
} as const;

export type ProactiveTriggerParameterField = {
  readonly name: string;
  readonly valueKind: 'integer' | 'decimal' | 'titleKind' | 'none';
  readonly required: boolean;
};

export type CertifiedProactiveTriggerType = {
  readonly type: ProactiveTriggerType;
  readonly description: string;
  readonly parameters: readonly ProactiveTriggerParameterField[];
};

export const CERTIFIED_PROACTIVE_TRIGGER_TYPES: readonly CertifiedProactiveTriggerType[] = [
  {
    type: 'REVENUE_GOAL_PERCENTAGE',
    description: 'Meta mensal de faturamento atingiu o percentual configurado.',
    parameters: [{ name: 'percentage', valueKind: 'integer', required: true }],
  },
  {
    type: 'EXPENSE_CEILING_PERCENTAGE',
    description: 'Despesa mensal atingiu o percentual configurado do teto.',
    parameters: [{ name: 'percentage', valueKind: 'integer', required: true }],
  },
  {
    type: 'EXPENSE_CEILING_EXCEEDED',
    description: 'Despesa mensal ultrapassou o teto, na semântica oficial EXCEEDED.',
    parameters: [],
  },
  {
    type: 'TITLE_DUE_SOON',
    description: 'Título em aberto vence dentro da quantidade de dias configurada.',
    parameters: [
      { name: 'daysAhead', valueKind: 'integer', required: true },
      { name: 'minimumAmount', valueKind: 'decimal', required: true },
      { name: 'titleKind', valueKind: 'titleKind', required: true },
    ],
  },
];

export type ParsedProactiveParameters = {
  readonly triggerType: ProactiveTriggerType;
  readonly parameterKey: string;
  readonly percentage: number | null;
  readonly daysAhead: number | null;
  readonly minimumAmount: string | null;
  readonly titleKind: ProactiveTitleKind | null;
};

export function isProactiveTriggerType(value: string): value is ProactiveTriggerType {
  return (PROACTIVE_TRIGGER_TYPES as readonly string[]).includes(value);
}

export function parseProactiveTriggerParameters(
  triggerType: string,
  raw: unknown,
): ParsedProactiveParameters {
  if (!isProactiveTriggerType(triggerType)) {
    throw new AdvisorDomainError('TRIGGER_TYPE_UNKNOWN', 'Tipo de gatilho não certificado.');
  }
  const record = asParameterRecord(raw);
  if (triggerType === 'EXPENSE_CEILING_EXCEEDED') {
    if (Object.keys(record).length > 0) {
      throw new AdvisorDomainError(
        'TRIGGER_PARAMETER_UNKNOWN',
        'Este tipo não aceita parâmetro.',
      );
    }
    return emptyParameters(triggerType, 'exceeded');
  }
  if (PERCENTAGE_TYPES.has(triggerType)) {
    assertOnlyKeys(record, ['percentage']);
    const percentage = readPercentage(record.percentage);
    return {
      triggerType,
      parameterKey: `percentage:${percentage}`,
      percentage,
      daysAhead: null,
      minimumAmount: null,
      titleKind: null,
    };
  }
  assertOnlyKeys(record, ['daysAhead', 'minimumAmount', 'titleKind']);
  const daysAhead = readDaysAhead(record.daysAhead);
  const minimumAmount = readMinimumAmount(record.minimumAmount);
  const titleKind = readTitleKind(record.titleKind);
  return {
    triggerType,
    parameterKey: `daysAhead:${daysAhead}|kind:${titleKind}|minimumAmount:${minimumAmount}`,
    percentage: null,
    daysAhead,
    minimumAmount,
    titleKind,
  };
}

export function buildProactiveOccurrenceKey(input: {
  readonly configurationId: string;
  readonly periodKey: string;
  readonly subjectKey: string;
  readonly parameterKey: string;
}): string {
  return `${input.configurationId}|${input.periodKey}|${input.subjectKey}|${input.parameterKey}`;
}

export function assertProactivePeriodKey(triggerType: ProactiveTriggerType, periodKey: string): void {
  const pattern = triggerType === 'TITLE_DUE_SOON' ? DAY_KEY : MONTH_KEY;
  if (!pattern.test(periodKey)) {
    throw new AdvisorDomainError(
      'TRIGGER_PERIOD_INVALID',
      'Período da ocorrência não corresponde ao tipo do gatilho.',
    );
  }
}

export function assertProactiveSubjectKey(
  triggerType: ProactiveTriggerType,
  subjectKey: string,
  titleKind: ProactiveTitleKind | null,
): void {
  if (triggerType !== 'TITLE_DUE_SOON') {
    if (subjectKey !== '') {
      throw new AdvisorDomainError(
        'TRIGGER_SUBJECT_INVALID',
        'Este gatilho não identifica um título.',
      );
    }
    return;
  }
  if (titleKind === null) {
    throw new AdvisorDomainError('TRIGGER_SUBJECT_INVALID', 'Gatilho de título sem kind.');
  }
  const prefix = `${titleKind}:`;
  const externalId = subjectKey.startsWith(prefix) ? subjectKey.slice(prefix.length) : '';
  if (!SUBJECT_ID.test(externalId)) {
    throw new AdvisorDomainError(
      'TRIGGER_SUBJECT_INVALID',
      'O sujeito do título precisa ser KIND:externalId.',
    );
  }
}

export function assertProactiveSourceMetric(sourceMetric: string): void {
  if (!SOURCE_METRIC.test(sourceMetric)) {
    throw new AdvisorDomainError('TRIGGER_SOURCE_METRIC_INVALID', 'Métrica de origem inválida.');
  }
}

export function assertProactivePayload(payload: unknown): Record<string, unknown> {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AdvisorDomainError('TRIGGER_PAYLOAD_INVALID', 'O fato precisa ser um objeto.');
  }
  const record = payload as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (!PAYLOAD_KEY.test(key) || FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) {
      throw new AdvisorDomainError('TRIGGER_PAYLOAD_INVALID', 'Campo de fato não permitido.');
    }
    assertPayloadValue(value);
  }
  if (JSON.stringify(record).length > 8000) {
    throw new AdvisorDomainError('TRIGGER_PAYLOAD_INVALID', 'Fato estruturado grande demais.');
  }
  return record;
}

function emptyParameters(
  triggerType: ProactiveTriggerType,
  parameterKey: string,
): ParsedProactiveParameters {
  return {
    triggerType,
    parameterKey,
    percentage: null,
    daysAhead: null,
    minimumAmount: null,
    titleKind: null,
  };
}

function asParameterRecord(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AdvisorDomainError('TRIGGER_PARAMETER_INVALID', 'Parâmetros precisam ser um objeto.');
  }
  return raw as Record<string, unknown>;
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new AdvisorDomainError('TRIGGER_PARAMETER_UNKNOWN', 'Parâmetro não pertence a este tipo.');
    }
  }
  for (const key of allowed) {
    if (!(key in record)) {
      throw new AdvisorDomainError('TRIGGER_PARAMETER_INVALID', 'Parâmetro obrigatório ausente.');
    }
  }
}

function readPercentage(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new AdvisorDomainError(
      'TRIGGER_PERCENTAGE_INVALID',
      'Percentual precisa ser um inteiro de 1 a 100.',
    );
  }
  return value;
}

function readDaysAhead(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > DAYS_AHEAD_MAX) {
    throw new AdvisorDomainError(
      'TRIGGER_DAYS_AHEAD_INVALID',
      'daysAhead precisa ser um inteiro de 1 a 366.',
    );
  }
  return value;
}

function readMinimumAmount(value: unknown): string {
  if (typeof value !== 'string' || !AMOUNT_PATTERN.test(value.trim())) {
    throw new AdvisorDomainError(
      'TRIGGER_MINIMUM_AMOUNT_INVALID',
      'minimumAmount precisa ser um decimal positivo com até 4 casas.',
    );
  }
  const trimmed = value.trim();
  if (Number(trimmed) <= 0) {
    throw new AdvisorDomainError(
      'TRIGGER_MINIMUM_AMOUNT_INVALID',
      'minimumAmount precisa ser maior que zero.',
    );
  }
  const [whole, fraction = ''] = trimmed.split('.');
  return `${whole}.${fraction.padEnd(4, '0')}`;
}

function readTitleKind(value: unknown): ProactiveTitleKind {
  if (typeof value !== 'string' || !(PROACTIVE_TITLE_KINDS as readonly string[]).includes(value)) {
    throw new AdvisorDomainError('TRIGGER_TITLE_KIND_INVALID', 'kind precisa ser RECEIVABLE ou PAYABLE.');
  }
  return value as ProactiveTitleKind;
}

function assertPayloadValue(value: unknown): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AdvisorDomainError('TRIGGER_PAYLOAD_INVALID', 'Número de fato inválido.');
    }
    return;
  }
  throw new AdvisorDomainError('TRIGGER_PAYLOAD_INVALID', 'Valor de fato não suportado.');
}
