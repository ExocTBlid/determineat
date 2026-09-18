// Shape of a restaurant as returned by the backend API.
export interface Restaurant {
  id: string;
  userId: string;
  name: string;
  cuisineType: string;
  googleMapsUrl: string | null;
  visitDate: string; // ISO date string from the API
  rating: number; // 1–5
  wouldVisitAgain: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Payload for creating or updating a restaurant (no server-managed fields).
export interface RestaurantInput {
  name: string;
  cuisineType: string;
  googleMapsUrl?: string | null;
  visitDate: string; // YYYY-MM-DD
  rating: number;
  wouldVisitAgain: boolean;
  notes?: string | null;
}
