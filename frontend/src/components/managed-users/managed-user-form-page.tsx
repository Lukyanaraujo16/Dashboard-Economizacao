'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { useAuth } from '../../auth';
import type {
  CreateManagedUserInput,
  ManagedUser,
  UpdateManagedUserInput,
} from '../../services/admin/managed-user.types';
import { ManagedUsersRequestError } from '../../services/admin/managed-user.types';
import { StateWrapper } from '../financial/state-wrapper';
import { Button, FormField, Input, PasswordInput, Typography } from '../ui';
import styles from '../companies/companies.module.css';
import {
  mapManagedUserValidationDetails,
  validateManagedUserCreateFields,
  validateManagedUserUpdateFields,
  type ManagedUserFieldErrors,
} from './managed-user-utils';

export type ManagedUserFormApi = {
  readonly getById?: (userId: string) => Promise<ManagedUser>;
  readonly create?: (input: CreateManagedUserInput) => Promise<ManagedUser>;
  readonly update?: (userId: string, input: UpdateManagedUserInput) => Promise<ManagedUser>;
};

export type ManagedUserFormPageProps = {
  readonly mode: 'create' | 'edit';
  readonly userId?: string;
  readonly title: string;
  readonly description: string;
  readonly notFoundMessage: string;
  readonly loadErrorMessage: string;
  readonly cancelHref: string;
  readonly successHref: string;
  readonly submitLabel: string;
  readonly api: ManagedUserFormApi;
  readonly wrap?: (content: ReactNode) => ReactNode;
};

export function ManagedUserFormPage({
  mode,
  userId,
  title,
  description,
  notFoundMessage,
  loadErrorMessage,
  cancelHref,
  successHref,
  submitLabel,
  api,
  wrap,
}: ManagedUserFormPageProps) {
  const router = useRouter();
  const { refreshSession } = useAuth();
  const refreshSessionRef = useRef(refreshSession);
  const routerRef = useRef(router);
  refreshSessionRef.current = refreshSession;
  routerRef.current = router;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ManagedUserFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error' | 'not_found'>(
    mode === 'edit' ? 'loading' : 'ready',
  );

  useEffect(() => {
    if (mode !== 'edit' || !userId || !api.getById) {
      return;
    }

    let cancelled = false;
    const getById = api.getById;

    async function loadUser() {
      setLoadState('loading');
      try {
        const user = await getById(userId!);
        if (cancelled) return;
        setName(user.name);
        setEmail(user.email);
        setLoadState('ready');
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ManagedUsersRequestError) {
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

    void loadUser();
    return () => {
      cancelled = true;
    };
  }, [api.getById, mode, userId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    const validation =
      mode === 'create'
        ? validateManagedUserCreateFields({
            name: trimmedName,
            email: trimmedEmail,
            password,
          })
        : validateManagedUserUpdateFields({
            name: trimmedName,
            email: trimmedEmail,
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
      if (mode === 'create' && api.create) {
        await api.create({
          name: trimmedName,
          email: trimmedEmail,
          password,
        });
      } else if (mode === 'edit' && userId && api.update) {
        await api.update(userId, {
          name: trimmedName,
          email: trimmedEmail,
        });
      }
      router.push(successHref);
    } catch (error) {
      if (error instanceof ManagedUsersRequestError) {
        if (error.kind === 'unauthenticated') {
          await refreshSession().catch(() => undefined);
          router.replace('/login');
          return;
        }
        if (
          error.kind === 'validation' ||
          error.kind === 'bad_request' ||
          error.kind === 'conflict'
        ) {
          setFieldErrors(mapManagedUserValidationDetails(error.details));
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
      setFormError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState === 'loading') {
    return <StateWrapper state="loading" loadingLabel="Carregando" align="start" className="" />;
  }

  if (loadState === 'not_found') {
    return (
      <StateWrapper
        state="error"
        errorMessage={notFoundMessage}
        onRetry={() => router.push(cancelHref)}
        align="start"
      />
    );
  }

  if (loadState === 'error') {
    return (
      <StateWrapper
        state="error"
        errorMessage={loadErrorMessage}
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
        <FormField label="Nome" htmlFor="managed-user-name" error={fieldErrors.name}>
          <Input
            id="managed-user-name"
            name="name"
            value={name}
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>

        <FormField
          label="Email"
          htmlFor="managed-user-email"
          hint="O e-mail será usado para acesso à plataforma."
          error={fieldErrors.email}
        >
          <Input
            id="managed-user-email"
            name="email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>

        {mode === 'create' ? (
          <FormField
            label="Senha"
            htmlFor="managed-user-password"
            hint="Mínimo de 10 caracteres. A senha não será exibida novamente."
            error={fieldErrors.password}
          >
            <PasswordInput
              id="managed-user-password"
              name="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
        ) : null}

        {formError ? (
          <Typography as="p" variant="body" className={styles.formError} role="alert">
            {formError}
          </Typography>
        ) : null}

        <div className={styles.formActions}>
          <Button type="submit" variant="primary" loading={submitting}>
            {submitLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={() => router.push(cancelHref)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );

  return wrap ? <>{wrap(formContent)}</> : formContent;
}
