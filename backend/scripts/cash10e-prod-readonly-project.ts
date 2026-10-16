/**
 * CORREÇÃO 10-E — projeção READ-ONLY a partir de export JSON de produção.
 *
 * Uso (dev):
 *   pnpm exec tsx scripts/cash10e-prod-readonly-project.ts --export=/path/cash10e-prod-export.json
 *
 * Opcional (dumps GET Conta Azul já obtidos sem persistência):
 *   --api-life-transfers=/tmp/life-transfers-aug.json
 *   --api-life-baixa-parcela1=/tmp/life-baixa-792e.json
 *   --api-life-baixa-parcela2=/tmp/life-baixa-00fc.json
 *   --api-blooty-transfers=/tmp/blooty-transfers-aug.json
 *
 * NÃO conecta em produção. NÃO muta banco. NÃO chama Conta Azul por si.
 */
import { readFileSync } from 'node:fs';
import { Prisma } from '../src/generated/prisma/client.js';
import { decideTransferMatches } from '../src/modules/integrations/conta-azul/domain/conta-azul-transfer-match.js';
import { evaluateR3Tombstone } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-lifecycle.js';
import { projectLocalTombstoneCandidates } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-tombstone-projection.js';
import { mapFinancialTransferList } from '../src/modules/integrations/conta-azul/domain/conta-azul-transfer-mappers.js';
import { mapSettlementList } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import { readParcelaIdentity } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-lifecycle.js';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

function readJson(path: string | undefined): unknown | null {
  if (!path) {
    return null;
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

function extractJsonPayload(raw: string): unknown {
  const start = raw.indexOf('===BEGIN_JSON===');
  const end = raw.indexOf('===END_JSON===');
  if (start >= 0 && end > start) {
    return JSON.parse(raw.slice(start + '===BEGIN_JSON==='.length, end).trim());
  }
  return JSON.parse(raw);
}

function d(n: string | number | null | undefined): Prisma.Decimal {
  return new Prisma.Decimal(n ?? 0);
}

function main(): void {
  const exportPath = arg('export');
  if (!exportPath) {
    process.stderr.write(
      JSON.stringify({
        event: 'cash10e_blocked',
        reason: 'missing --export= path to production SELECT JSON',
      }) + '\n',
    );
    process.exit(2);
  }

  const exportRaw = readFileSync(exportPath, 'utf8');
  const data = extractJsonPayload(exportRaw) as {
    readonly life?: {
      readonly receipt1313?: ReadonlyArray<Record<string, unknown>>;
      readonly transfersAug?: ReadonlyArray<Record<string, unknown>>;
      readonly stalePairs?: ReadonlyArray<Record<string, unknown>>;
      readonly augRealized?: { readonly inflows?: string; readonly outflows?: string };
    };
    readonly marielle?: unknown;
    readonly inventory?: unknown;
  };

  const life = data.life ?? {};
  const receipt1313 = (life.receipt1313 ?? []) as ReadonlyArray<Record<string, unknown>>;
  const transfersAug = (life.transfersAug ?? []) as ReadonlyArray<Record<string, unknown>>;
  const transfer1313 = transfersAug.find((t) => Number(t.amount) === 1313);

  let matcher1313: Record<string, unknown> = {
    status: 'insufficient_data',
    note: 'receipt1313 ou transfer 1313 ausentes no export',
  };

  if (receipt1313.length > 0 && transfer1313) {
    const settlements = receipt1313.map((r) => ({
      id: String(r.id),
      occurredOn: new Date(String(r.occurred_on)),
      netAmount: d(r.net_amount),
      financialAccountExternalId: r.financial_account_external_id as string | null,
      lifecycleStatus: r.lifecycle_status as 'ACTIVE' | 'DELETED',
      transactionType: r.transaction_type as 'RECEIPT' | 'DISBURSEMENT',
    }));
    const decisions = decideTransferMatches(
      [
        {
          id: String(transfer1313.id),
          occurredOn: new Date(String(transfer1313.occurred_on)),
          amount: d(transfer1313.amount),
          sourceFinancialAccountExternalId: String(
            transfer1313.source_financial_account_external_id,
          ),
          destinationFinancialAccountExternalId: String(
            transfer1313.destination_financial_account_external_id,
          ),
        },
      ],
      settlements,
    );
    const linked = receipt1313.find((r) => r.financial_transfer_id);
    matcher1313 = {
      currentLinkPresent: Boolean(linked?.financial_transfer_id),
      currentLinkedExternalId: linked?.external_id ?? null,
      projected: decisions[0],
      wouldUnlink:
        Boolean(linked?.financial_transfer_id) && decisions[0]?.status === 'UNMATCHED',
      faturamentoDeltaIfUnlink: linked ? '1313.00' : '0.00',
    };
  }

  const stalePairs = (life.stalePairs ?? []) as ReadonlyArray<Record<string, unknown>>;
  const byInst = new Map<string, Array<Record<string, unknown>>>();
  for (const row of stalePairs) {
    const key = String(row.installment_external_id);
    const list = byInst.get(key) ?? [];
    list.push(row);
    byInst.set(key, list);
  }

  const localLifecycle = [...byInst.entries()].map(([installmentExternalId, rows]) => {
    const paidHint =
      installmentExternalId === '792e421e-65de-4116-84d4-203edf3ae454'
        ? '2550.82'
        : installmentExternalId === '00fcc4f3-1ec7-458f-8560-b68aaa283711'
          ? '536.04'
          : '0';
    const projection = projectLocalTombstoneCandidates({
      paid: d(paidHint),
      rows: rows.map((r) => ({
        id: String(r.id),
        externalId: String(r.external_id),
        installmentExternalId,
        installmentKind: 'PAYABLE' as const,
        transactionType: r.transaction_type as 'RECEIPT' | 'DISBURSEMENT',
        occurredOn: new Date(String(r.occurred_on)),
        netAmount: d(r.net_amount),
        grossAmount: d(r.gross_amount ?? r.net_amount),
        financialAccountExternalId: (r.financial_account_external_id as string) ?? null,
        lifecycleStatus: r.lifecycle_status as 'ACTIVE' | 'DELETED',
      })),
    });
    return {
      installmentExternalId,
      paidHint,
      rows: rows.map((r) => ({
        externalId: r.external_id,
        lifecycle: r.lifecycle_status,
        net: r.net_amount,
        transferId: r.financial_transfer_id,
      })),
      localProjection: {
        mode: projection.mode,
        wouldDeleteIds: projection.wouldDeleteIds,
        projectedRemovedNet: projection.projectedRemovedNet.toFixed(2),
        coverage: projection.coverage,
      },
      r3RequiresApi: true,
    };
  });

  // Optional API dumps for R3 + transfer presence
  const apiLifeTransfers = readJson(arg('api-life-transfers'));
  const apiParc1 = readJson(arg('api-life-baixa-parcela1'));
  const apiParc2 = readJson(arg('api-life-baixa-parcela2'));
  const apiBlooty = readJson(arg('api-blooty-transfers'));

  let lifeTransferGaps: unknown = {
    status: 'api_dump_missing',
    known: [
      { date: '2026-08-27', amount: '860.00' },
      { date: '2026-08-31', amount: '1350.02' },
    ],
  };
  if (apiLifeTransfers) {
    const mapped = mapFinancialTransferList(apiLifeTransfers);
    const presentInDb = new Set(transfersAug.map((t) => String(t.external_id)));
    lifeTransferGaps = {
      status: 'compared',
      apiItemCount: mapped.items.length,
      known: [
        { date: '2026-08-27', amount: '860.00' },
        { date: '2026-08-31', amount: '1350.02' },
      ].map((k) => {
        const hit = mapped.items.find(
          (item) =>
            item.occurredOn.toISOString().startsWith(k.date) &&
            item.amount.equals(d(k.amount)),
        );
        return {
          ...k,
          presentInApi: Boolean(hit),
          apiExternalId: hit?.externalId ?? null,
          presentInDb: hit ? presentInDb.has(hit.externalId) : false,
          origin: hit?.sourceFinancialAccountExternalId ?? null,
          dest: hit?.destinationFinancialAccountExternalId ?? null,
        };
      }),
    };
  }

  function projectR3(
    installmentExternalId: string,
    paid: string,
    apiDump: unknown,
    localRows: ReadonlyArray<Record<string, unknown>>,
  ) {
    if (!apiDump) {
      return { status: 'api_dump_missing' };
    }
    const mapped = mapSettlementList(apiDump);
    const upstreamIds = new Set(mapped.items.map((i) => i.externalId));
    const remainingGross = mapped.items.reduce(
      (acc, item) => acc.add(item.grossAmount),
      new Prisma.Decimal(0),
    );
    const dumpRecord =
      apiDump && typeof apiDump === 'object' ? (apiDump as Record<string, unknown>) : {};
    const detail = dumpRecord.parcelaDetail ?? null;
    const parcela = detail ? readParcelaIdentity(detail) : { kind: 'unreadable' as const };
    const missing = localRows.filter(
      (r) => r.lifecycle_status === 'ACTIVE' && !upstreamIds.has(String(r.external_id)),
    );
    const lookupsTable =
      dumpRecord.settlementLookups && typeof dumpRecord.settlementLookups === 'object'
        ? (dumpRecord.settlementLookups as Record<string, unknown>)
        : {};
    const decisions = missing.map((row) => {
      const rawLookup = lookupsTable[String(row.external_id)];
      const lookups =
        rawLookup === 'not_found' || rawLookup === 'found' || rawLookup === 'error'
          ? rawLookup
          : undefined;
      const decision = evaluateR3Tombstone({
        listOkNonEmpty: mapped.items.length > 0,
        missingFromList: true,
        settlementLookup: lookups ?? 'error',
        parcela,
        remainingGross,
        installmentExternalId,
      });
      return {
        externalId: row.external_id,
        decision,
        settlementLookup: lookups ?? 'error_missing_in_dump',
      };
    });
    return {
      status: 'projected',
      paidHint: paid,
      upstreamCount: mapped.items.length,
      remainingGross: remainingGross.toFixed(2),
      missingCount: missing.length,
      decisions,
      note: 'Sem settlementLookups/parcelaDetail no dump → R3 permanece conservador (hold).',
    };
  }

  const r3 = {
    par1: projectR3(
      '792e421e-65de-4116-84d4-203edf3ae454',
      '2550.82',
      apiParc1,
      byInst.get('792e421e-65de-4116-84d4-203edf3ae454') ?? [],
    ),
    par2: projectR3(
      '00fcc4f3-1ec7-458f-8560-b68aaa283711',
      '536.04',
      apiParc2,
      byInst.get('00fcc4f3-1ec7-458f-8560-b68aaa283711') ?? [],
    ),
  };

  let blootyApi: unknown = { status: 'api_dump_missing' };
  if (apiBlooty) {
    const mapped = mapFinancialTransferList(apiBlooty);
    const t20400 = mapped.items.filter((i) => i.amount.equals(d('20400')));
    blootyApi = {
      status: 'ok',
      count: mapped.items.length,
      sum: mapped.items.reduce((a, i) => a.add(i.amount), new Prisma.Decimal(0)).toFixed(2),
      transfers20400: t20400.map((i) => ({
        externalId: i.externalId,
        occurredOn: i.occurredOn.toISOString().slice(0, 10),
        origin: i.sourceFinancialAccountExternalId,
        dest: i.destinationFinancialAccountExternalId,
        amount: i.amount.toFixed(2),
      })),
    };
  }

  const home = life.augRealized ?? {};
  const fatAtual = d(home.inflows);
  const despAtual = d(home.outflows);
  const unlink = Boolean(
    matcher1313 &&
      typeof matcher1313 === 'object' &&
      'wouldUnlink' in matcher1313 &&
      matcher1313.wouldUnlink === true,
  );
  const lifeHomeProjection = {
    faturamentoAtual: fatAtual.toFixed(2),
    faturamentoProjetado: unlink ? fatAtual.add(1313).toFixed(2) : fatAtual.toFixed(2),
    despesasAtual: despAtual.toFixed(2),
    despesasProjetadaNote:
      'Só aplicar -3086.86 se R3 confirmar ambos os pares via dumps API; caso contrário manter atual.',
    expectedManual: {
      faturamento: '235020.42',
      despesas: '147875.42',
      resultado: '87145.00',
    },
    confirmation:
      unlink && fatAtual.add(1313).equals(d('235020.42'))
        ? 'FATURAMENTO_DELTA_CONFIRMED_IF_BASE_MATCHES'
        : 'PARTIAL_PENDING_API_AND_OR_BASE',
  };

  process.stdout.write(
    `${JSON.stringify(
      {
        event: 'cash10e_prod_readonly_projection',
        mode: 'READ_ONLY',
        mutations: false,
        contaAzulCalledByThisScript: false,
        matcher1313,
        localLifecycle,
        r3,
        lifeTransferGaps,
        blootyApi,
        marielle: data.marielle ?? null,
        inventory: data.inventory ?? null,
        lifeHomeProjection,
      },
      null,
      2,
    )}\n`,
  );
}

main();
