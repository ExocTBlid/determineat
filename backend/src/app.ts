import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
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
// Static frontend (production only)
//
// In the production image the built React app is copied into a `public/`
// directory and PUBLIC_DIR points at it. When that directory exists we serve
// its static assets and fall back to index.html for client-side routes, so a
// page refresh on any SPA route returns the app rather than a 404.
//
// This block is skipped in local dev and tests (no PUBLIC_DIR / no such dir) —
// Vite serves the frontend and proxies /api to this server instead.
//
// PUBLIC_DIR is resolved from the current working directory so this works under
// both the ESM production runtime and the CommonJS test runner (no import.meta).
// ---------------------------------------------------------------------------
const publicDir = path.resolve(process.cwd(), process.env['PUBLIC_DIR'] ?? 'public');

if (existsSync(publicDir)) {
  app.use(express.static(publicDir));

  // SPA fallback: any non-API GET that didn't match a static file returns index.html
  app.get(/^(?!\/api\/|\/health).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

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
