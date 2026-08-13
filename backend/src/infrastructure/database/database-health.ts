import { getPrismaClient } from './prisma.js';

export async function isDatabaseHealthy(databaseUrl: string | undefined): Promise<boolean> {
  if (!databaseUrl) {
    return false;
  }

  try {
    const prisma = getPrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
