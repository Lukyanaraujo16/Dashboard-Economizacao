import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { assertTenantId } from '../../finance/repositories/read-query.js';
import { civilTodayInSaoPaulo } from '../domain/analytical-timezone.js';
import { calculateInstallmentStockSnapshot } from '../domain/installment-snapshot.js';
import { calculateReceivableDelinquency } from '../domain/receivable-delinquency.js';
import type { FinancialStockSnapshot, GetFinancialStockSnapshotInput } from '../domain/types.js';

export type AnalyticsService = {
  getFinancialStockSnapshot(input: GetFinancialStockSnapshotInput): Promise<FinancialStockSnapshot>;
};

export type AnalyticsServiceDependencies = {
  readonly receivables: ReceivableReadRepository;
  readonly payables: PayableReadRepository;
};

export function createAnalyticsService(deps: AnalyticsServiceDependencies): AnalyticsService {
  return {
    async getFinancialStockSnapshot(input) {
      assertTenantId(input.tenantId);
      const now = input.now ?? new Date();
      const today = civilTodayInSaoPaulo(now);
      const scope = { tenantId: input.tenantId, integrationId: input.integrationId };
      const [receivableRows, payableRows] = await Promise.all([
        deps.receivables.findActiveByTenant(scope),
        deps.payables.findActiveByTenant(scope),
      ]);
      const receivables = calculateInstallmentStockSnapshot(receivableRows, today);
      return {
        tenantId: input.tenantId,
        today,
        receivables,
        payables: calculateInstallmentStockSnapshot(payableRows, today),
        receivableDelinquency: calculateReceivableDelinquency(receivables),
      };
    },
  };
}
