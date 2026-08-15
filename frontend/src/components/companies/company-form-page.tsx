'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { useAuth } from '../../auth';
import { createCompany, getCompany, updateCompany } from '../../services/admin/companies';
import { CompaniesRequestError } from '../../services/admin/companies.types';
import { StateWrapper } from '../financial/state-wrapper';
import { Button, FormField, Input, Typography } from '../ui';
import {
  mapCompanyValidationDetails,
  previewCompanyIdentifier,
  validateCompanyFields,
  type CompanyFieldErrors,
} from './company-utils';
import { CompanySectionNav } from './company-section-nav';
import styles from './companies.module.css';

type CompanyFormPageProps = {
  readonly mode: 'create' | 'edit';
  readonly companyId?: string;
};

export function CompanyFormPage({ mode, companyId }: CompanyFormPageProps) {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const refreshSessionRef = useRef(refreshSession);
  const routerRef = useRef(router);
  refreshSessionRef.current = refreshSession;
  routerRef.current = router;

  const [companyDisplayName, setCompanyDisplayName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [name, setName] = useState('');
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CompanyFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not_found'>(
    mode === 'edit' ? 'loading' : 'ready',
  );

  useEffect(() => {
    if (mode !== 'edit' || !companyId) {
      return;
    }

    let cancelled = false;

    async function loadCompany() {
      setLoadState('loading');
      try {
        const company = await getCompany(companyId!);
        if (cancelled) return;
        setDisplayName(company.displayName);
        setCompanyDisplayName(company.displayName);
        setName(company.name);
        setIdentifierTouched(true);
        setLoadState('ready');
      } catch (error) {
        if (cancelled) return;
        if (error instanceof CompaniesRequestError) {
          if (error.kind === 'unauthenticated') {
            await refreshSessionRef.current().catch(() => undefined);
            routerRef.current.replace('/login');
            return;
          }
          if (error.kind === 'not_found') {
            setLoadState('not_found');
            return;
          }
        }
        setLoadState('error');
      }
    }

    void loadCompany();

    return () => {
      cancelled = true;
    };
  }, [companyId, mode]);

  function handleDisplayNameChange(value: string) {
    setDisplayName(value);
    if (mode === 'create' && !identifierTouched) {
      setName(previewCompanyIdentifier(value));
    }
  }

  function handleIdentifierChange(value: string) {
    setName(value);
    if (mode === 'create') {
      setIdentifierTouched(true);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedDisplayName = displayName.trim();
    const trimmedName = name.trim();
    const validation = validateCompanyFields({
      displayName: trimmedDisplayName,
      name: trimmedName,
    });

    if (Object.keys(validation).length > 0) {
      setFieldErrors(validation);
      setFormError(null);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);

    try {
      if (mode === 'create') {
        await createCompany({ displayName: trimmedDisplayName, name: trimmedName });
      } else if (companyId) {
        await updateCompany(companyId, { displayName: trimmedDisplayName, name: trimmedName });
      }
      router.push('/empresas');
    } catch (error) {
      if (error instanceof CompaniesRequestError) {
        if (error.kind === 'unauthenticated') {
          await refreshSession().catch(() => undefined);
          router.replace('/login');
          return;
        }
        if (error.kind === 'validation' || error.kind === 'bad_request') {
          setFieldErrors(mapCompanyValidationDetails(error.details));
          setFormError(error.message);
          return;
        }
        if (error.kind === 'conflict') {
          setFieldErrors(mapCompanyValidationDetails(error.details));
          setFormError(error.message);
          return;
        }
        if (error.kind === 'not_found') {
          setLoadState('not_found');
          return;
        }
        setFormError(error.message);
        return;
      }
      setFormError('Não foi possível salvar a empresa. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === 'create' ? 'Nova empresa' : 'Editar empresa';
  const description =
    mode === 'create'
      ? 'Cadastre uma nova empresa na plataforma.'
      : 'Atualize os dados de identificação da empresa.';

  if (loadState === 'loading') {
    return (
      <StateWrapper state="loading" loadingLabel="Carregando empresa" align="start" className="" />
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

  if (loadState === 'error') {
    return (
      <StateWrapper
        state="error"
        errorMessage="Não foi possível carregar a empresa."
        onRetry={() => router.refresh()}
        align="start"
      />
    );
  }

  const formContent = (
    <div className={styles.formPage}>
      <div className={styles.formIntro}>
        <Typography as="h2" variant="heading">
          {title}
        </Typography>
        <Typography as="p" variant="body" className={styles.formDescription}>
          {description}
        </Typography>
      </div>

      <form className={styles.formCard} onSubmit={(event) => void handleSubmit(event)} noValidate>
        <FormField
          label="Nome da empresa"
          htmlFor="company-display-name"
          error={fieldErrors.displayName}
        >
          <Input
            id="company-display-name"
            name="displayName"
            value={displayName}
            autoComplete="organization"
            onChange={(event) => handleDisplayNameChange(event.target.value)}
          />
        </FormField>

        <FormField
          label="Identificador"
          htmlFor="company-name"
          className={styles.identifierField}
          hint={
            mode === 'create'
              ? 'Gerado automaticamente a partir do nome. Você pode personalizar antes de salvar.'
              : 'O identificador é usado internamente pelo sistema.'
          }
          error={fieldErrors.name}
        >
          <Input
            id="company-name"
            name="name"
            value={name}
            autoComplete="off"
            onChange={(event) => handleIdentifierChange(event.target.value)}
          />
        </FormField>

        {formError ? (
          <Typography as="p" variant="body" className={styles.formError} role="alert">
            {formError}
          </Typography>
        ) : null}

        <div className={styles.formActions}>
          <Button type="submit" variant="primary" loading={submitting}>
            {mode === 'create' ? 'Cadastrar empresa' : 'Salvar alterações'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={() => router.push('/empresas')}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );

  if (mode === 'edit' && companyId) {
    return (
      <CompanySectionNav companyId={companyId} companyName={companyDisplayName || displayName}>
        {formContent}
      </CompanySectionNav>
    );
  }

  return formContent;
}
