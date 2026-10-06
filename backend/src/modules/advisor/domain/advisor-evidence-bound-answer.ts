/**
 * Gate pragmático do caminho AGENT: afirmações monetárias/percentuais da resposta
 * final precisam aparecer nos fatos autorizados do turno E com provenance/escopo
 * compatível quando a pergunta é entity-scoped.
 *
 * Limitações conhecidas (não é theorem prover):
 * - só valida padrões com R$ e percentuais com %;
 * - não valida datas civis soltas, ranks "1º/2º", anos, nem prosa sem cifra;
 * - normalização BR (milhar/ponto/vírgula) é heurística;
 * - escopo usa entityScope/costCenter nos blocos e tool results; se a marcação
 *   estiver ausente, trata como TENANT (conservador para perguntas CC-scoped);
 * - não reconstrói a frase: se houver cifra não sustentada, devolve limitação
 *   determinística (uma tentativa de rewrite controlada opcional via callback).
 */

export const ADVISOR_EVIDENCE_GATE_LIMITATION_TEXT =
  'Não posso afirmar os valores financeiros citados porque eles não estão sustentados pelos fatos oficiais obtidos nesta consulta. Posso repetir apenas números presentes nos resultados oficiais.';

export const ADVISOR_EVIDENCE_SCOPE_LIMITATION_TEXT =
  'Não posso afirmar valores desse escopo apenas com fatos da empresa (tenant-wide). É necessário um resultado oficial com o mesmo escopo (ex.: centro de custo resolvido).';

/**
 * Valores monetários BR.
 * Ordem importa: milhar com pontos antes do inteiro simples, para não casar
 * "R$ 280" dentro de "R$ 28000".
 */
const MONEY_CLAIM_RE =
  /R\$\s*(?:\d{1,3}(?:\.\d{3})+,\d{1,2}|\d{1,3}(?:\.\d{3})+|\d+(?:,\d{1,2})?)/gi;
const PERCENT_CLAIM_RE = /\d{1,3}(?:[.,]\d{1,4})?\s*%/g;
/** Campos JSON oficiais com cifra (evita colher year/month soltos do texto). */
const JSON_AMOUNT_FIELD_RE =
  /"(?:amount|totalRealized|total|absolute|absoluteDelta|netAmount|value|result|sharePercent|percent|percentageDelta|attributedAmount|costCenterAmount|populationAmount|identifiedAmount|unidentifiedAmount|originalSettlementAmount|delta|billing|realizedOutflows|realizedInflows)"\s*:\s*"?(?<num>-?\d+(?:[.,]\d{1,20})?)"?/gi;

export type AdvisorEvidenceEntityScope = 'TENANT' | 'COST_CENTER' | 'UNKNOWN';

export type AdvisorEvidenceItem = {
  readonly text: string;
  readonly entityScope: AdvisorEvidenceEntityScope;
  readonly resolvedCostCenter?: string | null;
  readonly source: 'FINANCIAL_FACTS' | 'ANALYTICAL_FACTS' | 'PRESENTED_INSIGHT_FACTS' | 'TOOL_RESULT';
};

export type AdvisorEvidenceBoundGateInput = {
  readonly answerText: string;
  readonly authorizedEvidenceTexts?: readonly string[];
  readonly evidenceItems?: readonly AdvisorEvidenceItem[];
  /** Quando false, o gate ainda pode bloquear se a pergunta for entity-scoped. */
  readonly agentToolPath: boolean;
  readonly requiredEntityScope?: AdvisorEvidenceEntityScope;
  readonly requiredCostCenterName?: string | null;
};

export type AdvisorEvidenceBoundGateResult = {
  readonly ok: boolean;
  readonly text: string;
  readonly unsupportedClaims: readonly string[];
  readonly reason:
    | 'OK'
    | 'UNSUPPORTED_NUMERIC_CLAIMS'
    | 'INCOMPATIBLE_EVIDENCE_SCOPE'
    | 'SKIPPED_NON_AGENT';
};

export function collectAuthorizedFinancialClaimTokens(
  evidenceTexts: readonly string[],
): ReadonlySet<string> {
  return collectTokensFromItems(
    evidenceTexts.map((text) => ({
      text,
      entityScope: 'UNKNOWN' as const,
      source: 'TOOL_RESULT' as const,
    })),
    'UNKNOWN',
  );
}

export function inferEvidenceEntityScope(text: string): AdvisorEvidenceEntityScope {
  if (/entityScope\s*[:=]\s*COST_CENTER/i.test(text) || /"entityScope"\s*:\s*"COST_CENTER"/i.test(text)) {
    return 'COST_CENTER';
  }
  if (/entityScope\s*[:=]\s*TENANT/i.test(text) || /"entityScope"\s*:\s*"TENANT"/i.test(text)) {
    return 'TENANT';
  }
  if (/costCenter\s*[:=]\s*NONE/i.test(text) || /"resolvedCostCenter"\s*:\s*"NONE"/i.test(text)) {
    return 'TENANT';
  }
  if (/"costCenter"\s*:\s*\{/i.test(text) || /resolvedCostCenter\s*[:=]\s*(?!NONE)/i.test(text)) {
    return 'COST_CENTER';
  }
  return 'UNKNOWN';
}

export function gateAdvisorEvidenceBoundAnswer(
  input: AdvisorEvidenceBoundGateInput,
): AdvisorEvidenceBoundGateResult {
  const items = normalizeEvidenceItems(input);
  const requiredScope = input.requiredEntityScope ?? 'UNKNOWN';
  const requiresCostCenter = requiredScope === 'COST_CENTER';

  if (!input.agentToolPath && !requiresCostCenter) {
    return {
      ok: true,
      text: input.answerText,
      unsupportedClaims: [],
      reason: 'SKIPPED_NON_AGENT',
    };
  }

  const authorized = collectTokensFromItems(items, requiredScope);
  const claims = extractFinancialClaims(input.answerText);

  if (requiresCostCenter) {
    const hasCompatibleEvidence = items.some(
      (item) =>
        item.entityScope === 'COST_CENTER' &&
        (input.requiredCostCenterName === undefined ||
          input.requiredCostCenterName === null ||
          item.resolvedCostCenter === null ||
          item.resolvedCostCenter === undefined ||
          fold(item.resolvedCostCenter).includes(fold(input.requiredCostCenterName)) ||
          fold(input.requiredCostCenterName).includes(fold(item.resolvedCostCenter))),
    );
    if (claims.length > 0 && !hasCompatibleEvidence) {
      return {
        ok: false,
        text: ADVISOR_EVIDENCE_SCOPE_LIMITATION_TEXT,
        unsupportedClaims: claims,
        reason: 'INCOMPATIBLE_EVIDENCE_SCOPE',
      };
    }
  }

  const unsupported = claims.filter((claim) => {
    const money = normalizeFinancialClaim(claim);
    const bare = normalizeNumericToken(claim.replace(/R\$/gi, '').replace(/%/g, ''));
    if (authorized.has(money) || (bare !== null && authorized.has(bare))) {
      return false;
    }
    // Percentuais oficiais vêm com alta precisão; aceita arredondamento pragmático (2–4 casas).
    if (claim.includes('%') && bare !== null && authorizedHasRoundedPercent(authorized, bare)) {
      return false;
    }
    return true;
  });

  if (unsupported.length === 0) {
    return {
      ok: true,
      text: input.answerText,
      unsupportedClaims: [],
      reason: 'OK',
    };
  }

  return {
    ok: false,
    text: ADVISOR_EVIDENCE_GATE_LIMITATION_TEXT,
    unsupportedClaims: unsupported,
    reason: 'UNSUPPORTED_NUMERIC_CLAIMS',
  };
}

/**
 * Tentativa controlada: se o rewrite ainda tiver cifras não sustentadas,
 * cai na limitação determinística.
 */
export function applyAdvisorEvidenceBoundRewrite(input: {
  readonly original: AdvisorEvidenceBoundGateResult;
  readonly rewriteText: string;
  readonly authorizedEvidenceTexts?: readonly string[];
  readonly evidenceItems?: readonly AdvisorEvidenceItem[];
  readonly requiredEntityScope?: AdvisorEvidenceEntityScope;
  readonly requiredCostCenterName?: string | null;
}): AdvisorEvidenceBoundGateResult {
  if (input.original.ok) {
    return input.original;
  }
  const second = gateAdvisorEvidenceBoundAnswer({
    answerText: input.rewriteText,
    authorizedEvidenceTexts: input.authorizedEvidenceTexts,
    evidenceItems: input.evidenceItems,
    agentToolPath: true,
    requiredEntityScope: input.requiredEntityScope,
    requiredCostCenterName: input.requiredCostCenterName,
  });
  if (second.ok) {
    return second;
  }
  return {
    ok: false,
    text:
      second.reason === 'INCOMPATIBLE_EVIDENCE_SCOPE'
        ? ADVISOR_EVIDENCE_SCOPE_LIMITATION_TEXT
        : ADVISOR_EVIDENCE_GATE_LIMITATION_TEXT,
    unsupportedClaims: second.unsupportedClaims,
    reason: second.reason,
  };
}

export function normalizeAdvisorToolCallFingerprint(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const normalizedArgs: Record<string, unknown> = {};
  for (const key of Object.keys(args).sort((a, b) => a.localeCompare(b))) {
    const value = args[key];
    if (typeof value === 'string') {
      normalizedArgs[key] = value.trim().toLowerCase();
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      normalizedArgs[key] = value;
    } else if (typeof value === 'boolean') {
      normalizedArgs[key] = value;
    } else if (value === null) {
      normalizedArgs[key] = null;
    } else {
      normalizedArgs[key] = JSON.stringify(value);
    }
  }
  return `${toolName.trim().toLowerCase()}\0${JSON.stringify(normalizedArgs)}`;
}

function normalizeEvidenceItems(input: AdvisorEvidenceBoundGateInput): AdvisorEvidenceItem[] {
  if (input.evidenceItems !== undefined && input.evidenceItems.length > 0) {
    return [...input.evidenceItems];
  }
  return (input.authorizedEvidenceTexts ?? []).map((text) => ({
    text,
    entityScope: inferEvidenceEntityScope(text),
    source: 'TOOL_RESULT' as const,
  }));
}

function collectTokensFromItems(
  items: readonly AdvisorEvidenceItem[],
  requiredScope: AdvisorEvidenceEntityScope,
): ReadonlySet<string> {
  const tokens = new Set<string>();
  for (const item of items) {
    if (requiredScope === 'COST_CENTER' && item.entityScope === 'TENANT') {
      continue;
    }
    if (
      requiredScope === 'COST_CENTER' &&
      item.entityScope !== 'COST_CENTER' &&
      item.entityScope !== 'UNKNOWN'
    ) {
      continue;
    }
    addTokensFromText(tokens, item.text);
  }
  return tokens;
}

function addTokensFromText(tokens: Set<string>, text: string): void {
  for (const claim of extractFinancialClaims(text)) {
    const money = normalizeFinancialClaim(claim);
    tokens.add(money);
    const bare = normalizeNumericToken(claim.replace(/R\$/gi, '').replace(/%/g, ''));
    if (bare !== null) {
      addMagnitudeTokens(tokens, bare);
    }
  }
  JSON_AMOUNT_FIELD_RE.lastIndex = 0;
  let fieldMatch: RegExpExecArray | null;
  while ((fieldMatch = JSON_AMOUNT_FIELD_RE.exec(text)) !== null) {
    const raw = fieldMatch.groups?.num;
    if (raw === undefined) {
      continue;
    }
    const normalized = normalizeNumericToken(raw);
    if (normalized !== null) {
      addMagnitudeTokens(tokens, normalized);
      addRoundedPercentTokens(tokens, normalized);
    }
  }
}

/** Autoriza magnitudem com e sem sinal (delta negativo vs prosa "diferença de R$ X"). */
function addMagnitudeTokens(tokens: Set<string>, normalized: string): void {
  tokens.add(normalized);
  tokens.add(`r$${normalized}`);
  tokens.add(`${normalized}%`);
  if (normalized.startsWith('-')) {
    const positive = normalized.slice(1);
    if (positive !== '') {
      tokens.add(positive);
      tokens.add(`r$${positive}`);
      tokens.add(`${positive}%`);
    }
  }
}

function addRoundedPercentTokens(tokens: Set<string>, normalized: string): void {
  const asNumber = Number(normalized);
  if (!Number.isFinite(asNumber)) {
    return;
  }
  for (const source of [asNumber, Math.abs(asNumber)]) {
    for (const digits of [2, 3, 4]) {
      const rounded = source.toFixed(digits);
      const trimmed = Number(rounded).toString();
      tokens.add(trimmed);
      tokens.add(`${trimmed}%`);
      tokens.add(rounded);
      tokens.add(`${rounded}%`);
    }
  }
}

function authorizedHasRoundedPercent(
  authorized: ReadonlySet<string>,
  bareClaim: string,
): boolean {
  const claimNumber = Number(bareClaim);
  if (!Number.isFinite(claimNumber)) {
    return false;
  }
  for (const token of authorized) {
    const bare = token.endsWith('%') ? token.slice(0, -1) : token;
    if (!/^-?\d+(?:\.\d+)?$/.test(bare)) {
      continue;
    }
    const evidenceNumber = Number(bare);
    if (!Number.isFinite(evidenceNumber)) {
      continue;
    }
    if (Math.abs(evidenceNumber - claimNumber) <= 0.05) {
      return true;
    }
    // "-25,47%" no fato vs "25,47%" na prosa (magnitude da variação).
    if (Math.abs(Math.abs(evidenceNumber) - Math.abs(claimNumber)) <= 0.05) {
      return true;
    }
  }
  return false;
}

function extractFinancialClaims(text: string): string[] {
  const claims: string[] = [];
  for (const match of text.match(MONEY_CLAIM_RE) ?? []) {
    claims.push(match);
  }
  for (const match of text.match(PERCENT_CLAIM_RE) ?? []) {
    claims.push(match);
  }
  return claims;
}

function normalizeFinancialClaim(claim: string): string {
  const trimmed = claim.trim().toLowerCase().replace(/\s+/g, '');
  if (trimmed.includes('%')) {
    const bare = normalizeNumericToken(trimmed.replace('%', ''));
    return bare === null ? trimmed : `${bare}%`;
  }
  const bare = normalizeNumericToken(trimmed.replace(/r\$/g, ''));
  return bare === null ? trimmed : `r$${bare}`;
}

function normalizeNumericToken(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') {
    return null;
  }
  let normalized = cleaned;
  // BR milhar: exige 2+ grupos .000 (1.234.567) OU vírgula decimal (1.234,56).
  // Evita tratar "25.472" (percentual JSON) como 25472.
  if (
    /^-?\d{1,3}(?:\.\d{3}){2,}(?:,\d+)?$/.test(normalized) ||
    /^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(normalized)
  ) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',') && normalized.includes('.')) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }
  const asNumber = Number(normalized);
  if (!Number.isFinite(asNumber)) {
    return null;
  }
  return asNumber.toString();
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}
