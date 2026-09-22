import { describe, expect, it } from 'vitest';

import {
  ANALYTICALLY_CONFIRMED_COST_CENTER_DETAIL_STATUSES,
  isAnalyticallyConfirmedCostCenterDetailStatus,
} from '../src/modules/finance/domain/cost-center-allocation-analytical-validity.js';
import { detailStatusFromNormalizeKind } from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-detail-fetch.js';

describe('11-E.3 analytical validity of cost center detail', () => {
  it('somente FETCHED é confirmado para CURRENT', () => {
    expect(ANALYTICALLY_CONFIRMED_COST_CENTER_DETAIL_STATUSES).toEqual(['FETCHED']);
    expect(isAnalyticallyConfirmedCostCenterDetailStatus('FETCHED')).toBe(true);
    expect(isAnalyticallyConfirmedCostCenterDetailStatus('NO_ALLOCATION')).toBe(false);
    expect(isAnalyticallyConfirmedCostCenterDetailStatus('ERROR')).toBe(false);
    expect(isAnalyticallyConfirmedCostCenterDetailStatus('UNRESOLVED')).toBe(false);
    expect(isAnalyticallyConfirmedCostCenterDetailStatus('UNKNOWN')).toBe(false);
  });

  it('PARTIAL homologado mapeia para FETCHED (permanece elegível em CURRENT)', () => {
    expect(detailStatusFromNormalizeKind('PARTIAL')).toBe('FETCHED');
    expect(detailStatusFromNormalizeKind('DIRECT')).toBe('FETCHED');
    expect(detailStatusFromNormalizeKind('EVENT_SCOPED_SINGLE_CENTER')).toBe('FETCHED');
    expect(detailStatusFromNormalizeKind('MULTI_CENTER_UNRESOLVED')).toBe('UNRESOLVED');
    expect(detailStatusFromNormalizeKind('NO_ALLOCATION')).toBe('NO_ALLOCATION');
  });
});
