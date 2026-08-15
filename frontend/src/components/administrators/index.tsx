'use client';

import { useMemo } from 'react';

import {
  blockAdministrator,
  createAdministrator,
  disableAdministrator,
  enableAdministrator,
  getAdministrator,
  listAdministrators,
  resetAdministratorPassword,
  unblockAdministrator,
  updateAdministrator,
} from '../../services/admin/administrators';
import { ManagedUserFormPage } from '../managed-users/managed-user-form-page';
import { ManagedUsersListPage } from '../managed-users/managed-users-list-page';

export function AdministratorsPage() {
  const api = useMemo(
    () => ({
      list: listAdministrators,
      block: blockAdministrator,
      unblock: unblockAdministrator,
      disable: disableAdministrator,
      enable: enableAdministrator,
      resetPassword: resetAdministratorPassword,
    }),
    [],
  );

  return (
    <ManagedUsersListPage
      title="Administradores"
      description="Cadastre e gerencie os administradores da plataforma."
      createLabel="Novo administrador"
      emptyCtaLabel="Cadastrar primeiro administrador"
      createHref="/administradores/novo"
      editHref={(userId) => `/administradores/${userId}/editar`}
      emptyDescription="Nenhum administrador cadastrado."
      tableAriaLabel="Administradores cadastrados"
      filterAriaLabel="Filtrar administradores por status"
      loadingLabel="Carregando administradores"
      api={api}
    />
  );
}

type AdministratorFormPageProps = {
  readonly mode: 'create' | 'edit';
  readonly userId?: string;
};

export function AdministratorFormPage({ mode, userId }: AdministratorFormPageProps) {
  const api = useMemo(
    () => ({
      getById: getAdministrator,
      create: createAdministrator,
      update: updateAdministrator,
    }),
    [],
  );

  return (
    <ManagedUserFormPage
      mode={mode}
      userId={userId}
      title={mode === 'create' ? 'Novo administrador' : 'Editar administrador'}
      description={
        mode === 'create'
          ? 'Cadastre um novo administrador da plataforma.'
          : 'Atualize os dados do administrador.'
      }
      notFoundMessage="Administrador não encontrado."
      loadErrorMessage="Não foi possível carregar o administrador."
      cancelHref="/administradores"
      successHref="/administradores"
      submitLabel={mode === 'create' ? 'Cadastrar administrador' : 'Salvar alterações'}
      api={api}
    />
  );
}
