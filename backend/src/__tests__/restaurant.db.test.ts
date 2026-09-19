/**
 * Restaurant DB integration tests
 *
 * These tests run against a real PostgreSQL instance (the `postgres_test`
 * service in docker-compose.yml on port 5433). They verify that the Prisma
 * schema and migrations are correct by exercising actual DB operations.
 *
 * Prerequisites:
 *   docker compose up -d postgres_test
 *   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/determineat_test \
 *     npx prisma migrate deploy
 *
 * The TEST_DATABASE_URL env var must be set. Tests are skipped when it is not,
 * so the suite still passes cleanly in environments without a live DB.
 */

import { PrismaClient } from '@prisma/client';

const TEST_DB_URL = process.env['TEST_DATABASE_URL'];

// Skip all tests if no test DB is available (e.g. plain `npm test` without DB)
const describeIfDb = TEST_DB_URL ? describe : describe.skip;

describeIfDb('Restaurant DB integration', () => {
  let prisma: PrismaClient;
  const TEST_USER_ID = 'test-cognito-sub-12345';

  beforeAll(async () => {
    // TEST_DB_URL is guaranteed non-undefined here — describeIfDb skips when it's missing
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL as string } } });
    await prisma.$connect();
    // Ensure a User row exists (FK requirement)
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      create: { id: TEST_USER_ID },
      update: {},
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.restaurant.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.delete({ where: { id: TEST_USER_ID } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Wipe restaurants between tests for isolation
    await prisma.restaurant.deleteMany({ where: { userId: TEST_USER_ID } });
  });

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------
  it('creates a restaurant entry', async () => {
    const restaurant = await prisma.restaurant.create({
      data: {
        userId: TEST_USER_ID,
        name: 'The Golden Fork',
        cuisineType: 'Italian',
        googleMapsUrl: 'https://maps.google.com/?q=The+Golden+Fork',
        visitDate: new Date('2024-06-15'),
        rating: 4,
        wouldVisitAgain: true,
        notes: 'Great pasta, a bit noisy.',
      },
    });

    expect(restaurant.id).toBeTruthy();
    expect(restaurant.name).toBe('The Golden Fork');
    expect(restaurant.cuisineType).toBe('Italian');
    expect(restaurant.rating).toBe(4);
    expect(restaurant.wouldVisitAgain).toBe(true);
    expect(restaurant.userId).toBe(TEST_USER_ID);
  });

  // ---------------------------------------------------------------------------
  // Read (list)
  // ---------------------------------------------------------------------------
  it('reads all restaurants for a user', async () => {
    await prisma.restaurant.createMany({
      data: [
        {
          userId: TEST_USER_ID,
          name: 'Sushi Place',
          cuisineType: 'Japanese',
          visitDate: new Date('2024-07-01'),
          rating: 5,
          wouldVisitAgain: true,
        },
        {
          userId: TEST_USER_ID,
          name: 'Taco Stand',
          cuisineType: 'Mexican',
          visitDate: new Date('2024-07-10'),
          rating: 3,
          wouldVisitAgain: false,
        },
      ],
    });

    const restaurants = await prisma.restaurant.findMany({
      where: { userId: TEST_USER_ID },
      orderBy: { visitDate: 'asc' },
    });

    expect(restaurants).toHaveLength(2);
    expect(restaurants[0]?.name).toBe('Sushi Place');
    expect(restaurants[1]?.name).toBe('Taco Stand');
  });

  // ---------------------------------------------------------------------------
  // Read (single)
  // ---------------------------------------------------------------------------
  it('reads a single restaurant by id', async () => {
    const created = await prisma.restaurant.create({
      data: {
        userId: TEST_USER_ID,
        name: 'Burger Barn',
        cuisineType: 'American',
        visitDate: new Date('2024-08-01'),
        rating: 2,
        wouldVisitAgain: false,
      },
    });

    const found = await prisma.restaurant.findUnique({ where: { id: created.id } });
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Burger Barn');
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------
  it('updates a restaurant entry', async () => {
    const created = await prisma.restaurant.create({
      data: {
        userId: TEST_USER_ID,
        name: 'Old Name',
        cuisineType: 'French',
        visitDate: new Date('2024-09-01'),
        rating: 3,
        wouldVisitAgain: false,
      },
    });

    const updated = await prisma.restaurant.update({
      where: { id: created.id },
      data: { name: 'New Name', rating: 5, wouldVisitAgain: true },
    });

    expect(updated.name).toBe('New Name');
    expect(updated.rating).toBe(5);
    expect(updated.wouldVisitAgain).toBe(true);
    // updatedAt should be at or after createdAt
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(updated.createdAt.getTime());
  });

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------
  it('deletes a restaurant entry', async () => {
    const created = await prisma.restaurant.create({
      data: {
        userId: TEST_USER_ID,
        name: 'To Be Deleted',
        cuisineType: 'Greek',
        visitDate: new Date('2024-10-01'),
        rating: 1,
        wouldVisitAgain: false,
      },
    });

    await prisma.restaurant.delete({ where: { id: created.id } });

    const found = await prisma.restaurant.findUnique({ where: { id: created.id } });
    expect(found).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // User scoping — ensure a user cannot see another user's data
  // ---------------------------------------------------------------------------
  it('does not return restaurants belonging to a different user', async () => {
    const otherUserId = 'other-user-sub-99999';

    // Create the other user
    await prisma.user.upsert({
      where: { id: otherUserId },
      create: { id: otherUserId },
      update: {},
    });

    // Create a restaurant for the other user
    await prisma.restaurant.create({
      data: {
        userId: otherUserId,
        name: "Other User's Place",
        cuisineType: 'Thai',
        visitDate: new Date('2024-11-01'),
        rating: 4,
        wouldVisitAgain: true,
      },
    });

    // Query scoped to TEST_USER_ID — should return nothing
    const results = await prisma.restaurant.findMany({
      where: { userId: TEST_USER_ID },
    });
    expect(results).toHaveLength(0);

    // Cleanup
    await prisma.restaurant.deleteMany({ where: { userId: otherUserId } });
    await prisma.user.delete({ where: { id: otherUserId } });
  });

  // ---------------------------------------------------------------------------
  // Rating constraint — verify rating values 1–5 are stored correctly
  // ---------------------------------------------------------------------------
  it('stores all valid rating values (1–5)', async () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      const r = await prisma.restaurant.create({
        data: {
          userId: TEST_USER_ID,
          name: `Rating ${rating} Place`,
          cuisineType: 'Test',
          visitDate: new Date('2024-01-01'),
          rating,
          wouldVisitAgain: rating >= 3,
        },
      });
      expect(r.rating).toBe(rating);
    }

    const all = await prisma.restaurant.findMany({ where: { userId: TEST_USER_ID } });
    expect(all).toHaveLength(5);
  });
});
