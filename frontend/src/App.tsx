import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import RestaurantsPage from './components/RestaurantsPage.js';

// Dev auth bypass — mirrors the backend's AUTH_MODE=dev. When enabled the app
// skips the Cognito Authenticator entirely and renders as a fixed dev user, so
// local development needs no live Cognito pool. See docs/cognito.md.
const DEV_AUTH = import.meta.env.VITE_AUTH_MODE === 'dev';
const DEV_EMAIL = 'dev@determineat.local';

/**
 * Presentational app shell. Shows the signed-in user's email, a sign-out
 * control, and the restaurant management page. Auth-agnostic — it receives the
 * email and sign-out handler from whichever auth path rendered it.
 */
function AppShell({ email, signOut }: { email: string; signOut?: () => void }) {
  return (
    <main>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem',
          borderBottom: '1px solid #ddd',
        }}
      >
        <h1 style={{ margin: 0 }}>DeterminEat</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span>{email}</span>
          {signOut && (
            <button type="button" onClick={signOut}>
              Sign out
            </button>
          )}
        </div>
      </header>

      <section style={{ padding: '1rem' }}>
        <RestaurantsPage />
      </section>
    </main>
  );
}

/**
 * The authenticated application shell (Cognito path).
 * Rendered only after a successful Cognito login.
 */
function AuthenticatedApp() {
  const { user, signOut } = useAuthenticator((context) => [context.user]);

  // The email is available via the token's signInDetails (loginId)
  const email = user?.signInDetails?.loginId ?? user?.username ?? 'there';

  return <AppShell email={email} signOut={signOut} />;
}

/**
 * Root component.
 *
 * In dev-auth mode (VITE_AUTH_MODE=dev) the Cognito Authenticator is skipped
 * and the app renders directly as the fixed dev user. Otherwise the
 * Authenticator renders the Cognito sign-in / sign-up UI when the user is not
 * authenticated, and renders its children once authenticated.
 */
export default function App() {
  if (DEV_AUTH) {
    return <AppShell email={DEV_EMAIL} />;
  }

  return (
    <Authenticator>
      <AuthenticatedApp />
    </Authenticator>
  );
}
