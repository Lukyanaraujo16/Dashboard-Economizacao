/**
 * Playground visual interno — disponível apenas fora de produção.
 */
export function isDevUiEnabled(nodeEnv: string | undefined = process.env.NODE_ENV): boolean {
  return nodeEnv !== 'production';
}
