import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import meRouter from './routes/me.js';
import restaurantsRouter from './routes/restaurants.js';

const app = express();

// Parse JSON request bodies
app.use(express.json());

// ---------------------------------------------------------------------------
// Health check — unauthenticated, used by ECS health checks and local dev
// ---------------------------------------------------------------------------
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use('/api/me', meRouter);
app.use('/api/restaurants', restaurantsRouter);

// ---------------------------------------------------------------------------
// Global error handler — catches any error passed to next(err)
// Must be defined last with four parameters so Express recognises it.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack ?? err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
