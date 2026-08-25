/** Decodifica literais hex de um PDF gerado pelo pdfkit (compress: false). */
export function decodedPdfStrings(buffer: Buffer): string {
  return [...buffer.toString('latin1').matchAll(/<([0-9A-Fa-f]+)>/g)]
    .map((match) => Buffer.from(match[1] ?? '', 'hex').toString('latin1'))
    .join('');
}
