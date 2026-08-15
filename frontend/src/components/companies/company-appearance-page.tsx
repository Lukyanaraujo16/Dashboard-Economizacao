'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';

import { useAuth } from '../../auth';
import { darkColorTokens } from '../../theme/dark/colors';
import { lightColorTokens } from '../../theme/light/colors';
import {
  deleteLogo,
  getBranding,
  replaceBrandingColors,
  resetBranding,
  uploadLogo,
} from '../../services/admin/branding';
import {
  ALLOWED_LOGO_ACCEPT,
  ALLOWED_LOGO_MIME_TYPES,
  BrandingRequestError,
  MAX_LOGO_BYTES,
  type BrandColorOverrides,
  type BrandColorToken,
  type CompanyBranding,
} from '../../services/admin/branding.types';
import { getCompany } from '../../services/admin/companies';
import { CompaniesRequestError, type Company } from '../../services/admin/companies.types';
import type { ResolvedColorScheme } from '../../theme/types/theme';
import { StateWrapper } from '../financial/state-wrapper';
import { PlatformBrandMark } from '../../login/platform-brand-mark';
import { Button, FormField, Input, Typography } from '../ui';
import { CompanyBrandingPreview } from './company-branding-preview';
import { CompanySectionNav } from './company-section-nav';
import { meetsWcagAaNormalText, normalizeHexInput } from './contrast';
import styles from './companies.module.css';

type CompanyAppearancePageProps = {
  readonly companyId: string;
};

type ColorFieldConfig = {
  readonly token: BrandColorToken;
  readonly label: string;
  readonly help: string;
};

const COLOR_FIELDS: readonly ColorFieldConfig[] = [
  {
    token: 'primary',
    label: 'Cor principal',
    help: 'Usada em botões e destaques principais da interface.',
  },
  {
    token: 'onPrimary',
    label: 'Texto sobre a cor principal',
    help: 'Texto e ícones exibidos sobre a cor principal.',
  },
  {
    token: 'secondary',
    label: 'Cor secundária',
    help: 'Complementa a identidade em elementos de apoio.',
  },
  {
    token: 'accent',
    label: 'Cor de destaque',
    help: 'Usada com parcimônia para chamar atenção a valores e ênfases.',
  },
] as const;

function emptyOverrides(): BrandColorOverrides {
  return {};
}

function cloneOverrides(value: BrandColorOverrides | null | undefined): BrandColorOverrides {
  if (!value) {
    return emptyOverrides();
  }
  return { ...value };
}

function platformFallback(scheme: ResolvedColorScheme, token: BrandColorToken): string {
  return scheme === 'dark' ? darkColorTokens[token] : lightColorTokens[token];
}

function resolvedPair(
  overrides: BrandColorOverrides,
  scheme: ResolvedColorScheme,
): { primary: string; onPrimary: string } {
  return {
    primary: overrides.primary ?? platformFallback(scheme, 'primary'),
    onPrimary: overrides.onPrimary ?? platformFallback(scheme, 'onPrimary'),
  };
}

function isAllowedLogoFile(file: File): boolean {
  return (ALLOWED_LOGO_MIME_TYPES as readonly string[]).includes(file.type);
}

export function CompanyAppearancePage({ companyId }: CompanyAppearancePageProps) {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const refreshSessionRef = useRef(refreshSession);
  const routerRef = useRef(router);
  refreshSessionRef.current = refreshSession;
  routerRef.current = router;

  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [company, setCompany] = useState<Company | null>(null);
  const [appearance, setAppearance] = useState<CompanyBranding | null>(null);
  const [lightDraft, setLightDraft] = useState<BrandColorOverrides>(emptyOverrides());
  const [darkDraft, setDarkDraft] = useState<BrandColorOverrides>(emptyOverrides());
  const [editScheme, setEditScheme] = useState<ResolvedColorScheme>('light');
  const [previewScheme, setPreviewScheme] = useState<ResolvedColorScheme>('light');
  const [loadState, setLoadState] = useState<
    'loading' | 'ready' | 'error' | 'not_found' | 'forbidden'
  >('loading');
  const [savingColors, setSavingColors] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmRemoveLogo, setConfirmRemoveLogo] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<BrandColorToken, string>>>({});

  function revokeLocalPreview() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setLocalPreviewUrl(null);
  }

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setFormError(null);
      try {
        const [companyResult, brandingResult] = await Promise.all([
          getCompany(companyId),
          getBranding(companyId),
        ]);
        if (cancelled) return;
        setCompany(companyResult);
        setAppearance(brandingResult);
        setLightDraft(cloneOverrides(brandingResult.light));
        setDarkDraft(cloneOverrides(brandingResult.dark));
        setLoadState('ready');
      } catch (error) {
        if (cancelled) return;
        if (error instanceof CompaniesRequestError || error instanceof BrandingRequestError) {
          if (error.kind === 'unauthenticated') {
            await refreshSessionRef.current().catch(() => undefined);
            routerRef.current.replace('/login');
            return;
          }
          if (error.kind === 'not_found') {
            setLoadState('not_found');
            return;
          }
          if (error.kind === 'forbidden') {
            setLoadState('forbidden');
            return;
          }
        }
        setLoadState('error');
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const activeDraft = editScheme === 'light' ? lightDraft : darkDraft;
  const setActiveDraft = editScheme === 'light' ? setLightDraft : setDarkDraft;

  const lightPair = resolvedPair(lightDraft, 'light');
  const darkPair = resolvedPair(darkDraft, 'dark');
  const lightContrastOk = meetsWcagAaNormalText(lightPair.onPrimary, lightPair.primary);
  const darkContrastOk = meetsWcagAaNormalText(darkPair.onPrimary, darkPair.primary);
  const contrastBlocked = !lightContrastOk || !darkContrastOk;

  function updateToken(token: BrandColorToken, rawValue: string) {
    setSuccessMessage(null);
    setFormError(null);
    const nextValue = rawValue.trim();
    if (nextValue.length === 0) {
      setActiveDraft((current) => {
        const next = { ...current };
        delete next[token];
        return next;
      });
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[token];
        return next;
      });
      return;
    }

    const normalized = normalizeHexInput(nextValue.startsWith('#') ? nextValue : `#${nextValue}`);
    if (!normalized) {
      setFieldErrors((current) => ({
        ...current,
        [token]: 'Use o formato #RRGGBB.',
      }));
      setActiveDraft((current) => ({ ...current, [token]: nextValue.toUpperCase() }));
      return;
    }

    setFieldErrors((current) => {
      const next = { ...current };
      delete next[token];
      return next;
    });
    setActiveDraft((current) => ({ ...current, [token]: normalized }));
  }

  function clearToken(token: BrandColorToken) {
    setActiveDraft((current) => {
      const next = { ...current };
      delete next[token];
      return next;
    });
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[token];
      return next;
    });
  }

  async function handleSaveColors() {
    if (savingColors || contrastBlocked || Object.keys(fieldErrors).length > 0) {
      return;
    }

    setSavingColors(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const light = Object.keys(lightDraft).length > 0 ? lightDraft : null;
      const dark = Object.keys(darkDraft).length > 0 ? darkDraft : null;
      const updated = await replaceBrandingColors(companyId, { light, dark });
      setAppearance(updated);
      setLightDraft(cloneOverrides(updated.light));
      setDarkDraft(cloneOverrides(updated.dark));
      setSuccessMessage('Cores da aparência salvas.');
    } catch (error) {
      if (error instanceof BrandingRequestError) {
        if (error.kind === 'unauthenticated') {
          await refreshSession().catch(() => undefined);
          router.replace('/login');
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Não foi possível salvar as cores. Tente novamente.');
    } finally {
      setSavingColors(false);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFormError(null);
    setSuccessMessage(null);
    revokeLocalPreview();
    setSelectedFileName(null);

    if (!file) {
      return;
    }

    if (!isAllowedLogoFile(file)) {
      setFormError('Envie um arquivo PNG, JPEG ou WebP.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      setFormError('O arquivo excede o tamanho máximo de 2 MB.');
      event.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;
    setLocalPreviewUrl(objectUrl);
    setSelectedFileName(`${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
  }

  async function handleUploadLogo() {
    const file = fileInputRef.current?.files?.[0];
    if (!file || uploadingLogo) {
      if (!file) {
        setFormError('Selecione um arquivo de logo para enviar.');
      }
      return;
    }

    setUploadingLogo(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const updated = await uploadLogo(companyId, file);
      setAppearance(updated);
      revokeLocalPreview();
      setSelectedFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setSuccessMessage('Logo atualizada.');
    } catch (error) {
      if (error instanceof BrandingRequestError) {
        if (error.kind === 'unauthenticated') {
          await refreshSession().catch(() => undefined);
          router.replace('/login');
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Não foi possível enviar a logo. Tente novamente.');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleRemoveLogo() {
    if (removingLogo) return;
    setRemovingLogo(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      await deleteLogo(companyId);
      const refreshed = await getBranding(companyId);
      setAppearance(refreshed);
      setConfirmRemoveLogo(false);
      setSuccessMessage('Logo removida. As cores da empresa foram mantidas.');
    } catch (error) {
      if (error instanceof BrandingRequestError) {
        if (error.kind === 'unauthenticated') {
          await refreshSession().catch(() => undefined);
          router.replace('/login');
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Não foi possível remover a logo. Tente novamente.');
    } finally {
      setRemovingLogo(false);
    }
  }

  async function handleResetAppearance() {
    if (resetting) return;
    setResetting(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      await resetBranding(companyId);
      const refreshed = await getBranding(companyId);
      setAppearance(refreshed);
      setLightDraft(cloneOverrides(refreshed.light));
      setDarkDraft(cloneOverrides(refreshed.dark));
      setConfirmReset(false);
      setSuccessMessage('Aparência restaurada para o padrão da plataforma.');
    } catch (error) {
      if (error instanceof BrandingRequestError) {
        if (error.kind === 'unauthenticated') {
          await refreshSession().catch(() => undefined);
          router.replace('/login');
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Não foi possível restaurar o padrão. Tente novamente.');
    } finally {
      setResetting(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <StateWrapper
        state="loading"
        loadingLabel="Carregando aparência"
        align="start"
        className=""
      />
    );
  }

  if (loadState === 'not_found') {
    return (
      <StateWrapper
        state="error"
        errorMessage="Empresa não encontrada."
        onRetry={() => router.push('/empresas')}
        align="start"
      />
    );
  }

  if (loadState === 'forbidden') {
    return (
      <StateWrapper
        state="error"
        errorMessage="Você não tem permissão para editar a aparência desta empresa."
        onRetry={() => router.push('/empresas')}
        align="start"
      />
    );
  }

  if (loadState === 'error' || !company || !appearance) {
    return (
      <StateWrapper
        state="error"
        errorMessage="Não foi possível carregar a aparência da empresa."
        onRetry={() => router.refresh()}
        align="start"
      />
    );
  }

  const displayedLogoUrl = localPreviewUrl ?? appearance.logoUrl;

  return (
    <CompanySectionNav companyId={companyId} companyName={company.displayName}>
      <div className={styles.appearancePage}>
        <div className={styles.appearanceIntro}>
          <Typography as="p" variant="body" className={styles.formDescription}>
            Personalize a identidade visual desta empresa. Campos vazios usam o padrão da
            plataforma.
          </Typography>
        </div>

        <div className={styles.appearanceLayout} data-testid="appearance-layout">
          <div className={styles.appearanceEditor}>
            <section className={styles.appearanceSection} aria-labelledby="logo-section-title">
              <div className={styles.appearanceSectionHeader}>
                <Typography as="h2" variant="label" id="logo-section-title">
                  Logo da empresa
                </Typography>
                <Typography as="p" variant="caption" className={styles.appearanceHelp}>
                  PNG, JPEG ou WebP · máximo 2 MB. SVG não é aceito.
                </Typography>
              </div>

              <div className={styles.appearanceLogoDropzone}>
                <div className={styles.appearanceLogoMarkFrame}>
                  <PlatformBrandMark
                    size={56}
                    logoUrl={displayedLogoUrl}
                    alt={company.displayName}
                    className={styles.appearanceLogoMark}
                  />
                </div>
                <div className={styles.appearanceLogoActions}>
                  <label className={styles.appearanceFileLabel} htmlFor={fileInputId}>
                    Escolher imagem
                  </label>
                  <input
                    ref={fileInputRef}
                    id={fileInputId}
                    type="file"
                    accept={ALLOWED_LOGO_ACCEPT}
                    className={styles.appearanceFileInput}
                    onChange={handleFileChange}
                  />
                  {selectedFileName ? (
                    <Typography as="p" variant="caption" className={styles.appearanceSelectedFile}>
                      {selectedFileName}
                    </Typography>
                  ) : (
                    <Typography as="p" variant="caption" className={styles.appearanceHelp}>
                      Selecione uma imagem para enviar ou substituir a logo.
                    </Typography>
                  )}
                  <div className={styles.appearanceLogoSubmit}>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={uploadingLogo}
                      onClick={() => void handleUploadLogo()}
                    >
                      {appearance.logoUrl ? 'Substituir logo' : 'Enviar logo'}
                    </Button>
                    {appearance.logoUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={uploadingLogo || removingLogo}
                        onClick={() => setConfirmRemoveLogo(true)}
                      >
                        Remover logo
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {confirmRemoveLogo ? (
                <div
                  className={styles.appearanceConfirm}
                  role="region"
                  aria-label="Confirmar remoção"
                >
                  <Typography as="p" variant="body">
                    Remover a logo? As cores personalizadas serão mantidas.
                  </Typography>
                  <div className={styles.formActions}>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={removingLogo}
                      onClick={() => void handleRemoveLogo()}
                    >
                      Confirmar remoção
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={removingLogo}
                      onClick={() => setConfirmRemoveLogo(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className={styles.appearanceSection} aria-labelledby="colors-section-title">
              <div className={styles.appearanceSectionHeader}>
                <Typography as="h2" variant="label" id="colors-section-title">
                  Cores
                </Typography>
                <Typography as="p" variant="caption" className={styles.appearanceHelp}>
                  Defina as cores da empresa para cada tema. A prévia ao lado é independente.
                </Typography>
              </div>

              <div className={styles.appearanceSchemeBlock}>
                <Typography as="p" variant="caption" className={styles.appearanceSchemeLabel}>
                  Editar cores
                </Typography>
                <div
                  className={styles.appearanceSchemeTabs}
                  role="tablist"
                  aria-label="Editar cores"
                >
                  {(['light', 'dark'] as const).map((scheme) => (
                    <button
                      key={scheme}
                      type="button"
                      role="tab"
                      aria-selected={editScheme === scheme}
                      className={styles.filterButton}
                      data-active={editScheme === scheme ? 'true' : 'false'}
                      onClick={() => setEditScheme(scheme)}
                    >
                      {scheme === 'light' ? 'Claro' : 'Escuro'}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.appearanceColorFields}>
                {COLOR_FIELDS.map((field) => {
                  const value = activeDraft[field.token] ?? '';
                  const fallback = platformFallback(editScheme, field.token);
                  const swatch = value || fallback;
                  const colorInputValue = normalizeHexInput(swatch) ?? fallback;

                  return (
                    <div key={field.token} className={styles.appearanceColorField}>
                      <div className={styles.appearanceColorControls}>
                        <input
                          type="color"
                          aria-label={`${field.label} — seletor`}
                          value={colorInputValue}
                          className={styles.appearanceSwatch}
                          onChange={(event) => updateToken(field.token, event.target.value)}
                        />
                        <FormField
                          label={field.label}
                          htmlFor={`brand-${editScheme}-${field.token}`}
                          hint={field.help}
                          error={fieldErrors[field.token]}
                        >
                          <Input
                            id={`brand-${editScheme}-${field.token}`}
                            name={field.token}
                            value={value}
                            placeholder={fallback}
                            autoComplete="off"
                            spellCheck={false}
                            aria-label={`${field.label} — valor hexadecimal`}
                            onChange={(event) => updateToken(field.token, event.target.value)}
                          />
                        </FormField>
                        {value ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => clearToken(field.token)}
                          >
                            Usar padrão
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!lightContrastOk ? (
                <Typography as="p" variant="body" className={styles.formError} role="alert">
                  Tema claro: essa combinação não oferece contraste suficiente para leitura.
                </Typography>
              ) : null}
              {!darkContrastOk ? (
                <Typography as="p" variant="body" className={styles.formError} role="alert">
                  Tema escuro: essa combinação não oferece contraste suficiente para leitura.
                </Typography>
              ) : null}

              <div className={styles.formActions}>
                <Button
                  type="button"
                  variant="primary"
                  loading={savingColors}
                  disabled={contrastBlocked || Object.keys(fieldErrors).length > 0}
                  onClick={() => void handleSaveColors()}
                >
                  Salvar cores
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={savingColors || resetting}
                  onClick={() => setConfirmReset(true)}
                >
                  Restaurar padrão
                </Button>
              </div>

              {confirmReset ? (
                <div
                  className={styles.appearanceConfirm}
                  role="region"
                  aria-label="Confirmar restauração"
                >
                  <Typography as="p" variant="body">
                    Restaurar cores e logo para o padrão da plataforma? Esta ação remove a
                    personalização desta empresa.
                  </Typography>
                  <div className={styles.formActions}>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={resetting}
                      onClick={() => void handleResetAppearance()}
                    >
                      Confirmar restauração
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={resetting}
                      onClick={() => setConfirmReset(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            {formError ? (
              <Typography as="p" variant="body" className={styles.formError} role="alert">
                {formError}
              </Typography>
            ) : null}
            {successMessage ? (
              <Typography as="p" variant="body" className={styles.appearanceSuccess} role="status">
                {successMessage}
              </Typography>
            ) : null}
          </div>

          <aside className={styles.appearancePreviewColumn}>
            <div className={styles.appearancePreviewShell}>
              <div className={styles.appearancePreviewHeader}>
                <Typography as="p" variant="caption" className={styles.appearanceSchemeLabel}>
                  Prévia
                </Typography>
                <div className={styles.appearanceSchemeTabs} role="tablist" aria-label="Prévia">
                  {(['light', 'dark'] as const).map((scheme) => (
                    <button
                      key={scheme}
                      type="button"
                      role="tab"
                      aria-selected={previewScheme === scheme}
                      className={styles.filterButton}
                      data-active={previewScheme === scheme ? 'true' : 'false'}
                      onClick={() => setPreviewScheme(scheme)}
                    >
                      {scheme === 'light' ? 'Claro' : 'Escuro'}
                    </button>
                  ))}
                </div>
              </div>
              <CompanyBrandingPreview
                companyName={company.displayName}
                logoUrl={displayedLogoUrl}
                colorScheme={previewScheme}
                light={Object.keys(lightDraft).length > 0 ? lightDraft : null}
                dark={Object.keys(darkDraft).length > 0 ? darkDraft : null}
              />
            </div>
          </aside>
        </div>
      </div>
    </CompanySectionNav>
  );
}
