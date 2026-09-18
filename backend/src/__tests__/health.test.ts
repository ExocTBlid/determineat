/**
 * Health check endpoint test.
 *
 * aws-jwt-verify is mocked here because app.ts now imports auth middleware,
 * which instantiates CognitoJwtVerifier at module load time. Without the mock
 * the verifier would throw "Invalid Cognito User Pool ID" in the test env.
 */

// Mock must be registered before app is imported
jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: () => ({ verify: jest.fn() }),
  },
}));

import request from 'supertest';
import app from '../app';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
