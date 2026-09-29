/**
 * Referência lógica do USER para lookup/anáfora futura.
 * Não aceita IDs de banco escolhidos pelo provider.
 */
export type AnalyticalIdentityRef = {
  readonly kind: 'QUERY';
  readonly query: string;
};
