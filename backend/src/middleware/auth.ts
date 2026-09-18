import type { Request, Response, NextFunction } from 'express';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// ---------------------------------------------------------------------------
// Cognito JWT verifier — instantiated once at module load.
// The verifier caches Cognito's public JWKS, so repeated calls don't
// make network requests on every request after the first fetch.
// ---------------------------------------------------------------------------
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env['COGNITO_USER_POOL_ID'] ?? '',
  clientId: process.env['COGNITO_CLIENT_ID'] ?? '',
  tokenUse: 'access',
});

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
    const payload = await verifier.verify(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
