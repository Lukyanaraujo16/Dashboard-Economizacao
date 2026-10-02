export const SYNC_COUNT_LABELS: Readonly<Record<string, string>> = {
  receivables: 'Recebimentos',
  payables: 'Pagamentos',
  categories: 'Categorias',
  costCenters: 'Centros de custo',
  ledgerFetched: 'Lançamentos',
  parties: 'Cadastros',
  financialAccounts: 'Contas financeiras',
  costCenterAllocations: 'Alocações de centro de custo',
  costCenterDetailCandidates: 'Candidatos de detalhe de centro de custo',
  costCenterDetailSkippedFresh: 'Detalhes de centro de custo já atualizados',
  costCenterDetailRequested: 'Detalhes de centro de custo solicitados',
  costCenterDetailSuccess: 'Detalhes de centro de custo obtidos',
  costCenterDetailNoAllocation: 'Detalhes sem alocação',
  costCenterDetailPartial: 'Detalhes parciais de centro de custo',
  costCenterDetailUnresolved: 'Detalhes de centro de custo sem resolução',
  costCenterDetailErrors: 'Erros de detalhe de centro de custo',
  ledgerCandidates: 'Candidatos de lançamento',
  ledgerUpserted: 'Lançamentos gravados',
  ledgerSkippedInvalid: 'Lançamentos ignorados',
  ledgerIdentityMismatches: 'Lançamentos com identidade divergente',
  ledgerParcelFailures: 'Falhas de parcela no razão',
  balanceSnapshotsAttempted: 'Saldos consultados',
  balanceSnapshotsUpserted: 'Saldos gravados',
  balanceSnapshotsFailed: 'Saldos com falha',
  transferPages: 'Páginas de transferência',
  transferFetched: 'Transferências lidas',
  transferUpserted: 'Transferências gravadas',
  transferSkippedInvalid: 'Transferências ignoradas',
  transferMatched: 'Transferências conciliadas',
  transferUnmatched: 'Transferências sem conciliação',
  transferAmbiguous: 'Transferências ambíguas',
  installmentPresenceProbed: 'Parcelas verificadas',
  installmentPresenceTombstoned: 'Parcelas removidas na origem',
  installmentPresenceWouldTombstone: 'Parcelas que seriam removidas',
  installmentPresenceFound: 'Parcelas ainda presentes',
  installmentPresenceFailed: 'Falhas ao verificar parcelas',
};

const PRIMARY_COUNT_KEYS = [
  'receivables',
  'payables',
  'categories',
  'costCenters',
  'ledgerFetched',
] as const;

export const SYNC_ERROR_LABELS: Readonly<Record<string, string>> = {
  sync_unauthorized: 'Acesso à origem não autorizado',
  sync_rate_limited: 'Limite de requisições da origem',
  sync_upstream_unavailable: 'Serviço de origem indisponível',
  sync_invalid_payload: 'Resposta da origem inválida',
  sync_persistence_failed: 'Falha ao gravar os dados',
  sync_tenant_disabled: 'Empresa desativada',
  sync_disconnected: 'Empresa desconectada',
  sync_timeout: 'Tempo esgotado na sincronização',
  sync_enqueue_failed: 'Não foi possível enfileirar a sincronização',
  sync_stale_run: 'Execução interrompida por inatividade',
  sync_identity_changed: 'Identidade da integração mudou',
};

const MONTH_LABELS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

export function formatOperationsMonth(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    return monthKey;
  }
  const label = MONTH_LABELS[Number(match[2]) - 1];
  return label ? `${label} de ${match[1]}` : monthKey;
}

export function syncErrorLabel(code: string | null): string {
  if (!code) {
    return '—';
  }
  return SYNC_ERROR_LABELS[code] ?? 'Falha de sincronização';
}

export function primarySyncCountSummary(counts: Record<string, number> | null): string {
  if (!counts) {
    return '—';
  }
  const parts = PRIMARY_COUNT_KEYS.flatMap((key) => {
    const value = counts[key];
    if (value === undefined) {
      return [];
    }
    return [`${SYNC_COUNT_LABELS[key]} ${value}`];
  });
  return parts.length > 0 ? parts.join(' · ') : 'Sem contagens principais';
}

export function syncCountDetails(
  counts: Record<string, number> | null,
): ReadonlyArray<{ readonly label: string; readonly key: string; readonly value: number }> {
  if (!counts) {
    return [];
  }
  return Object.entries(counts).map(([key, value]) => ({
    key,
    label: SYNC_COUNT_LABELS[key] ?? key,
    value,
  }));
}

export function failureProgressSummary(counts: Record<string, number> | null): string {
  if (!counts) {
    return 'A sincronização falhou antes de registrar contagens.';
  }
  const summary = primarySyncCountSummary(counts);
  return summary === '—' || summary === 'Sem contagens principais'
    ? 'A sincronização falhou e registrou apenas métricas técnicas.'
    : `Contagens registradas até a falha: ${summary}.`;
}

export type AiPageSummary = {
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly averageDurationMs: number | null;
};

export function summarizeAiPage(
  rows: readonly { readonly status: string; readonly durationMs: number | null }[],
): AiPageSummary {
  const durations = rows.flatMap((row) => (row.durationMs === null ? [] : [row.durationMs]));
  const average =
    durations.length === 0
      ? null
      : Math.round(durations.reduce((total, value) => total + value, 0) / durations.length);
  return {
    total: rows.length,
    succeeded: rows.filter((row) => row.status === 'SUCCEEDED').length,
    failed: rows.filter((row) => row.status === 'FAILED' || row.status === 'TIMEOUT').length,
    averageDurationMs: average,
  };
}
