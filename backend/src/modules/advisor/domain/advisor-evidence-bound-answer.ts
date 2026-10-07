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
 * Premissa/cenário presente na evidência, mas claim tratado como fato realizado/oficial.
 * Não apaga a assumption — só bloqueia promoção indevida.
 */
export const ADVISOR_EVIDENCE_PROVENANCE_LIMITATION_TEXT =
  'Esse valor aparece apenas como premissa ou resultado de cenário que você informou, não como fato oficial desta consulta. Posso usá-lo em simulação condicional, mas não posso afirmar que foi pago, lançado ou realizado nos dados oficiais.';

/** Classe de autorização do grounding (não é source bruto). */
export type AdvisorEvidenceAuthorizationClass = 'OFFICIAL' | 'SCENARIO';

/**
 * OFFICIAL_ONLY: só OFFICIAL sustenta a cifra (fecha promoção USER_ASSUMPTION→fato).
 * SCENARIO_OR_OFFICIAL: premissa/derived também autorizam claims condicionais.
 */
export type AdvisorNumericEvidenceMode = 'OFFICIAL_ONLY' | 'SCENARIO_OR_OFFICIAL';

export function evidenceSourceAuthorizationClass(
  source: AdvisorEvidenceSource,
): AdvisorEvidenceAuthorizationClass {
  if (source === 'USER_ASSUMPTION' || source === 'SCENARIO_DERIVED') {
    return 'SCENARIO';
  }
  return 'OFFICIAL';
}

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
  /"(?<field>amount|totalRealized|total|absolute|absoluteDelta|netAmount|value|result|sharePercent|percent|percentageDelta|attributedAmount|costCenterAmount|populationAmount|identifiedAmount|unidentifiedAmount|originalSettlementAmount|delta|billing|realizedOutflows|realizedInflows|unpaid|paid)"\s*:\s*"?(?<num>-?\d+(?:[.,]\d{1,20})?)"?/gi;

/**
 * FINANCIAL_FACTS / prosa analítica com `chave: 98200.00` (sem R$).
 * Só chaves com semântica monetária — não autoriza monthKey/ano/contagens.
 */
const FACT_BARE_AMOUNT_RE =
  /(?:^|\n)\s*[^\n:]*(?:amount|total|billing|inflows|outflows|result|payables|receivables|unpaid|paid|open|overdue|value|delta|rate|attributed|population|identified|settlement|assumption|derived|share)[^\n:]*\s*[:=]\s*(?<num>-?\d+(?:[.,]\d{1,20})?)\b/gi;

/** Tolerância absoluta para equivalência monetária (centavos). */
const MONEY_CLAIM_ABS_TOLERANCE = 0.05;

export type AdvisorEvidenceEntityScope = 'TENANT' | 'COST_CENTER' | 'UNKNOWN';

export type AdvisorEvidenceSource =
  | 'FINANCIAL_FACTS'
  | 'ANALYTICAL_FACTS'
  | 'PRESENTED_INSIGHT_FACTS'
  | 'TOOL_RESULT'
  /** Premissa explícita do usuário — autoriza cifra no gate sem virar fato oficial. */
  | 'USER_ASSUMPTION'
  /** Cálculo auditável official+assumption. */
  | 'SCENARIO_DERIVED';

export type AdvisorEvidenceItem = {
  readonly text: string;
  readonly entityScope: AdvisorEvidenceEntityScope;
  readonly resolvedCostCenter?: string | null;
  readonly source: AdvisorEvidenceSource;
};

export type AdvisorEvidenceBoundGateInput = {
  readonly answerText: string;
  readonly authorizedEvidenceTexts?: readonly string[];
  readonly evidenceItems?: readonly AdvisorEvidenceItem[];
  /** Quando false, o gate ainda pode bloquear se a pergunta for entity-scoped. */
  readonly agentToolPath: boolean;
  readonly requiredEntityScope?: AdvisorEvidenceEntityScope;
  readonly requiredCostCenterName?: string | null;
  /**
   * Compatibilidade provenance × claim.
   * Omitido: SCENARIO_OR_OFFICIAL (números de premissa/derived autorizam — legado seguro
   * só quando o caller não distingue modo; o runtime AGENT resolve explicitamente).
   */
  readonly numericEvidenceMode?: AdvisorNumericEvidenceMode;
};

export type AdvisorEvidenceBoundGateResult = {
  readonly ok: boolean;
  readonly text: string;
  readonly unsupportedClaims: readonly string[];
  readonly reason:
    | 'OK'
    | 'UNSUPPORTED_NUMERIC_CLAIMS'
    | 'INCOMPATIBLE_EVIDENCE_SCOPE'
    | 'INCOMPATIBLE_EVIDENCE_PROVENANCE'
    | 'SKIPPED_NON_AGENT';
};

/**
 * Resolve se cifras só de USER_ASSUMPTION/SCENARIO_DERIVED podem autorizar a resposta.
 * Estrutural: pergunta cita magnitude compatível com assumption ACTIVE → cenário.
 * Sem catálogo de frases factuais ("realmente"/"paguei"). Sem provider.
 * Default seguro OFFICIAL_ONLY quando há assumptions mas a pergunta não reancora a premissa.
 */
export function resolveAdvisorNumericEvidenceMode(input: {
  readonly question: string;
  readonly activeAssumptionValues: readonly number[];
}): AdvisorNumericEvidenceMode {
  if (input.activeAssumptionValues.length === 0) {
    return 'OFFICIAL_ONLY';
  }
  const cited = extractNumericMagnitudesFromProse(input.question);
  if (cited.length === 0) {
    return 'OFFICIAL_ONLY';
  }
  for (const claimValue of cited) {
    for (const assumptionValue of input.activeAssumptionValues) {
      if (Math.abs(claimValue - assumptionValue) <= MONEY_CLAIM_ABS_TOLERANCE) {
        return 'SCENARIO_OR_OFFICIAL';
      }
    }
  }
  return 'OFFICIAL_ONLY';
}

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
  const hasScenarioEvidence = items.some(
    (item) => evidenceSourceAuthorizationClass(item.source) === 'SCENARIO',
  );

  // Gate também quando há evidência de cenário (mesmo sem tool round) — fecha H sem tools.
  if (!input.agentToolPath && !requiresCostCenter && !hasScenarioEvidence) {
    return {
      ok: true,
      text: input.answerText,
      unsupportedClaims: [],
      reason: 'SKIPPED_NON_AGENT',
    };
  }

  const officialItems = items.filter(
    (item) => evidenceSourceAuthorizationClass(item.source) === 'OFFICIAL',
  );
  const scenarioItems = items.filter(
    (item) => evidenceSourceAuthorizationClass(item.source) === 'SCENARIO',
  );
  const officialAuthorized = collectTokensFromItems(officialItems, requiredScope);
  const scenarioAuthorized = collectTokensFromItems(scenarioItems, requiredScope);
  const mode: AdvisorNumericEvidenceMode = input.numericEvidenceMode ?? 'SCENARIO_OR_OFFICIAL';
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

  const unsupportedOfficial: string[] = [];
  const unsupportedProvenance: string[] = [];

  for (const claim of claims) {
    if (claimAuthorizedByTokenSet(claim, officialAuthorized)) {
      continue;
    }
    if (claimAuthorizedByTokenSet(claim, scenarioAuthorized)) {
      if (mode === 'SCENARIO_OR_OFFICIAL') {
        continue;
      }
      // Magnitude só em USER_ASSUMPTION/SCENARIO_DERIVED sob pergunta factual.
      unsupportedProvenance.push(claim);
      continue;
    }
    unsupportedOfficial.push(claim);
  }

  if (unsupportedOfficial.length === 0 && unsupportedProvenance.length === 0) {
    return {
      ok: true,
      text: input.answerText,
      unsupportedClaims: [],
      reason: 'OK',
    };
  }

  if (unsupportedOfficial.length === 0 && unsupportedProvenance.length > 0) {
    return {
      ok: false,
      text: buildProvenanceLimitationText(scenarioItems),
      unsupportedClaims: unsupportedProvenance,
      reason: 'INCOMPATIBLE_EVIDENCE_PROVENANCE',
    };
  }

  return {
    ok: false,
    text: ADVISOR_EVIDENCE_GATE_LIMITATION_TEXT,
    unsupportedClaims: [...unsupportedOfficial, ...unsupportedProvenance],
    reason: 'UNSUPPORTED_NUMERIC_CLAIMS',
  };
}

/**
 * Limitação determinística citando BRL da premissa/cenário (sem promover a fato).
 */
function buildProvenanceLimitationText(
  scenarioItems: readonly AdvisorEvidenceItem[],
): string {
  const amounts: string[] = [];
  for (const item of scenarioItems) {
    for (const match of item.text.matchAll(/assumptionAmountBrl:\s*(R\$[^\n]+)/gi)) {
      const value = match[1]?.trim();
      if (value !== undefined && value !== '') {
        amounts.push(value);
      }
    }
  }
  const unique = [...new Set(amounts)].slice(0, 3);
  if (unique.length === 0) {
    return ADVISOR_EVIDENCE_PROVENANCE_LIMITATION_TEXT;
  }
  const listed = unique.join(', ');
  return `O valor ${listed} aparece apenas como premissa ou resultado de cenário que você informou, não como fato oficial desta consulta. Posso usá-lo em simulação condicional, mas não posso afirmar que foi pago, lançado ou realizado nos dados oficiais.`;
}

function claimAuthorizedByTokenSet(claim: string, authorized: ReadonlySet<string>): boolean {
  const isPercent = claim.includes('%');
  const money = normalizeFinancialClaim(claim);
  const bare = normalizeNumericToken(claim.replace(/R\$/gi, '').replace(/%/g, ''), {
    money: !isPercent,
  });
  if (authorized.has(money) || (bare !== null && authorized.has(bare))) {
    return true;
  }
  if (bare !== null && !isPercent && authorizedHasNumericMagnitude(authorized, bare)) {
    return true;
  }
  if (isPercent && bare !== null && authorizedHasRoundedPercent(authorized, bare)) {
    return true;
  }
  return false;
}

/**
 * Tentativa controlada: se o rewrite ainda tiver cifras não sustentadas,
 * tenta salvage determinístico (remove só agregações/cifras não autorizadas)
 * antes da limitação.
 */
export function applyAdvisorEvidenceBoundRewrite(input: {
  readonly original: AdvisorEvidenceBoundGateResult;
  /** Prosa rejeitada pelo gate (não a mensagem de limitação). */
  readonly rejectedAnswerText?: string;
  readonly rewriteText: string;
  readonly authorizedEvidenceTexts?: readonly string[];
  readonly evidenceItems?: readonly AdvisorEvidenceItem[];
  readonly requiredEntityScope?: AdvisorEvidenceEntityScope;
  readonly requiredCostCenterName?: string | null;
  readonly numericEvidenceMode?: AdvisorNumericEvidenceMode;
}): AdvisorEvidenceBoundGateResult {
  if (input.original.ok) {
    return input.original;
  }
  const gateInput = {
    authorizedEvidenceTexts: input.authorizedEvidenceTexts,
    evidenceItems: input.evidenceItems,
    agentToolPath: true as const,
    requiredEntityScope: input.requiredEntityScope,
    requiredCostCenterName: input.requiredCostCenterName,
    numericEvidenceMode: input.numericEvidenceMode,
  };
  const rewriteGated = gateAdvisorEvidenceBoundAnswer({
    answerText: input.rewriteText,
    ...gateInput,
  });

  // Salvage determinístico: remove agregações/cifras não sustentadas e revalida.
  const salvageCandidates: Array<{ text: string; unsupported: readonly string[] }> = [];
  if (input.rejectedAnswerText !== undefined && input.rejectedAnswerText.trim() !== '') {
    salvageCandidates.push({
      text: input.rejectedAnswerText,
      unsupported: input.original.unsupportedClaims,
    });
  }
  if (!rewriteGated.ok) {
    salvageCandidates.push({
      text: input.rewriteText,
      unsupported: rewriteGated.unsupportedClaims,
    });
  }

  let bestSalvage: AdvisorEvidenceBoundGateResult | null = null;
  for (const candidate of salvageCandidates) {
    const salvagedText = stripUnsupportedMonetaryClaims(candidate.text, candidate.unsupported);
    if (salvagedText.trim() === '' || salvagedText === candidate.text) {
      continue;
    }
    const salvaged = gateAdvisorEvidenceBoundAnswer({
      answerText: salvagedText,
      ...gateInput,
    });
    if (!salvaged.ok) {
      continue;
    }
    if (
      bestSalvage === null ||
      extractFinancialClaims(salvaged.text).length > extractFinancialClaims(bestSalvage.text).length
    ) {
      bestSalvage = salvaged;
    }
  }

  // Preferir ranking/listagem salvado com cifras oficiais a um rewrite vazio
  // (limitação genérica sem números) que passaria o gate por ausência de claims.
  if (bestSalvage !== null && extractFinancialClaims(bestSalvage.text).length > 0) {
    if (!rewriteGated.ok || extractFinancialClaims(input.rewriteText).length === 0) {
      return bestSalvage;
    }
  }
  if (rewriteGated.ok) {
    return rewriteGated;
  }
  if (bestSalvage !== null) {
    return bestSalvage;
  }

  const provenanceFail =
    rewriteGated.reason === 'INCOMPATIBLE_EVIDENCE_PROVENANCE' ||
    input.original.reason === 'INCOMPATIBLE_EVIDENCE_PROVENANCE';
  return {
    ok: false,
    text:
      rewriteGated.reason === 'INCOMPATIBLE_EVIDENCE_SCOPE'
        ? ADVISOR_EVIDENCE_SCOPE_LIMITATION_TEXT
        : provenanceFail
          ? input.original.reason === 'INCOMPATIBLE_EVIDENCE_PROVENANCE'
            ? input.original.text
            : ADVISOR_EVIDENCE_PROVENANCE_LIMITATION_TEXT
          : ADVISOR_EVIDENCE_GATE_LIMITATION_TEXT,
    unsupportedClaims: rewriteGated.unsupportedClaims,
    reason: rewriteGated.reason,
  };
}

/**
 * Remove sentenças/trechos que contêm cifras não autorizadas.
 * Preserva valores individuais oficiais quando a agregação inventada é acessória.
 */
export function stripUnsupportedMonetaryClaims(
  text: string,
  unsupportedClaims: readonly string[],
): string {
  if (unsupportedClaims.length === 0) {
    return text;
  }
  let result = text;
  for (const claim of unsupportedClaims) {
    const escaped = claim
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\s+/g, '\\s*');
    // Remove a sentença (até pontuação ou quebra de linha) que contém a cifra.
    result = result.replace(
      new RegExp(`[^\\n.!?]*${escaped}[^\\n.!?]*[.!?]?`, 'gi'),
      '',
    );
  }
  return result
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
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
    const isPercent = claim.includes('%');
    const money = normalizeFinancialClaim(claim);
    tokens.add(money);
    const bare = normalizeNumericToken(claim.replace(/R\$/gi, '').replace(/%/g, ''), {
      money: !isPercent,
    });
    if (bare !== null) {
      addMagnitudeTokens(tokens, bare);
    }
  }
  JSON_AMOUNT_FIELD_RE.lastIndex = 0;
  let fieldMatch: RegExpExecArray | null;
  while ((fieldMatch = JSON_AMOUNT_FIELD_RE.exec(text)) !== null) {
    const raw = fieldMatch.groups?.num;
    const field = fieldMatch.groups?.field ?? '';
    if (raw === undefined) {
      continue;
    }
    // Percentuais JSON NÃO usam milhar BR (25.472 ≠ 25472).
    const isPercentField = /percent/i.test(field);
    const normalized = normalizeNumericToken(raw, { money: !isPercentField });
    if (normalized !== null) {
      addMagnitudeTokens(tokens, normalized);
      if (isPercentField) {
        addRoundedPercentTokens(tokens, normalized);
      }
    }
  }
  FACT_BARE_AMOUNT_RE.lastIndex = 0;
  let factMatch: RegExpExecArray | null;
  while ((factMatch = FACT_BARE_AMOUNT_RE.exec(text)) !== null) {
    const raw = factMatch.groups?.num;
    if (raw === undefined) {
      continue;
    }
    const normalized = normalizeNumericToken(raw, { money: true });
    if (normalized !== null) {
      addMagnitudeTokens(tokens, normalized);
    }
  }
}

function authorizedHasNumericMagnitude(
  authorized: ReadonlySet<string>,
  bareClaim: string,
): boolean {
  const claimNumber = Number(bareClaim);
  if (!Number.isFinite(claimNumber)) {
    return false;
  }
  for (const token of authorized) {
    const bare = token.startsWith('r$')
      ? token.slice(2)
      : token.endsWith('%')
        ? token.slice(0, -1)
        : token;
    if (!/^-?\d+(?:\.\d+)?$/.test(bare)) {
      continue;
    }
    const evidenceNumber = Number(bare);
    if (!Number.isFinite(evidenceNumber)) {
      continue;
    }
    if (Math.abs(evidenceNumber - claimNumber) <= MONEY_CLAIM_ABS_TOLERANCE) {
      return true;
    }
    if (
      Math.abs(Math.abs(evidenceNumber) - Math.abs(claimNumber)) <= MONEY_CLAIM_ABS_TOLERANCE
    ) {
      return true;
    }
  }
  return false;
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

/**
 * Expande "R$ 5 mil" / "R$ 5,5 mil" para forma decimal BR antes do extract,
 * evitando que o regex monetário capture só "R$ 5" e rejeite cifra autorizada de 5000.
 */
function expandBrMilMoneyClaims(text: string): string {
  return text.replace(/R\$\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*mil\b/gi, (full, raw: string) => {
    const n = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(n)) {
      return full;
    }
    const cents = (n * 1000).toFixed(2);
    const [intPart, dec] = cents.split('.') as [string, string];
    const withDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `R$ ${withDots},${dec}`;
  });
}

function extractFinancialClaims(text: string): string[] {
  const normalized = expandBrMilMoneyClaims(text);
  const claims: string[] = [];
  for (const match of normalized.match(MONEY_CLAIM_RE) ?? []) {
    claims.push(match);
  }
  for (const match of normalized.match(PERCENT_CLAIM_RE) ?? []) {
    claims.push(match);
  }
  return claims;
}

/** Magnitudes numéricas citadas em prosa (pergunta) — para reancorar cenário sem frases. */
export function extractNumericMagnitudesFromProse(text: string): readonly number[] {
  const out: number[] = [];
  for (const claim of extractFinancialClaims(text)) {
    const isPercent = claim.includes('%');
    const bare = normalizeNumericToken(claim.replace(/R\$/gi, '').replace(/%/g, ''), {
      money: !isPercent,
    });
    if (bare !== null) {
      const n = Number(bare);
      if (Number.isFinite(n)) {
        out.push(n);
      }
    }
  }
  // "5 mil" sem R$ (cue estrutural de magnitude, alinhado a messageHasAssumptionMagnitudeCue).
  const milBare = /\b(\d+(?:[.,]\d+)?)\s*mil\b/gi;
  let milMatch: RegExpExecArray | null;
  while ((milMatch = milBare.exec(text)) !== null) {
    const raw = milMatch[1];
    if (raw === undefined) {
      continue;
    }
    const n = Number(raw.replace(',', '.'));
    if (Number.isFinite(n)) {
      out.push(n * 1000);
    }
  }
  return out;
}

function normalizeFinancialClaim(claim: string): string {
  const trimmed = claim.trim().toLowerCase().replace(/\s+/g, '');
  if (trimmed.includes('%')) {
    const bare = normalizeNumericToken(trimmed.replace('%', ''), { money: false });
    return bare === null ? trimmed : `${bare}%`;
  }
  const bare = normalizeNumericToken(trimmed.replace(/r\$/g, ''), { money: true });
  return bare === null ? trimmed : `r$${bare}`;
}

function normalizeNumericToken(
  raw: string,
  options: { readonly money?: boolean } = {},
): string | null {
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') {
    return null;
  }
  let normalized = cleaned;
  // BR milhar com vírgula decimal: 1.234,56 / 80.000,00
  // BR milhar longo: 1.234.567
  // BR milhar monetário sem centavos: R$ 80.000 → 80000 (só com money=true;
  // percentuais como 25.472 ficam intactos).
  if (
    /^-?\d{1,3}(?:\.\d{3}){2,}(?:,\d+)?$/.test(normalized) ||
    /^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(normalized) ||
    (options.money === true && /^-?\d{1,3}(?:\.\d{3})+$/.test(normalized))
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
