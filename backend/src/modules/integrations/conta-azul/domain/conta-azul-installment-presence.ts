/**
 * Correção 11-E.1 — lifecycle de presença de parcelas AR/AP.
 *
 * Soft-tombstone (`lifecycle_status=DELETED`) somente com GET /parcelas/{id}
 * HTTP 404 inequívoco (ContaAzulApiError kind=unavailable + httpStatus=404)
 * e autoTombstone habilitado.
 *
 * Flag de mutação: `CONTA_AZUL_INSTALLMENT_PRESENCE_AUTO_TOMBSTONE`
 * (EnvironmentFile). Default seguro = **false** (dry-run) quando ausente.
 * Restart do worker basta para false→true; sem rebuild.
 *
 * Ranking (11-E.1 priorização temporal): never-checked primeiro; entre
 * never-checked, tier civil do estoque atual. `syncedAt` NÃO entra no rank —
 * idade local não é evidência de exclusão (incremental só regrava alteração).
 */

import {
  civilMonthBounds,
  civilMonthBoundsFromKey,
  isCivilDateInInclusiveRange,
  shiftCivilMonthKey,
} from '../../../analytics/domain/civil-calendar.js';

/**
 * Candidatos de probe por kind (RECEIVABLE ou PAYABLE) por sync.
 * 50×2 = 100/ciclo, alinhado ao teto de maintenance do ledger (100).
 * Separação por kind evita starvation entre AR e AP.
 */
export const MAX_INSTALLMENT_PRESENCE_PROBE_CANDIDATES_PER_KIND = 50;

/**
 * Nome da variável de ambiente (systemd EnvironmentFile / .env).
 * Documentado aqui para staging e ops — resolução em runtime via
 * {@link resolveContaAzulInstallmentPresenceAutoTombstone}.
 */
export const CONTA_AZUL_INSTALLMENT_PRESENCE_AUTO_TOMBSTONE_ENV =
  'CONTA_AZUL_INSTALLMENT_PRESENCE_AUTO_TOMBSTONE';

/**
 * Parser booleano seguro (mesma convenção de `parseBooleanFlag` em env.ts):
 * - ausente / vazio / "false" / qualquer outro → false
 * - "true" | "1" | "yes" → true
 *
 * NÃO usa Boolean(string): a string "false" NÃO vira true.
 */
export function resolveContaAzulInstallmentPresenceAutoTombstone(
  value: string | undefined,
): boolean {
  const raw = value?.trim().toLowerCase() ?? '';
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export type InstallmentPresenceTemporalTier = 0 | 1 | 2 | 3;

export type InstallmentPresenceCandidateRankInput = {
  readonly externalId: string;
  readonly lastPresenceCheckedAt: Date | null;
  readonly dueDate: Date;
  readonly unpaidPositive: boolean;
};

/**
 * Tier civil alinhado ao estoque do Dashboard (`dueDate` @db.Date = meia-noite UTC).
 * `today` deve ser o mesmo civil SP dos cards (ver `civilTodayInSaoPaulo`).
 *
 * 0: unpaid>0 e vencido (dueDate < today)
 * 1: unpaid>0 no mês civil corrente (inclui hoje)
 * 2: unpaid>0 no próximo mês civil
 * 3: demais ACTIVE elegíveis (futuro distante ou sem unpaid)
 */
export function installmentPresenceTemporalTier(
  input: Pick<InstallmentPresenceCandidateRankInput, 'dueDate' | 'unpaidPositive'>,
  today: Date,
): InstallmentPresenceTemporalTier {
  if (!input.unpaidPositive) {
    return 3;
  }
  if (input.dueDate.getTime() < today.getTime()) {
    return 0;
  }
  const current = civilMonthBounds(today);
  if (isCivilDateInInclusiveRange(input.dueDate, current.from, current.to)) {
    return 1;
  }
  const next = civilMonthBoundsFromKey(shiftCivilMonthKey(current.monthKey, 1));
  if (isCivilDateInInclusiveRange(input.dueDate, next.from, next.to)) {
    return 2;
  }
  return 3;
}

function compareExternalId(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Ordenação determinística de candidatos:
 * 1) nunca verificados primeiro (already-checked nunca ultrapassa never-checked);
 * 2) already-checked: menor lastPresenceCheckedAt;
 * 3) tier temporal do estoque;
 * 4) dueDate crescente;
 * 5) externalId ascendente.
 */
export function rankInstallmentPresenceCandidates<T extends InstallmentPresenceCandidateRankInput>(
  rows: readonly T[],
  today: Date,
): T[] {
  return [...rows].sort((left, right) => {
    const leftNever = left.lastPresenceCheckedAt === null;
    const rightNever = right.lastPresenceCheckedAt === null;
    if (leftNever !== rightNever) {
      return leftNever ? -1 : 1;
    }
    if (left.lastPresenceCheckedAt && right.lastPresenceCheckedAt) {
      const byCheckpoint =
        left.lastPresenceCheckedAt.getTime() - right.lastPresenceCheckedAt.getTime();
      if (byCheckpoint !== 0) {
        return byCheckpoint;
      }
    }
    const byTier =
      installmentPresenceTemporalTier(left, today) - installmentPresenceTemporalTier(right, today);
    if (byTier !== 0) {
      return byTier;
    }
    const byDue = left.dueDate.getTime() - right.dueDate.getTime();
    if (byDue !== 0) {
      return byDue;
    }
    return compareExternalId(left.externalId, right.externalId);
  });
}
