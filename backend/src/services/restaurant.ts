import { prisma } from '../lib/prisma.js';
import type { CreateRestaurantInput, UpdateRestaurantInput } from '../schemas/restaurant.js';

// ---------------------------------------------------------------------------
// Restaurant service layer
//
// Every function is scoped to a userId (the Cognito sub). This is the single
// enforcement point for data isolation — a user can never read or mutate
// another user's records because userId is always part of the query.
// ---------------------------------------------------------------------------

/**
 * Ensures a User row exists for the given Cognito sub.
 * Restaurants have a FK to User, so this must run before the first insert.
 * Idempotent — safe to call on every write.
 */
async function ensureUser(userId: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId },
    update: {},
  });
}

export async function listRestaurants(userId: string) {
  return prisma.restaurant.findMany({
    where: { userId },
    orderBy: { visitDate: 'desc' },
  });
}

export async function getRestaurant(userId: string, id: string) {
  // Scoped by both id AND userId — another user's record returns null
  return prisma.restaurant.findFirst({
    where: { id, userId },
  });
}

export async function createRestaurant(userId: string, input: CreateRestaurantInput) {
  await ensureUser(userId);
  return prisma.restaurant.create({
    data: {
      userId,
      name: input.name,
      cuisineType: input.cuisineType,
      googleMapsUrl: input.googleMapsUrl ?? null,
      visitDate: input.visitDate,
      rating: input.rating,
      wouldVisitAgain: input.wouldVisitAgain,
      notes: input.notes ?? null,
    },
  });
}

/**
 * Updates a restaurant only if it belongs to the user.
 * Returns null if no matching record exists (missing or owned by someone else).
 */
export async function updateRestaurant(userId: string, id: string, input: UpdateRestaurantInput) {
  // Confirm ownership first
  const existing = await prisma.restaurant.findFirst({ where: { id, userId } });
  if (!existing) return null;

  return prisma.restaurant.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.cuisineType !== undefined && { cuisineType: input.cuisineType }),
      ...(input.googleMapsUrl !== undefined && { googleMapsUrl: input.googleMapsUrl }),
      ...(input.visitDate !== undefined && { visitDate: input.visitDate }),
      ...(input.rating !== undefined && { rating: input.rating }),
      ...(input.wouldVisitAgain !== undefined && { wouldVisitAgain: input.wouldVisitAgain }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });
}

/**
 * Deletes a restaurant only if it belongs to the user.
 * Returns false if no matching record exists.
 */
export async function deleteRestaurant(userId: string, id: string): Promise<boolean> {
  const existing = await prisma.restaurant.findFirst({ where: { id, userId } });
  if (!existing) return false;

  await prisma.restaurant.delete({ where: { id } });
  return true;
}
