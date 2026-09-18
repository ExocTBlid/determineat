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
- [Docker](https://www.docker.com/) and Docker Compose
- [AWS CLI](https://aws.amazon.com/cli/) (for deployment)
- [Terraform](https://www.terraform.io/) v1.5+ (for infrastructure)

### Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/your-username/determineat.git
   cd determineat
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start local services**
   ```bash
   docker-compose up
   ```
   This starts:
   - Express API at `http://localhost:3000`
   - PostgreSQL at `localhost:5432` (replaces Aurora for local dev)

4. **Run database migrations**
   ```bash
   cd backend
   npx prisma migrate dev
   ```

5. **Start the frontend dev server** (separate terminal)
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend available at `http://localhost:5173`

### Environment Variables

Copy `.env.example` to `.env` in the `backend/` directory:

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

Copy `.env.example` to `.env` in the `frontend/` directory:

```env
VITE_COGNITO_USER_POOL_ID=us-east-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_AWS_REGION=us-east-1
VITE_API_URL=http://localhost:3000
```

---

## Running Tests

```bash
# All tests (from root)
npm test

# Backend only
cd backend && npm test

# Frontend only
cd frontend && npm test
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

2. **Configure Terraform variables**
   ```bash
   cd infra
   cp terraform.tfvars.example terraform.tfvars
   # Edit terraform.tfvars with your AWS region, domain name, etc.
   ```

3. **Apply infrastructure**
   ```bash
   cd infra
   terraform init
   terraform apply
   ```

   This provisions: VPC, ECS cluster, Aurora Serverless v2, Cognito User Pool, ALB, ECR, CloudWatch log group, and all supporting IAM roles.

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
