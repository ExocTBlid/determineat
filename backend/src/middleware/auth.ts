import type { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

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
