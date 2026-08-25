'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';

import { resolveAuthenticatedHomePath, useAuth } from '../auth';
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
import { IconGauge, IconShield, IconZap } from '../components/ui/icons';
import { login, LoginRequestError } from '../services/auth/login';
import { ThemeProvider, useTheme } from '../theme';
import type { ResolvedColorScheme, TenantBrandingInput } from '../theme/types/theme';
import {
  mapLoginValidationDetails,
  validateLoginFields,
  type LoginFieldErrors,
} from './login-form-validation';
import styles from './login-experience.module.css';
import { PlatformBrandMark } from './platform-brand-mark';

const DEFAULT_LOGIN_BRAND_NAME = 'Economização';

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
  if (kind === 'control') {
    return <IconGauge size={18} />;
  }
  if (kind === 'security') {
    return <IconShield size={18} />;
  }
  return <IconZap size={18} />;
}

function LoginShell({
  children,
  forcedScheme,
}: {
  readonly children: ReactNode;
  readonly forcedScheme?: ResolvedColorScheme;
}) {
  const { theme } = useTheme();
  return (
    <div className={styles.shell} data-scheme={forcedScheme ?? theme.colorScheme}>
      {children}
    </div>
  );
}

type LoginStatus = 'idle' | 'submitting' | 'success';

type LoginExperienceProps = {
  /** Controles DEV de tema; omitidos na rota de produto. */
  readonly showThemeControls?: boolean;
  /** Nome da plataforma (GET /branding/platform); fallback Economização. */
  readonly brandName?: string;
  /**
   * Logo principal. Quando omitido/null, usa placeholder Accent.
   */
  readonly brandLogoUrl?: string | null;
  /** Ícone compacto do lockup institucional. Independente da logo principal. */
  readonly brandIconUrl?: string | null;
  /** Cores/nome/logo para o ThemeProvider aninhado do login. */
  readonly branding?: TenantBrandingInput | null;
  /** Injeção para testes; default: serviço HTTP real. */
  readonly loginAction?: typeof login;
};

/**
 * Login Experience Freeze v1 (ADR-044) + integração funcional 1.1F-E.2/E.3.
 * Sem redesenho visual; autenticação via cookie HttpOnly (sem JWT/storage).
 * Fonte de verdade do usuário após login: GET /auth/me via AuthProvider.
 */
export function LoginExperience({
  showThemeControls = false,
  brandName,
  brandLogoUrl = null,
  brandIconUrl = null,
  branding = null,
  loginAction = login,
}: LoginExperienceProps) {
  const router = useRouter();
  const { refreshSession } = useAuth();
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
      const session = await refreshSession();
      if (session.kind !== 'authenticated') {
        submittingRef.current = false;
        setStatus('idle');
        setFormError('Não foi possível verificar a sessão. Tente novamente.');
        return;
      }
      setStatus('success');
      router.replace(resolveAuthenticatedHomePath(session.user, session.support));
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
  const resolvedBrandName = brandName?.trim() || DEFAULT_LOGIN_BRAND_NAME;
  const themeBranding: TenantBrandingInput | null = branding
    ? {
        ...branding,
        name: branding.name ?? resolvedBrandName,
        logoUrl: branding.logoUrl ?? brandLogoUrl,
        iconUrl: branding.iconUrl ?? brandIconUrl,
      }
    : brandLogoUrl || brandIconUrl || brandName
      ? { name: resolvedBrandName, logoUrl: brandLogoUrl, iconUrl: brandIconUrl }
      : null;

  return (
    <ThemeProvider preference={showThemeControls ? scheme : undefined} branding={themeBranding}>
      <LoginShell forcedScheme={showThemeControls ? scheme : undefined}>
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
                  <div className={styles.logoRow} data-testid="login-institutional-lockup">
                    <PlatformBrandMark
                      size={52}
                      variant="compact"
                      logoUrl={brandIconUrl}
                      decorative
                      className={styles.brandMark}
                    />
                    <div className={styles.brandText}>
                      <Typography as="span" variant="heading" className={styles.brandName}>
                        {resolvedBrandName}
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
                  <div className={styles.authLogoWrap} data-testid="login-primary-logo">
                    <PlatformBrandMark
                      size={72}
                      variant="logo"
                      logoUrl={brandLogoUrl}
                      decorative
                      className={styles.authPrimaryLogo}
                    />
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
      </LoginShell>
    </ThemeProvider>
  );
}
