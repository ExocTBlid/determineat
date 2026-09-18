import { fetchAuthSession } from 'aws-amplify/auth';
import type { Restaurant, RestaurantInput } from '../types/restaurant.js';

// ---------------------------------------------------------------------------
// API client
//
// Every call attaches the current Cognito access token as a Bearer token.
// The token is read fresh from the Amplify auth session on each request so we
// always send a valid (auto-refreshed) token.
//
// VITE_API_URL points at the backend. In local dev it can be left empty and
// Vite's proxy forwards /api to the Express server (see vite.config.ts).
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_URL ?? '';

async function authHeader(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  const token = session.tokens?.accessToken?.toString();
  if (!token) {
    throw new Error('Not authenticated: no access token available');
  }
  return { Authorization: `Bearer ${token}` };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // response had no JSON body; keep the default message
    }
    throw new Error(message);
  }
  // 204 No Content has no body
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function listRestaurants(): Promise<Restaurant[]> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE}/api/restaurants`, { headers });
  return handleResponse<Restaurant[]>(res);
}

export async function getRestaurant(id: string): Promise<Restaurant> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE}/api/restaurants/${id}`, { headers });
  return handleResponse<Restaurant>(res);
}

export async function createRestaurant(input: RestaurantInput): Promise<Restaurant> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE}/api/restaurants`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<Restaurant>(res);
}

export async function updateRestaurant(
  id: string,
  input: Partial<RestaurantInput>,
): Promise<Restaurant> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE}/api/restaurants/${id}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return handleResponse<Restaurant>(res);
}

export async function deleteRestaurant(id: string): Promise<void> {
  const headers = await authHeader();
  const res = await fetch(`${API_BASE}/api/restaurants/${id}`, {
    method: 'DELETE',
    headers,
  });
  return handleResponse<void>(res);
}
