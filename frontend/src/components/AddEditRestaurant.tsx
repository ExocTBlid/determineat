import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Restaurant, RestaurantInput } from '../types/restaurant.js';

interface AddEditRestaurantProps {
  /** When provided, the form is in "edit" mode and pre-filled. */
  initial?: Restaurant | null;
  onSubmit: (input: RestaurantInput) => Promise<void>;
  onCancel: () => void;
}

function toDateInputValue(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Form for creating or editing a restaurant entry. Covers all metadata fields:
 * name, cuisine, Google Maps URL, visit date, rating, would-visit-again, notes.
 */
export default function AddEditRestaurant({ initial, onSubmit, onCancel }: AddEditRestaurantProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [cuisineType, setCuisineType] = useState(initial?.cuisineType ?? '');
  const [googleMapsUrl, setGoogleMapsUrl] = useState(initial?.googleMapsUrl ?? '');
  const [visitDate, setVisitDate] = useState(toDateInputValue(initial?.visitDate));
  const [rating, setRating] = useState(initial?.rating ?? 3);
  const [wouldVisitAgain, setWouldVisitAgain] = useState(initial?.wouldVisitAgain ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEdit = Boolean(initial);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name,
        cuisineType,
        googleMapsUrl: googleMapsUrl.trim() === '' ? null : googleMapsUrl.trim(),
        visitDate,
        rating,
        wouldVisitAgain,
        notes: notes.trim() === '' ? null : notes.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 480 }}>
      <h2>{isEdit ? 'Edit restaurant' : 'Add restaurant'}</h2>

      {error && <p style={{ color: '#c62828' }}>{error}</p>}

      <label>
        Name
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
        />
      </label>

      <label>
        Cuisine type
        <input
          type="text"
          value={cuisineType}
          onChange={(e) => setCuisineType(e.target.value)}
          required
          maxLength={100}
        />
      </label>

      <label>
        Google Maps URL (optional)
        <input
          type="url"
          value={googleMapsUrl ?? ''}
          onChange={(e) => setGoogleMapsUrl(e.target.value)}
          placeholder="https://maps.google.com/..."
        />
      </label>

      <label>
        Visit date
        <input
          type="date"
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
          required
        />
      </label>

      <label>
        Rating
        <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} star{n > 1 ? 's' : ''}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={wouldVisitAgain}
          onChange={(e) => setWouldVisitAgain(e.target.checked)}
        />
        Would visit again
      </label>

      <label>
        Notes (optional)
        <textarea
          value={notes ?? ''}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={5000}
        />
      </label>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add restaurant'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}
