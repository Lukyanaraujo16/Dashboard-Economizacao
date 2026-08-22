import { describe, expect, it } from 'vitest';

import {
  COST_CENTER_DETAIL_RULE_VERSION,
  detailStatusFromNormalizeKind,
  shouldFetchCostCenterDetail,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-detail-fetch.js';

describe('shouldFetchCostCenterDetail (CC1.2)', () => {
  const syncedAt = new Date('2026-08-20T12:00:00.000Z');
  const earlier = new Date('2026-08-19T12:00:00.000Z');
  const later = new Date('2026-08-21T12:00:00.000Z');

  it('UNKNOWN → fetch', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'UNKNOWN',
        detailSyncedAt: null,
        detailRuleVersion: 0,
        upstreamUpdatedAt: null,
      }),
    ).toEqual({ shouldFetch: true, reason: 'unknown' });
  });

  it('ERROR → retry fetch', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'ERROR',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: earlier,
      }).shouldFetch,
    ).toBe(true);
  });

  it('FETCHED fresco sem mudança upstream → skip', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'FETCHED',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: earlier,
      }),
    ).toEqual({ shouldFetch: false, reason: 'skip_fresh' });
  });

  it('NO_ALLOCATION confirmado sem mudança → skip (não refetch eterno)', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'NO_ALLOCATION',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: earlier,
      }),
    ).toEqual({ shouldFetch: false, reason: 'skip_no_allocation' });
  });

  it('upstreamUpdatedAt novo → refetch', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'FETCHED',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: later,
      }),
    ).toEqual({ shouldFetch: true, reason: 'upstream_changed' });
  });

  it('NO_ALLOCATION com upstream novo → refetch', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'NO_ALLOCATION',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: later,
      }).shouldFetch,
    ).toBe(true);
  });

  it('rule version bump → refetch', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'FETCHED',
        detailSyncedAt: syncedAt,
        detailRuleVersion: 0,
        upstreamUpdatedAt: earlier,
        currentRuleVersion: 2,
      }),
    ).toEqual({ shouldFetch: true, reason: 'rule_version_bump' });
  });

  it('UNRESOLVED fresco → skip (não storm; retry só se upstream mudar)', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'UNRESOLVED',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: earlier,
      }),
    ).toEqual({ shouldFetch: false, reason: 'skip_unresolved_fresh' });
  });

  it('FETCHED sem upstreamUpdatedAt → skip', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'FETCHED',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: null,
      }),
    ).toEqual({ shouldFetch: false, reason: 'skip_fetched_no_upstream' });
  });
});

describe('detailStatusFromNormalizeKind', () => {
  it('mapeia kinds CC1.1', () => {
    expect(detailStatusFromNormalizeKind('NO_ALLOCATION')).toBe('NO_ALLOCATION');
    expect(detailStatusFromNormalizeKind('MULTI_CENTER_UNRESOLVED')).toBe('UNRESOLVED');
    expect(detailStatusFromNormalizeKind('DIRECT')).toBe('FETCHED');
    expect(detailStatusFromNormalizeKind('PARTIAL')).toBe('FETCHED');
    expect(detailStatusFromNormalizeKind('EVENT_SCOPED_SINGLE_CENTER')).toBe('FETCHED');
  });
});
