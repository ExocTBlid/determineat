# DeterminEat — AWS Infrastructure

A detailed view of the AWS resources provisioned by the Terraform configuration
under `infra/`. For the higher-level system/component view, see
[`architecture.md`](./architecture.md).

The diagram below is generated from the Terraform modules:

| Module | Resources |
|---|---|
| `vpc` | VPC, 2 public + 2 private subnets across 2 AZs, Internet Gateway, single NAT Gateway + EIP, route tables |
| `alb` | Public Application Load Balancer, target group (`/health`), HTTP→HTTPS redirect + HTTPS listener (or HTTP-only without a cert), ALB security group |
| `ecs` | ECS cluster (Container Insights), Fargate task definition + service, CloudWatch log group, task + execution IAM roles |
| `aurora` | Aurora Serverless v2 (PostgreSQL) cluster + instance, DB subnet group, DB security group, Secrets Manager secret (`DATABASE_URL`) |
| `cognito` | Cognito User Pool + public app client |
| `ecr` | ECR repository (scan-on-push, keep last 10 images) |
| `monitoring` | SNS alerts topic (+ email sub), log metric filter, CloudWatch alarms |
| `github_oidc` | Data-source reference to the deploy IAM role (created by `bootstrap.py`) |
| root | ECS tasks security group (breaks the ecs↔aurora cycle) |

## Infrastructure Diagram

```mermaid
graph TB
    Internet(["Internet / Users"])
    GH["GitHub Actions<br/>(OIDC)"]
    S3[("S3<br/>Terraform state")]

    subgraph AWS["AWS Account / Region"]
        ECR["ECR<br/>app image<br/>scan-on-push, keep last 10"]
        Cognito["Cognito<br/>User Pool + public app client"]
        Secrets["Secrets Manager<br/>DATABASE_URL"]
        IAMrole["IAM: github-deploy role<br/>(bootstrap.py)"]

        subgraph VPC["VPC (2 AZs)"]
            IGW["Internet Gateway"]

            subgraph Public["Public subnets (AZ-a, AZ-b)"]
                ALB["Application Load Balancer<br/>HTTP:80 → HTTPS:443"]
                NAT["NAT Gateway + EIP"]
            end

            subgraph Private["Private subnets (AZ-a, AZ-b)"]
                ECS["ECS Fargate service<br/>app task: Express + React build<br/>sg: tasks (from ALB only)"]
                Aurora[("Aurora Serverless v2<br/>PostgreSQL (auto-pause, 0..2 ACU)<br/>sg: db (from tasks only)")]
            end
        end

        subgraph Observability["Monitoring"]
            CW["CloudWatch Logs<br/>+ Container Insights"]
            MF["Metric filter + alarms"]
            SNS["SNS alerts topic"]
        end
    end

    Internet -->|HTTPS| ALB
    ALB -->|HTTP target group<br/>/health| ECS
    ECS -->|JWT verify| Cognito
    ECS -->|PostgreSQL 5432| Aurora
    ECS -->|reads DATABASE_URL| Secrets
    ECS -->|egress| NAT
    NAT --> IGW
    ALB -.-> IGW
    IGW --- Internet

    ECS --> CW
    Aurora -.->|backups| CW
    CW --> MF
    MF --> SNS
    SNS -->|email| Internet

    GH -->|assume role| IAMrole
    GH -->|build & push| ECR
    GH -->|terraform state| S3
    ECR -->|pull image| ECS
```

## Security Groups & Traffic Flow

The security groups enforce a strict one-way ingress chain:

```mermaid
graph LR
    Net(["0.0.0.0/0"]) -->|80, 443| ALBSG["alb-sg"]
    ALBSG -->|container port| TasksSG["tasks-sg"]
    TasksSG -->|5432| DBSG["db-sg"]
```

- **`alb-sg`** — accepts HTTP (80) and HTTPS (443) from anywhere; egress open.
- **`tasks-sg`** — ingress only from `alb-sg` on the container port; egress open
  (outbound internet via the NAT Gateway). Defined at the Terraform root to
  break the circular dependency between the `ecs` and `aurora` modules.
- **`db-sg`** — ingress only from `tasks-sg` on 5432 (PostgreSQL); egress open.

## Networking Notes

- Two availability zones; each gets one public and one private subnet.
- Public subnets host the ALB and a **single** NAT Gateway (one NAT keeps cost
  down for a personal app — for HA you would run one per AZ).
- Private subnets host the ECS tasks and Aurora. Tasks reach the internet
  outbound through the NAT Gateway; neither tasks nor the database are directly
  reachable from the internet.
- The ECS task reads `DATABASE_URL` from Secrets Manager at start; Cognito IDs
  are passed as plain environment variables (they are not secrets).
