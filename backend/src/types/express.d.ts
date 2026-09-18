import type { CognitoAccessTokenPayload } from 'aws-jwt-verify/jwt-model';

// Augment the Express Request type globally so every route handler
// that runs after the auth middleware can access req.user without casting.
declare global {
  namespace Express {
    interface Request {
      /**
       * Decoded Cognito access token payload. Populated by the requireAuth
       * middleware — guaranteed to be present on any route that uses it.
       */
      user?: CognitoAccessTokenPayload;
    }
  }
}
