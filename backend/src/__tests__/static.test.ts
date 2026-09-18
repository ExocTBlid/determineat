/**
 * Static frontend serving + SPA fallback test.
 *
 * Creates a temporary public/ directory with an index.html and a static asset,
 * points PUBLIC_DIR at it, then loads a fresh app instance (the static block
 * runs at module load, so the env var must be set first).
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';

// aws-jwt-verify is imported transitively via app.ts → auth middleware
jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: () => ({ verify: jest.fn() }),
  },
}));

describe('Static frontend serving', () => {
  let tmpPublic: string;
  let app: Express;
  const originalPublicDir = process.env['PUBLIC_DIR'];

  beforeAll(async () => {
    // Build a fake production public/ directory
    tmpPublic = mkdtempSync(path.join(tmpdir(), 'determineat-public-'));
    writeFileSync(
      path.join(tmpPublic, 'index.html'),
      '<!doctype html><html><body><div id="root">DeterminEat SPA</div></body></html>',
    );
    mkdirSync(path.join(tmpPublic, 'assets'));
    writeFileSync(path.join(tmpPublic, 'assets', 'app.js'), 'console.log("hi");');

    process.env['PUBLIC_DIR'] = tmpPublic;

    // Load a fresh app instance with PUBLIC_DIR set
    await jest.isolateModulesAsync(async () => {
      const mod = await import('../app');
      app = mod.default;
    });
  });

  afterAll(() => {
    if (originalPublicDir === undefined) {
      delete process.env['PUBLIC_DIR'];
    } else {
      process.env['PUBLIC_DIR'] = originalPublicDir;
    }
    rmSync(tmpPublic, { recursive: true, force: true });
  });

  it('serves index.html at the root', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('DeterminEat SPA');
  });

  it('serves static assets', async () => {
    const res = await request(app).get('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.text).toContain('console.log');
  });

  it('falls back to index.html for client-side routes', async () => {
    const res = await request(app).get('/some/spa/route');
    expect(res.status).toBe(200);
    expect(res.text).toContain('DeterminEat SPA');
  });

  it('does NOT fall back for /api routes (returns 401, not the SPA)', async () => {
    const res = await request(app).get('/api/restaurants');
    expect(res.status).toBe(401);
    expect(res.text).not.toContain('DeterminEat SPA');
  });

  it('does NOT fall back for /health (returns JSON)', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
