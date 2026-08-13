/**
 * Marca visual da plataforma na Login Experience.
 *
 * Placeholder institucional temporário (cifrão Accent).
 * Será substituído pelo branding oficial.
 *
 * Preparado para receber `logoUrl` de asset futuro (admin / Theme Default)
 * sem alterar a composição da página.
 */

import { cx } from '../components/ui/utils/cx';
import styles from './platform-brand-mark.module.css';

export type PlatformBrandMarkProps = {
  readonly size?: number;
  readonly alt?: string;
  /** Asset oficial futuro; quando ausente, usa o placeholder Accent. */
  readonly logoUrl?: string | null;
  readonly className?: string;
  /** Decorative (ex.: no card de auth) — alt vazio. */
  readonly decorative?: boolean;
};

export function PlatformBrandMark({
  size = 52,
  alt = 'Economização',
  logoUrl = null,
  className,
  decorative = false,
}: PlatformBrandMarkProps) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={decorative ? '' : alt}
        width={size}
        height={size}
        className={cx(styles.asset, className)}
      />
    );
  }

  return (
    <span
      className={cx(styles.placeholder, className)}
      style={{ width: size, height: size }}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : alt}
      data-brand-placeholder="true"
      title="Placeholder — será substituído pelo branding oficial"
    >
      {/* Placeholder institucional temporário. Será substituído pelo branding oficial. */}
      <svg
        width={Math.round(size * 0.46)}
        height={Math.round(size * 0.46)}
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
