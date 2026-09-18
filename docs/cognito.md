# DeterminEat — AWS Cognito Reference

This document describes the Amazon Cognito requirements for DeterminEat: what the
user pool and app client must look like, which environment variables the frontend
and backend consume, and how tokens flow through the system. The Cognito resources
themselves are provisioned by Terraform in Task 8 — this doc is the spec those
resources must satisfy.

> Content on this page was summarized from AWS documentation (linked throughout)
> and rephrased for compliance with licensing restrictions.

---

## Overview

DeterminEat uses a Cognito **user pool** as its identity provider. The frontend
(React + Amplify UI) handles sign-up, sign-in, and token storage. The backend
(Express) never sees passwords — it only validates the JWT access token that the
frontend sends on each API request.

```
Browser (Amplify UI)                Express backend
   │                                      │
   │ 1. sign up / sign in ───────────────▶│  (goes to Cognito, not the backend)
   │◀── tokens (id, access, refresh) ─────┤
   │                                      │
   │ 2. GET /api/... with                 │
   │    Authorization: Bearer <access> ──▶│ 3. aws-jwt-verify validates the token
   │◀────────────── JSON response ────────┤    against Cognito's public JWKS
```

---

## User Pool Requirements

| Setting | Required value | Why |
|---|---|---|
| Sign-in identifier | Email | Users sign in with their email address; matches `loginWith: { email: true }` in the frontend Amplify config |
| Self-service sign-up | Enabled | Allows users to register themselves (personal app, no admin provisioning) |
| Account verification | Email code | Cognito emails a verification code on sign-up |
| Password policy | Cognito defaults or stronger | Minimum length + complexity; enforced by Cognito, not the app |
| MFA | Optional (off for MVP) | Can be enabled later without app changes |
| Attributes | `email` (required, standard) | The app reads `email` from the token to display the signed-in user |

Reference: [Amazon Cognito user pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools.html),
[Configuring sign-up](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-admin-create-user-policy.html).

---

## App Client Requirements

The React app is a browser SPA, which is a **public client** — it runs entirely
in the user's browser and cannot keep a secret confidential. This drives the most
important requirement:

| Setting | Required value | Why |
|---|---|---|
| **Client secret** | **None (do not generate)** | A browser SPA cannot protect a secret. Amplify expects a public client with no secret. Creating one with a secret breaks the Amplify sign-in flow. |
| Auth flows | `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` | SRP keeps the password off the wire; refresh flow lets Amplify renew tokens silently |
| Callback / sign-out URLs | App origins only | Restrict to the actual app URLs (e.g. `http://localhost:5173` for dev, the ALB/CloudFront URL for prod) |
| Token expiry | Access/ID short (e.g. 1h), refresh longer (e.g. 30d) | Short-lived access tokens limit exposure if leaked |

A public client without a secret, with callback/sign-out URLs and OAuth flows
scoped to the real application, is the recommended configuration for browser and
mobile apps. Reference:
[App client settings](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html),
[Cognito security best practices](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-security-best-practices.html).

---

## Environment Variables

These are the only Cognito values the application needs. Terraform (Task 8) will
output the user pool ID and app client ID after provisioning; wire those into the
environments below.

### Frontend (`frontend/.env`)

| Variable | Example | Source |
|---|---|---|
| `VITE_COGNITO_USER_POOL_ID` | `us-east-1_ABC123xyz` | Terraform output |
| `VITE_COGNITO_CLIENT_ID` | `1a2b3c4d5e6f7g8h9i0j` | Terraform output (public app client) |
| `VITE_AWS_REGION` | `us-east-1` | Deployment region |

Consumed by `frontend/src/amplifyConfig.ts` via `Amplify.configure(...)`.

### Backend (`backend/.env`)

| Variable | Example | Source |
|---|---|---|
| `COGNITO_USER_POOL_ID` | `us-east-1_ABC123xyz` | Terraform output (same pool as frontend) |
| `COGNITO_CLIENT_ID` | `1a2b3c4d5e6f7g8h9i0j` | Terraform output (same client as frontend) |
| `AWS_REGION` | `us-east-1` | Deployment region |

Consumed by `backend/src/middleware/auth.ts` via `CognitoJwtVerifier.create(...)`.

> The frontend and backend must reference the **same** user pool and app client.
> The backend verifies the `client_id` claim on the access token against
> `COGNITO_CLIENT_ID`, so a mismatch will reject every request with 401.

---

## Token Model

Cognito issues three tokens on sign-in. DeterminEat uses them as follows:

| Token | Used by | Purpose |
|---|---|---|
| **Access token** | Backend API auth | Sent as `Authorization: Bearer <token>`; verified on every `/api/*` request. Carries `sub`, `client_id`, `scope`. |
| **ID token** | Frontend display | Carries user profile claims (`email`, etc.); Amplify manages it client-side |
| **Refresh token** | Frontend (Amplify) | Silently renews the access/ID tokens when they expire |

Important details confirmed from AWS docs:

- Access tokens and ID tokens are **signed with different keys**, so they must be
  verified independently. DeterminEat's backend verifies the **access token** only.
  ([Understanding the access token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html))
- Every application that consumes Cognito JWTs must verify the signature against
  the pool's public keys on each sign-in — a modified access token is a
  privilege-escalation risk.
  ([Verifying a JSON Web Token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html))

---

## How DeterminEat Verifies Tokens

The backend uses the official [`aws-jwt-verify`](https://github.com/awslabs/aws-jwt-verify)
library. The verifier is configured in `backend/src/middleware/auth.ts`:

```ts
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env['COGNITO_USER_POOL_ID'] ?? '',
  clientId: process.env['COGNITO_CLIENT_ID'] ?? '',
  tokenUse: 'access',
});
```

On each request the `requireAuth` middleware:

1. Reads the `Authorization: Bearer <token>` header (401 if missing/malformed).
2. Calls `verifier.verify(token)`, which checks:
   - the **signature** against Cognito's public JWKS (cached after first fetch),
   - the **expiry** (`exp`),
   - the **issuer** (`iss`) matches the configured user pool,
   - the **token use** is `access`,
   - the **client_id** matches the configured app client.
3. On success, attaches the decoded claims to `req.user`. On failure, responds 401.

`aws-jwt-verify` fetches and caches the JWKS, so only the first verification makes
a network call. Reference:
[Decode and verify a Cognito JWT](https://aws.amazon.com/premiumsupport/knowledge-center/decode-verify-cognito-json-token/).

---

## Local Development Without a Real Pool

The unit/integration tests **mock** `aws-jwt-verify` and `@aws-amplify/ui-react`,
so no live Cognito pool is needed to run the test suite. To exercise the real
sign-in flow locally, you need an actual user pool — set the `VITE_COGNITO_*` and
`COGNITO_*` variables to a real pool created via Terraform (Task 8) or the AWS
console.

---

## Related Files

- `frontend/src/amplifyConfig.ts` — Amplify/Cognito configuration
- `backend/src/middleware/auth.ts` — access-token verification middleware
- `infra/modules/cognito/` — Terraform for the pool + app client (Task 8)

## AWS Documentation Index

- [Amazon Cognito user pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools.html)
- [Application-specific settings with app clients](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html)
- [Integrating Cognito with web and mobile apps](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-integrate-apps.html)
- [Understanding the access token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-access-token.html)
- [Verifying a JSON Web Token](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html)
- [Security best practices for Cognito user pools](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-security-best-practices.html)
- [aws-jwt-verify (GitHub)](https://github.com/awslabs/aws-jwt-verify)
- [Amplify UI Authenticator (React)](https://ui.docs.amplify.aws/react/components/authenticator)
