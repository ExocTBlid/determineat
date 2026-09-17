# Documentation Maintenance

## Rule: Keep Documentation in Sync

Whenever you make changes to this codebase, you **must** update the relevant documentation as part of the same task. Documentation is not optional or deferred — it is part of the definition of done for every change.

---

## What to Update and When

### `README.md`
Update when:
- New environment variables are added or removed
- Local dev setup steps change (new commands, new prerequisites, changed ports)
- The project structure changes (new top-level directories or files)
- Deployment steps change (new secrets, new manual steps, changed commands)
- Operational procedures change (new runbook steps, changed health check config, new AWS resource names)
- The tech stack changes (new dependencies, replaced libraries)

### `docs/architecture.md`
Update when:
- New AWS services or infrastructure components are added or removed
- The data model changes (new models, new fields, removed fields)
- The CI/CD pipeline structure changes (new jobs, new steps, changed triggers)
- Technology decisions change (e.g., switching from one library to another)
- Networking or security architecture changes
- The repo directory structure changes

### `docs/plan.md`
Update when:
- A task is completed — add a `✓` or `[x]` marker and note any deviations from the original plan
- A task's implementation approach changes significantly from what was originally documented
- New tasks are added (e.g., a new feature, a discovered requirement)
- A task is split into sub-tasks or merged with another

---

## App Name

The app is called **DeterminEat** — capital E in "Eat". This name must be used consistently in:
- All documentation headings and prose
- UI-visible strings (page titles, app name in the browser tab, auth screens)
- Any user-facing copy

The lowercase slug `determineat` is correct for use in:
- Repository URLs and git references
- AWS resource names (ECS cluster, ECR repo, S3 buckets, DynamoDB tables, CloudWatch log groups)
- Docker image names and tags
- Database names

---

## How to Apply This Rule

Before marking any task as complete, check:

1. Does this change affect how a developer sets up or runs the project locally? → Update `README.md`
2. Does this change affect the system architecture, data model, or infrastructure? → Update `docs/architecture.md`
3. Does this change complete or significantly alter a planned task? → Update `docs/plan.md`
4. Does any file contain the old name `DetermineAt`? → Fix it to `DeterminEat`

If none of the above apply, no doc update is needed — but be explicit about that reasoning.
