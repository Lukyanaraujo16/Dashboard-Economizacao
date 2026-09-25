/**
 * Normalização textual conservadora da dimensão nominal (F13.8.1D3).
 * Sem fuzzy, embeddings, aliases inventados ou união por semelhança.
 */

const OPERATIONAL_SUFFIXES = [/\s*-\s*bruto$/iu] as const;

const GENERIC_IDENTITY_KEYS = new Set([
  'recebimento',
  'recebimentos',
  'pagamento',
  'pagamentos',
  'convenio',
  'convenios',
  'recebimento convenio',
  'pagamento convenio',
  'atendimento',
  'atendimentos',
  'atendimentos convenio',
  'pix',
  'ted',
  'transferencia',
]);

export function foldAdvisorNominalText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripAdvisorOperationalSuffix(value: string): string {
  let current = value.trim().replace(/\s+/g, ' ');
  for (const suffix of OPERATIONAL_SUFFIXES) {
    current = current.replace(suffix, '').trim();
  }
  return current;
}

export function normalizeAdvisorNominalKey(value: string): string {
  return foldAdvisorNominalText(stripAdvisorOperationalSuffix(value));
}

export function displayAdvisorNominalName(value: string): string {
  const stripped = stripAdvisorOperationalSuffix(value);
  return stripped === '' ? value.trim() : stripped;
}

export function tokenizeAdvisorNominalText(value: string): readonly string[] {
  return foldAdvisorNominalText(value)
    .split(' ')
    .filter((token) => token.length > 0)
    .map(singularizeAdvisorToken);
}

export function isGenericAdvisorNominalKey(normalizedKey: string): boolean {
  return normalizedKey === '' || GENERIC_IDENTITY_KEYS.has(normalizedKey);
}

function singularizeAdvisorToken(token: string): string {
  if (token.length <= 3) {
    return token;
  }
  if (token.endsWith('oes') && token.length > 4) {
    return `${token.slice(0, -3)}ao`;
  }
  if (token.endsWith('ais') && token.length > 4) {
    return `${token.slice(0, -3)}al`;
  }
  if (token.endsWith('es') && token.length > 4) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s')) {
    return token.slice(0, -1);
  }
  return token;
}
