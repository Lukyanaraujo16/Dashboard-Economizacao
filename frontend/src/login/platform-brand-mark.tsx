/**
 * Marca visual da plataforma / tenant.
 *
 * Dois papéis:
 * - compact: ícone quadrado (sidebar, lockup institucional).
 * - logo: logo principal com proporção livre (card de login).
 *
 * Sem asset ou falha de carga → placeholder Accent (cifrão).
 */

'use client';

import { useEffect, useState } from 'react';

import { cx } from '../components/ui/utils/cx';
import styles from './platform-brand-mark.module.css';

export type PlatformBrandMarkVariant = 'compact' | 'logo';

export type PlatformBrandMarkProps = {
  readonly size?: number;
  readonly alt?: string;
  /** Asset do papel visual atual (logo principal ou ícone compacto). */
  readonly logoUrl?: string | null;
  readonly className?: string;
  /** Decorative (ex.: no card de auth) — alt vazio. */
  readonly decorative?: boolean;
  readonly variant?: PlatformBrandMarkVariant;
};

export function PlatformBrandMark({
  size = 52,
  alt = 'Economização',
  logoUrl = null,
  className,
  decorative = false,
  variant = 'compact',
}: PlatformBrandMarkProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUrl]);

  const showAsset = Boolean(logoUrl) && !logoFailed;

  function handleLogoError() {
    setLogoFailed(true);
  }

  if (showAsset && logoUrl) {
    if (variant === 'logo') {
      return (
        <img
          src={logoUrl}
          alt={decorative ? '' : alt}
          className={cx(styles.logoAsset, className)}
          data-brand-role="logo"
          onError={handleLogoError}
        />
      );
    }

    return (
      <img
        src={logoUrl}
        alt={decorative ? '' : alt}
        width={size}
        height={size}
        className={cx(styles.asset, className)}
        data-brand-role="compact"
        onError={handleLogoError}
      />
    );
  }

  return (
    <span
      className={cx(variant === 'logo' ? styles.logoPlaceholder : styles.placeholder, className)}
      style={variant === 'logo' ? undefined : { width: size, height: size }}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : alt}
      data-brand-placeholder="true"
      data-variant={variant}
      title="Placeholder — será substituído pelo branding oficial"
    >
      <svg
        width={Math.round(size * (variant === 'logo' ? 0.42 : 0.46))}
        height={Math.round(size * (variant === 'logo' ? 0.42 : 0.46))}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M12 3v18M16.5 7.2c-.9-1.3-2.3-2-4.5-2-2.6 0-4.5 1.3-4.5 3.3 0 1.8 1.3 2.7 4.2 3.4 3.2.8 4.8 1.9 4.8 4.1 0 2.3-2 3.6-4.8 3.6-2.4 0-4-1-4.9-2.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
