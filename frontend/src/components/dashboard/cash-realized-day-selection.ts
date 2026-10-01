export type ScopedDaySelection = {
  readonly scope: string;
  readonly date: string;
};

/** Mesmo dia fecha. Outro dia troca. Escopo diferente invalida a seleção na hora. */
export function nextScopedDaySelection(
  current: ScopedDaySelection | null,
  scope: string,
  date: string,
): ScopedDaySelection | null {
  if (current?.scope === scope && current.date === date) {
    return null;
  }
  return { scope, date };
}

export function visibleScopedDay(
  current: ScopedDaySelection | null,
  scope: string,
): string | null {
  if (current === null || current.scope !== scope) {
    return null;
  }
  return current.date;
}
