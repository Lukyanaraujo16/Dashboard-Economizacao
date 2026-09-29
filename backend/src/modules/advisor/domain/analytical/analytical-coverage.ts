/**
 * Coverage canônico: ratio ∈ [0, 1] (não percentual 0–100).
 * Adapters F13.8.5B convertem coveragePercentage legado → ratio.
 * null ≠ 0; ambiguous ≠ identified; partial ≠ full.
 */
export type AnalyticalCoverage = {
  readonly identifiedAmount: string | null;
  readonly ambiguousAmount: string | null;
  readonly unavailableAmount: string | null;
  readonly populationAmount: string | null;
  /** identified / population; null se indefinido. */
  readonly ratio: number | null;
};

export function isValidAnalyticalCoverageRatio(ratio: number | null): boolean {
  if (ratio === null) {
    return true;
  }
  return Number.isFinite(ratio) && ratio >= 0 && ratio <= 1;
}
