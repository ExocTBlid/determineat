import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod validation schemas for restaurant request bodies.
// The service/route layer parses request bodies through these so invalid
// input is rejected with a 400 before it ever reaches the database.
// ---------------------------------------------------------------------------

export const createRestaurantSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  cuisineType: z.string().min(1, 'Cuisine type is required').max(100),
  googleMapsUrl: z.string().url('Must be a valid URL').max(2048).optional().nullable(),
  visitDate: z.coerce.date({ errorMap: () => ({ message: 'Must be a valid date' }) }),
  rating: z.number().int().min(1, 'Rating must be 1–5').max(5, 'Rating must be 1–5'),
  wouldVisitAgain: z.boolean(),
  notes: z.string().max(5000).optional().nullable(),
});

// Update allows partial payloads — any subset of the create fields.
export const updateRestaurantSchema = createRestaurantSchema.partial();

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
