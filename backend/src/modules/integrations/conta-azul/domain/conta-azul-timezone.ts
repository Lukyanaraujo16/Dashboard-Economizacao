const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: SAO_PAULO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const found = parts.find((item) => item.type === type);
  if (!found) {
    throw new Error('Não foi possível converter o instante para America/Sao_Paulo.');
  }
  return found.value;
}

/** Formato da Conta Azul: ISO 8601 local em São Paulo, sem offset. */
export function formatSaoPauloDateTime(instant: Date): string {
  const parts = DATE_TIME_FORMAT.formatToParts(instant);
  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}T${part(parts, 'hour')}:${part(parts, 'minute')}:${part(parts, 'second')}`;
}

export function saoPauloTimeZone(): string {
  return SAO_PAULO_TIME_ZONE;
}
