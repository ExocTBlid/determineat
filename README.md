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

1. **Create Terraform remote state resources** (one-time manual step)

   ```bash
   aws s3 mb s3://determineat-terraform-state --region us-east-1
   aws s3api put-bucket-versioning \
     --bucket determineat-terraform-state \
     --versioning-configuration Status=Enabled

   aws dynamodb create-table \
     --table-name determineat-terraform-lock \
     --attribute-definitions AttributeName=LockID,AttributeType=S \
     --key-schema AttributeName=LockID,KeyType=HASH \
     --billing-mode PAY_PER_REQUEST \
     --region us-east-1
   ```

2. **Configure Terraform variables and backend**
   ```bash
   cd infra
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars: AWS region, ACM cert ARN, app domain URL, etc.

   cp backend.hcl.example backend.hcl
   # Edit backend.hcl to reference the S3 bucket + DynamoDB table from step 1
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
   groups.

4. **Wire the outputs into your environment**

   After `apply`, Terraform prints the values the app needs:
   ```bash
   terraform output
   # cognito_user_pool_id, cognito_client_id  -> frontend build + backend env
   # ecr_repository_url                       -> CI image push target
   # alb_dns_name                             -> the public app URL
   ```
   The database connection string is managed automatically — Terraform stores
   it in AWS Secrets Manager and the ECS task reads it at startup, so you never
   handle `DATABASE_URL` in production by hand.

### GitHub Actions (Automated Deployments)

Every push to `main` automatically runs the full pipeline. Add the following secrets to your GitHub repository (`Settings → Secrets and variables → Actions`):

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user access key with ECS, ECR, RDS, and Cognito permissions |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |
| `AWS_REGION` | AWS region (e.g., `us-east-1`) |
| `TF_STATE_BUCKET` | S3 bucket name for Terraform state |
| `TF_LOCK_TABLE` | DynamoDB table name for Terraform state locking |

**Pipeline stages:**

1. **test** — Runs backend Jest tests and frontend Vitest tests; fails fast on any error
2. **build** — Builds the Docker image (multi-stage), tags with git SHA, pushes to ECR
3. **deploy** — Runs `terraform apply` with the new image tag, forces a new ECS deployment

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

### Viewing Logs

Stream live container logs from the terminal:

```bash
aws logs tail /ecs/determineat --follow --region us-east-1
```

Or open the [CloudWatch Logs console](https://console.aws.amazon.com/cloudwatch/home#logsV2:log-groups) and navigate to the `/ecs/determineat` log group.

### Forcing a Redeployment

```bash
aws ecs update-service \
  --cluster determineat \
  --service determineat-service \
  --force-new-deployment \
  --region us-east-1
```

### Checking Service Health

```bash
# Check ECS service status
aws ecs describe-services \
  --cluster determineat \
  --services determineat-service \
  --region us-east-1 \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount,Health:healthCheckGracePeriodSeconds}'

# Hit the health endpoint directly (replace with your ALB DNS)
curl https://your-alb-dns.us-east-1.elb.amazonaws.com/health
```

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
     --service determineat-service \
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
