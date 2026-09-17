import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Prisma client singleton
//
// In development, hot-reload would create a new PrismaClient on every module
// evaluation, exhausting the connection pool. We attach the instance to the
// global object to reuse it across reloads.
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}
