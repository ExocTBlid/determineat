import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

/**
 * The authenticated application shell.
 * Rendered only after a successful Cognito login. Displays the signed-in
 * user's email and a sign-out button.
 *
 * Task 6 will replace the placeholder body with the restaurant list and forms.
 */
function AuthenticatedApp() {
  const { user, signOut } = useAuthenticator((context) => [context.user]);

  // The email is available via the token's signInDetails (loginId)
  const email = user?.signInDetails?.loginId ?? user?.username ?? 'there';

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
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      <section style={{ padding: '1rem' }}>
        <p>Welcome back. Your restaurant log will appear here.</p>
        <p>
          <em>Coming soon (Task 6): add, view, and manage the restaurants you&apos;ve visited.</em>
        </p>
      </section>
    </main>
  );
}

/**
 * Root component.
 * The Authenticator renders the Cognito sign-in / sign-up UI when the user is
 * not authenticated, and renders its children once authenticated.
 */
export default function App() {
  return (
    <Authenticator>
      <AuthenticatedApp />
    </Authenticator>
  );
}
