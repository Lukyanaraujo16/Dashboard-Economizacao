/** Estados de dados financeiros — desacoplados da origem (API, cache, etc.). */
export type FinancialDataState = 'loading' | 'empty' | 'ready' | 'error';

export type FinancialStateMessages = {
  readonly empty?: string;
  readonly loading?: string;
  readonly error?: string;
};
