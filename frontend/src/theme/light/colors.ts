import type { ColorTokens } from '../types/colors';

/**
 * Tema claro padrão da plataforma (Economização = theme default).
 * Componentes consomem apenas tokens semânticos — agnósticos de marca.
 */
export const lightColorTokens = {
  background: '#E7E7EF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  primary: '#141452',
  onPrimary: '#FFFFFF',
  secondary: '#2D2D74',
  accent: '#F2C200',
  textPrimary: '#141452',
  textSecondary: '#7A7A8C',
  textMuted: '#9494A3',
  border: '#D8D8E4',
  success: '#1E9E5A',
  warning: '#B45309',
  danger: '#C7402F',
  onDanger: '#FFFFFF',
  info: '#5B5BA6',
  focus: '#5B5BA6',
  disabled: '#A0A0B0',
  overlay: 'rgba(20, 20, 82, 0.44)',
  shadow: 'rgba(20, 20, 82, 0.08)',
  divider: '#DDDDE8',
} as const satisfies ColorTokens;
