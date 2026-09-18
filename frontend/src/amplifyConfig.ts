import { Amplify } from 'aws-amplify';

// ---------------------------------------------------------------------------
// Amplify / Cognito configuration
//
// Values come from Vite env vars (VITE_*), injected at build time.
// See frontend/.env.example for the required variables.
// ---------------------------------------------------------------------------

export function configureAmplify(): void {
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

  if (!userPoolId || !userPoolClientId) {
    // Surface a clear message in dev rather than a cryptic Amplify error
    console.warn(
      'Cognito env vars missing (VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_CLIENT_ID). ' +
        'Auth will not work until these are set.',
    );
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: userPoolId ?? '',
        userPoolClientId: userPoolClientId ?? '',
        loginWith: {
          email: true,
        },
      },
    },
  });
}
