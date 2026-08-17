'use client';

import { createContext } from 'react';

export type RuntimeThemeContextValue = {
  /** Recarrega branding da sessão autenticada (ADMIN: admin API; USER: /branding/current). */
  readonly refreshBranding: () => Promise<void>;
};

export const RuntimeThemeContext = createContext<RuntimeThemeContextValue | null>(null);
