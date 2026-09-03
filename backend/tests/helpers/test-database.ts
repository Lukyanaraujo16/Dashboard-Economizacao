type TestDatabaseCleaner = {
  readonly integrationSyncCursor: { deleteMany: () => Promise<unknown> };
  readonly syncRun: { deleteMany: () => Promise<unknown> };
  readonly revenueGoal: { deleteMany: () => Promise<unknown> };
  readonly installmentCostCenterAllocation: { deleteMany: () => Promise<unknown> };
  readonly costCenter: { deleteMany: () => Promise<unknown> };
  readonly financialTransaction: { deleteMany: () => Promise<unknown> };
  readonly financialTransfer: { deleteMany: () => Promise<unknown> };
  readonly receivable: { deleteMany: () => Promise<unknown> };
  readonly payable: { deleteMany: () => Promise<unknown> };
  readonly party: { deleteMany: () => Promise<unknown> };
  readonly financialCategory: { deleteMany: () => Promise<unknown> };
  readonly financialAccountBalanceSnapshot: { deleteMany: () => Promise<unknown> };
  readonly financialAccount: { deleteMany: () => Promise<unknown> };
  readonly supportSession: { deleteMany: () => Promise<unknown> };
  readonly integrationCredential: { deleteMany: () => Promise<unknown> };
  readonly integrationExternalAccount: { deleteMany: () => Promise<unknown> };
  readonly integration: { deleteMany: () => Promise<unknown> };
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

  await prisma.integrationSyncCursor.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.revenueGoal.deleteMany();
  await prisma.installmentCostCenterAllocation.deleteMany();
  await prisma.costCenter.deleteMany();
  await prisma.financialTransaction.deleteMany();
  await prisma.financialTransfer.deleteMany();
  await prisma.receivable.deleteMany();
  await prisma.payable.deleteMany();
  await prisma.party.deleteMany();
  await prisma.financialCategory.deleteMany();
  await prisma.financialAccountBalanceSnapshot.deleteMany();
  await prisma.financialAccount.deleteMany();
  await prisma.supportSession.deleteMany();
  await prisma.integrationCredential.deleteMany();
  await prisma.integrationExternalAccount.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.userCredential.deleteMany();
  await prisma.user.deleteMany();
  await prisma.platformBranding.deleteMany();
  await prisma.tenantBranding.deleteMany();
  await prisma.storedFile.deleteMany();
  await prisma.tenant.deleteMany();
}
