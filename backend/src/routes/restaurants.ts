import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createRestaurantSchema, updateRestaurantSchema } from '../schemas/restaurant.js';
import {
  listRestaurants,
  getRestaurant,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
} from '../services/restaurant.js';

const router = Router();

// All restaurant routes require a valid Cognito token.
router.use(requireAuth);

// GET /api/restaurants — list all entries for the authenticated user
router.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const restaurants = await listRestaurants(userId);
  res.json(restaurants);
});

// POST /api/restaurants — create a new entry
router.post('/', async (req: Request, res: Response) => {
  const parsed = createRestaurantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const userId = req.user!.sub;
  const restaurant = await createRestaurant(userId, parsed.data);
  res.status(201).json(restaurant);
});

// GET /api/restaurants/:id — fetch a single entry
router.get('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const restaurant = await getRestaurant(userId, req.params.id!);
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }
  res.json(restaurant);
});

// PUT /api/restaurants/:id — update an entry
router.put('/:id', async (req: Request, res: Response) => {
  const parsed = updateRestaurantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const userId = req.user!.sub;
  const updated = await updateRestaurant(userId, req.params.id!, parsed.data);
  if (!updated) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }
  res.json(updated);
});

// DELETE /api/restaurants/:id — remove an entry
router.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.sub;
  const deleted = await deleteRestaurant(userId, req.params.id!);
  if (!deleted) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }
  res.status(204).send();
});

export default router;
