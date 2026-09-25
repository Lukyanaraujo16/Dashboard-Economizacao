import {
  amountsMatch,
  extractAdvisorMentionedAmounts,
  formatAdvisorFactualBrl,
  formatAdvisorFactualMonth,
  formatAdvisorFactualPercent,
} from './advisor-factual-display.js';
import {
  classifyAdvisorFactualResponse,
  isAdvisorNominalIdentityFollowUp,
  type AdvisorFactualClassification,
  type AdvisorFactualIntentKind,
} from './classify-advisor-factual-response.js';
import type { AdvisorCostCenterAnaphoraStatus } from './resolve-advisor-conversational-cost-center.js';
import type { AdvisorNominalAnaphoraStatus } from './resolve-advisor-conversational-nominal.js';

export const ADVISOR_FACTUAL_COMPOSER_VERSION = 'd4.3.2-1';

export type AdvisorFactualAnswerMeta = {
  readonly classification: 'FACTUAL_CLOSED';
  readonly providerCalled: false;
  readonly intentKind: AdvisorFactualIntentKind;
  readonly factKind: string | null;
  readonly identityStatus: string | null;
  readonly returnedCount: number | null;
  readonly coveragePercent: string | null;
  readonly composerVersion: typeof ADVISOR_FACTUAL_COMPOSER_VERSION;
};

export type ComposeAdvisorFactualAnswerInput = {
  readonly content: string;
  readonly anaphora: AdvisorNominalAnaphoraStatus | AdvisorCostCenterAnaphoraStatus;
  readonly toolName: string | null;
  readonly toolOk: boolean;
  readonly toolContent: string | null;
};

export type ComposeAdvisorFactualAnswerResult =
  | {
      readonly classification: AdvisorFactualClassification;
      readonly answer: string;
      readonly meta: AdvisorFactualAnswerMeta;
    }
  | {
      readonly classification: AdvisorFactualClassification;
      readonly answer: null;
      readonly meta: null;
    };

/**
 * Transforma fatos oficiais já serializados em linguagem factual.
 * Não acessa Prisma de negócio, Conta Azul, HTTP ou provider.
 */
export function composeAdvisorFactualAnswer(
  input: ComposeAdvisorFactualAnswerInput,
): ComposeAdvisorFactualAnswerResult {
  const facts = parseFacts(input.toolContent);
  const classification = classifyAdvisorFactualResponse({
    content: input.content,
    anaphora: input.anaphora,
    toolName: input.toolName,
    toolOk: input.toolOk,
    facts,
  });
  if (classification.kind !== 'FACTUAL_CLOSED' || facts === null) {
    return { classification, answer: null, meta: null };
  }

  const answer =
    classification.intentKind === 'RANKING_WINNER'
      ? composeRankingWinner(facts)
      : classification.intentKind === 'RANKING_SHARE'
        ? composeRankingShare(facts)
        : classification.intentKind === 'RANKING_TOPN'
          ? composeRankingTopN(facts)
          : classification.intentKind === 'LOOKUP'
            ? composeLookup(facts, input.content)
            : classification.intentKind === 'COMPARISON'
              ? composeComparison(facts)
              : classification.intentKind === 'IDENTITY_AMBIGUITY'
                ? composeIdentityAmbiguity(facts, input.content)
                : classification.intentKind.startsWith('SNAPSHOT_')
                  ? composeCurrentSnapshot(facts, classification.intentKind)
                  : classification.intentKind === 'COST_CENTER_COMPARE'
                  ? composeCostCenterCompare(facts)
                  : classification.intentKind === 'COST_CENTER_MOVEMENT_LINES'
                    ? composeCostCenterMovements(facts)
                    : classification.intentKind.startsWith('COST_CENTER_')
                      ? composeCostCenter(facts, classification.intentKind)
                      : classification.intentKind === 'MONTHLY_COMPARISON'
                        ? composeMonthlyComparison(facts)
                        : classification.intentKind === 'MONTHLY_BILLING_WINNER'
                          ? composeMonthlyBillingWinner(facts)
                          : composeLimitation(facts, input.anaphora);

  if (answer === null) {
    return {
      classification: {
        kind: 'UNRESOLVED',
        intentKind: classification.intentKind,
        factKind: classification.factKind,
      },
      answer: null,
      meta: null,
    };
  }

  return {
    classification,
    answer,
    meta: {
      classification: 'FACTUAL_CLOSED',
      providerCalled: false,
      intentKind: classification.intentKind,
      factKind: classification.factKind,
      identityStatus: readIdentityStatus(facts, classification.intentKind),
      returnedCount: readReturnedCount(facts),
      coveragePercent: readCoveragePercent(facts),
      composerVersion: ADVISOR_FACTUAL_COMPOSER_VERSION,
    },
  };
}

function composeRankingWinner(facts: Record<string, unknown>): string | null {
  const winner = asRecord(facts.winner);
  const first = rankingRows(facts)[0];
  const population = asRecord(facts.population);
  const category = asRecord(facts.category);
  const identityCoverage = asRecord(facts.identityCoverage);
  const month = formatAdvisorFactualMonth(asString(facts.monthKey) ?? '');
  const name = asString(winner?.displayName);
  const amount = formatAdvisorFactualBrl(asString(winner?.amount) ?? '');
  const share = formatAdvisorFactualPercent(asString(first?.shareOfPopulation) ?? '');
  const total = formatAdvisorFactualBrl(asString(population?.amount) ?? '');
  const categoryName = asString(category?.name);
  const coverage = formatAdvisorFactualPercent(coverageRaw(facts) ?? '');
  if (
    month === null ||
    name === null ||
    amount === null ||
    share === null ||
    total === null ||
    categoryName === null ||
    coverage === null
  ) {
    return null;
  }
  const ambiguous = formatAdvisorFactualBrl(asString(identityCoverage?.ambiguousAmount) ?? '0');
  const ambiguousSentence =
    identityCoverage !== null &&
    asString(identityCoverage.ambiguousAmount) !== '0' &&
    ambiguous !== null
      ? ` A identificação nominal cobre ${coverage} do valor da categoria; ${ambiguous} permanecem ambíguos.`
      : ` A identificação nominal cobre ${coverage} do valor da categoria.`;
  return `Em ${month}, o maior valor identificado foi de ${name}: ${amount}, equivalente a ${share} do total de ${total} da categoria ${categoryName}.${ambiguousSentence}`;
}

function composeRankingShare(facts: Record<string, unknown>): string | null {
  const cardinality = asRecord(facts.cardinality);
  const topN = asRecord(facts.topN);
  const population = asRecord(facts.population);
  const category = asRecord(facts.category);
  const identityCoverage = asRecord(facts.identityCoverage);
  const identifiedCount = asNumber(cardinality?.identifiedEntityCount);
  const returnedCount = asNumber(cardinality?.returnedCount);
  const amount = formatAdvisorFactualBrl(asString(topN?.amount) ?? '');
  const share = formatAdvisorFactualPercent(asString(topN?.shareOfPopulation) ?? '');
  const total = formatAdvisorFactualBrl(asString(population?.amount) ?? '');
  const categoryName = asString(category?.name);
  const month = formatAdvisorFactualMonth(asString(facts.monthKey) ?? '');
  if (
    identifiedCount === null ||
    returnedCount === null ||
    amount === null ||
    share === null ||
    total === null ||
    categoryName === null ||
    month === null
  ) {
    return null;
  }
  const entityPhrase =
    identifiedCount === 1
      ? 'Há 1 convênio nominalmente identificado no ranking'
      : `Há ${identifiedCount} convênios nominalmente identificados no ranking`;
  const ambiguous = formatAdvisorFactualBrl(asString(identityCoverage?.ambiguousAmount) ?? '0');
  const ambiguousSentence =
    identityCoverage !== null &&
    asString(identityCoverage.ambiguousAmount) !== '0' &&
    ambiguous !== null
      ? ` ${ambiguous} permanecem ambíguos.`
      : '';
  return `${entityPhrase}. Em ${month}, juntos somam ${amount}, equivalentes a ${share} do total de ${total} da categoria ${categoryName}.${ambiguousSentence}`;
}

function composeRankingTopN(facts: Record<string, unknown>): string | null {
  const rows = rankingRows(facts);
  const cardinality = asRecord(facts.cardinality);
  const identifiedCount = asNumber(cardinality?.identifiedEntityCount);
  const month = formatAdvisorFactualMonth(asString(facts.monthKey) ?? '');
  if (identifiedCount === null || month === null || rows.length === 0) {
    return null;
  }
  const listed = rows.map((row) => {
    const name = asString(row.displayName);
    const amount = formatAdvisorFactualBrl(asString(row.amount) ?? '');
    if (name === null || amount === null) {
      return null;
    }
    return `${name}: ${amount}`;
  });
  if (listed.some((item) => item === null)) {
    return null;
  }
  const header =
    identifiedCount === 1
      ? `Há 1 convênio nominalmente identificado no ranking em ${month}`
      : `Há ${identifiedCount} convênios nominalmente identificados no ranking em ${month}`;
  return `${header}: ${listed.join('; ')}.`;
}

function composeLookup(facts: Record<string, unknown>, question: string): string | null {
  const entity = asRecord(facts.entity);
  const category = asRecord(facts.category);
  const month = formatAdvisorFactualMonth(asString(facts.monthKey) ?? '');
  const name = asString(entity?.displayName);
  const amount = formatAdvisorFactualBrl(asString(entity?.amount) ?? '');
  const populationShare = formatAdvisorFactualPercent(asString(entity?.shareOfPopulation) ?? '');
  const identifiedShare = formatAdvisorFactualPercent(asString(entity?.shareOfIdentified) ?? '');
  const total = formatAdvisorFactualBrl(asString(facts.populationAmount) ?? '');
  const categoryName = asString(category?.name);
  if (
    month === null ||
    name === null ||
    amount === null ||
    populationShare === null ||
    total === null ||
    categoryName === null
  ) {
    return null;
  }
  const folded = foldPt(question);
  const wantsIdentifiedShare =
    /\bentre (?:os |os valores )?identificad/.test(folded) ||
    /\bshareofidentified\b/.test(folded);
  if (wantsIdentifiedShare && identifiedShare !== null) {
    return `Em ${month}, o valor identificado de ${name} em ${categoryName} foi ${amount}, equivalente a ${identifiedShare} entre os valores identificados — não do total da categoria.`;
  }
  return `Em ${month}, o valor identificado de ${name} em ${categoryName} foi ${amount}, equivalente a ${populationShare} do total da categoria (${total}).`;
}

function composeComparison(facts: Record<string, unknown>): string | null {
  const item = asRecord(Array.isArray(facts.items) ? facts.items[0] : null);
  const monthA = formatAdvisorFactualMonth(asString(facts.comparisonMonthKey) ?? '');
  const monthB = formatAdvisorFactualMonth(asString(facts.monthKey) ?? '');
  const name = asString(item?.displayName);
  const amountA = formatAdvisorFactualBrl(asString(item?.amountA) ?? '');
  const amountB = formatAdvisorFactualBrl(asString(item?.amountB) ?? '');
  const delta = formatAdvisorFactualBrl(asString(item?.deltaAmount) ?? '');
  if (
    item === null ||
    monthA === null ||
    monthB === null ||
    name === null ||
    amountA === null ||
    amountB === null ||
    delta === null
  ) {
    return null;
  }
  const percent = formatAdvisorFactualPercent(asString(item.deltaPercent) ?? '');
  if (percent === null) {
    return `De ${monthA} para ${monthB}, ${name} passou de ${amountA} para ${amountB}, variação de ${delta}. A variação percentual não se aplica porque o denominador do período anterior é zero.`;
  }
  return `De ${monthA} para ${monthB}, ${name} passou de ${amountA} para ${amountB}, variação de ${delta} (${percent}).`;
}

function composeIdentityAmbiguity(
  facts: Record<string, unknown>,
  question: string,
): string | null {
  const identityCoverage = asRecord(facts.identityCoverage);
  const ambiguousRaw = asString(identityCoverage?.ambiguousAmount);
  const ambiguous = formatAdvisorFactualBrl(ambiguousRaw ?? '');
  if (ambiguousRaw === null || ambiguousRaw === '0' || ambiguous === null) {
    return null;
  }
  const mentionedAmounts = extractAdvisorMentionedAmounts(question);
  if (mentionedAmounts.length > 0 && !mentionedAmounts.some((amount) => amountsMatch(amount, ambiguousRaw))) {
    return null;
  }
  const mentioned = findMentionedIdentified(question, rankingRows(facts));
  if (mentioned !== null) {
    const identifiedAmount = formatAdvisorFactualBrl(asString(mentioned.amount) ?? '');
    if (identifiedAmount === null) {
      return null;
    }
    return `Não é seguro somar ${ambiguous} a ${mentioned.displayName} e considerar tudo a mesma entidade. O valor ${identifiedAmount} está associado a uma identidade estruturada de ${mentioned.displayName}; ${ambiguous} permanecem ambíguos porque não há identificador estruturado compartilhado suficiente para comprovar que pertencem à mesma entidade.`;
  }
  return `Não é seguro consolidar ${ambiguous} em uma entidade identificada. Esses valores permanecem ambíguos porque não há identificador estruturado compartilhado suficiente para comprovar a mesma identidade.`;
}

function composeCurrentSnapshot(
  facts: Record<string, unknown>,
  intentKind: AdvisorFactualIntentKind,
): string | null {
  const receivables = asRecord(facts.receivables);
  const payables = asRecord(facts.payables);
  const delinquency = asRecord(facts.receivableDelinquency);
  if (intentKind === 'SNAPSHOT_OPEN_RECEIVABLES') {
    const amount = formatAdvisorFactualBrl(asString(receivables?.open) ?? '');
    return amount === null ? null : `Hoje, você tem ${amount} em contas a receber em aberto.`;
  }
  if (intentKind === 'SNAPSHOT_OPEN_PAYABLES') {
    const amount = formatAdvisorFactualBrl(asString(payables?.open) ?? '');
    return amount === null ? null : `Hoje, você tem ${amount} em contas a pagar em aberto.`;
  }
  if (intentKind === 'SNAPSHOT_OPEN_BOTH') {
    const receive = formatAdvisorFactualBrl(asString(receivables?.open) ?? '');
    const pay = formatAdvisorFactualBrl(asString(payables?.open) ?? '');
    return receive === null || pay === null
      ? null
      : `Hoje, você tem ${receive} em contas a receber em aberto e ${pay} em contas a pagar em aberto.`;
  }
  if (intentKind === 'SNAPSHOT_OVERDUE_RECEIVABLES') {
    const amount = formatAdvisorFactualBrl(asString(receivables?.overdue) ?? '');
    return amount === null ? null : `Hoje, há ${amount} em contas a receber vencidas.`;
  }
  if (intentKind === 'SNAPSHOT_OVERDUE_PAYABLES') {
    const amount = formatAdvisorFactualBrl(asString(payables?.overdue) ?? '');
    return amount === null ? null : `Hoje, há ${amount} em contas a pagar vencidas.`;
  }
  if (intentKind === 'SNAPSHOT_OVERDUE_BOTH') {
    const receive = formatAdvisorFactualBrl(asString(receivables?.overdue) ?? '');
    const pay = formatAdvisorFactualBrl(asString(payables?.overdue) ?? '');
    return receive === null || pay === null
      ? null
      : `Hoje, há ${receive} em contas a receber vencidas e ${pay} em contas a pagar vencidas.`;
  }
  if (intentKind === 'SNAPSHOT_DELINQUENCY') {
    const overdue = formatAdvisorFactualBrl(asString(delinquency?.overdueAmount) ?? '');
    const open = formatAdvisorFactualBrl(asString(delinquency?.openAmount) ?? '');
    const rateRaw = asString(delinquency?.percentage);
    if (overdue === null || open === null) {
      return null;
    }
    if (rateRaw === null || rateRaw === 'ABSENT' || rateRaw === 'NOT_APPLICABLE') {
      return `Não há recebíveis em aberto hoje; a taxa de inadimplência dos recebíveis não se aplica. O vencido atual dos recebíveis é ${overdue}.`;
    }
    const rate = formatAdvisorFactualPercent(rateRaw);
    return rate === null
      ? null
      : `A inadimplência atual dos recebíveis é de ${rate}, equivalente a ${overdue} vencidos sobre ${open} em aberto.`;
  }
  if (intentKind === 'SNAPSHOT_DUE_TODAY_RECEIVABLES') {
    const amount = formatAdvisorFactualBrl(asString(receivables?.dueToday) ?? '');
    return amount === null ? null : `Hoje, vencem ${amount} em contas a receber.`;
  }
  if (intentKind === 'SNAPSHOT_DUE_TODAY_PAYABLES') {
    const amount = formatAdvisorFactualBrl(asString(payables?.dueToday) ?? '');
    return amount === null ? null : `Hoje, vencem ${amount} em contas a pagar.`;
  }
  if (intentKind === 'SNAPSHOT_DUE_TODAY_BOTH') {
    const receive = formatAdvisorFactualBrl(asString(receivables?.dueToday) ?? '');
    const pay = formatAdvisorFactualBrl(asString(payables?.dueToday) ?? '');
    return receive === null || pay === null
      ? null
      : `Hoje, vencem ${receive} em contas a receber e ${pay} em contas a pagar.`;
  }
  if (intentKind === 'SNAPSHOT_UPCOMING_RECEIVABLES') {
    const amount = formatAdvisorFactualBrl(asString(receivables?.upcomingFuture) ?? '');
    return amount === null ? null : `Há ${amount} em contas a receber ainda a vencer após hoje.`;
  }
  if (intentKind === 'SNAPSHOT_UPCOMING_PAYABLES') {
    const amount = formatAdvisorFactualBrl(asString(payables?.upcomingFuture) ?? '');
    return amount === null ? null : `Há ${amount} em contas a pagar ainda a vencer após hoje.`;
  }
  if (intentKind === 'SNAPSHOT_UPCOMING_BOTH') {
    const receive = formatAdvisorFactualBrl(asString(receivables?.upcomingFuture) ?? '');
    const pay = formatAdvisorFactualBrl(asString(payables?.upcomingFuture) ?? '');
    return receive === null || pay === null
      ? null
      : `Há ${receive} em contas a receber e ${pay} em contas a pagar ainda a vencer após hoje.`;
  }
  return null;
}

function composeCostCenter(
  facts: Record<string, unknown>,
  intentKind: AdvisorFactualIntentKind,
): string | null {
  const direction = asString(facts.direction) === 'INFLOW' ? 'entradas realizadas' : 'saídas realizadas';
  const singular = asString(facts.direction) === 'INFLOW' ? 'entrada realizada' : 'saída realizada';
  const month = formatAdvisorFactualMonth(asString(facts.monthKey) ?? '');
  const coverage = formatAdvisorFactualPercent(asString(facts.coveragePercentage) ?? '');
  const coverageSentence =
    coverage !== null && asString(facts.coveragePercentage) !== '100'
      ? ` Foi possível atribuir ${coverage} das ${direction} a centros de custo.`
      : '';
  if (intentKind === 'COST_CENTER_RANKING_WINNER') {
    const winner = asRecord(facts.winner);
    const name = asString(winner?.name);
    const amount = formatAdvisorFactualBrl(asString(winner?.amount) ?? '');
    const share = formatAdvisorFactualPercent(asString(winner?.shareOfPopulation) ?? '');
    if (month === null || name === null || amount === null || share === null) {
      return null;
    }
    return `Em ${month}, o centro de custo ${name} teve a maior ${singular}: ${amount}, equivalente a ${share} do total de ${direction} do mês.${coverageSentence}`;
  }
  if (intentKind === 'COST_CENTER_RANKING_TOPN') {
    const ranking = Array.isArray(facts.ranking) ? facts.ranking : [];
    const cardinality = asRecord(facts.cardinality);
    const identifiedCount = asNumber(cardinality?.identifiedEntityCount);
    if (month === null || identifiedCount === null || ranking.length === 0) {
      return null;
    }
    const listed = ranking.map((row) => {
      const item = asRecord(row);
      const name = asString(item?.name);
      const amount = formatAdvisorFactualBrl(asString(item?.amount) ?? '');
      if (name === null || amount === null) {
        return null;
      }
      return `${name}: ${amount}`;
    });
    if (listed.some((item) => item === null)) {
      return null;
    }
    const header =
      identifiedCount === 1
        ? `Foi identificado 1 centro de custo nas ${direction} de ${month}`
        : `Foram identificados ${identifiedCount} centros de custo nas ${direction} de ${month}`;
    return `${header}: ${listed.join('; ')}.${coverageSentence}`;
  }
  const center = asRecord(facts.costCenter);
  const name = asString(center?.name);
  const amount = formatAdvisorFactualBrl(asString(center?.amount) ?? '');
  const share = formatAdvisorFactualPercent(asString(center?.shareOfPopulation) ?? '');
  if (month === null || name === null || amount === null) {
    return null;
  }
  if (share === null) {
    return `Em ${month}, o centro ${name} teve ${amount} em ${direction}. A participação percentual não se aplica porque o total do mês é zero.`;
  }
  if (intentKind === 'COST_CENTER_SHARE') {
    return `O centro ${name} teve ${amount} em ${direction}, equivalente a ${share} do total de ${direction} do mês.${coverageSentence}`;
  }
  return `Em ${month}, o centro ${name} teve ${amount} em ${direction}, equivalente a ${share} do total de ${direction}.${coverageSentence}`;
}

function composeCostCenterCompare(facts: Record<string, unknown>): string | null {
  const center = asRecord(facts.costCenter);
  const base = asRecord(facts.base);
  const target = asRecord(facts.target);
  const name = asString(center?.name);
  const monthA = formatAdvisorFactualMonth(asString(facts.comparisonMonthKey) ?? '');
  const monthB = formatAdvisorFactualMonth(asString(facts.monthKey) ?? '');
  const amountA = formatAdvisorFactualBrl(asString(base?.amount) ?? '');
  const amountB = formatAdvisorFactualBrl(asString(target?.amount) ?? '');
  const delta = formatAdvisorFactualBrl(asString(facts.absoluteDelta) ?? '');
  const direction = asString(facts.direction) === 'INFLOW' ? 'entradas realizadas' : 'saídas realizadas';
  if (
    name === null ||
    monthA === null ||
    monthB === null ||
    amountA === null ||
    amountB === null ||
    delta === null
  ) {
    return null;
  }
  const percent = formatAdvisorFactualPercent(asString(facts.percentageDelta) ?? '');
  const core =
    percent === null
      ? `${name} teve ${amountA} em ${direction} em ${monthA} e ${amountB} em ${monthB}, uma variação de ${delta}. A variação percentual não é aplicável porque a base era zero.`
      : `${name} teve ${amountA} em ${direction} em ${monthA} e ${amountB} em ${monthB}, uma variação de ${delta} (${percent}).`;
  if (facts.coverageDiffers !== true) {
    return core;
  }
  const coverageA = formatAdvisorFactualPercent(asString(base?.coveragePercentage) ?? '');
  const coverageB = formatAdvisorFactualPercent(asString(target?.coveragePercentage) ?? '');
  if (coverageA === null || coverageB === null) {
    return `${core} A cobertura identificada de centros de custo diferiu entre os meses. A variação considera os valores identificados deste centro.`;
  }
  return `${core} A cobertura identificada de centros de custo foi de ${coverageA} em ${monthA} e ${coverageB} em ${monthB}. A variação considera os valores identificados deste centro.`;
}

function composeCostCenterMovements(facts: Record<string, unknown>): string | null {
  const center = asRecord(facts.costCenter);
  const name = asString(center?.name);
  const month = formatAdvisorFactualMonth(asString(facts.monthKey) ?? '');
  const total = formatAdvisorFactualBrl(asString(facts.costCenterAmount) ?? '');
  const direction = asString(facts.direction) === 'INFLOW' ? 'entradas realizadas' : 'saídas realizadas';
  const singular = asString(facts.direction) === 'INFLOW' ? 'entrada realizada' : 'saída realizada';
  if (month === null || name === null || total === null) {
    return null;
  }
  const lines = Array.isArray(facts.lines) ? facts.lines : [];
  if (lines.length === 0) {
    return `Em ${month}, o centro ${name} teve ${total} em ${direction}. Não há lançamentos atribuídos a esse centro neste recorte.`;
  }
  const listed = lines.map((row, index) => {
    const item = asRecord(row);
    const amount = formatAdvisorFactualBrl(asString(item?.attributedAmount) ?? '');
    const date = asString(item?.occurredOn);
    const description = asString(item?.description);
    const party = asString(item?.partyName);
    if (amount === null) {
      return null;
    }
    const label = [description, party].filter((part) => part !== null).join(' — ');
    const when = date === null ? '' : ` (${date})`;
    return `${index + 1}. ${label === '' ? singular : label}${when}: ${amount}`;
  });
  if (listed.some((item) => item === null)) {
    return null;
  }
  const count = listed.length;
  const hasMore = facts.hasMore === true;
  const header = `Em ${month}, o centro ${name} teve ${total} em ${direction}.`;
  const intro = hasMore
    ? `Os ${count} maiores lançamentos que compõem esse total foram:`
    : `Os lançamentos que compõem esse total foram:`;
  const closer = hasMore
    ? ' Esses são os maiores lançamentos que compõem o total; existem outros lançamentos no período.'
    : '';
  return `${header} ${intro}\n${listed.join('\n')}.${closer}`;
}

function composeMonthlyComparison(facts: Record<string, unknown>): string | null {
  const periodA = asRecord(facts.periodA);
  const periodB = asRecord(facts.periodB);
  const difference = asRecord(facts.difference);
  const monthA = formatAdvisorFactualMonth(asString(periodA?.monthKey) ?? asString(facts.comparisonMonthKey) ?? '');
  const monthB = formatAdvisorFactualMonth(asString(periodB?.monthKey) ?? asString(facts.monthKey) ?? '');
  if (monthA === null || monthB === null || periodA === null || periodB === null || difference === null) {
    return null;
  }
  const billingARaw = asString(periodA.billing);
  const billingBRaw = asString(periodB.billing);
  if (billingARaw === 'ABSENT' || billingBRaw === 'ABSENT' || billingARaw === null || billingBRaw === null) {
    return `Não há faturamento oficial disponível para comparar ${monthA} e ${monthB}.`;
  }
  const billingA = formatAdvisorFactualBrl(billingARaw);
  const billingB = formatAdvisorFactualBrl(billingBRaw);
  const deltaRaw = asString(difference.billing);
  const delta = deltaRaw === 'ABSENT' || deltaRaw === null ? null : formatAdvisorFactualBrl(deltaRaw);
  if (billingA === null || billingB === null || delta === null) {
    return null;
  }
  const percentRaw = asString(difference.billingPercent);
  const percent =
    percentRaw === null || percentRaw === 'NOT_APPLICABLE' || percentRaw === 'ABSENT'
      ? null
      : formatAdvisorFactualPercent(percentRaw);
  const direction = monthlyTrendLabel(deltaRaw);
  if (percent === null) {
    return `O faturamento em ${monthA} foi ${billingA} e em ${monthB} foi ${billingB}, ${direction} de ${delta}. A variação percentual não é aplicável porque a base era zero.`;
  }
  return `O faturamento em ${monthA} foi ${billingA} e em ${monthB} foi ${billingB}, ${direction} de ${delta} (${percent}).`;
}

function composeMonthlyBillingWinner(facts: Record<string, unknown>): string | null {
  const periodA = asRecord(facts.periodA);
  const periodB = asRecord(facts.periodB);
  const monthA = formatAdvisorFactualMonth(asString(periodA?.monthKey) ?? '');
  const monthB = formatAdvisorFactualMonth(asString(periodB?.monthKey) ?? '');
  const billingARaw = asString(periodA?.billing);
  const billingBRaw = asString(periodB?.billing);
  if (
    monthA === null ||
    monthB === null ||
    billingARaw === null ||
    billingBRaw === null ||
    billingARaw === 'ABSENT' ||
    billingBRaw === 'ABSENT'
  ) {
    return null;
  }
  const billingA = formatAdvisorFactualBrl(billingARaw);
  const billingB = formatAdvisorFactualBrl(billingBRaw);
  if (billingA === null || billingB === null) {
    return null;
  }
  try {
    const left = Number(billingARaw);
    const right = Number(billingBRaw);
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      return null;
    }
    if (right > left) {
      return `O maior faturamento foi o de ${monthB}, ${billingB}.`;
    }
    if (left > right) {
      return `O maior faturamento foi o de ${monthA}, ${billingA}.`;
    }
    return `${monthA} e ${monthB} tiveram o mesmo faturamento, ${billingB}.`;
  } catch {
    return null;
  }
}

function monthlyTrendLabel(deltaRaw: string | null): string {
  if (deltaRaw === null) {
    return 'uma variação';
  }
  const numeric = Number(deltaRaw);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return 'uma variação';
  }
  return numeric > 0 ? 'um aumento' : 'uma redução';
}

function composeLimitation(
  facts: Record<string, unknown>,
  anaphora: AdvisorNominalAnaphoraStatus | AdvisorCostCenterAnaphoraStatus,
): string | null {
  const status = asString(facts.status);
  const reason = asString(facts.reason);
  const factKind = asString(facts.factKind);
  if (
    factKind === 'REALIZED_CASH_COST_CENTER_DIMENSION_LOOKUP' ||
    factKind === 'REALIZED_CASH_COST_CENTER_DIMENSION_RANKING' ||
    factKind === 'REALIZED_CASH_COST_CENTER_DIMENSION_COMPARE' ||
    factKind === 'REALIZED_CASH_COST_CENTER_MOVEMENT_LINES'
  ) {
    if (reason === 'COST_CENTER_ORDINAL_UNSUPPORTED' || anaphora === 'ORDINAL_UNSUPPORTED') {
      return 'Não consigo identificar o centro de custo pela posição no ranking. Especifique o nome ou o código.';
    }
    if (
      reason === 'NO_UNEQUIVOCAL_COST_CENTER_ANTECEDENT' ||
      anaphora === 'UNRESOLVED'
    ) {
      return 'Não há um centro de custo inequívoco nesta conversa para consultar o valor.';
    }
    if (status === 'AMBIGUOUS') {
      return 'Há mais de um centro de custo correspondente. Especifique o nome ou o código.';
    }
    if (status === 'NOT_FOUND') {
      return 'Não encontrei esse centro de custo.';
    }
    return 'Não há atribuição oficial suficiente de centros de custo nas movimentações realizadas deste mês.';
  }
  if (anaphora === 'AMBIGUOUS' || status === 'AMBIGUOUS' || reason === 'MULTIPLE_NOMINAL_ANTECEDENTS') {
    return 'Há mais de um antecedente nominal nesta conversa. Especifique a entidade para eu consultar o valor oficial.';
  }
  if (anaphora === 'UNRESOLVED' || status === 'UNRESOLVED' || reason === 'NO_UNEQUIVOCAL_NOMINAL_ANTECEDENT') {
    return 'Não há um antecedente nominal inequívoco nesta conversa para consultar o valor.';
  }
  if (status === 'NOT_FOUND') {
    return 'Não encontrei essa entidade nominalmente identificada no período consultado.';
  }
  if (status === 'INSUFFICIENT' || status === 'UNAVAILABLE' || status === 'ABSENT') {
    return 'Não há fatos nominais suficientes para responder objetivamente a essa pergunta.';
  }
  if (asString(facts.factKind) === 'CURRENT_FINANCIAL_SNAPSHOT') {
    return 'Não há um recorte oficial separado de vence-hoje ou a vencer nesta posição atual para responder objetivamente.';
  }
  return null;
}

function findMentionedIdentified(
  question: string,
  rows: readonly Record<string, unknown>[],
): { readonly displayName: string; readonly amount: string } | null {
  const foldedQuestion = foldPt(question);
  const matches: Array<{ readonly displayName: string; readonly amount: string }> = [];
  for (const row of rows) {
    if (row.identityStatus !== 'IDENTIFIED') {
      continue;
    }
    const displayName = asString(row.displayName);
    const amount = asString(row.amount);
    if (displayName === null || amount === null) {
      continue;
    }
    const foldedName = foldPt(displayName);
    if (foldedName.length < 3 || !foldedQuestion.includes(foldedName)) {
      continue;
    }
    matches.push({ displayName, amount });
  }
  return matches.length === 1 ? matches[0]! : null;
}

function rankingRows(facts: Record<string, unknown>): readonly Record<string, unknown>[] {
  if (!Array.isArray(facts.ranking)) {
    return [];
  }
  return facts.ranking
    .map((row) => asRecord(row))
    .filter((row): row is Record<string, unknown> => row !== null);
}

function coverageRaw(facts: Record<string, unknown>): string | null {
  const coverage = asRecord(facts.coverage);
  return (
    asString(coverage?.identifiedPercent) ??
    asString(coverage?.amountPercent) ??
    asString(facts.coveragePercentage)
  );
}

function readIdentityStatus(
  facts: Record<string, unknown>,
  intentKind: AdvisorFactualIntentKind,
): string | null {
  if (intentKind === 'IDENTITY_AMBIGUITY') {
    return 'AMBIGUOUS';
  }
  const entity = asRecord(facts.entity);
  if (typeof entity?.identityStatus === 'string') {
    return entity.identityStatus;
  }
  const winner = asRecord(facts.winner);
  if (typeof winner?.identityStatus === 'string') {
    return winner.identityStatus;
  }
  return null;
}

function readReturnedCount(facts: Record<string, unknown>): number | null {
  const cardinality = asRecord(facts.cardinality);
  return asNumber(cardinality?.returnedCount) ?? asNumber(facts.returnedCount);
}

function readCoveragePercent(facts: Record<string, unknown>): string | null {
  return coverageRaw(facts);
}

function parseFacts(content: string | null): Record<string, unknown> | null {
  if (content === null || content.trim() === '') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(content);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export { isAdvisorNominalIdentityFollowUp };
