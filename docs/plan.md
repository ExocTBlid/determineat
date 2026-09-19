# DeterminEat — Implementation Plan

## Problem Statement
Build a secure, full-stack web app where a registered user can log restaurants they've visited, record whether they'd return, and attach metadata (cuisine type, Google Maps link, rating). Deploy it to AWS ECS Fargate via Terraform, triggered by a GitHub Actions pipeline on push to main, with Aurora Serverless v2 as the database, AWS Cognito for auth, and CloudWatch for logs and health monitoring.

## Requirements
- **Auth:** AWS Cognito user pool for registration, login, and JWT-based API authorization
- **Data:** Restaurant entries with fields: name, cuisine type, Google Maps URL, visit date, rating (1–5), would-visit-again (boolean), notes
- **Frontend:** React SPA bundled and served as static files by the Express backend (single container)
- **Backend:** Node/Express REST API in TypeScript, validates Cognito JWTs, talks to Aurora Serverless v2 via Prisma ORM
- **Database:** Aurora Serverless v2 (PostgreSQL-compatible), with automated backups enabled (7-day retention)
- **Infrastructure:** Terraform monorepo, deploying VPC, ECS Fargate, ECR, Aurora Serverless v2, Cognito, ALB, CloudWatch
- **CI/CD:** GitHub Actions — on push to main: lint → test → build Docker image → push to ECR → apply Terraform → deploy to ECS
- **Monitoring:** CloudWatch container logs, ECS health checks, RDS automated backups

## Stack Summary

| Concern | Choice |
|---|---|
| Language | TypeScript (full-stack) |
| Backend framework | Express |
| ORM | Prisma |
| Auth | AWS Cognito + aws-jwt-verify |
| Database | Aurora Serverless v2 (PostgreSQL-compatible) |
| Container | Docker, single image (Express serves React build) |
| Registry | Amazon ECR |
| Orchestration | ECS Fargate |
| Load balancer | ALB (HTTPS termination) |
| IaC | Terraform (S3 remote state, native locking) |
| CI/CD | GitHub Actions (push to main) |
| Monitoring | CloudWatch Logs + ECS health checks |

---

## Task Breakdown

### Task 1: Monorepo scaffold and local dev environment ✓
- **Objective:** Create the repo structure with `frontend/`, `backend/`, `infra/`, and root-level tooling config
- **Implementation:** Initialize with npm workspaces; set up TypeScript configs for both frontend (React/Vite) and backend (Express); add ESLint + Prettier configs shared across packages; add a root `docker-compose.yml` that runs Express + a local PostgreSQL container for development
- **Tests:** Confirm both `frontend` and `backend` TypeScript compile without errors; `docker-compose up` starts both services
- **Demo:** Running `docker-compose up` starts a local Express server and PostgreSQL; hitting `localhost:3000` returns a health-check response
- **Completed:** Monorepo scaffold created. npm workspaces (`frontend/`, `backend/`). Shared tooling: `tsconfig.base.json`, `eslint.config.mjs` (flat config), `.prettierrc`. Backend: Express skeleton with `GET /health`, Jest + Supertest, `tsconfig.json` + `tsconfig.test.json`. Frontend: React 18 + Vite + Vitest + RTL, placeholder `App.tsx`. `docker-compose.yml`: `postgres:16-alpine` + backend with live-reload. `backend/Dockerfile.dev` for local container. Runtime verified: `npm install` ✓, `npm run typecheck` ✓ (both packages), `npm test` ✓ (2 tests pass — backend `/health` + frontend `App` render).

---

### Task 2: Database schema and Prisma setup ✓
- **Objective:** Define the data model and get Prisma migrations working against local PostgreSQL
- **Implementation:** Add Prisma to the backend package; define schema with two models — `User` (Cognito sub as primary key) and `Restaurant` (id, userId, name, cuisineType, googleMapsUrl, visitDate, rating, wouldVisitAgain, notes, createdAt, updatedAt); run initial migration; generate Prisma client
- **Tests:** Write a Jest unit test that uses a test DB via docker-compose to verify create/read/delete operations on `Restaurant`
- **Demo:** Running the migration creates the tables; the test suite passes confirming schema is correct
- **Completed:** `@prisma/client` + `prisma` 5.19.1 added. Schema defined with `User` (Cognito sub PK) and `Restaurant` (cuid PK, all fields, `@@index` on userId, cascade delete on user removal). Prisma client singleton at `src/lib/prisma.ts`. `docker-compose.yml` extended with `postgres_test` on port 5433. Migration `20260917222333_init` created and applied. 6 integration tests written (`restaurant.db.test.ts`) covering create, list, read, update, delete, user scoping, and rating values — all pass. Tests use `describe.skip` when `TEST_DATABASE_URL` is absent so CI without a DB still passes.

---

### Task 3: Express backend — auth middleware and base API ✓
- **Objective:** Scaffold the Express app with Cognito JWT verification middleware and a protected route structure
- **Implementation:** Set up Express with TypeScript; add `aws-jwt-verify` to validate Cognito access tokens on all `/api` routes; implement a `GET /health` (unauthenticated) and a `GET /api/me` endpoint that returns the decoded Cognito user claims; add error handling middleware
- **Tests:** Jest + Supertest — test that `/health` returns 200, `/api/me` with no token returns 401, and `/api/me` with a valid mock JWT returns 200 with user info (mock the JWT verifier)
- **Demo:** `curl localhost:3000/health` → 200; `curl localhost:3000/api/me` without token → 401
- **Completed:** `aws-jwt-verify` 4.0.1 added. `src/middleware/auth.ts` — `requireAuth` middleware using `CognitoJwtVerifier`, strips Bearer prefix, returns 401 on missing/malformed/invalid token. `src/types/express.d.ts` — augments `Express.Request` with `req.user?: CognitoAccessTokenPayload`. `src/routes/me.ts` — `GET /api/me` returns `{sub, username, email}`. `app.ts` updated with `/api/me` route and 4-param global error handler. 5 new auth tests (mocking `aws-jwt-verify`) plus health test updated to include mock. All 14 tests pass.

---

### Task 4: Restaurant CRUD API endpoints ✓
- **Objective:** Build the full REST API for managing restaurant entries, scoped to the authenticated user
- **Implementation:** Implement `GET /api/restaurants`, `POST /api/restaurants`, `GET /api/restaurants/:id`, `PUT /api/restaurants/:id`, `DELETE /api/restaurants/:id`; all queries filter by `userId` from the JWT claims; validate request bodies with `zod`
- **Tests:** Supertest integration tests for each endpoint — happy paths, 404 on missing records, 403 if user tries to access another user's record, and validation errors on bad input
- **Demo:** Using a REST client (e.g., curl), authenticated requests can create, list, update, and delete restaurant entries
- **Completed:** `src/schemas/restaurant.ts` — Zod create/update (partial) schemas. `src/services/restaurant.ts` — user-scoped queries (`ensureUser` upsert before create; update/delete verify ownership). `src/routes/restaurants.ts` — all 5 endpoints behind `requireAuth`, 201 on create, 204 on delete, 400 on validation failure, 404 on missing/cross-user records. Cross-user access returns 404 (record not visible) rather than 403, since queries are scoped by `userId` — this avoids leaking existence of other users' records. Wired at `/api/restaurants`. 13 API integration tests added covering create/list/read/update/delete happy paths, 401 unauthenticated, 400 validation (empty name, rating out of range, bad URL), and cross-user 404 isolation. All 27 tests pass; typecheck clean.

---

### Task 5: React frontend — auth flow with Cognito ✓
- **Objective:** Build the login/register UI wired to Cognito using Amplify UI components
- **Implementation:** Set up React with Vite inside `frontend/`; add `@aws-amplify/ui-react` for the Cognito auth UI; configure Amplify with User Pool ID and Client ID from environment variables; implement a simple authenticated shell that shows the user's email and a logout button
- **Tests:** Vitest + React Testing Library — test that the login form renders, unauthenticated state shows the login screen, and mocked authenticated state shows the app shell
- **Demo:** Opening the app in a browser shows the Cognito login page; registering and logging in shows the authenticated shell with the user's email
- **Completed:** `aws-amplify` 6.6.0 + `@aws-amplify/ui-react` 6.1.14 added (v6 Gen2 config API). `src/amplifyConfig.ts` — `configureAmplify()` reads `VITE_COGNITO_*` env vars, warns if missing, calls `Amplify.configure` with the `Auth.Cognito` shape. `src/vite-env.d.ts` — typed env vars. `App.tsx` — `Authenticator` wraps an `AuthenticatedApp` shell that uses `useAuthenticator` to show the user's email (from `signInDetails.loginId`) and a Sign out button. `main.tsx` — calls `configureAmplify()` and wraps the app in `Authenticator.Provider`. 2 Vitest tests (mocking `@aws-amplify/ui-react`) verify the login screen shows when unauthenticated and the shell + email + sign-out show when authenticated. All 29 tests pass; typecheck clean; production `vite build` succeeds (bundle ~564 kB — Amplify is large, code-splitting noted as a future optimization).

---

### Task 6: React frontend — restaurant list and add/edit UI ✓
- **Objective:** Build the main app screens for viewing and managing restaurant entries
- **Implementation:** Build a `RestaurantList` page showing all entries in a card/table layout with cuisine type, rating (star display), and a "Would Visit Again" badge; build an `AddEditRestaurant` form with fields for all metadata; wire both to the backend API using `fetch` with the Cognito access token in the `Authorization` header; add a Google Maps link that opens in a new tab
- **Tests:** Vitest + React Testing Library — test list renders from mocked API response, form submission calls the correct API endpoint, and empty state is shown when no restaurants exist
- **Demo:** Logged-in user can see their restaurant list, add a new entry via the form, edit it, and delete it — all persisted to the backend
- **Completed:** `src/types/restaurant.ts` (Restaurant + RestaurantInput). `src/api/client.ts` — typed fetch wrapper that pulls the Cognito access token from `fetchAuthSession()` and sends it as `Authorization: Bearer`, with error extraction and 204 handling. Components: `StarRating` (★/☆ with aria-label), `RestaurantList` (cards with cuisine, rating, would-visit-again badge, formatted visit date, notes, Google Maps link in a new tab, Edit/Delete; empty state), `AddEditRestaurant` (controlled form for all fields, edit mode pre-fills, submit error handling), `RestaurantsPage` (container: loads on mount, list/add/edit view state, optimistic delete, reload after mutations). Wired into the authenticated shell in `App.tsx`. 4 Vitest tests (mocking the API client): list renders from API, empty state, create submits correct payload, delete calls endpoint. All 33 tests pass (6 frontend + 27 backend); typecheck clean; production build succeeds (~570 kB).

---

### Task 7: Docker image — production build ✓
- **Objective:** Create a multi-stage Dockerfile that builds the React app and serves it from Express
- **Implementation:** Multi-stage Dockerfile — stage 1 builds the React app with Vite; stage 2 builds the Express backend; stage 3 is the production image that copies both builds, with Express serving static files from `public/` and falling back to `index.html` for client-side routing
- **Tests:** Build the image locally (`docker build`), run it with environment variables pointing to local Postgres, confirm `localhost:3000` serves the React app and API routes work
- **Demo:** Single `docker run` starts the full app — React UI served at `/`, API available at `/api/*`
- **Completed:** `app.ts` serves the SPA in production — when `PUBLIC_DIR` exists it mounts `express.static` and adds an SPA fallback (regex excludes `/api/` and `/health`) so refreshes on client routes return `index.html`. `PUBLIC_DIR` is resolved from `cwd` (no `import.meta`) so it works under both the ESM runtime and the CJS test runner. Root `Dockerfile` — 3 stages: `frontend-build` (Vite), `backend-build` (openssl + `prisma generate` + `tsc`, with `tsconfig.base.json` copied in), `runtime` (prod deps + `prisma` CLI, generated Prisma client copied from build stage, compiled `dist/`, React build → `public/`; `CMD` runs `prisma migrate deploy` then `node dist/index.js`). `typescript` added to both packages' devDependencies (was only at the root, unavailable in the isolated Docker build). Root `.dockerignore` added. 5 static-serving tests added. **Verified against the real image:** built successfully, ran against a Postgres container — `/` serves the SPA (`<title>DeterminEat</title>`), `/some/spa/route` → 200 (fallback), `/health` → 200, `/api/restaurants` → 401, migrations applied on startup. All 38 tests pass; typecheck clean.

---

### Task 8: Terraform — core AWS infrastructure ✓
- **Objective:** Define all AWS resources needed to run the app in Terraform
- **Implementation:** Under `infra/`, create Terraform modules for: VPC (2 AZs, public/private subnets), ECR repository, Cognito User Pool + App Client, Aurora Serverless v2 cluster (PostgreSQL, private subnet group, automated backups with 7-day retention), ECS cluster + Fargate task definition + service, ALB with HTTPS listener (ACM cert), IAM roles for ECS task execution, CloudWatch log group; use S3 + DynamoDB for Terraform remote state; parameterize via `terraform.tfvars`
- **Tests:** Run `terraform validate` and `terraform plan` against a dev workspace; verify resource counts match expectations
- **Demo:** `terraform apply` provisions all infrastructure; the ECS service is running; ALB health check passes
- **Completed:** Root config (`versions.tf`, `variables.tf`, `main.tf`, `outputs.tf`, `security_groups.tf`) plus five modules under `infra/modules/`: `vpc` (2 AZs, public/private subnets, IGW, single NAT), `ecr` (repo + scan-on-push + last-10 lifecycle), `cognito` (user pool + public app client, no secret, SRP+refresh, per `docs/cognito.md`), `aurora` (Serverless v2 PostgreSQL, private DB subnet group, SG locked to ECS, 7-day backups, `DATABASE_URL` in Secrets Manager), `alb` (public ALB, `/health` target group, HTTPS+HTTP-redirect when an ACM cert is set, HTTP-only fallback otherwise), `ecs` (cluster w/ Container Insights, Fargate task def pulling `DATABASE_URL` from Secrets Manager + Cognito IDs as env, execution/task IAM roles, CloudWatch log group, container health check). S3 remote state via `-backend-config` (`backend.hcl.example`) — originally paired with a DynamoDB lock table, later switched to native S3 locking (`use_lockfile`) during the bootstrap refactor, so no DynamoDB is used. A cross-module dependency cycle (ECS needs the DB secret, Aurora needs the ECS SG) was broken by defining the tasks security group at the root. **Verified:** `terraform fmt` clean, `terraform init -backend=false` + `terraform validate` → "Success! The configuration is valid." (`plan`/`apply` require real AWS credentials, not run here.) Also fixed `.gitignore` to commit `.terraform.lock.hcl` (provider pinning) and stop ignoring `.dockerignore`.

---

### Task 9: GitHub Actions CI/CD pipeline ✓
- **Objective:** Automate the full test → build → deploy pipeline on push to main
- **Implementation:** Create `.github/workflows/deploy.yml` with jobs: (1) **test** — runs backend Jest tests and frontend Vitest tests; (2) **build** — builds Docker image, tags with git SHA, pushes to ECR; (3) **deploy** — runs `terraform init` + `terraform apply -auto-approve` with new image tag, then forces new ECS deployment; store AWS credentials and config as GitHub Actions secrets
- **Tests:** Push a change to main and verify all three jobs pass; intentionally break a test to confirm pipeline blocks deployment
- **Demo:** Merging a PR to main automatically runs tests, builds a new Docker image, updates Terraform state, and deploys the new container to ECS
- **Completed:** `.github/workflows/deploy.yml` with three jobs — **test** (runs on push + PR: `setup-node@v4` pinned to 20, `npm ci`, spins up the `postgres_test` container, applies migrations, then typecheck + lint + test), **build** (push-to-main only, after test: OIDC auth, ECR login, `docker build` with the `VITE_*` Cognito values passed as build args, pushes SHA + `latest` tags), **deploy** (after build: OIDC auth, `hashicorp/setup-terraform@v3` pinned to 1.9.8, `terraform init -backend-config=backend.hcl`, `terraform apply` with the new image URI, `aws ecs update-service --force-new-deployment`, then waits for the service to stabilize).
- **Deviations from the original plan:**
  - **Auth uses OIDC, not stored AWS keys.** The pipeline assumes a role via `id-token` instead of storing `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` secrets. Config is passed via repo **variables** (not secrets), since none of them are sensitive with OIDC. The OIDC provider and deploy role are created by `infra/bootstrap.py` (idempotent, boto3); the `github_oidc` Terraform module only *references* the role via a data source, avoiding the chicken-and-egg where the role must exist before the OIDC-authenticated pipeline can run Terraform. State locking is native to S3 (`use_lockfile`, Terraform 1.10+) so no DynamoDB table is needed.
  - **Runner tooling is pinned explicitly.** GitHub-hosted runners don't ship Terraform, so `hashicorp/setup-terraform@v3` installs it (pinned 1.9.8, satisfying `versions.tf`'s `>= 1.10`); Node is pinned via `setup-node@v4`.
  - **Migrations run in the container on startup, not as a pipeline step** — the runner can't reach the private-subnet Aurora instance, and the Dockerfile `CMD` already runs `prisma migrate deploy`.
  - **Dockerfile frontend stage** gained `ARG`/`ENV` for the `VITE_*` vars, because Vite inlines them at build time.
- **Verified:** `terraform validate` passes with the new module; workflow YAML parses cleanly; `npm run lint` is clean (removed a stale `eslint-disable`); all 38 tests pass. `plan`/`apply` and a live pipeline run require a real AWS account + GitHub repo, not exercised here.

---

### Task 10: CloudWatch monitoring and operational readiness
- **Objective:** Ensure the app is observable and recovers from failures automatically
- **Implementation:** Configure ECS health check on `GET /health` (30s interval, 3 retries); confirm CloudWatch log group receives container stdout/stderr; add CloudWatch log metric filter for `ERROR` log level; add Prisma database connection retry logic on startup (for Aurora cold-start); document operational runbook in `README.md`
- **Tests:** Simulate a failed health check locally; verify logs appear in CloudWatch after ECS deployment
- **Demo:** App is live on the ALB URL; CloudWatch shows live container logs; ECS console shows the service as stable with passing health checks
