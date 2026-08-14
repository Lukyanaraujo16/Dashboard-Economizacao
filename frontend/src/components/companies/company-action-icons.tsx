import type { ReactNode } from 'react';

type IconProps = {
  readonly className?: string;
};

function iconProps(className?: string) {
  return {
    viewBox: '0 0 24 24',
    width: 18,
    height: 18,
    fill: 'none' as const,
    'aria-hidden': true as const,
    className,
  };
}

export function EditCompanyIcon({ className }: IconProps): ReactNode {
  return (
    <svg {...iconProps(className)}>
      <path
        d="M4 20h4l10.5-10.5a1.8 1.8 0 0 0 0-2.6l-1.4-1.4a1.8 1.8 0 0 0-2.6 0L4 16v4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="m13.5 6.5 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function DisableCompanyIcon({ className }: IconProps): ReactNode {
  return (
    <svg {...iconProps(className)}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 8l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ReactivateCompanyIcon({ className }: IconProps): ReactNode {
  return (
    <svg {...iconProps(className)}>
      <path
        d="M12 5v4M9.5 7.5 12 5l2.5 2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 12a5 5 0 0 0 8.6 3.5M17 12a5 5 0 0 0-8.6-3.5M7 16.5V19M17 7.5V5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DeleteCompanyIcon({ className }: IconProps): ReactNode {
  return (
    <svg {...iconProps(className)}>
      <path
        d="M9 9v8M15 9v8M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 7l.6 11.2c.1 1.3 1.2 2.3 2.5 2.3h3.8c1.3 0 2.4-1 2.5-2.3L17 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
