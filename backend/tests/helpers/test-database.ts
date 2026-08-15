type TestDatabaseCleaner = {
  readonly userCredential: { deleteMany: () => Promise<unknown> };
  readonly user: { deleteMany: () => Promise<unknown> };
  readonly platformBranding: { deleteMany: () => Promise<unknown> };
  readonly tenantBranding: { deleteMany: () => Promise<unknown> };
  readonly storedFile: { deleteMany: () => Promise<unknown> };
  readonly tenant: { deleteMany: () => Promise<unknown> };
};

function databaseNameFromUrl(databaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('URL de banco de testes inválida.');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName) {
    throw new Error('URL de banco de testes não informa o nome do banco.');
  }
  return databaseName;
}

export function assertTestDatabaseUrl(databaseUrl: string): void {
  const databaseName = databaseNameFromUrl(databaseUrl);
  if (!databaseName.endsWith('_test')) {
    throw new Error(
      `Operação de teste bloqueada: o banco "${databaseName}" não possui o sufixo obrigatório "_test".`,
    );
  }
}

export function resolveTestDatabaseUrl(source: NodeJS.ProcessEnv): string {
  const explicitTestUrl = source.TEST_DATABASE_URL?.trim();
  if (explicitTestUrl) {
    assertTestDatabaseUrl(explicitTestUrl);
    return explicitTestUrl;
  }

  const developmentUrl = source.DATABASE_URL?.trim();
  if (!developmentUrl) {
    throw new Error('TEST_DATABASE_URL é obrigatória para os testes backend.');
  }

  const parsed = new URL(developmentUrl);
  const developmentDatabase = databaseNameFromUrl(developmentUrl);
  if (!developmentDatabase.endsWith('_dev')) {
    throw new Error(
      'TEST_DATABASE_URL ausente e DATABASE_URL não aponta para um banco local com sufixo "_dev".',
    );
  }

  parsed.pathname = `/${developmentDatabase.slice(0, -4)}_test`;
  const derivedTestUrl = parsed.toString();
  assertTestDatabaseUrl(derivedTestUrl);
  return derivedTestUrl;
}

export async function cleanTestDatabase(
  prisma: TestDatabaseCleaner,
  databaseUrl = process.env.DATABASE_URL,
): Promise<void> {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL de teste não está configurada para o cleanup.');
  }
  assertTestDatabaseUrl(databaseUrl);

  await prisma.userCredential.deleteMany();
  await prisma.user.deleteMany();
  await prisma.platformBranding.deleteMany();
  await prisma.tenantBranding.deleteMany();
  await prisma.storedFile.deleteMany();
  await prisma.tenant.deleteMany();
}
