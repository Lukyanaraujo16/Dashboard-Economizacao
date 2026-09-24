const MASK = '••••••••';

/**
 * Metadado visual derivado no PUT. Nunca inclui sufixo nem material único da chave.
 * Não é usado para autenticação nem para resolver o provider.
 */
export function deriveManagedCredentialDisplayHint(credential: string): string {
  const value = credential.trim();
  if (value.startsWith('sk-proj-')) {
    return `sk-proj-${MASK}`;
  }
  if (value.startsWith('sk-ant-')) {
    return `sk-ant-${MASK}`;
  }
  if (value.startsWith('sk-')) {
    return `sk-${MASK}`;
  }
  return MASK;
}
