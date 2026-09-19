# DeterminEat

A personal restaurant visit logger. Track the restaurants you've been to, whether you'd go back, and all the details that matter — cuisine type, rating, notes, and a direct Google Maps link.

Built with TypeScript full-stack (React + Express), deployed to AWS ECS Fargate via Terraform, with AWS Cognito handling authentication.

> **Status:** In development. See [`docs/plan.md`](docs/plan.md) for the full implementation plan.

---

## Features

- Secure user registration and login via AWS Cognito
- Log restaurant visits with:
  - Name and cuisine type
  - Google Maps link
  - Visit date
  - Rating (1–5 stars)
  - Would visit again? (yes/no)
  - Free-text notes
- View, edit, and delete your entries
- Fully private — each user only sees their own data

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, AWS Amplify UI |
| Backend | Node.js, Express, TypeScript |
| ORM | Prisma |
| Auth | AWS Cognito |
| Database | Aurora Serverless v2 (PostgreSQL) |
| Infrastructure | AWS ECS Fargate, ALB, ECR, VPC |
| IaC | Terraform |
| CI/CD | GitHub Actions |
| Monitoring | CloudWatch Logs |

---

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Docker](https://www.docker.com/) with the Compose v2 plugin (use `docker compose`, not `docker-compose`)
- [AWS CLI](https://aws.amazon.com/cli/) (for deployment)
- [Terraform](https://www.terraform.io/) v1.5+ (for infrastructure)

> **Heads up on authentication:** the app authenticates against a real AWS Cognito
> user pool. Without one, the backend and `/health` still run, but you can't log in
> through the UI or call the `/api/*` endpoints (they require a valid Cognito JWT).
> The full test suite runs without any AWS resources. To exercise the real sign-in
> flow, provision Cognito via Terraform (Task 8) or create a pool manually — see
> [`docs/cognito.md`](docs/cognito.md).

### Getting Started

1. **Clone the repo and install dependencies**
   ```bash
   git clone https://github.com/your-username/determineat.git
   cd determineat
   npm install
   ```

2. **Create the env files**
   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```
   Fill in the `COGNITO_*` / `VITE_COGNITO_*` values if you have a user pool
   (see [`docs/cognito.md`](docs/cognito.md)). The defaults are fine for starting
   the server and running tests.

3. **Start PostgreSQL**
   ```bash
   docker compose up -d postgres
   ```
   PostgreSQL listens on `localhost:5432`.

4. **Run the database migration** (generates the Prisma client too)
   ```bash
   npm run db:migrate --workspace @determineat/backend
   ```

5. **Start the backend** (separate terminal, from repo root)
   ```bash
   npm run dev --workspace @determineat/backend
   ```
   API at `http://localhost:3000`. Verify with:
   ```bash
   curl http://localhost:3000/health   # -> {"status":"ok"}
   ```

6. **Start the frontend** (separate terminal, from repo root)
   ```bash
   npm run dev --workspace @determineat/frontend
   ```
   UI at `http://localhost:5173`. API requests are proxied to the backend.

### Alternative: run the backend in Docker

Instead of steps 3–5, you can run PostgreSQL and the backend together in
containers (the backend image applies migrations on startup):

```bash
docker compose up -d postgres backend
```

The backend container runs on `http://localhost:3000` with live reload from the
mounted `backend/src` directory.

### Environment Variables

Step 2 above creates these files from the checked-in `.env.example` templates.
For a full explanation of the Cognito values and how they are used, see
[`docs/cognito.md`](docs/cognito.md).

**`backend/.env`**

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/determineat

# AWS Cognito (used for JWT verification)
COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_REGION=us-east-1

# App
PORT=3000
NODE_ENV=development
```

**`frontend/.env`**

```env
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_AWS_REGION=us-east-1
VITE_API_URL=http://localhost:3000
```

> The backend leaves `/health` and server startup working even with placeholder
> Cognito values — the JWT verifier is created lazily on the first `/api/*`
> request, so invalid Cognito config only fails authenticated calls, not boot.

---

## Running Tests

The backend's DB integration tests run against a dedicated test database
(the `postgres_test` service, on port 5433). Start it first, then run the suite:

```bash
# Start the test database (once per session)
docker compose up -d postgres_test

# All tests (from repo root)
npm test

# Backend only
npm test --workspace @determineat/backend

# Frontend only
npm test --workspace @determineat/frontend
```

> The DB-backed tests skip automatically when `TEST_DATABASE_URL` is not set
> (see `backend/.env.test`), so the suite still passes without the test database —
> it just runs fewer cases. Frontend tests never need a database.

To type-check both packages:

```bash
npm run typecheck
```

---

## Deployment

### First-Time Infrastructure Setup

1. **Bootstrap the prerequisites** (one-time, run locally with admin credentials)

   Terraform can't create the S3 bucket that stores its own state, nor the IAM
   role the OIDC pipeline assumes to run Terraform. `infra/bootstrap.py` creates
   both. It is idempotent — safe to re-run any time.

   ```bash
   pip install boto3
   cd infra
   python3 bootstrap.py --github-repo your-username/determineat
   ```

   This creates:
   - the Terraform state S3 bucket (versioned, encrypted, public access blocked;
     state locking is native to S3 — no DynamoDB table needed)
   - the GitHub Actions OIDC provider
   - the `determineat-github-deploy` IAM role the pipeline assumes

   The script prints the `backend.hcl` values and the GitHub repository
   variables to set (including the deploy role ARN).

2. **Configure Terraform variables and backend**
   ```bash
   cd infra
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars: github_repository, ACM cert ARN, app domain URL, etc.

   cp backend.hcl.example backend.hcl
   # Set bucket + region to match what bootstrap.py created
   ```

3. **Apply infrastructure**
   ```bash
   cd infra
   terraform init -backend-config=backend.hcl
   terraform apply
   ```

   This provisions: VPC (2 AZs, public/private subnets, NAT), ECS Fargate
   cluster + service, Aurora Serverless v2, Cognito user pool + app client,
   ALB, ECR, CloudWatch log group, and all supporting IAM roles and security
   groups. (The OIDC provider and deploy role are owned by `bootstrap.py`;
   Terraform only references the role.)

4. **Wire the outputs into your environment**

   After `apply`, Terraform prints the values the app needs:
   ```bash
   terraform output
   # cognito_user_pool_id, cognito_client_id  -> frontend build + backend env
   # ecr_repository_url                       -> CI image push target
   # alb_dns_name                             -> the public app URL
   # github_actions_role_arn                  -> AWS_ROLE_ARN repo variable
   ```
   The database connection string is managed automatically — Terraform stores
   it in AWS Secrets Manager and the ECS task reads it at startup, so you never
   handle `DATABASE_URL` in production by hand.

### GitHub Actions (Automated Deployments)

The pipeline (`.github/workflows/deploy.yml`) runs on every push to `main` (the
test job also runs on PRs). It authenticates to AWS with **GitHub OIDC** — the
job assumes an IAM role instead of storing long-lived AWS keys in GitHub.

**Pipeline stages:**

1. **commitlint** (PRs only) — validates that commit messages follow
   Conventional Commits, so the release step can derive the version.
2. **test** — `npm ci`, start the test database, apply migrations, then
   typecheck + lint + test (Jest + Vitest). Runs on push and PR; a failure here
   blocks release, build, and deploy.
3. **release** — `semantic-release` computes the next version from the commit
   history, tags the repo, updates `CHANGELOG.md` + `package.json`, and creates
   a GitHub Release. Outputs the version for the build step.
4. **build** — Assumes the deploy role via OIDC, logs in to ECR, builds the
   multi-stage image (baking the `VITE_*` Cognito values in at build time), and
   pushes it tagged with the **semantic version** (falling back to the git SHA
   if no release was published) and `latest`.
5. **deploy** — Assumes the deploy role, installs the pinned Terraform version,
   runs `terraform apply` with the new image URI, then forces a new ECS
   deployment and waits for the service to stabilize.

**Runner tooling:** GitHub-hosted runners already provide Node, Docker, and the
AWS CLI, but **not Terraform** — the deploy job installs it with
`hashicorp/setup-terraform@v3` (pinned to a specific version that satisfies the
`>= 1.10` constraint in `infra/versions.tf`). Node is pinned with
`actions/setup-node@v4`.

**One-time OIDC setup:** the OIDC provider and the deploy role are created by
`infra/bootstrap.py` (see "First-Time Infrastructure Setup" above), not by the
pipeline. Set the role ARN it prints (also available as
`terraform output github_actions_role_arn`) as the `AWS_ROLE_ARN` repository
variable below.

**Repository variables** (`Settings → Secrets and variables → Actions → Variables`).
With OIDC none of these are secrets — they are non-sensitive identifiers:

| Variable | Description |
|---|---|
| `AWS_ROLE_ARN` | Deploy role ARN (`terraform output github_actions_role_arn`) |
| `AWS_REGION` | AWS region (e.g., `us-east-1`) |
| `ECR_REPOSITORY` | ECR repository name (the `project_name`, e.g. `determineat`) |
| `ECS_CLUSTER` | ECS cluster name (`terraform output ecs_cluster_name`) |
| `ECS_SERVICE` | ECS service name (`terraform output ecs_service_name`) |
| `COGNITO_USER_POOL_ID` | Baked into the frontend build (`terraform output cognito_user_pool_id`) |
| `COGNITO_CLIENT_ID` | Baked into the frontend build (`terraform output cognito_client_id`) |
| `ACM_CERTIFICATE_ARN` | (Optional) ACM cert ARN for the ALB HTTPS listener |
| `APP_DOMAIN_URL` | (Optional) Public app URL for Cognito callback/sign-out |

> **Order of operations:** run `bootstrap.py` first (creates the state bucket +
> deploy role), then the first `terraform apply` locally (creates the app
> infrastructure), then set the repository variables from the outputs. After
> that, pushes to `main` deploy automatically via the pipeline.

---

## Versioning

Releases are automated with [semantic-release](https://semantic-release.gitbook.io/)
driven by [Conventional Commits](https://www.conventionalcommits.org/). On every
push to `main` that passes tests, the `release` job derives the next
[semantic version](https://semver.org/) from the commit messages since the last
release, tags the repo, writes `CHANGELOG.md`, and publishes a GitHub Release.
That version becomes the Docker image tag, so every deployed image traces back
to a release.

**Commit message prefixes** determine the bump:

| Prefix | Example | Version bump |
|---|---|---|
| `fix:` | `fix: correct rating validation` | patch (`0.0.x`) |
| `feat:` | `feat: add cuisine filter` | minor (`0.x.0`) |
| `feat!:` or a `BREAKING CHANGE:` footer | `feat!: drop v1 API` | major (`x.0.0`) |
| `chore:`, `docs:`, `test:`, `refactor:`, `ci:`, `build:`, `perf:`, `style:` | `docs: update runbook` | no release |

`commitlint` runs on pull requests and fails the check if a commit doesn't
follow the convention, so malformed messages are caught before merge. The config
lives in `commitlint.config.cjs`; the release config in `.releaserc.json`.

> The release commit is made with `[skip ci]` so it doesn't retrigger the
> pipeline. semantic-release authenticates to GitHub with the built-in
> `GITHUB_TOKEN` (no extra secret needed).

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for the full architecture diagram, component breakdown, and technology decision rationale.

For the AWS Cognito setup — user pool and app client requirements, token model, and how the app verifies JWTs — see [`docs/cognito.md`](docs/cognito.md).

```
Browser → ALB → ECS Fargate (Express + React) → Aurora Serverless v2
                      ↕
                 AWS Cognito (auth)
                      ↕
                CloudWatch Logs
```

---

## Operations

> The ECS cluster and service are both named `determineat` (the `project_name`).
> Adjust the `--region` in the commands below to match your deployment.

### Viewing Logs

Stream live container logs from the terminal:

```bash
aws logs tail /ecs/determineat --follow --region us-east-1
```

Or open the [CloudWatch Logs console](https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups) and navigate to the `/ecs/determineat` log group.

The app emits **structured JSON logs** (one object per line with a `level` field
of `INFO`, `WARN`, or `ERROR`). Query them with CloudWatch Logs Insights, e.g.
recent errors:

```
fields @timestamp, message, error
| filter level = "ERROR"
| sort @timestamp desc
| limit 50
```

### Monitoring and Alerts

Monitoring is provisioned by the `monitoring` Terraform module:

- **Container Insights** is enabled on the ECS cluster (CPU, memory, task counts).
- A **metric filter** counts `ERROR`-level log lines as the
  `DeterminEat/AppErrorCount` metric.
- An **SNS topic** (`determineat-alerts`) receives alarm notifications. Set the
  `alert_email` Terraform variable to subscribe an address — AWS sends a
  confirmation email you must accept before alerts arrive.
- **CloudWatch alarms** publish to that topic:

  | Alarm | Trigger |
  |---|---|
  | `determineat-app-errors` | ≥ 5 `ERROR` log events in 5 minutes |
  | `determineat-ecs-cpu-high` | CPU > 85% for 10 minutes |
  | `determineat-ecs-memory-high` | Memory > 85% for 10 minutes |
  | `determineat-unhealthy-hosts` | ≥ 1 unhealthy ALB target for 3 minutes |

View alarm state:

```bash
aws cloudwatch describe-alarms \
  --alarm-name-prefix determineat- \
  --region us-east-1 \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue}'
```

### Forcing a Redeployment

```bash
aws ecs update-service \
  --cluster determineat \
  --service determineat \
  --force-new-deployment \
  --region us-east-1
```

### Checking Service Health

```bash
# Check ECS service status
aws ecs describe-services \
  --cluster determineat \
  --services determineat \
  --region us-east-1 \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'

# Hit the health endpoint directly (replace with your ALB DNS)
curl https://your-alb-dns.us-east-1.elb.amazonaws.com/health
```

### Diagnosing an Unhealthy Service

If the `unhealthy-hosts` alarm fires or the service won't stabilize:

1. **Check recent logs** for startup or request errors:
   ```bash
   aws logs tail /ecs/determineat --since 15m --region us-east-1
   ```
2. **Database cold-start is handled automatically.** Aurora Serverless v2 can be
   paused or scaling when a task starts; the app retries the DB connection with
   exponential backoff (up to 8 attempts) before giving up. Look for
   `Database connection failed; retrying` (WARN) and
   `Database connection established` (INFO) in the logs. Repeated
   `giving up` errors mean the DB is genuinely unreachable — check the Aurora
   cluster status and the DB security group.
3. **Inspect stopped tasks** for the exit reason:
   ```bash
   aws ecs list-tasks --cluster determineat --desired-status STOPPED --region us-east-1
   aws ecs describe-tasks --cluster determineat --tasks <task-arn> --region us-east-1 \
     --query 'tasks[0].stoppedReason'
   ```
4. If a bad image was deployed, redeploy a known-good tag by updating
   `container_image` in `terraform.tfvars` and running `terraform apply`, or
   revert the offending commit and let the pipeline roll forward.

### Restoring from an Aurora Snapshot

Aurora Serverless v2 takes automated backups daily with a 7-day retention window.

1. Open the [RDS console](https://console.aws.amazon.com/rds/) → **Snapshots**
2. Select the desired automated snapshot
3. Choose **Restore cluster** and follow the wizard
4. Once the new cluster is available, update the `DATABASE_URL` in AWS Secrets Manager or Parameter Store to point to the new cluster endpoint
5. Force a new ECS deployment to pick up the updated connection string:
   ```bash
   aws ecs update-service \
     --cluster determineat \
     --service determineat \
     --force-new-deployment \
     --region us-east-1
   ```

### Health Check Endpoint

The app exposes `GET /health` which returns `200 OK` when the service is running. ECS uses this endpoint to determine container health:
- Checked every **30 seconds**
- **3 consecutive failures** = container marked unhealthy → Fargate replaces it automatically

---

## Project Structure

```
determineat/
├── frontend/               # React + Vite application
├── backend/                # Express + Prisma API
├── infra/                  # Terraform infrastructure
├── .github/workflows/      # GitHub Actions CI/CD pipeline
├── docs/                   # Architecture and planning documentation
│   ├── plan.md             # Full 10-task implementation plan
│   └── architecture.md     # System architecture and decisions
├── docker-compose.yml      # Local development environment
├── Dockerfile              # Production multi-stage build
└── README.md
```

---

## Contributing

This is a personal project, but if you're using it as a template feel free to fork and adapt it.
