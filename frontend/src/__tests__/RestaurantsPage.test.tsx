import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Restaurant } from '../types/restaurant';

// ---------------------------------------------------------------------------
// Mock the API client so tests never hit Amplify or the network.
// ---------------------------------------------------------------------------
const mockList = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('../api/client', () => ({
  listRestaurants: () => mockList(),
  createRestaurant: (input: unknown) => mockCreate(input),
  updateRestaurant: (id: string, input: unknown) => mockUpdate(id, input),
  deleteRestaurant: (id: string) => mockDelete(id),
}));

import RestaurantsPage from '../components/RestaurantsPage';

const sampleRestaurant: Restaurant = {
  id: 'r1',
  userId: 'u1',
  name: 'The Golden Fork',
  cuisineType: 'Italian',
  googleMapsUrl: 'https://maps.google.com/?q=golden-fork',
  visitDate: '2024-06-15T00:00:00.000Z',
  rating: 4,
  wouldVisitAgain: true,
  notes: 'Great pasta',
  createdAt: '2024-06-16T00:00:00.000Z',
  updatedAt: '2024-06-16T00:00:00.000Z',
};

describe('RestaurantsPage', () => {
  beforeEach(() => {
    mockList.mockReset();
    mockCreate.mockReset();
    mockUpdate.mockReset();
    mockDelete.mockReset();
  });

  it('renders the list from the API response', async () => {
    mockList.mockResolvedValue([sampleRestaurant]);

    render(<RestaurantsPage />);

    expect(await screen.findByText('The Golden Fork')).toBeInTheDocument();
    expect(screen.getByText('Italian')).toBeInTheDocument();
    expect(screen.getByText(/would visit again/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /google maps/i })).toHaveAttribute(
      'href',
      'https://maps.google.com/?q=golden-fork',
    );
  });

  it('shows the empty state when there are no restaurants', async () => {
    mockList.mockResolvedValue([]);

    render(<RestaurantsPage />);

    expect(await screen.findByText(/no restaurants logged yet/i)).toBeInTheDocument();
  });

  it('submits a new restaurant to the create endpoint', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([]); // initial load, then reload after create
    mockCreate.mockResolvedValue({ ...sampleRestaurant, id: 'new' });

    render(<RestaurantsPage />);

    // Wait for initial load, then open the add form
    await screen.findByText(/no restaurants logged yet/i);
    await user.click(screen.getByRole('button', { name: /add restaurant/i }));

    // Fill required fields
    await user.type(screen.getByLabelText(/^name/i), 'New Place');
    await user.type(screen.getByLabelText(/cuisine type/i), 'Thai');
    // visit date input
    const dateInput = screen.getByLabelText(/visit date/i);
    await user.type(dateInput, '2024-07-20');

    await user.click(screen.getByRole('button', { name: /add restaurant/i }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'New Place',
        cuisineType: 'Thai',
        visitDate: '2024-07-20',
      }),
    );
  });

  it('deletes a restaurant via the delete endpoint', async () => {
    const user = userEvent.setup();
    mockList.mockResolvedValue([sampleRestaurant]);
    mockDelete.mockResolvedValue(undefined);

    render(<RestaurantsPage />);

    await screen.findByText('The Golden Fork');
    await user.click(screen.getByRole('button', { name: /delete/i }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('r1');
    });
  });
});
