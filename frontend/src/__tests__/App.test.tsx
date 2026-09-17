import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App', () => {
  it('renders the DeterminEat heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /determineat/i })).toBeInTheDocument();
  });
});
