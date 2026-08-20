import type { ColorTokens } from '../types/colors';

/**
 * Tema escuro próprio (não é inversão do light).
 * Dashboard V2: charcoal neutro, superfícies hierárquicas, séries financeiras protegidas.
 */
export const darkColorTokens = {
  background: '#0E1117',
  surface: '#171A21',
  surfaceElevated: '#22262F',
  primary: '#8B9CF7',
  onPrimary: '#0E1117',
  secondary: '#A5B4CF',
  accent: '#F2C200',
  textPrimary: '#F3F4F8',
  textSecondary: '#B8C0D0',
  textMuted: '#8B95A8',
  border: '#2D323C',
  success: '#22C55E',
  warning: '#FBBF24',
  danger: '#EF4444',
  onDanger: '#FFFFFF',
  info: '#60A5FA',
  focus: '#8B9CF7',
  disabled: '#6B7280',
  overlay: 'rgba(0, 0, 0, 0.62)',
  shadow: 'rgba(0, 0, 0, 0.45)',
  divider: '#232830',
  seriesRevenue: '#22C55E',
  seriesExpense: '#F97316',
  seriesReceivable: '#38BDF8',
  seriesReceived: '#3B82F6',
  seriesResult: '#A855F7',
} as const satisfies ColorTokens;
