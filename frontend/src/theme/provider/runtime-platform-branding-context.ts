'use client';

import { createContext } from 'react';

import type { CurrentBranding } from '../../services/branding/current.types';

export type RuntimePlatformBrandingStatus = 'loading' | 'ready' | 'error';

export type RuntimePlatformBrandingContextValue = {
  readonly platformBranding: CurrentBranding | null;
  readonly status: RuntimePlatformBrandingStatus;
  readonly refresh: () => Promise<void>;
};

export const RuntimePlatformBrandingContext =
  createContext<RuntimePlatformBrandingContextValue | null>(null);
