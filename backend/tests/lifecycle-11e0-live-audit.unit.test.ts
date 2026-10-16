import { describe, expect, it } from 'vitest';

import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import {
  classifyInstallmentAbsenceEvidence,
  classifyInstallmentProbeError,
  classifyTransferAbsenceEvidence,
  computeHypotheticalTransferUnlinkImpact,
  isAnalyticalActiveStatus,
  isPaginationInconsistent,
  snapshotExhausted,
} from '../scripts/lifecycle-11e0-live-audit.js';

describe('lifecycle-11e0-live-audit helpers (sem API)', () => {
  it('paginação: full page não esgota; short page esgota', () => {
    expect(snapshotExhausted(100, 100)).toBe(false);
    expect(snapshotExhausted(99, 100)).toBe(true);
    expect(snapshotExhausted(0, 100)).toBe(true);
  });

  it('paginação: totalItems não encerra; processed > total é anomalia', () => {
    expect(
      isPaginationInconsistent({
        pageItemCount: 100,
        processed: 100,
        totalItems: 100,
        pageSize: 100,
      }),
    ).toBe(false);
    expect(
      isPaginationInconsistent({
        pageItemCount: 100,
        processed: 101,
        totalItems: 100,
        pageSize: 100,
      }),
    ).toBe(true);
  });

  it('status analítico ativo alinhado ao domínio', () => {
    expect(isAnalyticalActiveStatus('OPEN')).toBe(true);
    expect(isAnalyticalActiveStatus('OVERDUE')).toBe(true);
    expect(isAnalyticalActiveStatus('PARTIALLY_PAID')).toBe(true);
    expect(isAnalyticalActiveStatus('PAID')).toBe(false);
    expect(isAnalyticalActiveStatus('UNKNOWN')).toBe(false);
  });

  it('404 individual => STRONG_DELETION_EVIDENCE se busca completa', () => {
    expect(
      classifyInstallmentAbsenceEvidence({
        searchSnapshotComplete: true,
        probe: 'NOT_FOUND_404',
      }),
    ).toBe('STRONG_DELETION_EVIDENCE');
  });

  it('FOUND_NON_ACTIVE => NON_ACTIVE_UPSTREAM', () => {
    expect(
      classifyInstallmentAbsenceEvidence({
        searchSnapshotComplete: true,
        probe: 'FOUND_NON_ACTIVE',
      }),
    ).toBe('NON_ACTIVE_UPSTREAM');
  });

  it('ausência sem probe => WEAK; busca incompleta => INCONCLUSIVE', () => {
    expect(
      classifyInstallmentAbsenceEvidence({
        searchSnapshotComplete: true,
        probe: null,
      }),
    ).toBe('WEAK_ABSENCE_ONLY');
    expect(
      classifyInstallmentAbsenceEvidence({
        searchSnapshotComplete: false,
        probe: 'NOT_FOUND_404',
      }),
    ).toBe('INCONCLUSIVE');
  });

  it('erro de probe => INCONCLUSIVE', () => {
    expect(
      classifyInstallmentAbsenceEvidence({
        searchSnapshotComplete: true,
        probe: 'RATE_LIMITED',
      }),
    ).toBe('INCONCLUSIVE');
    expect(
      classifyInstallmentAbsenceEvidence({
        searchSnapshotComplete: true,
        probe: 'AUTH_ERROR',
      }),
    ).toBe('INCONCLUSIVE');
  });

  it('classifyInstallmentProbeError mapeia ContaAzulApiError', () => {
    expect(
      classifyInstallmentProbeError(
        new ContaAzulApiError('unavailable', 'x', { httpStatus: 404 }),
      ),
    ).toBe('NOT_FOUND_404');
    expect(
      classifyInstallmentProbeError(new ContaAzulApiError('unauthorized', 'x')),
    ).toBe('AUTH_ERROR');
    expect(
      classifyInstallmentProbeError(new ContaAzulApiError('rate_limited', 'x')),
    ).toBe('RATE_LIMITED');
    expect(
      classifyInstallmentProbeError(
        new ContaAzulApiError('unavailable', 'x', { httpStatus: 500 }),
      ),
    ).toBe('SERVER_ERROR');
  });

  it('transfer sem GET individual => WEAK se snapshot completo', () => {
    expect(
      classifyTransferAbsenceEvidence({
        searchSnapshotComplete: true,
        probe: 'INDIVIDUAL_PROBE_UNAVAILABLE',
      }),
    ).toBe('WEAK_ABSENCE_ONLY');
    expect(
      classifyTransferAbsenceEvidence({
        searchSnapshotComplete: false,
        probe: 'INDIVIDUAL_PROBE_UNAVAILABLE',
      }),
    ).toBe('INCONCLUSIVE');
  });

  it('cálculo hipotético de unlink (sem mutação)', () => {
    const impact = computeHypotheticalTransferUnlinkImpact({
      transfers: [
        {
          externalId: 't1',
          matchStatus: 'MATCHED',
          linked: [
            {
              lifecycleStatus: 'ACTIVE',
              netAmount: '10.5000',
              transactionType: 'CREDIT',
            },
          ],
        },
        {
          externalId: 't2',
          matchStatus: 'MATCHED',
          linked: [
            {
              lifecycleStatus: 'ACTIVE',
              netAmount: '3.2500',
              transactionType: 'DEBIT',
            },
          ],
        },
        {
          externalId: 't3',
          matchStatus: 'UNMATCHED',
          linked: [],
        },
      ],
    });
    expect(impact.matchedAbsentTransfers).toBe(2);
    expect(impact.settlementsAffected).toBe(2);
    expect(impact.activeSettlementsAffected).toBe(2);
    expect(impact.creditNetSum).toBe('10.5000');
    expect(impact.debitNetSum).toBe('3.2500');
    expect(impact.absoluteNetSum).toBe('13.7500');
  });
});
