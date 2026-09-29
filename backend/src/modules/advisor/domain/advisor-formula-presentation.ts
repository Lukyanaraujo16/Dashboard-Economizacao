/**
 * Detecção leve de LaTeX matemático em respostas do Consultor (F13.8.2C.2).
 * Somente observabilidade/testes — NÃO reescreve conteúdo.
 * Não trata "$" isolado (moeda) como LaTeX.
 */

const LATEX_MATH_PATTERNS: readonly RegExp[] = [
  /\\\[/,
  /\\\]/,
  /\\\(/,
  /\\\)/,
  /\$\$/,
  /\\frac\s*\{/,
  /\\text\s*\{/,
  /\\begin\s*\{/,
  /\\end\s*\{/,
];

export function advisorTextLooksLikeLatexMath(text: string): boolean {
  if (text.trim().length === 0) {
    return false;
  }
  return LATEX_MATH_PATTERNS.some((pattern) => pattern.test(text));
}
