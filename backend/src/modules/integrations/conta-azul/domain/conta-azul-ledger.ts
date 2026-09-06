/**
 * Tombstone R3 (CASH-8A / Correção 10-C).
 *
 * Default **true**: no sync padrão, settlement confirmado stale pela R3
 * passa a `lifecycle_status=DELETED` (sem hard delete).
 *
 * Guardrails R3 (todos obrigatórios):
 * - lista de baixas da parcela OK e não vazia;
 * - external_id local ACTIVE ausente dessa lista;
 * - GET `/parcelas/baixa/{id}` → 404;
 * - parcela viva (id coerente + status pago-like);
 * - Σ gross das baixas remanescentes upstream = valor_pago da parcela.
 *
 * R4: lista `[]` ou falha de fetch → HOLD (nunca tombstona).
 * Override por parâmetro `autoTombstone: false` permanece disponível
 * (backfill dry-run / testes). Não depende de env de produção.
 */
export const CONTA_AZUL_LEDGER_AUTO_TOMBSTONE = true;
