import type { Request, Response, NextFunction } from 'express';
import type { CognitoAccessTokenPayload } from 'aws-jwt-verify/jwt-model';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// ---------------------------------------------------------------------------
// Dev-mode auth bypass
//
// When AUTH_MODE=dev the middleware skips real JWT verification and injects a
// fixed fake user. This exists ONLY to make local development possible without
// a live Cognito pool — see docs/cognito.md ("Local Development") and the
// README. It is guarded three ways so it can never weaken production:
//
//   1. It activates only when AUTH_MODE === 'dev'.
//   2. isDevAuthEnabled() additionally requires NODE_ENV !== 'production'.
//   3. assertDevAuthSafe() (called at startup from index.ts) throws hard if
//      AUTH_MODE=dev is ever combined with NODE_ENV=production, so a
//      misconfigured deploy fails fast instead of silently trusting everyone.
// ---------------------------------------------------------------------------

/** The fixed identity injected for every request when dev auth is enabled. */
export const DEV_USER = {
  sub: 'dev-user-00000000-0000-0000-0000-000000000000',
  username: 'devuser',
  email: 'dev@determineat.local',
} as const;

/**
 * True only when the dev bypass is both requested (AUTH_MODE=dev) and safe
 * (not running in production). Never returns true in production.
 */
export function isDevAuthEnabled(): boolean {
  return process.env['AUTH_MODE'] === 'dev' && process.env['NODE_ENV'] !== 'production';
}

/**
 * Fails fast if the dev bypass is requested in a production environment.
 * Call once at server startup (see index.ts) so a misconfiguration crashes the
 * process rather than shipping an app that trusts every request.
 */
export function assertDevAuthSafe(): void {
  if (process.env['AUTH_MODE'] === 'dev' && process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'AUTH_MODE=dev is not allowed when NODE_ENV=production. ' +
        'The dev auth bypass must never run in production.',
    );
  }
}

/** Builds the fake access-token payload used by the dev bypass. */
function devUserPayload(): CognitoAccessTokenPayload {
  const now = Math.floor(Date.now() / 1000);
  // Cast: we only populate the claims the app actually reads (sub/username/
  // email); the rest of the Cognito payload shape isn't needed for local dev.
  return {
    sub: DEV_USER.sub,
    username: DEV_USER.username,
    email: DEV_USER.email,
    token_use: 'access',
    iss: 'dev-auth-bypass',
    client_id: 'dev-auth-bypass',
    scope: 'openid',
    auth_time: now,
    exp: now + 3600,
    iat: now,
    jti: 'dev-auth-bypass',
  } as unknown as CognitoAccessTokenPayload;
}

// ---------------------------------------------------------------------------
// Cognito JWT verifier — created lazily on first use.
//
// Constructing the verifier validates the User Pool ID format, which throws if
// COGNITO_USER_POOL_ID is a placeholder (as in local dev without a real pool).
// Deferring construction until the first authenticated request means the server
// (and the unauthenticated /health endpoint) starts fine without valid Cognito
// config — the error only surfaces when auth is actually attempted.
//
// The verifier caches Cognito's public JWKS, so repeated calls don't make a
// network request on every request after the first fetch.
// ---------------------------------------------------------------------------

// The `tokenUse: 'access'` literal selects the access-token verifier overload,
// so verify() returns a CognitoAccessTokenPayload (matching req.user's type).
function createVerifier() {
  return CognitoJwtVerifier.create({
    userPoolId: process.env['COGNITO_USER_POOL_ID'] ?? '',
    clientId: process.env['COGNITO_CLIENT_ID'] ?? '',
    tokenUse: 'access',
  });
}

let cachedVerifier: ReturnType<typeof createVerifier> | null = null;

function getVerifier(): ReturnType<typeof createVerifier> {
  if (!cachedVerifier) {
    cachedVerifier = createVerifier();
  }
  return cachedVerifier;
}

/**
 * requireAuth middleware
 *
 * Validates the Bearer token in the Authorization header using aws-jwt-verify.
 * On success, attaches the decoded payload to `req.user` and calls `next()`.
 * On failure, responds with 401 immediately — the route handler is never reached.
 *
 * Usage:
 *   router.get('/api/me', requireAuth, meHandler);
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Dev bypass: inject a fixed fake user without touching Cognito. Guarded so it
  // is impossible to activate in production (see isDevAuthEnabled).
  if (isDevAuthEnabled()) {
    req.user = devUserPayload();
    next();
    return;
  }

  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = await getVerifier().verify(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
