import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialStockSnapshot } from '../src/modules/analytics/domain/types.js';
import type { ContaAzulIntegrationRecord } from '../src/modules/integrations/conta-azul/domain/types.js';
import {
  serializeCivilDate,
  serializeDecimal,
  toDashboardOverviewResponse,
} from '../src/modules/dashboard/http/to-dashboard-overview-response.js';

describe('dashboard overview serializer', () => {
  it('serializa Decimal como string sem Number', () => {
    expect(serializeDecimal(new Prisma.Decimal(0))).toBe('0');
    expect(serializeDecimal(new Prisma.Decimal('12.34'))).toBe('12.34');
    expect(serializeDecimal(new Prisma.Decimal('999999999999.9999'))).toBe('999999999999.9999');
    expect(typeof serializeDecimal(new Prisma.Decimal('12.34'))).toBe('string');
  });

  it('today civil é YYYY-MM-DD a partir da meia-noite UTC', () => {
    expect(serializeCivilDate(new Date('2026-08-19T00:00:00.000Z'))).toBe('2026-08-19');
  });

  it('preserva rate null e ISO de lastSuccessfulSyncAt', () => {
    const snapshot: FinancialStockSnapshot = {
      tenantId: 't',
      today: new Date('2026-08-19T00:00:00.000Z'),
      receivables: {
        open: new Prisma.Decimal(0),
        overdue: new Prisma.Decimal(0),
        upcoming: new Prisma.Decimal(0),
      },
      payables: {
        open: new Prisma.Decimal(0),
        overdue: new Prisma.Decimal(0),
        upcoming: new Prisma.Decimal(0),
      },
      receivableDelinquency: {
        overdueUnpaid: new Prisma.Decimal(0),
        openUnpaid: new Prisma.Decimal(0),
        rate: null,
      },
    };
    const dto = toDashboardOverviewResponse(snapshot, null);
    expect(dto.delinquency.rate).toBeNull();
    expect(dto.integration).toEqual({
      status: 'DISCONNECTED',
      lastSuccessfulSyncAt: null,
      lastErrorCode: null,
    });
    expect(typeof dto.receivables.open).toBe('string');
  });

  it('serializa taxa Decimal e sanitiza lastErrorCode', () => {
    const snapshot: FinancialStockSnapshot = {
      tenantId: 't',
      today: new Date('2026-08-19T00:00:00.000Z'),
      receivables: {
        open: new Prisma.Decimal('100'),
        overdue: new Prisma.Decimal('50'),
        upcoming: new Prisma.Decimal('50'),
      },
      payables: {
        open: new Prisma.Decimal(0),
        overdue: new Prisma.Decimal(0),
        upcoming: new Prisma.Decimal(0),
      },
      receivableDelinquency: {
        overdueUnpaid: new Prisma.Decimal('50'),
        openUnpaid: new Prisma.Decimal('100'),
        rate: new Prisma.Decimal('50'),
      },
    };
    const integration: ContaAzulIntegrationRecord = {
      id: 'i',
      tenantId: 't',
      provider: 'CONTA_AZUL',
      status: 'ERROR',
      connectedAt: null,
      disconnectedAt: null,
      lastSuccessfulSyncAt: new Date('2026-08-18T12:00:00.000Z'),
      lastErrorAt: new Date('2026-08-18T13:00:00.000Z'),
      lastErrorCode: 'refresh_failed',
      externalAccountId: 'should-not-appear',
      externalCompanyName: 'Empresa ERP',
    };
    const dto = toDashboardOverviewResponse(snapshot, integration);
    expect(dto.delinquency.rate).toBe('50');
    expect(dto.integration.status).toBe('ERROR');
    expect(dto.integration.lastSuccessfulSyncAt).toBe('2026-08-18T12:00:00.000Z');
    expect(dto.integration.lastErrorCode).toBe('refresh_failed');
    expect(JSON.stringify(dto)).not.toContain('should-not-appear');
    expect(JSON.stringify(dto)).not.toContain('Empresa ERP');
  });
});
