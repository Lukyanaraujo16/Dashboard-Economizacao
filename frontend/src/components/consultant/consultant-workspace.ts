'use client';

import { useEffect, useState } from 'react';

/** Shell autenticado já trata 1024px como desktop largo. */
const CONSULTANT_WORKSPACE_MEDIA = '(min-width: 1024px)';

export function useConsultantWorkspace(): boolean {
  const [workspace, setWorkspace] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia(CONSULTANT_WORKSPACE_MEDIA);
    const apply = () => setWorkspace(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  return workspace;
}
