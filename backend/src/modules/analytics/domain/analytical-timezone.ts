const ANALYTICAL_TIME_ZONE = 'America/Sao_Paulo';

const CIVIL_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: ANALYTICAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const found = parts.find((item) => item.type === type);
  if (!found) {
    throw new Error('Não foi possível obter o dia civil em America/Sao_Paulo.');
  }
  return found.value;
}

export function analyticalTimeZone(): string {
  return ANALYTICAL_TIME_ZONE;
}

/**
 * Dia civil corrente em America/Sao_Paulo, como Date UTC à meia-noite
 * daquela data (mesmo contrato de dueDate @db.Date).
 */
export function civilTodayInSaoPaulo(now: Date): Date {
  const parts = CIVIL_PARTS.formatToParts(now);
  const year = Number(part(parts, 'year'));
  const month = Number(part(parts, 'month'));
  const day = Number(part(parts, 'day'));
  return new Date(Date.UTC(year, month - 1, day));
}
