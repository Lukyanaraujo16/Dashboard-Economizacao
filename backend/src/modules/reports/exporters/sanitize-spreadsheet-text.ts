const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const WRAPPED_FORMULA_PREFIX = /^['`][=+\-@]/;

/**
 * Neutraliza texto que o Excel/Sheets interpretaria como fórmula (docs/09.8 §3.14).
 * Não altera números — só células de texto (empresa, categoria, filtros).
 */
export function sanitizeSpreadsheetText(value: string): string {
  const normalized = value.replace(/[\r\n\t]/g, ' ').trim();
  if (normalized === '') {
    return normalized;
  }
  if (FORMULA_PREFIX.test(normalized) || WRAPPED_FORMULA_PREFIX.test(normalized)) {
    return `'${normalized}`;
  }
  return normalized;
}
