'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

import {
  Badge,
  Button,
  Card,
  Divider,
  FormField,
  Input,
  PasswordInput,
  Stack,
  Typography,
} from '../components/ui';
import { login, LoginRequestError } from '../services/auth/login';
import { ThemeProvider } from '../theme';
import type { ResolvedColorScheme } from '../theme/types/theme';
import {
  mapLoginValidationDetails,
  validateLoginFields,
  type LoginFieldErrors,
} from './login-form-validation';
import styles from './login-experience.module.css';
import { PlatformBrandMark } from './platform-brand-mark';

type HighlightIconKind = 'control' | 'security' | 'performance';

const HIGHLIGHTS: ReadonlyArray<{
  title: string;
  description: string;
  icon: HighlightIconKind;
}> = [
  {
    title: 'Controle inteligente',
    description: 'Visão clara da operação financeira, sem ruído.',
    icon: 'control',
  },
  {
    title: 'Segurança',
    description: 'Acesso protegido e isolamento multiempresa.',
    icon: 'security',
  },
  {
    title: 'Performance',
    description: 'Decisões rápidas com indicadores confiáveis.',
    icon: 'performance',
  },
];

function HighlightIcon({ kind }: { readonly kind: HighlightIconKind }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 18 18',
    fill: 'none',
    'aria-hidden': true as const,
  };

  if (kind === 'control') {
    return (
      <svg {...common}>
        <rect
          x="2.5"
          y="2.5"
          width="5.5"
          height="5.5"
          rx="1.2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <rect
          x="10"
          y="2.5"
          width="5.5"
          height="5.5"
          rx="1.2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <rect
          x="2.5"
          y="10"
          width="5.5"
          height="5.5"
          rx="1.2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <rect
          x="10"
          y="10"
          width="5.5"
          height="5.5"
          rx="1.2"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle cx="13" cy="13" r="1.15" className={styles.accentDot} />
      </svg>
    );
  }

  if (kind === 'security') {
    return (
      <svg {...common}>
        <path
          d="M9 2.4 14.5 4.6v4.2c0 3.2-2.2 5.5-5.5 6.8C5.7 14.3 3.5 12 3.5 8.8V4.6L9 2.4Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M9 7.2v3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="9" cy="12.2" r="0.9" className={styles.accentDot} />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path
        d="M3 12.5 6.8 8.2 9.6 10.6 15 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11.2 4.5H15v3.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="15" cy="4.5" r="1" className={styles.accentDot} />
    </svg>
  );
}

type LoginStatus = 'idle' | 'submitting' | 'success';

type LoginExperienceProps = {
  /** Controles DEV de tema; omitidos na rota de produto. */
  readonly showThemeControls?: boolean;
  /**
   * Asset oficial futuro (Theme Default / admin).
   * Quando omitido, usa placeholder Accent temporário.
   */
  readonly brandLogoUrl?: string | null;
  /** Injeção para testes; default: serviço HTTP real. */
  readonly loginAction?: typeof login;
};

/**
 * Login Experience Freeze v1 (ADR-044) + integração funcional 1.1F-E.2.
 * Sem redesenho visual; autenticação via cookie HttpOnly (sem JWT/storage).
 */
export function LoginExperience({
  showThemeControls = false,
  brandLogoUrl = null,
  loginAction = login,
}: LoginExperienceProps) {
  const router = useRouter();
  const [scheme, setScheme] = useState<ResolvedColorScheme>('light');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<LoginStatus>('idle');
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current || status === 'submitting' || status === 'success') {
      return;
    }

    const clientErrors = validateLoginFields({ email, password });
    if (clientErrors.email || clientErrors.password) {
      setFieldErrors(clientErrors);
      setFormError(null);
      return;
    }

    submittingRef.current = true;
    setStatus('submitting');
    setFieldErrors({});
    setFormError(null);

    try {
      await loginAction({
        email: email.trim(),
        password,
      });
      setStatus('success');
      router.replace('/');
    } catch (error) {
      submittingRef.current = false;
      setStatus('idle');

      if (error instanceof LoginRequestError) {
        if (error.kind === 'validation') {
          const mapped = mapLoginValidationDetails(error.details);
          setFieldErrors(mapped.fieldErrors);
          setFormError(mapped.formError ?? null);
          return;
        }

        setFieldErrors({});
        setFormError(error.message);
        return;
      }

      setFieldErrors({});
      setFormError('Não foi possível conectar ao serviço. Tente novamente.');
    }
  }

  const isSubmitting = status === 'submitting' || status === 'success';

  return (
    <ThemeProvider preference={scheme}>
      <div className={styles.shell} data-scheme={scheme}>
        <div className={styles.atmosphere} aria-hidden="true" />
        <div className={styles.gridOverlay} aria-hidden="true" />
        <div className={styles.accentWash} aria-hidden="true" />

        {showThemeControls ? (
          <div className={styles.devControls}>
            <Badge variant="neutral" className={styles.devBadge}>
              DEV
            </Badge>
            <Stack direction="horizontal" gap={2}>
              <Button
                size="sm"
                variant={scheme === 'light' ? 'primary' : 'secondary'}
                aria-pressed={scheme === 'light'}
                onClick={() => setScheme('light')}
              >
                Light
              </Button>
              <Button
                size="sm"
                variant={scheme === 'dark' ? 'primary' : 'secondary'}
                aria-pressed={scheme === 'dark'}
                onClick={() => setScheme('dark')}
              >
                Dark
              </Button>
            </Stack>
          </div>
        ) : null}

        <main className={styles.layout}>
          <section className={styles.brandColumn} aria-label="Experiência da marca">
            <div className={styles.brandInner}>
              <div className={styles.brandIntro}>
                <div className={styles.brandLockup}>
                  <div className={styles.logoRow}>
                    <PlatformBrandMark
                      size={52}
                      logoUrl={brandLogoUrl}
                      className={styles.brandMark}
                    />
                    <div className={styles.brandText}>
                      <Typography as="span" variant="heading" className={styles.brandName}>
                        Economização
                      </Typography>
                      <Typography as="span" variant="caption" className={styles.brandTag}>
                        Dashboard financeiro
                      </Typography>
                    </div>
                  </div>
                  <span className={styles.brandAccentRule} aria-hidden="true" />
                </div>

                <Stack gap={5} className={styles.brandCopyBlock}>
                  <Typography as="h1" variant="display" className={styles.brandHeadline}>
                    <span className={styles.headlineDesktop}>
                      Inteligência financeira
                      <br />
                      com silêncio visual.
                    </span>
                    <span className={styles.headlineMobile}>Inteligência financeira.</span>
                  </Typography>
                  <Typography variant="body" className={styles.brandCopy}>
                    <span className={styles.copyDesktop}>
                      A entrada da plataforma para decisões precisas, clareza operacional e
                      confiança em cada indicador.
                    </span>
                    <span className={styles.copyMobile}>Acesse sua conta para continuar.</span>
                  </Typography>
                </Stack>
              </div>

              <Stack gap={3} className={styles.highlights}>
                {HIGHLIGHTS.map((item) => (
                  <Card key={item.title} className={styles.highlightCard}>
                    <Stack direction="horizontal" gap={3} align="start">
                      <span className={styles.highlightIcon} aria-hidden="true">
                        <HighlightIcon kind={item.icon} />
                      </span>
                      <Stack gap={1} className={styles.highlightCopy}>
                        <Typography as="h3" variant="label" className={styles.highlightTitle}>
                          {item.title}
                        </Typography>
                        <Typography variant="caption">{item.description}</Typography>
                      </Stack>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            </div>
          </section>

          <section className={styles.authColumn} aria-label="Acesso">
            <Card variant="elevated" className={styles.authCard}>
              <Stack gap={6} className={styles.authStack}>
                <Stack gap={3} className={styles.authHeader} align="center">
                  <div className={styles.authLogoWrap}>
                    <PlatformBrandMark size={36} logoUrl={brandLogoUrl} decorative />
                    <span className={styles.authAccentPip} aria-hidden="true" />
                  </div>
                  <Stack gap={2} className={styles.authIntro} align="center">
                    <Typography as="h2" variant="heading" className={styles.authTitle}>
                      Bem-vindo de volta.
                    </Typography>
                    <Typography variant="body" className={styles.authSupport}>
                      Entre com suas credenciais para acessar o dashboard.
                    </Typography>
                  </Stack>
                </Stack>

                <Divider />

                <form className={styles.form} onSubmit={handleSubmit} noValidate>
                  <Stack gap={4}>
                    {formError ? (
                      <Typography
                        as="p"
                        variant="caption"
                        className={styles.formError}
                        role="alert"
                      >
                        {formError}
                      </Typography>
                    ) : null}

                    <FormField label="E-mail" error={fieldErrors.email} required>
                      <Input
                        type="email"
                        name="email"
                        autoComplete="username"
                        placeholder="voce@empresa.com"
                        inputMode="email"
                        value={email}
                        disabled={isSubmitting}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          if (fieldErrors.email) {
                            setFieldErrors((current) => ({ ...current, email: undefined }));
                          }
                        }}
                      />
                    </FormField>

                    <FormField label="Senha" error={fieldErrors.password} required>
                      <PasswordInput
                        name="password"
                        autoComplete="current-password"
                        placeholder="Sua senha"
                        value={password}
                        disabled={isSubmitting}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          if (fieldErrors.password) {
                            setFieldErrors((current) => ({ ...current, password: undefined }));
                          }
                        }}
                      />
                    </FormField>

                    <Stack gap={3}>
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        className={styles.submit}
                        loading={isSubmitting}
                      >
                        Entrar
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className={styles.forgot}>
                        Esqueci minha senha
                      </Button>
                    </Stack>
                  </Stack>
                </form>
              </Stack>
            </Card>
          </section>
        </main>
      </div>
    </ThemeProvider>
  );
}
