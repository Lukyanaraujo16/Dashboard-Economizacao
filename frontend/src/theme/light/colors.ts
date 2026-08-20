import type { ColorTokens } from '../types/colors';

/**
 * Tema claro padrão da plataforma (Economização = theme default).
 * Mesma geometria V2; séries financeiras com contraste em fundo claro.
 */
export const lightColorTokens = {
  background: '#E8ECF4',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  primary: '#141452',
  onPrimary: '#FFFFFF',
  secondary: '#2D2D74',
  accent: '#F2C200',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  border: '#D5DCE8',
  success: '#15803D',
  warning: '#B45309',
  danger: '#C7402F',
  onDanger: '#FFFFFF',
  info: '#2563EB',
  focus: '#5B5BA6',
  disabled: '#A0A0B0',
  overlay: 'rgba(15, 23, 42, 0.44)',
  shadow: 'rgba(15, 23, 42, 0.08)',
  divider: '#E2E8F0',
  seriesRevenue: '#16A34A',
  seriesExpense: '#EA580C',
  seriesReceivable: '#0284C7',
  seriesReceived: '#2563EB',
  seriesResult: '#7C3AED',
} as const satisfies ColorTokens;
