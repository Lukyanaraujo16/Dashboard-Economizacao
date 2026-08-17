'use client';

import { useContext } from 'react';

import {
  RuntimePlatformBrandingContext,
  type RuntimePlatformBrandingContextValue,
} from '../provider/runtime-platform-branding-context';

export function useRuntimePlatformBranding(): RuntimePlatformBrandingContextValue {
  const context = useContext(RuntimePlatformBrandingContext);
  if (!context) {
    throw new Error(
      'useRuntimePlatformBranding deve ser usado dentro de RuntimePlatformBrandingProvider.',
    );
  }
  return context;
}
