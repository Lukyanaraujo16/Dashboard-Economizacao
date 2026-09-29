/**
 * Normalização textual pré-chunking.
 * Neutraliza controles e delimitadores UNTRUSTED futuros sem destruir significado.
 */

const UNTRUSTED_BEGIN = '<<<UNTRUSTED';
const UNTRUSTED_END = '<<<END_UNTRUSTED';

export function normalizeAdvisorKnowledgeDocumentText(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '');
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replaceAll(UNTRUSTED_BEGIN, '<<‹UNTRUSTED').replaceAll(UNTRUSTED_END, '<<‹END_UNTRUSTED');
  // Strip C0 controls except TAB/LF without control-regex (eslint).
  text = [...text]
    .filter((char) => {
      const code = char.charCodeAt(0);
      if (code === 9 || code === 10) {
        return true;
      }
      return code >= 32 && code !== 127;
    })
    .join('');
  // Collapse 3+ blank lines to 2.
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}
