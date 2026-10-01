import { Prisma } from '../../../generated/prisma/client.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import {
  addCivilDays,
  civilDateUtcFromKey,
} from '../../analytics/domain/civil-calendar.js';
import type { ExpenseCeilingProgress } from '../../dashboard/domain/expense-ceiling-math.js';
import type { RevenueGoalProgress } from '../../dashboard/domain/revenue-goal-math.js';
import { buildHotSyncCivilWindow } from '../../integrations/conta-azul/domain/conta-azul-hot-sync.js';
import type { ProactiveTitleKind } from './proactive-trigger-catalog.js';

/** Mesmo contrato de sujeito do catálogo: KIND + externalId opaco. */
const TITLE_EXTERNAL_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type TitleDueWindow = {
  readonly from: Date;
  readonly to: Date;
};

/**
 * Marco de meta satisfeito no estado atual.
 * Mês futuro permanece PLANNED mesmo com taxa calculada: não qualifica.
 */
export function qualifyRevenueGoal(progress: RevenueGoalProgress, percentage: number): boolean {
  if (
    progress.achievementRate === null ||
    progress.status === 'PLANNED' ||
    progress.status === 'NO_TARGET'
  ) {
    return false;
  }
  return progress.achievementRate.greaterThanOrEqualTo(new Prisma.Decimal(percentage));
}

/**
 * Marco percentual do teto. A comparação é com o percentual configurado,
 * não com um marco vizinho. Indisponível, sem teto e mês futuro não qualificam.
 */
export function qualifyExpenseCeilingPercentage(
  progress: ExpenseCeilingProgress,
  percentage: number,
): boolean {
  if (
    progress.consumedRate === null ||
    progress.status === 'UNAVAILABLE' ||
    progress.status === 'NO_TARGET' ||
    progress.status === 'PLANNED'
  ) {
    return false;
  }
  return progress.consumedRate.greaterThanOrEqualTo(new Prisma.Decimal(percentage));
}

/** Somente o status oficial EXCEEDED. Exatamente no teto é ACHIEVED e não estoura. */
export function qualifyExpenseCeilingExceeded(progress: ExpenseCeilingProgress): boolean {
  return progress.status === 'EXCEEDED';
}

/**
 * Janela civil [hoje, hoje + daysAhead] em America/Sao_Paulo,
 * cortada pela cobertura quente (mês anterior + mês atual).
 * Interseção vazia devolve null: ausência de cobertura, não zero financeiro.
 */
export function titleDueWindow(now: Date, daysAhead: number): TitleDueWindow | null {
  const today = civilTodayInSaoPaulo(now);
  const requestedTo = addCivilDays(today, daysAhead);
  const hot = buildHotSyncCivilWindow(now);
  const hotFrom = civilDateUtcFromKey(hot.from);
  const hotTo = civilDateUtcFromKey(hot.to);
  if (hotFrom === null || hotTo === null) {
    return null;
  }
  const from = today.getTime() > hotFrom.getTime() ? today : hotFrom;
  const to = requestedTo.getTime() < hotTo.getTime() ? requestedTo : hotTo;
  if (from.getTime() > to.getTime()) {
    return null;
  }
  return { from, to };
}

/** unpaid em aberto, comparado ao mínimo com Decimal. Igual entra. Fora da janela não entra. */
export function titleQualifies(
  unpaid: Prisma.Decimal,
  minimumAmount: string,
  dueDate: Date,
  window: TitleDueWindow | null,
): boolean {
  if (window === null) {
    return false;
  }
  if (unpaid.lessThan(new Prisma.Decimal(minimumAmount))) {
    return false;
  }
  const due = dueDate.getTime();
  return due >= window.from.getTime() && due <= window.to.getTime();
}

/** null quando o externalId não cabe no sujeito certificado. O título é pulado. */
export function proactiveTitleSubjectKey(
  titleKind: ProactiveTitleKind,
  externalId: string,
): string | null {
  if (!TITLE_EXTERNAL_ID.test(externalId)) {
    return null;
  }
  return `${titleKind}:${externalId}`;
}
