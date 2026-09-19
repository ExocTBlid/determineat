import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';

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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Connect to the database, retrying with exponential backoff.
 *
 * Aurora Serverless v2 can be paused or mid-scale when a task starts, so the
 * first few connection attempts may fail. Rather than crash-loop the container,
 * we retry with backoff and only give up after `maxAttempts`.
 *
 * @param maxAttempts total attempts before giving up (default 8)
 * @param baseDelayMs initial backoff, doubled each attempt and capped at 10s
 */
export async function connectWithRetry(maxAttempts = 8, baseDelayMs = 500): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect();
      logger.info('Database connection established', { attempt });
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt === maxAttempts) {
        logger.error('Database connection failed; giving up', { attempt, maxAttempts, error: message });
        throw err;
      }
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 10_000);
      logger.warn('Database connection failed; retrying', { attempt, nextRetryMs: delay, error: message });
      await sleep(delay);
    }
  }
}
