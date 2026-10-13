# DeterminEat — Monthly Cost Estimate

A rough monthly AWS cost estimate for the infrastructure defined under `infra/`.
See [`infrastructure.md`](./infrastructure.md) for the resource diagram.

**Assumptions**

- Region: `us-east-1` (from `terraform.tfvars`)
- Config as deployed: 1 Fargate task (0.5 vCPU / 1 GB), Aurora Serverless v2
  `0–2` ACU (**auto-pause / scale-to-zero enabled**), a single NAT Gateway, one
  ALB, 2 AZs.
- Low personal-app traffic (a few GB/month egress, mostly idle database).
- 730 hours/month. On-demand pricing, no Savings Plans or free-tier credits.
- Prices are **us-east-1 as of October 2026** and will drift — treat the totals
  as a ballpark, not a quote. Verify against the
  [AWS Pricing Calculator](https://calculator.aws) before relying on them.

## Always-on (fixed) costs

These run 24/7 regardless of traffic and dominate the bill for a low-traffic app.

| Resource | Rate (us-east-1) | Monthly |
|---|---|---|
| NAT Gateway (hourly) | $0.045 / hr | ~$32.85 |
| Application Load Balancer (hourly) | $0.0225 / hr | ~$16.43 |
| Fargate task (0.5 vCPU + 1 GB) | $0.04048/vCPU-hr + $0.004445/GB-hr | ~$17.02 |
| **Fixed subtotal** | | **~$66 / mo** |

> **Aurora is no longer an always-on cost.** With `aurora_min_capacity = 0` the
> cluster auto-pauses when idle (billing compute at $0) and only bills
> $0.12/ACU-hr while actively serving. For a low-traffic app it spends most of
> the month paused, so Aurora compute moved to the usage-based table below.

## Usage-based (variable) costs

Small for a personal app, but they scale with traffic and data.

| Resource | Rate (us-east-1) | Low-traffic estimate |
|---|---|---|
| NAT Gateway data processing | $0.045 / GB | ~$1–5 (a few GB egress) |
| ALB LCU usage | $0.008 / LCU-hr | ~$2–6 (≈1 LCU) |
| Aurora compute (auto-pause, `min=0`) | $0.12 / ACU-hr while active | ~$0–10 (near $0 when mostly idle) |
| Aurora storage | $0.10 / GB-mo | ~$1 (small DB) |
| Aurora I/O | $0.20 / 1M requests | ~$1 |
| Aurora backups | billed above cluster size | ~$0–2 (7-day retention) |
| CloudWatch Logs ingest/store | $0.50/GB in, $0.03/GB-mo | ~$1–3 |
| Secrets Manager | $0.40 / secret-mo | ~$0.40 |
| ECR storage | $0.10 / GB-mo | ~$0.50 (keep-last-10) |
| SNS email alerts | first 1k emails free | ~$0 |
| Data transfer out | tiered, first 100 GB free | ~$0–2 |
| **Variable subtotal** | | **~$8–30 / mo** |

## Bottom line

| Scenario | Monthly estimate |
|---|---|
| **Idle / minimal traffic** (DB mostly paused) | **~$75–85** |
| **Light real usage** (DB active part of the day) | **~$85–100** |
| **Aurora pinned warm at 0.5 ACU** | add ~$44 (back to the old ~$115–140) |
| **Aurora sustained at max (2 ACU)** | add up to ~$175/mo of compute |

So roughly **$75–100/month** at low traffic now that the database auto-pauses —
down from ~$115–140 before scale-to-zero. The bill is dominated by the two
remaining always-on components (NAT Gateway ~$33, ALB ~$16) plus the Fargate
task (~$17); Aurora compute is near $0 whenever the DB is idle. Variable costs
rise with traffic and with how much of the day the database stays active.

## Biggest levers to reduce cost

- **NAT Gateway (~$33/mo + data).** The single largest fixed line item for
  something this small. Options: a NAT instance (t4g.nano) instead of a managed
  gateway, or VPC endpoints for the AWS services the tasks call (ECR, Secrets
  Manager, CloudWatch Logs) so less traffic needs the NAT. Removing it entirely
  isn't an option while tasks live in private subnets and need outbound access.
- **Aurora (already scaling to zero).** `aurora_min_capacity = 0` is set, so the
  DB auto-pauses when idle and compute bills at $0 during quiet periods — this
  lever is already pulled. See *Reducing the database cost* below for the
  details and remaining alternatives.
- **ALB (~$16/mo + LCU).** Unavoidable with ECS behind a load balancer. For a
  truly minimal personal app you could front a single task differently, but that
  trades away health checking and HTTPS termination.
- **Fargate (~$17/mo).** Already small. Fargate Spot would cut it further at the
  cost of possible task interruption.

## Reducing the database cost

**Current config: Aurora Serverless v2 with scale-to-zero
(`aurora_min_capacity = 0`).** The cluster auto-pauses after a period of
inactivity (AWS default: 5 minutes with no connections), billing $0 for compute
while paused and $0.12/ACU-hr only while actively serving. The cluster runs
engine `aurora-postgresql 17.10`, which supports auto-pause. This removed the
old ~$44/mo always-on floor — previously the biggest single line item — and
closes most of the gap with the single-instance Postgres on Azure (see
[`azure-alternative.md`](./azure-alternative.md)).

**Trade-off:** the first request after a pause triggers a cold start of a few
seconds while the DB resumes, and a connection or transaction can time out
during that window. That's acceptable for a personal app; if snappy first-hit
latency ever matters, set `aurora_min_capacity = 0.5` to keep it always warm
(back to ~$44/mo).

**Remaining alternatives**, if a flat, fully predictable bill is preferred over
elastic scale-to-zero:

| Option | Approx monthly (compute) | Change required | Trade-off |
|---|---|---|---|
| **Aurora v2, scale to zero** (`min_capacity = 0`) — *current* | ~$0 idle, $0.12/ACU-hr active | none (in place) | cold start (~seconds) on first request after a pause |
| **RDS PostgreSQL `db.t4g.micro`** (2 vCPU burst, 1 GiB) | ~$11.68 on-demand / ~$8.76 reserved | swap `aurora` module for an `aws_db_instance` | fixed instance (not elastic); 1 GiB RAM is tight; no scale-to-zero |
| **RDS PostgreSQL `db.t4g.small`** (2 vCPU burst, 2 GiB) | ~$23.36 on-demand / ~$17.5 reserved | same as above | fixed instance; closest 1:1 with Azure Burstable B1ms |
| **RDS Single-AZ + 1-yr reserved** | up to ~45% off the above | reservation commitment | 1-year commitment; Single-AZ has no standby failover |

A Burstable RDS instance would give a flat ~$12–23/mo regardless of activity
(no cold starts), but trades away Aurora's elasticity and the idle-time savings.
For a bursty personal app with real idle periods, scale-to-zero is the better
default and is what's configured. Either way, the ALB and NAT Gateway (the two
remaining always-on costs) are untouched — see the levers above for those.

## Keeping this estimate current

Two ways to automate, instead of maintaining this table by hand:

1. **Infracost** — reads the Terraform directly:

   ```bash
   # one-time: install from https://www.infracost.io, then
   infracost breakdown --path infra
   ```

   It can also run in CI to comment a cost diff on every PR. Note it prices
   usage-based resources (NAT data, Aurora) at full-month usage, so it tends to
   **over**estimate for a low-traffic app — read its totals as an upper bound.

2. **AWS Pricing Calculator** — <https://calculator.aws> for a manual,
   authoritative per-service breakdown.

---

*Prices sourced from AWS service pricing pages (RDS/Aurora, Elastic Load
Balancing, VPC/NAT Gateway, Fargate), us-east-1, October 2026. Content was
rephrased and figures recomputed for this project's configuration.*
