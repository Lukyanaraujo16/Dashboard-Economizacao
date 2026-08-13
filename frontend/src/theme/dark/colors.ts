import type { ColorTokens } from '../types/colors';

/**
 * Tema escuro próprio (não é inversão do light).
 * Direção: superfícies em camadas, contraste alto, accent contido.
 */
export const darkColorTokens = {
  background: '#0B0F19',
  surface: '#121826',
  surfaceElevated: '#1A2234',
  primary: '#7B8CFF',
  secondary: '#A3AEE8',
  accent: '#E0B84D',
  textPrimary: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',
  border: '#2A3548',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  info: '#60A5FA',
  focus: '#818CF8',
  disabled: '#64748B',
  overlay: 'rgba(0, 0, 0, 0.56)',
  shadow: 'rgba(0, 0, 0, 0.4)',
  divider: '#243044',
} as const satisfies ColorTokens;
