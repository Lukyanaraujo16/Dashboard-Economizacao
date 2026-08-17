'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';

import { useAuth } from '../../auth';
import { darkColorTokens } from '../../theme/dark/colors';
import { lightColorTokens } from '../../theme/light/colors';
import { PlatformBrandMark } from '../../login/platform-brand-mark';
import {
  getPlatformBranding,
  resetPlatformBranding,
  savePlatformAppearanceChanges,
  type PlatformAppearanceSaveChanges,
  type PlatformAppearanceSaveResult,
} from '../../services/admin/platform-branding';
import {
  ALLOWED_PLATFORM_ASSET_ACCEPT,
  ALLOWED_PLATFORM_ASSET_MIME_TYPES,
  DEFAULT_PLATFORM_BRAND_NAME,
  MAX_PLATFORM_FAVICON_BYTES,
  MAX_PLATFORM_LOGO_BYTES,
  type PlatformBranding,
} from '../../services/admin/platform-branding.types';
import {
  BrandingRequestError,
  type BrandColorOverrides,
  type BrandColorToken,
} from '../../services/admin/branding.types';
import { useRuntimePlatformBranding, useRuntimeTheme } from '../../theme';
import type { ResolvedColorScheme } from '../../theme/types/theme';
import { meetsWcagAaNormalText, normalizeHexInput } from '../companies/contrast';
import companyStyles from '../companies/companies.module.css';
import { StateWrapper } from '../financial/state-wrapper';
import { Button, FormField, Input, Typography } from '../ui';
import { PlatformBrandingPreview } from './platform-branding-preview';
import styles from './settings.module.css';

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

function overridesEqual(
  a: BrandColorOverrides | null | undefined,
  b: BrandColorOverrides | null | undefined,
): boolean {
  const left = a ?? emptyOverrides();
  const right = b ?? emptyOverrides();
  const leftKeys = Object.keys(left) as BrandColorToken[];
  const rightKeys = Object.keys(right) as BrandColorToken[];
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
}

function toPersistedOverrides(draft: BrandColorOverrides): BrandColorOverrides | null {
  return Object.keys(draft).length > 0 ? draft : null;
}

function baselineName(appearance: PlatformBranding): string {
  return appearance.name?.trim() || DEFAULT_PLATFORM_BRAND_NAME;
}

function normalizeNameInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
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

function isAllowedAssetFile(file: File): boolean {
  return (ALLOWED_PLATFORM_ASSET_MIME_TYPES as readonly string[]).includes(file.type);
}

function partialSaveMessage(result: PlatformAppearanceSaveResult): string {
  const base = result.error?.message ?? 'Não foi possível concluir o salvamento. Tente novamente.';
  if (result.completed.length > 0) {
    return `Parte das alterações foi salva, mas ocorreu um erro: ${base}`;
  }
  return base;
}

export function PlatformAppearancePage() {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const { refresh: refreshPlatformBranding } = useRuntimePlatformBranding();
  const { refreshBranding: refreshSessionBranding } = useRuntimeTheme();
  const refreshSessionRef = useRef(refreshSession);
  const routerRef = useRef(router);
  refreshSessionRef.current = refreshSession;
  routerRef.current = router;

  const logoInputId = useId();
  const faviconInputId = useId();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const logoObjectUrlRef = useRef<string | null>(null);
  const faviconObjectUrlRef = useRef<string | null>(null);
  const pendingLogoFileRef = useRef<File | null>(null);
  const pendingFaviconFileRef = useRef<File | null>(null);

  const [appearance, setAppearance] = useState<PlatformBranding | null>(null);
  const [nameDraft, setNameDraft] = useState(DEFAULT_PLATFORM_BRAND_NAME);
  const [lightDraft, setLightDraft] = useState<BrandColorOverrides>(emptyOverrides());
  const [darkDraft, setDarkDraft] = useState<BrandColorOverrides>(emptyOverrides());
  const [editScheme, setEditScheme] = useState<ResolvedColorScheme>('light');
  const [previewScheme, setPreviewScheme] = useState<ResolvedColorScheme>('light');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'forbidden'>(
    'loading',
  );
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmRemoveLogo, setConfirmRemoveLogo] = useState(false);
  const [confirmRemoveFavicon, setConfirmRemoveFavicon] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [logoRemovalPending, setLogoRemovalPending] = useState(false);
  const [faviconRemovalPending, setFaviconRemovalPending] = useState(false);
  const [pendingLogoSelected, setPendingLogoSelected] = useState(false);
  const [pendingFaviconSelected, setPendingFaviconSelected] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedLogoName, setSelectedLogoName] = useState<string | null>(null);
  const [selectedFaviconName, setSelectedFaviconName] = useState<string | null>(null);
  const [localLogoUrl, setLocalLogoUrl] = useState<string | null>(null);
  const [localFaviconUrl, setLocalFaviconUrl] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<BrandColorToken, string>>>({});

  function revokeLogoPreview() {
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = null;
    }
    setLocalLogoUrl(null);
  }

  function revokeFaviconPreview() {
    if (faviconObjectUrlRef.current) {
      URL.revokeObjectURL(faviconObjectUrlRef.current);
      faviconObjectUrlRef.current = null;
    }
    setLocalFaviconUrl(null);
  }

  function clearPendingLogoSelection() {
    pendingLogoFileRef.current = null;
    setPendingLogoSelected(false);
    setSelectedLogoName(null);
    revokeLogoPreview();
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  }

  function clearPendingFaviconSelection() {
    pendingFaviconFileRef.current = null;
    setPendingFaviconSelected(false);
    setSelectedFaviconName(null);
    revokeFaviconPreview();
    if (faviconInputRef.current) {
      faviconInputRef.current.value = '';
    }
  }

  function applyBrandingState(next: PlatformBranding) {
    setAppearance(next);
    setNameDraft(next.name?.trim() || DEFAULT_PLATFORM_BRAND_NAME);
    setLightDraft(cloneOverrides(next.light));
    setDarkDraft(cloneOverrides(next.dark));
  }

  function clearCompletedPendingAssets(result: PlatformAppearanceSaveResult) {
    if (result.completed.includes('logo')) {
      clearPendingLogoSelection();
      setLogoRemovalPending(false);
      setConfirmRemoveLogo(false);
    }
    if (result.completed.includes('favicon')) {
      clearPendingFaviconSelection();
      setFaviconRemovalPending(false);
      setConfirmRemoveFavicon(false);
    }
  }

  useEffect(() => {
    return () => {
      if (logoObjectUrlRef.current) {
        URL.revokeObjectURL(logoObjectUrlRef.current);
      }
      if (faviconObjectUrlRef.current) {
        URL.revokeObjectURL(faviconObjectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState('loading');
      setFormError(null);
      try {
        const result = await getPlatformBranding();
        if (cancelled) return;
        applyBrandingState(result);
        setLoadState('ready');
      } catch (error) {
        if (cancelled) return;
        if (error instanceof BrandingRequestError) {
          if (error.kind === 'unauthenticated') {
            await refreshSessionRef.current().catch(() => undefined);
            routerRef.current.replace('/login');
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
  }, []);

  const activeDraft = editScheme === 'light' ? lightDraft : darkDraft;
  const setActiveDraft = editScheme === 'light' ? setLightDraft : setDarkDraft;

  const lightPair = resolvedPair(lightDraft, 'light');
  const darkPair = resolvedPair(darkDraft, 'dark');
  const lightContrastOk = meetsWcagAaNormalText(lightPair.onPrimary, lightPair.primary);
  const darkContrastOk = meetsWcagAaNormalText(darkPair.onPrimary, darkPair.primary);
  const contrastBlocked = !lightContrastOk || !darkContrastOk;

  const displayName = normalizeNameInput(nameDraft) || DEFAULT_PLATFORM_BRAND_NAME;

  const nameDirty =
    appearance !== null && normalizeNameInput(nameDraft) !== baselineName(appearance);
  const lightDirty = appearance !== null && !overridesEqual(lightDraft, appearance.light);
  const darkDirty = appearance !== null && !overridesEqual(darkDraft, appearance.dark);
  const isDirty =
    nameDirty ||
    lightDirty ||
    darkDirty ||
    pendingLogoSelected ||
    pendingFaviconSelected ||
    logoRemovalPending ||
    faviconRemovalPending;

  const showLogoRemove =
    (Boolean(appearance?.logoUrl) || pendingLogoSelected) && !logoRemovalPending;
  const showFaviconRemove =
    (Boolean(appearance?.faviconUrl) || pendingFaviconSelected) && !faviconRemovalPending;

  function markDirtyUi() {
    setSuccessMessage(null);
    setFormError(null);
  }

  function updateToken(token: BrandColorToken, rawValue: string) {
    markDirtyUi();
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
    markDirtyUi();
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

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    markDirtyUi();
    revokeLogoPreview();
    pendingLogoFileRef.current = null;
    setPendingLogoSelected(false);
    setSelectedLogoName(null);

    if (!file) {
      return;
    }

    if (!isAllowedAssetFile(file)) {
      setFormError('Envie um arquivo PNG, JPEG ou WebP.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_PLATFORM_LOGO_BYTES) {
      setFormError('O arquivo excede o tamanho máximo de 2 MB.');
      event.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    logoObjectUrlRef.current = objectUrl;
    pendingLogoFileRef.current = file;
    setLocalLogoUrl(objectUrl);
    setPendingLogoSelected(true);
    setLogoRemovalPending(false);
    setConfirmRemoveLogo(false);
    setSelectedLogoName(`${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
  }

  function handleFaviconFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    markDirtyUi();
    revokeFaviconPreview();
    pendingFaviconFileRef.current = null;
    setPendingFaviconSelected(false);
    setSelectedFaviconName(null);

    if (!file) {
      return;
    }

    if (!isAllowedAssetFile(file)) {
      setFormError('Envie um arquivo PNG, JPEG ou WebP. ICO e SVG não são aceitos.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_PLATFORM_FAVICON_BYTES) {
      setFormError('O arquivo excede o tamanho máximo de 512 KB.');
      event.target.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    faviconObjectUrlRef.current = objectUrl;
    pendingFaviconFileRef.current = file;
    setLocalFaviconUrl(objectUrl);
    setPendingFaviconSelected(true);
    setFaviconRemovalPending(false);
    setConfirmRemoveFavicon(false);
    setSelectedFaviconName(`${file.name} · ${(file.size / 1024).toFixed(0)} KB`);
  }

  function confirmPendingLogoRemoval() {
    markDirtyUi();
    clearPendingLogoSelection();
    if (appearance?.logoUrl) {
      setLogoRemovalPending(true);
    }
    setConfirmRemoveLogo(false);
  }

  function confirmPendingFaviconRemoval() {
    markDirtyUi();
    clearPendingFaviconSelection();
    if (appearance?.faviconUrl) {
      setFaviconRemovalPending(true);
    }
    setConfirmRemoveFavicon(false);
  }

  function undoLogoRemovalPending() {
    markDirtyUi();
    setLogoRemovalPending(false);
  }

  function undoFaviconRemovalPending() {
    markDirtyUi();
    setFaviconRemovalPending(false);
  }

  async function handleSaveChanges() {
    if (
      saving ||
      !appearance ||
      !isDirty ||
      contrastBlocked ||
      Object.keys(fieldErrors).length > 0
    ) {
      return;
    }

    const normalizedName = normalizeNameInput(nameDraft);
    const needsNameForBootstrap =
      (lightDirty || darkDirty) && appearance.createdAt === null && appearance.name === null;

    if ((nameDirty || needsNameForBootstrap) && !normalizedName) {
      setNameError('Informe o nome da plataforma.');
      return;
    }

    setSaving(true);
    setNameError(null);
    setFormError(null);
    setSuccessMessage(null);

    const changes: PlatformAppearanceSaveChanges = {
      ...(nameDirty || needsNameForBootstrap ? { name: normalizedName } : {}),
      ...(lightDirty ? { light: toPersistedOverrides(lightDraft) } : {}),
      ...(darkDirty ? { dark: toPersistedOverrides(darkDraft) } : {}),
      ...(pendingLogoFileRef.current ? { logoFile: pendingLogoFileRef.current } : {}),
      ...(!pendingLogoFileRef.current && logoRemovalPending ? { removeLogo: true } : {}),
      ...(pendingFaviconFileRef.current ? { faviconFile: pendingFaviconFileRef.current } : {}),
      ...(!pendingFaviconFileRef.current && faviconRemovalPending ? { removeFavicon: true } : {}),
    };

    try {
      const result = await savePlatformAppearanceChanges(changes);
      applyBrandingState(result.branding);
      clearCompletedPendingAssets(result);

      if (result.ok) {
        setSuccessMessage('Alterações salvas.');
        await refreshPlatformBranding();
        await refreshSessionBranding();
        return;
      }

      if (result.error?.kind === 'unauthenticated') {
        await refreshSession().catch(() => undefined);
        router.replace('/login');
        return;
      }

      setFormError(partialSaveMessage(result));
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
      setFormError('Não foi possível salvar as alterações. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetAppearance() {
    if (resetting) return;
    setResetting(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      await resetPlatformBranding();
      const refreshed = await getPlatformBranding();
      applyBrandingState(refreshed);
      clearPendingLogoSelection();
      clearPendingFaviconSelection();
      setLogoRemovalPending(false);
      setFaviconRemovalPending(false);
      setConfirmRemoveLogo(false);
      setConfirmRemoveFavicon(false);
      setConfirmReset(false);
      setSuccessMessage('Aparência da plataforma restaurada para o padrão.');
      await refreshPlatformBranding();
      await refreshSessionBranding();
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
        loadingLabel="Carregando aparência da plataforma"
        align="start"
        className=""
      />
    );
  }

  if (loadState === 'forbidden') {
    return (
      <StateWrapper
        state="error"
        errorMessage="Você não tem permissão para editar a aparência da plataforma."
        onRetry={() => router.push('/')}
        align="start"
      />
    );
  }

  if (loadState === 'error' || !appearance) {
    return (
      <StateWrapper
        state="error"
        errorMessage="Não foi possível carregar a aparência da plataforma."
        onRetry={() => router.refresh()}
        align="start"
      />
    );
  }

  const displayedLogoUrl = logoRemovalPending ? null : (localLogoUrl ?? appearance.logoUrl);
  const displayedFaviconUrl = faviconRemovalPending
    ? null
    : (localFaviconUrl ?? appearance.faviconUrl);

  const saveDisabled =
    !isDirty || saving || resetting || contrastBlocked || Object.keys(fieldErrors).length > 0;

  return (
    <div className={`${companyStyles.appearancePage} ${styles.appearanceCompact}`}>
      <div className={`${companyStyles.appearanceIntro} ${styles.appearanceIntroCompact}`}>
        <Typography as="h1" variant="heading">
          Aparência
        </Typography>
        <Typography as="p" variant="body" className={companyStyles.formDescription}>
          Defina a identidade visual global da plataforma. Campos vazios usam o padrão do sistema.
        </Typography>
        <Typography as="p" variant="caption" className={styles.impactNote}>
          As alterações desta página afetam a identidade global da plataforma.
        </Typography>
      </div>

      <div className={companyStyles.appearanceLayout} data-testid="platform-appearance-layout">
        <div className={companyStyles.appearanceEditor}>
          <div className={styles.groupBlock}>
            <Typography as="h2" variant="title" className={styles.groupTitle} id="identity-group">
              Identidade
            </Typography>

            <section
              className={`${companyStyles.appearanceSection} ${styles.compactSection}`}
              aria-labelledby="name-section-title"
            >
              <div className={companyStyles.appearanceSectionHeader}>
                <Typography as="h3" variant="label" id="name-section-title">
                  Nome da plataforma
                </Typography>
                <Typography as="p" variant="caption" className={companyStyles.appearanceHelp}>
                  Exibido na interface administrativa e, no futuro, na tela de login.
                </Typography>
              </div>
              <FormField
                label="Nome da plataforma"
                htmlFor="platform-brand-name"
                hint="Exemplo: Economização"
                error={nameError ?? undefined}
              >
                <Input
                  id="platform-brand-name"
                  name="name"
                  value={nameDraft}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    setNameError(null);
                    markDirtyUi();
                    setNameDraft(event.target.value);
                  }}
                />
              </FormField>
            </section>

            <section
              className={`${companyStyles.appearanceSection} ${styles.compactSection}`}
              aria-labelledby="logo-section-title"
            >
              <div className={companyStyles.appearanceSectionHeader}>
                <Typography as="h3" variant="label" id="logo-section-title">
                  Logo da plataforma
                </Typography>
                <Typography as="p" variant="caption" className={companyStyles.appearanceHelp}>
                  PNG, JPEG ou WebP · máximo 2 MB. SVG não é aceito.
                </Typography>
                <Typography
                  as="p"
                  variant="caption"
                  className={styles.assetGuidance}
                  data-testid="platform-logo-guidance"
                >
                  Para melhor resultado, use uma logo horizontal (proporção entre 3:1 e 4:1) ou uma
                  marca quadrada (1:1). A imagem é ajustada no espaço sem distorção.
                </Typography>
                <Typography
                  as="p"
                  variant="caption"
                  className={styles.assetGuidanceExamples}
                  data-testid="platform-logo-guidance-examples"
                >
                  Exemplos: 1200×300 ou 1000×300 (horizontal); 512×512 ou 1024×1024 (quadrada). Não
                  é necessário usar exatamente esses tamanhos.
                </Typography>
              </div>

              <div className={companyStyles.appearanceLogoDropzone}>
                <div
                  className={styles.platformLogoFrame}
                  data-testid="platform-logo-frame"
                  data-fit="contain"
                >
                  <PlatformBrandMark
                    size={56}
                    logoUrl={displayedLogoUrl}
                    alt={displayName}
                    className={styles.platformLogoAsset}
                  />
                </div>
                <div className={companyStyles.appearanceLogoActions}>
                  <label className={companyStyles.appearanceFileLabel} htmlFor={logoInputId}>
                    Escolher imagem
                  </label>
                  <input
                    ref={logoInputRef}
                    id={logoInputId}
                    type="file"
                    accept={ALLOWED_PLATFORM_ASSET_ACCEPT}
                    className={companyStyles.appearanceFileInput}
                    onChange={handleLogoFileChange}
                  />
                  {selectedLogoName ? (
                    <Typography
                      as="p"
                      variant="caption"
                      className={companyStyles.appearanceSelectedFile}
                    >
                      {selectedLogoName} · pendente até salvar
                    </Typography>
                  ) : logoRemovalPending ? (
                    <Typography as="p" variant="caption" className={companyStyles.appearanceHelp}>
                      Remoção pendente até salvar as alterações.
                    </Typography>
                  ) : (
                    <Typography as="p" variant="caption" className={companyStyles.appearanceHelp}>
                      Selecione uma imagem. O envio ocorre ao salvar as alterações.
                    </Typography>
                  )}
                  <div className={companyStyles.appearanceLogoSubmit}>
                    {showLogoRemove ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving || resetting}
                        onClick={() => setConfirmRemoveLogo(true)}
                      >
                        Remover logo
                      </Button>
                    ) : null}
                    {logoRemovalPending ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving || resetting}
                        onClick={undoLogoRemovalPending}
                      >
                        Desfazer remoção
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {confirmRemoveLogo ? (
                <div
                  className={companyStyles.appearanceConfirm}
                  role="region"
                  aria-label="Confirmar remoção da logo"
                >
                  <Typography as="p" variant="body">
                    Remover a logo da plataforma? A remoção só será aplicada ao salvar as
                    alterações. Nome, cores e favicon serão mantidos.
                  </Typography>
                  <div className={companyStyles.formActions}>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={confirmPendingLogoRemoval}
                    >
                      Confirmar remoção
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemoveLogo(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            <section
              className={`${companyStyles.appearanceSection} ${styles.compactSection}`}
              aria-labelledby="favicon-section-title"
            >
              <div className={companyStyles.appearanceSectionHeader}>
                <Typography as="h3" variant="label" id="favicon-section-title">
                  Ícone da aba / Favicon
                </Typography>
                <Typography as="p" variant="caption" className={companyStyles.appearanceHelp}>
                  Este ícone aparece na aba do navegador. PNG, JPEG ou WebP · máximo 512 KB. ICO e
                  SVG não são aceitos.
                </Typography>
                <Typography
                  as="p"
                  variant="caption"
                  className={styles.assetGuidance}
                  data-testid="platform-favicon-guidance"
                >
                  Use uma imagem quadrada (1:1), preferencialmente 512×512 px. A imagem é ajustada
                  no espaço sem distorção.
                </Typography>
              </div>

              <div className={companyStyles.appearanceLogoDropzone}>
                <div
                  className={styles.faviconPreview}
                  data-testid="platform-favicon-frame"
                  data-fit="contain"
                  aria-hidden={displayedFaviconUrl ? undefined : true}
                >
                  {displayedFaviconUrl ? (
                    <img src={displayedFaviconUrl} alt="" className={styles.faviconPreviewImg} />
                  ) : (
                    <span className={styles.faviconPlaceholder} />
                  )}
                </div>
                <div className={companyStyles.appearanceLogoActions}>
                  <label className={companyStyles.appearanceFileLabel} htmlFor={faviconInputId}>
                    Escolher imagem
                  </label>
                  <input
                    ref={faviconInputRef}
                    id={faviconInputId}
                    type="file"
                    accept={ALLOWED_PLATFORM_ASSET_ACCEPT}
                    className={companyStyles.appearanceFileInput}
                    onChange={handleFaviconFileChange}
                  />
                  {selectedFaviconName ? (
                    <Typography
                      as="p"
                      variant="caption"
                      className={companyStyles.appearanceSelectedFile}
                    >
                      {selectedFaviconName} · pendente até salvar
                    </Typography>
                  ) : faviconRemovalPending ? (
                    <Typography as="p" variant="caption" className={companyStyles.appearanceHelp}>
                      Remoção pendente até salvar as alterações.
                    </Typography>
                  ) : (
                    <Typography as="p" variant="caption" className={companyStyles.appearanceHelp}>
                      Selecione uma imagem. O envio ocorre ao salvar as alterações.
                    </Typography>
                  )}
                  <div className={companyStyles.appearanceLogoSubmit}>
                    {showFaviconRemove ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving || resetting}
                        onClick={() => setConfirmRemoveFavicon(true)}
                      >
                        Remover ícone
                      </Button>
                    ) : null}
                    {faviconRemovalPending ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving || resetting}
                        onClick={undoFaviconRemovalPending}
                      >
                        Desfazer remoção
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {confirmRemoveFavicon ? (
                <div
                  className={companyStyles.appearanceConfirm}
                  role="region"
                  aria-label="Confirmar remoção do favicon"
                >
                  <Typography as="p" variant="body">
                    Remover o ícone da aba? A remoção só será aplicada ao salvar as alterações.
                    Nome, cores e logo serão mantidos.
                  </Typography>
                  <div className={companyStyles.formActions}>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={confirmPendingFaviconRemoval}
                    >
                      Confirmar remoção
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRemoveFavicon(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <div className={styles.groupBlock}>
            <Typography as="h2" variant="title" className={styles.groupTitle} id="appearance-group">
              Aparência
            </Typography>

            <section
              className={`${companyStyles.appearanceSection} ${styles.compactSection}`}
              aria-labelledby="colors-section-title"
            >
              <div className={companyStyles.appearanceSectionHeader}>
                <Typography as="h3" variant="label" id="colors-section-title">
                  Cores
                </Typography>
                <Typography as="p" variant="caption" className={companyStyles.appearanceHelp}>
                  Defina as cores da plataforma para cada tema. A prévia ao lado é independente.
                </Typography>
              </div>

              <div className={companyStyles.appearanceSchemeBlock}>
                <Typography
                  as="p"
                  variant="caption"
                  className={companyStyles.appearanceSchemeLabel}
                >
                  Editar cores
                </Typography>
                <div
                  className={companyStyles.appearanceSchemeTabs}
                  role="tablist"
                  aria-label="Editar cores"
                >
                  {(['light', 'dark'] as const).map((scheme) => (
                    <button
                      key={scheme}
                      type="button"
                      role="tab"
                      aria-selected={editScheme === scheme}
                      className={companyStyles.filterButton}
                      data-active={editScheme === scheme ? 'true' : 'false'}
                      onClick={() => setEditScheme(scheme)}
                    >
                      {scheme === 'light' ? 'Claro' : 'Escuro'}
                    </button>
                  ))}
                </div>
              </div>

              <div className={companyStyles.appearanceColorFields}>
                {COLOR_FIELDS.map((field) => {
                  const value = activeDraft[field.token] ?? '';
                  const fallback = platformFallback(editScheme, field.token);
                  const swatch = value || fallback;
                  const colorInputValue = normalizeHexInput(swatch) ?? fallback;

                  return (
                    <div key={field.token} className={companyStyles.appearanceColorField}>
                      <div className={companyStyles.appearanceColorControls}>
                        <input
                          type="color"
                          aria-label={`${field.label} — seletor`}
                          value={colorInputValue}
                          className={companyStyles.appearanceSwatch}
                          onChange={(event) => updateToken(field.token, event.target.value)}
                        />
                        <FormField
                          label={field.label}
                          htmlFor={`platform-brand-${editScheme}-${field.token}`}
                          hint={field.help}
                          error={fieldErrors[field.token]}
                        >
                          <Input
                            id={`platform-brand-${editScheme}-${field.token}`}
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
                <Typography as="p" variant="body" className={companyStyles.formError} role="alert">
                  Tema claro: essa combinação não oferece contraste suficiente para leitura.
                </Typography>
              ) : null}
              {!darkContrastOk ? (
                <Typography as="p" variant="body" className={companyStyles.formError} role="alert">
                  Tema escuro: essa combinação não oferece contraste suficiente para leitura.
                </Typography>
              ) : null}
            </section>
          </div>

          <div className={styles.saveBar}>
            <Button
              type="button"
              variant="primary"
              loading={saving}
              disabled={saveDisabled}
              onClick={() => void handleSaveChanges()}
            >
              Salvar alterações
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={saving || resetting}
              onClick={() => setConfirmReset(true)}
            >
              Restaurar padrão
            </Button>
          </div>

          {confirmReset ? (
            <div
              className={companyStyles.appearanceConfirm}
              role="region"
              aria-label="Confirmar restauração"
            >
              <Typography as="p" variant="body">
                Restaurar nome, cores, logo e favicon para o padrão do sistema? Esta ação remove a
                personalização global da plataforma.
              </Typography>
              <div className={companyStyles.formActions}>
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

          {formError ? (
            <Typography as="p" variant="body" className={companyStyles.formError} role="alert">
              {formError}
            </Typography>
          ) : null}
          {successMessage ? (
            <Typography
              as="p"
              variant="body"
              className={companyStyles.appearanceSuccess}
              role="status"
            >
              {successMessage}
            </Typography>
          ) : null}
        </div>

        <aside className={companyStyles.appearancePreviewColumn}>
          <div className={companyStyles.appearancePreviewShell}>
            <div className={companyStyles.appearancePreviewHeader}>
              <Typography as="p" variant="caption" className={companyStyles.appearanceSchemeLabel}>
                Prévia
              </Typography>
              <div
                className={companyStyles.appearanceSchemeTabs}
                role="tablist"
                aria-label="Prévia"
              >
                {(['light', 'dark'] as const).map((scheme) => (
                  <button
                    key={scheme}
                    type="button"
                    role="tab"
                    aria-selected={previewScheme === scheme}
                    className={companyStyles.filterButton}
                    data-active={previewScheme === scheme ? 'true' : 'false'}
                    onClick={() => setPreviewScheme(scheme)}
                  >
                    {scheme === 'light' ? 'Claro' : 'Escuro'}
                  </button>
                ))}
              </div>
            </div>
            <PlatformBrandingPreview
              platformName={displayName}
              logoUrl={displayedLogoUrl}
              colorScheme={previewScheme}
              light={Object.keys(lightDraft).length > 0 ? lightDraft : null}
              dark={Object.keys(darkDraft).length > 0 ? darkDraft : null}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
