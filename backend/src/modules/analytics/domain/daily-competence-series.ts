import { Prisma } from '../../../generated/prisma/client.js';
import { addCivilDays } from './civil-calendar.js';

const ZERO = new Prisma.Decimal(0);

export type DailyCompetencePointSource = {
  readonly competenceDate: Date | null;
  readonly total: Prisma.Decimal;
  readonly paid: Prisma.Decimal;
  readonly unpaid: Prisma.Decimal;
};

export type DailyCompetencePoint = {
  readonly date: Date;
  /** Σ total dos títulos com competência neste dia. */
  readonly amount: Prisma.Decimal;
  /**
   * Σ paid (snapshot atual) dos mesmos títulos.
   * NÃO é caixa ocorrido neste dia — é o liquidado atual dos títulos
   * cuja competenceDate cai neste dia.
   */
  readonly received: Prisma.Decimal;
  /**
   * Σ unpaid (snapshot atual) dos mesmos títulos.
   * NÃO é vencimento/caixa — saldo em aberto dos títulos daquele dia de competência.
   */
  readonly outstanding: Prisma.Decimal;
};

type DayBucket = {
  amount: Prisma.Decimal;
  received: Prisma.Decimal;
  outstanding: Prisma.Decimal;
};

/**
 * Série diária por competência: dia = competenceDate (civil UTC @db.Date).
 * amount = Σ total; received = Σ paid; outstanding = Σ unpaid (snapshots).
 * Não é timeline de caixa / baixa.
 * Preenche todos os dias do intervalo [from, to] (zero honesto quando sem título).
 */
export function buildDailyCompetenceTotals(
  installments: readonly DailyCompetencePointSource[],
  from: Date,
  to: Date,
): readonly DailyCompetencePoint[] {
  const byDay = new Map<number, DayBucket>();
  for (const installment of installments) {
    const competence = installment.competenceDate;
    if (competence === null) {
      continue;
    }
    const time = competence.getTime();
    if (time < from.getTime() || time > to.getTime()) {
      continue;
    }
    const current = byDay.get(time) ?? {
      amount: ZERO,
      received: ZERO,
      outstanding: ZERO,
    };
    byDay.set(time, {
      amount: current.amount.plus(installment.total),
      received: current.received.plus(installment.paid),
      outstanding: current.outstanding.plus(installment.unpaid),
    });
  }

  const points: DailyCompetencePoint[] = [];
  let cursor = from;
  while (cursor.getTime() <= to.getTime()) {
    const bucket = byDay.get(cursor.getTime());
    points.push({
      date: cursor,
      amount: bucket?.amount ?? ZERO,
      received: bucket?.received ?? ZERO,
      outstanding: bucket?.outstanding ?? ZERO,
    });
    cursor = addCivilDays(cursor, 1);
  }
  return points;
}

export function accumulateDailyCompetence(
  points: readonly Pick<DailyCompetencePoint, 'date' | 'amount'>[],
): readonly { readonly date: Date; readonly amount: Prisma.Decimal }[] {
  let running = ZERO;
  return points.map((point) => {
    running = running.plus(point.amount);
    return { date: point.date, amount: running };
  });
}
