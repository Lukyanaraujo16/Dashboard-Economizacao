import type { TenantBrandingInput } from '../../types/theme';

/**
 * Brandings mock locais — apenas para validar o Theme Engine no playground/testes.
 * Sem backend, sem API, sem persistência.
 */
export type MockTenantBrandingId = 'default' | 'azul' | 'verde' | 'roxo' | 'vermelho';

export type MockTenantBranding = {
  readonly id: MockTenantBrandingId;
  readonly label: string;
  readonly branding: TenantBrandingInput | null;
};

export const MOCK_TENANT_BRANDINGS: readonly MockTenantBranding[] = [
  {
    id: 'default',
    label: 'Theme Default',
    branding: null,
  },
  {
    id: 'azul',
    label: 'Tenant Azul',
    branding: {
      name: 'Tenant Azul',
      logoUrl: null,
      light: {
        primary: '#1D4ED8',
        onPrimary: '#FFFFFF',
        secondary: '#3B82F6',
        accent: '#38BDF8',
      },
      dark: {
        primary: '#60A5FA',
        onPrimary: '#0B1220',
        secondary: '#93C5FD',
        accent: '#7DD3FC',
      },
    },
  },
  {
    id: 'verde',
    label: 'Tenant Verde',
    branding: {
      name: 'Tenant Verde',
      logoUrl: null,
      light: {
        primary: '#047857',
        onPrimary: '#FFFFFF',
        secondary: '#059669',
        accent: '#34D399',
      },
      dark: {
        primary: '#34D399',
        onPrimary: '#06241A',
        secondary: '#6EE7B7',
        accent: '#A7F3D0',
      },
    },
  },
  {
    id: 'roxo',
    label: 'Tenant Roxo',
    branding: {
      name: 'Tenant Roxo',
      logoUrl: null,
      light: {
        primary: '#6D28D9',
        onPrimary: '#FFFFFF',
        secondary: '#7C3AED',
        accent: '#C4B5FD',
      },
      dark: {
        primary: '#A78BFA',
        onPrimary: '#160B2A',
        secondary: '#C4B5FD',
        accent: '#DDD6FE',
      },
    },
  },
  {
    id: 'vermelho',
    label: 'Tenant Vermelho',
    branding: {
      name: 'Tenant Vermelho',
      logoUrl: null,
      light: {
        primary: '#B91C1C',
        onPrimary: '#FFFFFF',
        secondary: '#DC2626',
        accent: '#FCA5A5',
      },
      dark: {
        primary: '#F87171',
        onPrimary: '#2A0B0B',
        secondary: '#FCA5A5',
        accent: '#FECACA',
      },
    },
  },
] as const;

export function getMockTenantBranding(id: MockTenantBrandingId): MockTenantBranding {
  const found = MOCK_TENANT_BRANDINGS.find((item) => item.id === id);
  if (!found) {
    return MOCK_TENANT_BRANDINGS[0]!;
  }
  return found;
}
