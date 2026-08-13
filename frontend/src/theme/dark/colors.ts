import type { ColorTokens } from '../types/colors';

/**
 * Tema escuro próprio (não é inversão do light).
 * Três níveis: background → surface → surfaceElevated.
 * Success/danger/accent seguem a paleta oficial; primary adapta contraste.
 */
export const darkColorTokens = {
  background: '#0B0B14',
  surface: '#12121F',
  surfaceElevated: '#1A1A2C',
  primary: '#9A9AD4',
  onPrimary: '#0B0B14',
  secondary: '#B4B4DC',
  accent: '#F2C200',
  textPrimary: '#F2F2F8',
  textSecondary: '#B4B4C4',
  textMuted: '#8E8EA0',
  border: '#2A2A3E',
  success: '#1E9E5A',
  warning: '#FBBF24',
  danger: '#C7402F',
  onDanger: '#FFFFFF',
  info: '#8B8BC4',
  focus: '#8B8BC4',
  disabled: '#6A6A7C',
  overlay: 'rgba(0, 0, 0, 0.56)',
  shadow: 'rgba(0, 0, 0, 0.4)',
  divider: '#1E1E2E',
} as const satisfies ColorTokens;
