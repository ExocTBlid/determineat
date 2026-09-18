import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Authenticator } from '@aws-amplify/ui-react';
import App from './App.js';
import { configureAmplify } from './amplifyConfig.js';

// Configure Amplify/Cognito before the app renders
configureAmplify();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in document');
}

createRoot(rootElement).render(
  <StrictMode>
    <Authenticator.Provider>
      <App />
    </Authenticator.Provider>
  </StrictMode>,
);
