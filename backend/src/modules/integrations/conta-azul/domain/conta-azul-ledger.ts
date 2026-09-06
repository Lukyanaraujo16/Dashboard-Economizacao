/**
 * Tombstone R3 (CASH-8A / Correção 10-C) + R4b (Correção 10-F).
 *
 * Default **true**: no sync padrão, settlement confirmado stale pela R3
 * ou orphan confirmado pela R4b passa a `lifecycle_status=DELETED` (sem hard delete).
 *
 * Guardrails R3 (lista NÃO vazia — todos obrigatórios):
 * - lista de baixas da parcela OK e não vazia;
 * - external_id local ACTIVE ausente dessa lista;
 * - GET `/parcelas/baixa/{id}` → 404;
 * - parcela viva (id coerente + status pago-like);
 * - Σ gross das baixas remanescentes upstream = valor_pago da parcela.
 *
 * R4: lista `[]` SOZINHA → HOLD (nunca tombstona).
 *
 * R4b (CONFIRMED_UPSTREAM_ORPHAN) — somente quando TODOS:
 * - listOk === true e lista [];
 * - ≥1 financial_transaction ACTIVE local;
 * - GET individual de CADA baixa ACTIVE → not_found;
 * - GET individual da parcela → HTTP 404 explícito.
 *
 * Idade NÃO participa da decisão R4b (90d é só filtro de discovery).
 *
 * Override por parâmetro `autoTombstone: false` permanece disponível
 * (backfill dry-run / testes). Não depende de env de produção.
 */
export const CONTA_AZUL_LEDGER_AUTO_TOMBSTONE = true;

/** Candidatos adicionais de maintenance/probe por sync (não trunca changed/multi). */
export const MAX_LIFECYCLE_PROBE_CANDIDATES_PER_SYNC = 100;

/** Janela de discovery por occurred_on (não é evidência de tombstone). */
export const LIFECYCLE_PROBE_OCCURRED_ON_LOOKBACK_DAYS = 90;
