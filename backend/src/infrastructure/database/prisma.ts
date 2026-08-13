import { PrismaClient } from '../../generated/prisma/client.js';

const globalForPrisma = globalThis as typeof globalThis & {
  prismaClient?: PrismaClient;
};

let prismaClient = globalForPrisma.prismaClient;

export function getPrismaClient(): PrismaClient {
  prismaClient ??= new PrismaClient();

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prismaClient = prismaClient;
  }

  return prismaClient;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect();
    prismaClient = undefined;
    globalForPrisma.prismaClient = undefined;
  }
}
