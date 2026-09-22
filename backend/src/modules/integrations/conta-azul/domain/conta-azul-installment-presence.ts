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
 */

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

export type InstallmentPresenceCandidateRankInput = {
  readonly externalId: string;
  readonly lastPresenceCheckedAt: Date | null;
};

/**
 * Ordenação determinística de candidatos:
 * 1) nunca verificados primeiro;
 * 2) depois menor lastPresenceCheckedAt;
 * 3) desempate por externalId ascendente.
 */
export function rankInstallmentPresenceCandidates<T extends InstallmentPresenceCandidateRankInput>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((left, right) => {
    if (left.lastPresenceCheckedAt === null && right.lastPresenceCheckedAt !== null) {
      return -1;
    }
    if (left.lastPresenceCheckedAt !== null && right.lastPresenceCheckedAt === null) {
      return 1;
    }
    if (left.lastPresenceCheckedAt && right.lastPresenceCheckedAt) {
      const byTime =
        left.lastPresenceCheckedAt.getTime() - right.lastPresenceCheckedAt.getTime();
      if (byTime !== 0) {
        return byTime;
      }
    }
    return left.externalId < right.externalId
      ? -1
      : left.externalId > right.externalId
        ? 1
        : 0;
  });
}
