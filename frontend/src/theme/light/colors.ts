import type { ColorTokens } from '../types/colors';

/**
 * Tema claro padrão da plataforma.
 * Valores inspirados na identidade Economização, expressos apenas como tokens semânticos.
 */
export const lightColorTokens = {
  background: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  primary: '#1F2C6D',
  secondary: '#3A4A8C',
  accent: '#C9A227',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  border: '#E2E8F0',
  success: '#15803D',
  warning: '#B45309',
  danger: '#B91C1C',
  info: '#1D4ED8',
  focus: '#2563EB',
  disabled: '#94A3B8',
  overlay: 'rgba(15, 23, 42, 0.44)',
  shadow: 'rgba(15, 23, 42, 0.08)',
  divider: '#E8ECF2',
} as const satisfies ColorTokens;
