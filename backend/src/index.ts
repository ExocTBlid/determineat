import 'dotenv/config';
import app from './app.js';
import { connectWithRetry } from './lib/prisma.js';
import { logger } from './lib/logger.js';

const PORT = process.env['PORT'] ?? '3000';

async function start(): Promise<void> {
  // Establish the DB connection (with retry for Aurora cold-starts) before
  // accepting traffic, so the first requests don't fail on a paused cluster.
  await connectWithRetry();

  app.listen(Number(PORT), () => {
    logger.info('DeterminEat backend listening', { port: Number(PORT) });
  });
}

start().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('Fatal startup error', { error: message });
  process.exit(1);
});
