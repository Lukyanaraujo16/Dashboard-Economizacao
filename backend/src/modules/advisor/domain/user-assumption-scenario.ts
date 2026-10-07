/**
 * Cenário derivado auditável: OFFICIAL_FACT + USER_ASSUMPTION.
 * Resultado nunca é classificado como fato oficial.
 */
import {
  formatBrMoney,
  formatUserAssumptionEvidenceText,
  listActiveUserAssumptions,
  type UserAnalyticalAssumption,
} from './user-analytical-assumption.js';

export function serializeUserAssumptionsEvidenceBlock(
  assumptions: readonly UserAnalyticalAssumption[],
): string | null {
  const active = listActiveUserAssumptions(assumptions);
  if (active.length === 0) {
    return null;
  }
  return [
    'USER_ASSUMPTIONS_BLOCK',
    'provenance: USER_ASSUMPTION',
    'These values were explicitly provided by the user for conditional analysis.',
    'They are NOT official ledger/ERP/dashboard facts.',
    ...active.map((row) => formatUserAssumptionEvidenceText(row)),
  ].join('\n\n');
}

/**
 * Extrai um resultado de caixa realizado aproximado dos FINANCIAL_FACTS textuais.
 * Heurística conservadora — só chaves conhecidas.
 */
export function readOfficialCashResultFromFacts(factsText: string | null | undefined): number | null {
  if (factsText === undefined || factsText === null || factsText.trim() === '') {
    return null;
  }
  const patterns = [
    /cash\.realized\.result\s*[:=]\s*(-?\d+(?:[.,]\d+)?)/i,
    /cash\.result\s*[:=]\s*(-?\d+(?:[.,]\d+)?)/i,
    /(?:^|\n)\s*result(?:ado)?(?:\s+de\s+caixa)?\s*[:=]\s*(-?\d+(?:[.,]\d+)?)/i,
  ];
  for (const re of patterns) {
    const match = re.exec(factsText);
    if (match?.[1] !== undefined) {
      const n = Number(match[1].replace(',', '.'));
      if (Number.isFinite(n)) {
        return n;
      }
    }
  }
  // Fallback: inflows - outflows se ambos existirem.
  const inMatch = /cash\.realized\.inflows\s*[:=]\s*(-?\d+(?:[.,]\d+)?)/i.exec(factsText);
  const outMatch = /cash\.realized\.outflows\s*[:=]\s*(-?\d+(?:[.,]\d+)?)/i.exec(factsText);
  if (inMatch?.[1] !== undefined && outMatch?.[1] !== undefined) {
    const inflow = Number(inMatch[1].replace(',', '.'));
    const outflow = Number(outMatch[1].replace(',', '.'));
    if (Number.isFinite(inflow) && Number.isFinite(outflow)) {
      return inflow - outflow;
    }
  }
  return null;
}

/**
 * Gera fatos DERIVED auditáveis (não oficiais) para o evidence gate / provider.
 */
export function buildDerivedScenarioEvidence(input: {
  readonly assumptions: readonly UserAnalyticalAssumption[];
  readonly financialFactsText?: string | null;
}): string | null {
  const active = listActiveUserAssumptions(input.assumptions);
  if (active.length === 0) {
    return null;
  }
  const officialCashResult = readOfficialCashResultFromFacts(input.financialFactsText);
  const lines: string[] = [
    'SCENARIO_DERIVED_BLOCK',
    'provenance: DERIVED_FROM(OFFICIAL_FACT+USER_ASSUMPTION)',
    'NOTE: Conditional scenario math. Not an official ledger posting.',
  ];
  let wrote = false;

  for (const assumption of active) {
    if (
      (assumption.valueKind === 'AMOUNT' || assumption.valueKind === 'DELTA_AMOUNT') &&
      assumption.cadence === 'MONTHLY' &&
      (assumption.role === 'COST' || assumption.role === 'OUTFLOW') &&
      officialCashResult !== null
    ) {
      const remaining = officialCashResult - assumption.value;
      const share =
        Math.abs(officialCashResult) < 0.000_001
          ? null
          : (assumption.value / Math.abs(officialCashResult)) * 100;
      lines.push(`derived.forAssumptionId: ${assumption.id}`);
      lines.push(`derived.officialCashResult: ${officialCashResult.toFixed(2)}`);
      lines.push(`derived.officialCashResultBrl: ${formatBrMoney(officialCashResult)}`);
      lines.push(`derived.assumptionMonthlyCost: ${assumption.value.toFixed(2)}`);
      lines.push(`derived.assumptionMonthlyCostBrl: ${formatBrMoney(assumption.value)}`);
      lines.push(`derived.cashResultAfterAssumption: ${remaining.toFixed(2)}`);
      lines.push(`derived.cashResultAfterAssumptionBrl: ${formatBrMoney(remaining)}`);
      if (share !== null && Number.isFinite(share)) {
        const rounded = Math.round(share * 100) / 100;
        lines.push(`derived.assumptionShareOfCashResultPercent: ${rounded}`);
        lines.push(
          `derived.assumptionShareOfCashResultPercentDisplay: ${String(rounded).replace('.', ',')}%`,
        );
      }
      wrote = true;
    }

    if (
      assumption.valueKind === 'PERCENT' &&
      (assumption.role === 'REVENUE' || assumption.role === 'INFLOW') &&
      officialCashResult !== null
    ) {
      const delta = officialCashResult * (assumption.value / 100);
      const after = officialCashResult - delta;
      lines.push(`derived.forAssumptionId: ${assumption.id}`);
      lines.push(`derived.officialCashResult: ${officialCashResult.toFixed(2)}`);
      lines.push(`derived.assumptionPercent: ${assumption.value}`);
      lines.push(`derived.percentImpactOnCashResult: ${delta.toFixed(2)}`);
      lines.push(`derived.percentImpactOnCashResultBrl: ${formatBrMoney(delta)}`);
      lines.push(`derived.cashResultAfterPercentImpact: ${after.toFixed(2)}`);
      lines.push(`derived.cashResultAfterPercentImpactBrl: ${formatBrMoney(after)}`);
      wrote = true;
    }
  }

  return wrote ? lines.join('\n') : null;
}
