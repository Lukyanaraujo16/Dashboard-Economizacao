/**
 * Saudação institucional por horário local (client-only).
 */
export function resolveGreetingPrefix(
  now: Date = new Date(),
): 'Bom dia' | 'Boa tarde' | 'Boa noite' {
  const hour = now.getHours();
  if (hour < 12) {
    return 'Bom dia';
  }
  if (hour < 18) {
    return 'Boa tarde';
  }
  return 'Boa noite';
}
