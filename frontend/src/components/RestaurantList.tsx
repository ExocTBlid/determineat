import type { Restaurant } from '../types/restaurant.js';
import StarRating from './StarRating.js';

interface RestaurantListProps {
  restaurants: Restaurant[];
  onEdit: (restaurant: Restaurant) => void;
  onDelete: (id: string) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Displays the user's restaurants as a list of cards. Each card shows the
 * name, cuisine, rating, a "would visit again" badge, visit date, notes, and
 * (when present) a Google Maps link. Shows an empty state when there are none.
 */
export default function RestaurantList({ restaurants, onEdit, onDelete }: RestaurantListProps) {
  if (restaurants.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
        <p>No restaurants logged yet.</p>
        <p>Add your first one to start tracking where you&apos;ve eaten.</p>
      </div>
    );
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '1rem' }}>
      {restaurants.map((r) => (
        <li
          key={r.id}
          style={{ border: '1px solid #ddd', borderRadius: 8, padding: '1rem' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h3 style={{ margin: 0 }}>{r.name}</h3>
            <StarRating rating={r.rating} />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <span style={{ color: '#555' }}>{r.cuisineType}</span>
            <span
              style={{
                fontSize: '0.8rem',
                padding: '0.1rem 0.5rem',
                borderRadius: 12,
                background: r.wouldVisitAgain ? '#e6f4ea' : '#fbe9e7',
                color: r.wouldVisitAgain ? '#1e7e34' : '#c62828',
              }}
            >
              {r.wouldVisitAgain ? 'Would visit again' : "Wouldn't return"}
            </span>
            <span style={{ color: '#888', fontSize: '0.85rem' }}>Visited {formatDate(r.visitDate)}</span>
          </div>

          {r.notes && <p style={{ marginTop: '0.5rem', color: '#444' }}>{r.notes}</p>}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', alignItems: 'center' }}>
            {r.googleMapsUrl && (
              <a href={r.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                View on Google Maps
              </a>
            )}
            <button type="button" onClick={() => onEdit(r)}>
              Edit
            </button>
            <button type="button" onClick={() => onDelete(r.id)}>
              Delete
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
