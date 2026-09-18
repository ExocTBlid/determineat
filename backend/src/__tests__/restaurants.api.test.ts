/**
 * Restaurant CRUD API integration tests
 *
 * These exercise the full HTTP stack (Express + routes + service + Prisma)
 * against the real test database (postgres_test on port 5433).
 *
 * The Cognito verifier is mocked so we can inject an arbitrary user identity
 * per request via the mock's return value. This lets us test cross-user
 * isolation by switching the `sub` claim between requests.
 *
 * Skipped automatically when TEST_DATABASE_URL is not set.
 */

const mockVerify = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: () => ({ verify: mockVerify }),
  },
}));

import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';

const TEST_DB_URL = process.env['TEST_DATABASE_URL'];
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

// The app's Prisma singleton targets DATABASE_URL, which .env.test points at
// the same test database (see backend/.env.test).

const USER_A = 'user-a-sub';
const USER_B = 'user-b-sub';

/** Set the identity the mocked verifier returns for the next request(s). */
function authAs(sub: string): void {
  mockVerify.mockResolvedValue({
    sub,
    username: sub,
    email: `${sub}@example.com`,
    token_use: 'access',
  });
}

const validBody = {
  name: 'Test Bistro',
  cuisineType: 'French',
  googleMapsUrl: 'https://maps.google.com/?q=Test+Bistro',
  visitDate: '2024-06-15',
  rating: 4,
  wouldVisitAgain: true,
  notes: 'Lovely spot',
};

describeIfDb('Restaurant CRUD API', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL as string } } });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.restaurant.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
  });

  // -------------------------------------------------------------------------
  // Auth guard
  // -------------------------------------------------------------------------
  it('returns 401 for unauthenticated requests', async () => {
    const res = await request(app).get('/api/restaurants');
    expect(res.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------
  it('creates a restaurant (201) and returns it', async () => {
    authAs(USER_A);
    const res = await request(app)
      .post('/api/restaurants')
      .set('Authorization', 'Bearer token')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe('Test Bistro');
    expect(res.body.userId).toBe(USER_A);
  });

  it('rejects invalid input with 400', async () => {
    authAs(USER_A);
    const res = await request(app)
      .post('/api/restaurants')
      .set('Authorization', 'Bearer token')
      .send({ name: '', cuisineType: 'French', visitDate: '2024-06-15', rating: 9, wouldVisitAgain: true });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('rejects a rating outside 1–5 with 400', async () => {
    authAs(USER_A);
    const res = await request(app)
      .post('/api/restaurants')
      .set('Authorization', 'Bearer token')
      .send({ ...validBody, rating: 0 });

    expect(res.status).toBe(400);
  });

  it('rejects a malformed googleMapsUrl with 400', async () => {
    authAs(USER_A);
    const res = await request(app)
      .post('/api/restaurants')
      .set('Authorization', 'Bearer token')
      .send({ ...validBody, googleMapsUrl: 'not-a-url' });

    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // List
  // -------------------------------------------------------------------------
  it('lists only the authenticated user\'s restaurants', async () => {
    authAs(USER_A);
    await request(app).post('/api/restaurants').set('Authorization', 'Bearer token').send(validBody);

    authAs(USER_B);
    await request(app)
      .post('/api/restaurants')
      .set('Authorization', 'Bearer token')
      .send({ ...validBody, name: "B's Place" });

    // User A should see only their own entry
    authAs(USER_A);
    const res = await request(app).get('/api/restaurants').set('Authorization', 'Bearer token');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Test Bistro');
  });

  // -------------------------------------------------------------------------
  // Read single
  // -------------------------------------------------------------------------
  it('fetches a single restaurant by id', async () => {
    authAs(USER_A);
    const created = await request(app)
      .post('/api/restaurants')
      .set('Authorization', 'Bearer token')
      .send(validBody);

    const res = await request(app)
      .get(`/api/restaurants/${created.body.id}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('returns 404 for a non-existent restaurant', async () => {
    authAs(USER_A);
    const res = await request(app)
      .get('/api/restaurants/nonexistent-id')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
  });

  it('returns 404 when accessing another user\'s restaurant', async () => {
    // User A creates a restaurant
    authAs(USER_A);
    const created = await request(app)
      .post('/api/restaurants')
      .set('Authorization', 'Bearer token')
      .send(validBody);

    // User B tries to read it — should be 404 (not visible)
    authAs(USER_B);
    const res = await request(app)
      .get(`/api/restaurants/${created.body.id}`)
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------
  it('updates a restaurant', async () => {
    authAs(USER_A);
    const created = await request(app)
      .post('/api/restaurants')
      .set('Authorization', 'Bearer token')
      .send(validBody);

    const res = await request(app)
      .put(`/api/restaurants/${created.body.id}`)
      .set('Authorization', 'Bearer token')
      .send({ rating: 5, wouldVisitAgain: false });

    expect(res.status).toBe(200);
    expect(res.body.rating).toBe(5);
    expect(res.body.wouldVisitAgain).toBe(false);
    expect(res.body.name).toBe('Test Bistro'); // unchanged
  });

  it('returns 404 updating another user\'s restaurant', async () => {
    authAs(USER_A);
    const created = await request(app)
      .post('/api/restaurants')
      .set('Authorization', 'Bearer token')
      .send(validBody);

    authAs(USER_B);
    const res = await request(app)
      .put(`/api/restaurants/${created.body.id}`)
      .set('Authorization', 'Bearer token')
      .send({ rating: 1 });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------
  it('deletes a restaurant (204)', async () => {
    authAs(USER_A);
    const created = await request(app)
      .post('/api/restaurants')
      .set('Authorization', 'Bearer token')
      .send(validBody);

    const del = await request(app)
      .delete(`/api/restaurants/${created.body.id}`)
      .set('Authorization', 'Bearer token');
    expect(del.status).toBe(204);

    const get = await request(app)
      .get(`/api/restaurants/${created.body.id}`)
      .set('Authorization', 'Bearer token');
    expect(get.status).toBe(404);
  });

  it('returns 404 deleting another user\'s restaurant', async () => {
    authAs(USER_A);
    const created = await request(app)
      .post('/api/restaurants')
      .set('Authorization', 'Bearer token')
      .send(validBody);

    authAs(USER_B);
    const res = await request(app)
      .delete(`/api/restaurants/${created.body.id}`)
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
  });
});
