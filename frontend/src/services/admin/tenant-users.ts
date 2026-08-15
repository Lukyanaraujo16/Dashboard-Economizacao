import {
  adminTenantUserBlockPath,
  adminTenantUserDisablePath,
  adminTenantUserEnablePath,
  adminTenantUserPath,
  adminTenantUsersPath,
  adminTenantUserResetPasswordPath,
  adminTenantUserUnblockPath,
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

const USER_NOT_FOUND = 'Usuário não encontrado.';
const TENANT_NOT_FOUND = 'Empresa não encontrada.';

function notFoundMessage(body: unknown): string {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const envelope = body as { error?: { message?: string } };
    const message = envelope.error?.message?.trim();
    if (message?.toLowerCase().includes('empresa')) {
      return TENANT_NOT_FOUND;
    }
  }
  return USER_NOT_FOUND;
}

export async function listTenantUsers(
  tenantId: string,
  params?: ListManagedUsersParams,
): Promise<ManagedUserListResult> {
  const response = await managedUsersFetch(
    buildManagedUsersListUrl(adminTenantUsersPath(tenantId), params),
    { method: 'GET' },
  );
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, notFoundMessage(body));
  }
  return parseManagedUserListOrThrow(body, response);
}

export async function getTenantUser(tenantId: string, userId: string): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminTenantUserPath(tenantId, userId), {
    method: 'GET',
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, notFoundMessage(body));
  }
  return parseManagedUserOrThrow(body, response);
}

export async function createTenantUser(
  tenantId: string,
  input: CreateManagedUserInput,
): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminTenantUsersPath(tenantId), {
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
    throw toManagedUsersFailure(response, body, notFoundMessage(body));
  }
  return parseManagedUserOrThrow(body, response);
}

export async function updateTenantUser(
  tenantId: string,
  userId: string,
  input: UpdateManagedUserInput,
): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminTenantUserPath(tenantId, userId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, notFoundMessage(body));
  }
  return parseManagedUserOrThrow(body, response);
}

export async function blockTenantUser(tenantId: string, userId: string): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminTenantUserBlockPath(tenantId, userId), {
    method: 'POST',
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, notFoundMessage(body));
  }
  return parseManagedUserOrThrow(body, response);
}

export async function unblockTenantUser(tenantId: string, userId: string): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminTenantUserUnblockPath(tenantId, userId), {
    method: 'POST',
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, notFoundMessage(body));
  }
  return parseManagedUserOrThrow(body, response);
}

export async function disableTenantUser(tenantId: string, userId: string): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminTenantUserDisablePath(tenantId, userId), {
    method: 'POST',
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, notFoundMessage(body));
  }
  return parseManagedUserOrThrow(body, response);
}

export async function enableTenantUser(tenantId: string, userId: string): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminTenantUserEnablePath(tenantId, userId), {
    method: 'POST',
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, notFoundMessage(body));
  }
  return parseManagedUserOrThrow(body, response);
}

export async function resetTenantUserPassword(
  tenantId: string,
  userId: string,
  input: { readonly password: string; readonly passwordConfirmation: string },
): Promise<ManagedUser> {
  const response = await managedUsersFetch(adminTenantUserResetPasswordPath(tenantId, userId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: input.password,
      passwordConfirmation: input.passwordConfirmation,
    }),
  });
  const body = await readManagedUserJsonBody(response);
  if (!response.ok) {
    throw toManagedUsersFailure(response, body, notFoundMessage(body));
  }
  return parseResetPasswordResultOrThrow(body, response);
}

export { ManagedUsersRequestError };
