import { useEffect, useState, useCallback } from 'react';
import type { Restaurant, RestaurantInput } from '../types/restaurant.js';
import {
  listRestaurants,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
} from '../api/client.js';
import RestaurantList from './RestaurantList.js';
import AddEditRestaurant from './AddEditRestaurant.js';

type View = { mode: 'list' } | { mode: 'add' } | { mode: 'edit'; restaurant: Restaurant };

/**
 * Container for the restaurant feature. Loads the list on mount, and toggles
 * between the list view and the add/edit form. All data mutations go through
 * the API client and refresh the list on success.
 */
export default function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [view, setView] = useState<View>({ mode: 'list' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listRestaurants();
      setRestaurants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load restaurants');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(input: RestaurantInput) {
    await createRestaurant(input);
    setView({ mode: 'list' });
    await load();
  }

  async function handleUpdate(id: string, input: RestaurantInput) {
    await updateRestaurant(id, input);
    setView({ mode: 'list' });
    await load();
  }

  async function handleDelete(id: string) {
    // Optimistically remove, then reconcile with a reload
    setRestaurants((prev) => prev.filter((r) => r.id !== id));
    try {
      await deleteRestaurant(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      await load();
    }
  }

  if (view.mode === 'add') {
    return (
      <AddEditRestaurant
        onSubmit={handleCreate}
        onCancel={() => setView({ mode: 'list' })}
      />
    );
  }

  if (view.mode === 'edit') {
    return (
      <AddEditRestaurant
        initial={view.restaurant}
        onSubmit={(input) => handleUpdate(view.restaurant.id, input)}
        onCancel={() => setView({ mode: 'list' })}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Your restaurants</h2>
        <button type="button" onClick={() => setView({ mode: 'add' })}>
          Add restaurant
        </button>
      </div>

      {error && <p style={{ color: '#c62828' }}>{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <RestaurantList
          restaurants={restaurants}
          onEdit={(restaurant) => setView({ mode: 'edit', restaurant })}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
