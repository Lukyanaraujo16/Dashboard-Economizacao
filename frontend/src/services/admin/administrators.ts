import {
  adminAdministratorBlockPath,
  adminAdministratorDisablePath,
  adminAdministratorEnablePath,
  adminAdministratorPath,
  adminAdministratorsPath,
  adminAdministratorResetPasswordPath,
  adminAdministratorUnblockPath,
} from '../../lib/api-config';
import {
  buildManagedUsersListUrl,
  managedUsersFetch,
  parseManagedUserListOrThrow,
  parseManagedUserOrThrow,
  parseResetPasswordResultOrThrow,
  readManagedUserJsonBody,
  toManagedUsersFailure,
} from './managed-user-http';
import type {
  CreateManagedUserInput,
  ListManagedUsersParams,
  ManagedUser,
  ManagedUserListResult,
  UpdateManagedUserInput,
} from './managed-user.types';
import { ManagedUsersRequestError } from './managed-user.types';

const NOT_FOUND = 'Administrador não encontrado.';

export async function listAdministrators(
  params?: ListManagedUsersParams,
): Promise<ManagedUserListResult> {
  const response = await managedUsersFetch(
    buildManagedUsersListUrl(adminAdministratorsPath(), params),
    {
      method: 'GET',
    },
  );
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, NOT_FOUND);
  }
  return parseManagedUserListOrThrow(body, response);
}

export async function getAdministrator(userId: string): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminAdministratorPath(userId), { method: 'GET' });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, NOT_FOUND);
  }
  return parseManagedUserOrThrow(body, response);
}

export async function createAdministrator(input: CreateManagedUserInput): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminAdministratorsPath(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      password: input.password,
    }),
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, NOT_FOUND);
  }
  return parseManagedUserOrThrow(body, response);
}

export async function updateAdministrator(
  userId: string,
  input: UpdateManagedUserInput,
): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminAdministratorPath(userId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, NOT_FOUND);
  }
  return parseManagedUserOrThrow(body, response);
}

export async function blockAdministrator(userId: string): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminAdministratorBlockPath(userId), { method: 'POST' });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, NOT_FOUND);
  }
  return parseManagedUserOrThrow(body, response);
}

export async function unblockAdministrator(userId: string): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminAdministratorUnblockPath(userId), {
    method: 'POST',
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, NOT_FOUND);
  }
  return parseManagedUserOrThrow(body, response);
}

export async function disableAdministrator(userId: string): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminAdministratorDisablePath(userId), {
    method: 'POST',
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, NOT_FOUND);
  }
  return parseManagedUserOrThrow(body, response);
}

export async function enableAdministrator(userId: string): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminAdministratorEnablePath(userId), {
    method: 'POST',
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, NOT_FOUND);
  }
  return parseManagedUserOrThrow(body, response);
}

export async function resetAdministratorPassword(
  userId: string,
  input: { readonly password: string; readonly passwordConfirmation: string },
): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminAdministratorResetPasswordPath(userId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: input.password,
      passwordConfirmation: input.passwordConfirmation,
    }),
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, NOT_FOUND);
  }
  return parseResetPasswordResultOrThrow(body, response);
}

export { ManagedUsersRequestError };
