import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type {
  CashFlowForecast,
  UpcomingInstallments,
} from '../src/modules/analytics/domain/types.js';
import { toDashboardCashFlowForecastResponse } from '../src/modules/dashboard/http/to-dashboard-cash-flow-forecast-response.js';
import { toDashboardUpcomingResponse } from '../src/modules/dashboard/http/to-dashboard-upcoming-response.js';

describe('dashboard 10C serializers', () => {
  it('upcoming serializa Decimal e data civil sem tenantId nem descrição', () => {
    const window: UpcomingInstallments = {
      tenantId: 'secret-tenant',
      today: new Date('2026-08-19T00:00:00.000Z'),
      nDays: 15,
      from: new Date('2026-08-19T00:00:00.000Z'),
      to: new Date('2026-09-03T00:00:00.000Z'),
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          dueDate: new Date('2026-08-20T00:00:00.000Z'),
          unpaid: new Prisma.Decimal('12.34'),
          status: 'OPEN',
        },
      ],
    };
    const dto = toDashboardUpcomingResponse(15, window, { ...window, items: [] });
    expect(dto.nDays).toBe(15);
    expect(dto.summary).toEqual({ receivable: '12.34', payable: '0', net: '12.34' });
    expect(typeof dto.summary.net).toBe('string');
    const receivableSum = dto.receivables.items.reduce(
      (total, item) => total.plus(item.unpaid),
      new Prisma.Decimal(0),
    );
    expect(dto.summary.receivable).toBe(receivableSum.toString());
    expect(dto.today).toBe('2026-08-19');
    expect(dto.from).toBe('2026-08-19');
    expect(dto.to).toBe('2026-09-03');
    expect(dto.receivables.items[0]).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      dueDate: '2026-08-20',
      unpaid: '12.34',
      status: 'OPEN',
    });
    expect(typeof dto.receivables.items[0]?.unpaid).toBe('string');
    const json = JSON.stringify(dto);
    expect(json).not.toContain('secret-tenant');
    expect(json).not.toContain('tenantId');
    expect(json).not.toContain('description');
  });

  it('forecast serializa buckets e net como string, horizonDays do motor', () => {
    const forecast: CashFlowForecast = {
      tenantId: 'secret-tenant',
      today: new Date('2026-08-19T00:00:00.000Z'),
      horizonDays: 90,
      from: new Date('2026-08-19T00:00:00.000Z'),
      to: new Date('2026-11-17T00:00:00.000Z'),
      buckets: [
        {
          key: '2026-08',
          inflows: new Prisma.Decimal('10'),
          outflows: new Prisma.Decimal('4'),
          net: new Prisma.Decimal('6'),
        },
      ],
    };
    const dto = toDashboardCashFlowForecastResponse(forecast);
    expect(dto.horizonDays).toBe(90);
    expect(dto.buckets[0]).toEqual({
      key: '2026-08',
      inflows: '10',
      outflows: '4',
      net: '6',
    });
    expect(typeof dto.buckets[0]?.net).toBe('string');
    expect(JSON.stringify(dto)).not.toContain('secret-tenant');
  });
});
