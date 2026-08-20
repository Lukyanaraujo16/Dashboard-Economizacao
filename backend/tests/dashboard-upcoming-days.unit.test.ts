import { describe, expect, it } from 'vitest';

import { ValidationError } from '../src/shared/errors/application-error.js';
import { parseDashboardUpcomingDays } from '../src/modules/dashboard/http/parse-dashboard-upcoming-days.js';

describe('parseDashboardUpcomingDays (10C)', () => {
  it('aceita somente 7, 15 e 30 como string', () => {
    expect(parseDashboardUpcomingDays({ days: '7' })).toBe(7);
    expect(parseDashboardUpcomingDays({ days: '15' })).toBe(15);
    expect(parseDashboardUpcomingDays({ days: '30' })).toBe(30);
  });

  it('rejeita ausente, 0, negativo, float, 31 e prefixo', () => {
    expect(() => parseDashboardUpcomingDays({})).toThrow(ValidationError);
    expect(() => parseDashboardUpcomingDays({ days: '0' })).toThrow(ValidationError);
    expect(() => parseDashboardUpcomingDays({ days: '-1' })).toThrow(ValidationError);
    expect(() => parseDashboardUpcomingDays({ days: '1.5' })).toThrow(ValidationError);
    expect(() => parseDashboardUpcomingDays({ days: '31' })).toThrow(ValidationError);
    expect(() => parseDashboardUpcomingDays({ days: '07' })).toThrow(ValidationError);
    expect(() => parseDashboardUpcomingDays({ days: 15 })).toThrow(ValidationError);
    expect(() => parseDashboardUpcomingDays({ days: ['15'] })).toThrow(ValidationError);
  });
});
