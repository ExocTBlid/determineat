import 'dotenv/config';
import app from './app.js';
import { connectWithRetry } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { assertDevAuthSafe, isDevAuthEnabled } from './middleware/auth.js';

const PORT = process.env['PORT'] ?? '3000';

async function start(): Promise<void> {
  // Refuse to start if the dev auth bypass is misconfigured for production.
  assertDevAuthSafe();
  if (isDevAuthEnabled()) {
    logger.warn(
      'AUTH_MODE=dev — authentication is BYPASSED. All requests run as the dev ' +
        'user. This must only ever be used in local development.',
    );
  }

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
