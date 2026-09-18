import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @aws-amplify/ui-react
//
// The real Authenticator talks to Cognito, which we can't do in a unit test.
// We mock it so we can drive the two states we care about:
//   - unauthenticated: Authenticator renders its own login UI (not children)
//   - authenticated:   Authenticator renders children, and useAuthenticator
//                      returns a user object
//
// `mockAuthState` lets each test choose which branch to exercise.
// ---------------------------------------------------------------------------

interface MockUser {
  username: string;
  signInDetails?: { loginId?: string };
}

let mockAuthState: { authenticated: boolean; user: MockUser | null } = {
  authenticated: false,
  user: null,
};

const mockSignOut = vi.fn();

vi.mock('@aws-amplify/ui-react', () => ({
  // CSS import is a no-op in tests
  Authenticator: ({ children }: { children: React.ReactNode }) => {
    if (mockAuthState.authenticated) {
      return <div data-testid="authenticated">{children}</div>;
    }
    return <div data-testid="login-screen">Sign in to DeterminEat</div>;
  },
  useAuthenticator: () => ({
    user: mockAuthState.user,
    signOut: mockSignOut,
  }),
}));

// styles.css import in App.tsx — stub so the import doesn't fail
vi.mock('@aws-amplify/ui-react/styles.css', () => ({}));

import App from '../App';

describe('App auth flow', () => {
  beforeEach(() => {
    mockAuthState = { authenticated: false, user: null };
    mockSignOut.mockClear();
  });

  it('shows the login screen when the user is not authenticated', () => {
    render(<App />);
    expect(screen.getByTestId('login-screen')).toBeInTheDocument();
    // The authenticated shell heading should NOT be present
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('shows the authenticated shell with the user email when logged in', () => {
    mockAuthState = {
      authenticated: true,
      user: { username: 'abc123', signInDetails: { loginId: 'diner@example.com' } },
    };

    render(<App />);

    expect(screen.getByRole('heading', { name: /determineat/i })).toBeInTheDocument();
    expect(screen.getByText('diner@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });
});
