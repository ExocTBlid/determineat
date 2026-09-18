/**
 * Auth middleware and base API tests
 *
 * The Cognito JWT verifier is mocked so these tests run without any AWS
 * infrastructure. The mock is set up before the module under test is imported
 * so Jest's module registry picks it up.
 */

import request from 'supertest';

// ---------------------------------------------------------------------------
// Mock aws-jwt-verify BEFORE importing app so the middleware gets the mock
// ---------------------------------------------------------------------------
const mockVerify = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: () => ({ verify: mockVerify }),
  },
}));

// Import app after mocks are registered
import app from '../app';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal fake Cognito access token payload */
const fakePayload = {
  sub: 'user-sub-abc123',
  username: 'testuser',
  email: 'test@example.com',
  token_use: 'access' as const,
  iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
  aud: 'client-id',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  jti: 'fake-jti',
  scope: 'openid',
  client_id: 'client-id',
};

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
describe('GET /health', () => {
  it('returns 200 with status ok — no auth required', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// ---------------------------------------------------------------------------
// GET /api/me — unauthenticated cases
// ---------------------------------------------------------------------------
describe('GET /api/me — unauthenticated', () => {
  it('returns 401 when no Authorization header is present', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 when Authorization header is not Bearer format', async () => {
    const res = await request(app).get('/api/me').set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 when the token is invalid', async () => {
    mockVerify.mockRejectedValueOnce(new Error('JwtExpiredError'));
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer bad.token.here');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// GET /api/me — authenticated
// ---------------------------------------------------------------------------
describe('GET /api/me — authenticated', () => {
  it('returns 200 with user claims when token is valid', async () => {
    mockVerify.mockResolvedValueOnce(fakePayload);

    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer valid.token.here');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sub: 'user-sub-abc123',
      username: 'testuser',
      email: 'test@example.com',
    });
  });

  it('calls the verifier with the token from the Authorization header', async () => {
    mockVerify.mockResolvedValueOnce(fakePayload);

    await request(app).get('/api/me').set('Authorization', 'Bearer my.specific.token');

    expect(mockVerify).toHaveBeenCalledWith('my.specific.token');
  });
});
