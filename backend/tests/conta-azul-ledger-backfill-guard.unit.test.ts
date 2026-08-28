import { describe, expect, it } from 'vitest';

import {
  assertLedgerBackfillAllowed,
  assertTransferBackfillAllowed,
  classifyDatabaseName,
  isLocalDatabaseName,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-backfill-guard.js';

const PROD_DB = 'dashboard_economizacao';
const DEV_DB = 'dashboard_economizacao_dev';
const TEST_DB = 'dashboard_economizacao_test';

describe('classifyDatabaseName', () => {
  it('classifica sufixos sem expor credenciais', () => {
    expect(classifyDatabaseName(DEV_DB)).toBe('local_dev');
    expect(classifyDatabaseName(TEST_DB)).toBe('local_test');
    expect(classifyDatabaseName(PROD_DB)).toBe('production');
  });
});

describe('isLocalDatabaseName', () => {
  it('identifica bancos locais', () => {
    expect(isLocalDatabaseName(DEV_DB)).toBe(true);
    expect(isLocalDatabaseName(TEST_DB)).toBe(true);
    expect(isLocalDatabaseName(PROD_DB)).toBe(false);
  });
});

describe('assertLedgerBackfillAllowed — matriz fail-closed', () => {
  it('bloqueia production sem confirm', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'production',
        confirm: undefined,
        databaseName: PROD_DB,
      }),
    ).toThrow(/--confirm=LOCAL ou --confirm=PRODUCTION/);
  });

  it('bloqueia production + --confirm=LOCAL', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'production',
        confirm: 'LOCAL',
        databaseName: PROD_DB,
      }),
    ).toThrow(/--confirm=LOCAL não é permitido com NODE_ENV=production/);
  });

  it('bloqueia production + --confirm=PRODUCTION + banco _dev', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'production',
        confirm: 'PRODUCTION',
        databaseName: DEV_DB,
      }),
    ).toThrow(/--confirm=PRODUCTION não é permitido em banco _dev\/_test/);
  });

  it('bloqueia production + --confirm=PRODUCTION + banco _test', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'production',
        confirm: 'PRODUCTION',
        databaseName: TEST_DB,
      }),
    ).toThrow(/--confirm=PRODUCTION não é permitido em banco _dev\/_test/);
  });

  it('permite production + --confirm=PRODUCTION + banco real', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'production',
        confirm: 'PRODUCTION',
        databaseName: PROD_DB,
      }),
    ).not.toThrow();
  });

  it('bloqueia local + --confirm=PRODUCTION', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'development',
        confirm: 'PRODUCTION',
        databaseName: PROD_DB,
      }),
    ).toThrow(/--confirm=PRODUCTION exige NODE_ENV=production/);
  });

  it('bloqueia local + banco real + --confirm=LOCAL', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'development',
        confirm: 'LOCAL',
        databaseName: PROD_DB,
      }),
    ).toThrow(/_dev ou _test/);
  });

  it('permite development + banco _dev + --confirm=LOCAL', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'development',
        confirm: 'LOCAL',
        databaseName: DEV_DB,
      }),
    ).not.toThrow();
  });

  it('permite test + banco _test + --confirm=LOCAL', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'test',
        confirm: 'LOCAL',
        databaseName: TEST_DB,
      }),
    ).not.toThrow();
  });

  it('bloqueia confirm inválido', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'development',
        confirm: 'YES',
        databaseName: DEV_DB,
      }),
    ).toThrow(/--confirm inválido/);
  });

  it('bloqueia development sem confirm', () => {
    expect(() =>
      assertLedgerBackfillAllowed({
        nodeEnv: 'development',
        confirm: undefined,
        databaseName: DEV_DB,
      }),
    ).toThrow(/--confirm=LOCAL ou --confirm=PRODUCTION/);
  });
});

describe('assertTransferBackfillAllowed — paridade CASH-9C', () => {
  it('permite production explícita', () => {
    expect(() =>
      assertTransferBackfillAllowed({
        nodeEnv: 'production',
        confirm: 'PRODUCTION',
        databaseName: PROD_DB,
      }),
    ).not.toThrow();
  });

  it('bloqueia production + LOCAL', () => {
    expect(() =>
      assertTransferBackfillAllowed({
        nodeEnv: 'production',
        confirm: 'LOCAL',
        databaseName: PROD_DB,
      }),
    ).toThrow(/CASH-9C/);
  });
});
