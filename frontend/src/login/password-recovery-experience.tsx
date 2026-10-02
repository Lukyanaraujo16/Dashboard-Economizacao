'use client';

import { useState, type FormEvent } from 'react';

import {
  Button,
  Card,
  Divider,
  FormField,
  Input,
  Stack,
  Typography,
} from '../components/ui';
import { cx } from '../components/ui/utils/cx';
import buttonStyles from '../components/ui/button/button.module.css';
import { ThemeProvider } from '../theme';
import type { TenantBrandingInput } from '../theme/types/theme';
import { readAdminWhatsappE164 } from './admin-whatsapp-contact';
import styles from './login-experience.module.css';
import recoveryStyles from './password-recovery.module.css';
import {
  buildPasswordRecoveryWhatsappUrl,
  validatePasswordRecoveryFields,
  type PasswordRecoveryFieldErrors,
} from './password-recovery-request';
import { PlatformBrandMark } from './platform-brand-mark';

const DEFAULT_BRAND_NAME = 'Economização';

type PasswordRecoveryExperienceProps = {
  readonly brandName?: string;
  readonly brandLogoUrl?: string | null;
  readonly brandIconUrl?: string | null;
  readonly branding?: TenantBrandingInput | null;
  /** Número E.164. Omitido: lê `NEXT_PUBLIC_ADMIN_WHATSAPP_E164`. */
  readonly adminWhatsappE164?: string | null;
};

export function PasswordRecoveryExperience({
  brandName,
  brandLogoUrl = null,
  brandIconUrl = null,
  branding = null,
  adminWhatsappE164 = readAdminWhatsappE164(),
}: PasswordRecoveryExperienceProps) {
  const resolvedBrandName = brandName?.trim() || branding?.name?.trim() || DEFAULT_BRAND_NAME;
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [fieldErrors, setFieldErrors] = useState<PasswordRecoveryFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeIsAlert, setNoticeIsAlert] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validatePasswordRecoveryFields({ email, company });
    setFieldErrors(errors);
    setWhatsappUrl(null);
    if (errors.email || errors.company) {
      setNotice(null);
      setNoticeIsAlert(false);
      return;
    }

    const url = buildPasswordRecoveryWhatsappUrl(adminWhatsappE164, { email, company });
    if (!url) {
      setNoticeIsAlert(true);
      setNotice('O contato administrativo pelo WhatsApp ainda não está configurado.');
      return;
    }

    setNoticeIsAlert(false);
    setNotice(
      'A solicitação foi preparada no WhatsApp. O administrador confere o cadastro no painel antes de redefinir a senha.',
    );
    setWhatsappUrl(url);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <ThemeProvider branding={themeBranding}>
      <div className={styles.shell}>
        <div className={styles.atmosphere} aria-hidden="true" />
        <div className={styles.gridOverlay} aria-hidden="true" />
        <div className={styles.accentWash} aria-hidden="true" />
        <main className={styles.layout}>
          <section className={styles.brandColumn} aria-label="Experiência da marca">
            <div className={styles.brandInner}>
              <div className={styles.brandLockup}>
                <div className={styles.logoRow}>
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
              </div>
            </div>
          </section>

          <section className={styles.authColumn} aria-label="Recuperar acesso">
            <Card variant="elevated" className={styles.authCard}>
              <Stack gap={6} className={styles.authStack}>
                <Stack gap={3} className={styles.authHeader} align="center">
                  <div className={styles.authLogoWrap}>
                    <PlatformBrandMark
                      size={72}
                      variant="logo"
                      logoUrl={brandLogoUrl}
                      decorative
                      className={styles.authPrimaryLogo}
                    />
                  </div>
                  <Stack gap={2} className={styles.authIntro} align="center">
                    <Typography as="h1" variant="heading" className={styles.authTitle}>
                      Recuperar acesso
                    </Typography>
                    <Typography variant="body" className={cx(styles.authSupport, recoveryStyles.lead)}>
                      Informe seus dados para solicitar ao administrador a redefinição da sua senha.
                    </Typography>
                  </Stack>
                </Stack>

                <Divider />

                <form className={styles.form} onSubmit={handleSubmit} noValidate>
                  <Stack gap={4}>
                    {notice ? (
                      <Typography
                        as="p"
                        variant="caption"
                        className={noticeIsAlert ? styles.formError : recoveryStyles.notice}
                        role={noticeIsAlert ? 'alert' : 'status'}
                      >
                        {notice}
                      </Typography>
                    ) : null}

                    <FormField label="E-mail de acesso" error={fieldErrors.email} required>
                      <Input
                        type="email"
                        name="email"
                        autoComplete="username"
                        placeholder="voce@empresa.com"
                        inputMode="email"
                        value={email}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          if (fieldErrors.email) {
                            setFieldErrors((current) => ({ ...current, email: undefined }));
                          }
                        }}
                      />
                    </FormField>

                    <FormField label="Empresa" error={fieldErrors.company} required>
                      <Input
                        type="text"
                        name="company"
                        autoComplete="organization"
                        placeholder="Nome da empresa"
                        value={company}
                        onChange={(event) => {
                          setCompany(event.target.value);
                          if (fieldErrors.company) {
                            setFieldErrors((current) => ({ ...current, company: undefined }));
                          }
                        }}
                      />
                    </FormField>

                    <Stack gap={3}>
                      <Button type="submit" variant="primary" size="lg" className={styles.submit}>
                        Solicitar redefinição pelo WhatsApp
                      </Button>
                      {whatsappUrl ? (
                        <a
                          className={cx(
                            buttonStyles.root,
                            buttonStyles.ghost,
                            buttonStyles.sm,
                            recoveryStyles.fallbackLink,
                          )}
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir WhatsApp
                        </a>
                      ) : null}
                      <a
                        className={cx(buttonStyles.root, buttonStyles.ghost, buttonStyles.sm, styles.forgot)}
                        href="/login"
                      >
                        Voltar para o login
                      </a>
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
