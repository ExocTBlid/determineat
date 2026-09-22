#!/usr/bin/env python3
"""
bootstrap.py — one-time prerequisites for DeterminEat's Terraform + CI/CD.

Creates the two things Terraform cannot create for itself:

  1. The S3 bucket that holds Terraform remote state (with native state
     locking via `use_lockfile` — no DynamoDB table needed).
  2. The GitHub Actions OIDC provider and the deploy IAM role the pipeline
     assumes. Terraform then *references* this role via a data source rather
     than managing it (avoids a chicken-and-egg: the role must exist before
     the OIDC-authenticated pipeline can run Terraform at all).

The script is fully idempotent: every resource is checked before creation and
existing resources are updated in place, so it is safe to re-run at any time.

Requirements:
    pip install boto3
    AWS credentials with permissions to manage S3 + IAM (run locally, once).

Usage:
    python3 bootstrap.py --github-repo owner/determineat
    python3 bootstrap.py --github-repo owner/determineat \\
        --project determineat --region us-east-1 --branches main

After it runs, it prints the values to set as GitHub repository variables.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import ssl
import subprocess
import sys

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    sys.exit("boto3 is required. Install it with: pip install boto3")


GITHUB_OIDC_URL = "https://token.actions.githubusercontent.com"
GITHUB_OIDC_HOST = "token.actions.githubusercontent.com"
GITHUB_OIDC_AUDIENCE = "sts.amazonaws.com"


# ---------------------------------------------------------------------------
# S3 state bucket
# ---------------------------------------------------------------------------

def ensure_state_bucket(session, bucket_name: str, region: str) -> None:
    s3 = session.client("s3", region_name=region)

    if _bucket_exists(s3, bucket_name):
        print(f"  [=] S3 bucket already exists: {bucket_name}")
    else:
        # us-east-1 must NOT pass a LocationConstraint; every other region must.
        if region == "us-east-1":
            s3.create_bucket(Bucket=bucket_name)
        else:
            s3.create_bucket(
                Bucket=bucket_name,
                CreateBucketConfiguration={"LocationConstraint": region},
            )
        print(f"  [+] Created S3 bucket: {bucket_name}")

    # Versioning — recover prior state if a corrupt/partial write happens
    s3.put_bucket_versioning(
        Bucket=bucket_name,
        VersioningConfiguration={"Status": "Enabled"},
    )

    # Default server-side encryption
    s3.put_bucket_encryption(
        Bucket=bucket_name,
        ServerSideEncryptionConfiguration={
            "Rules": [
                {"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}
            ]
        },
    )

    # Block all public access — state files may contain sensitive values
    s3.put_public_access_block(
        Bucket=bucket_name,
        PublicAccessBlockConfiguration={
            "BlockPublicAcls": True,
            "IgnorePublicAcls": True,
            "BlockPublicPolicy": True,
            "RestrictPublicBuckets": True,
        },
    )
    print("  [=] Ensured versioning, encryption, and public-access block")


def _bucket_exists(s3, bucket_name: str) -> bool:
    try:
        s3.head_bucket(Bucket=bucket_name)
        return True
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code in ("404", "NoSuchBucket"):
            return False
        if code == "403":
            # Bucket exists but is owned by someone else (or no access)
            raise SystemExit(
                f"Bucket {bucket_name} exists but is not accessible (403). "
                "Choose a different --project name (bucket names are global)."
            )
        raise


# ---------------------------------------------------------------------------
# GitHub OIDC provider
# ---------------------------------------------------------------------------

def _github_oidc_thumbprint() -> str:
    """
    Compute the SHA-1 thumbprint of the root certificate in GitHub's OIDC TLS
    chain, formatted as IAM expects (lowercase hex, no colons).

    A real thumbprint is required: STS validates the token's TLS chain against
    it, so a placeholder value causes `Not authorized to perform
    sts:AssumeRoleWithWebIdentity` at role-assumption time.

    Uses `openssl s_client` to fetch the full chain (portable across Python
    versions — `SSLSocket.get_verified_chain()` isn't available everywhere).
    """
    proc = subprocess.run(
        [
            "openssl", "s_client", "-showcerts",
            "-servername", GITHUB_OIDC_HOST,
            "-connect", f"{GITHUB_OIDC_HOST}:443",
        ],
        input="",
        capture_output=True,
        text=True,
        timeout=20,
    )
    # Split the PEM blocks; the last certificate in the chain is the root.
    certs = re.findall(
        r"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
        proc.stdout,
        re.DOTALL,
    )
    if not certs:
        raise SystemExit("Could not retrieve GitHub OIDC certificate chain via openssl.")
    root_pem = certs[-1]
    der = ssl.PEM_cert_to_DER_cert(root_pem)
    return hashlib.sha1(der).hexdigest()


def ensure_oidc_provider(session) -> str:
    iam = session.client("iam")
    account_id = session.client("sts").get_caller_identity()["Account"]
    provider_arn = f"arn:aws:iam::{account_id}:oidc-provider/{GITHUB_OIDC_HOST}"

    thumbprint = _github_oidc_thumbprint()

    try:
        existing = iam.get_open_id_connect_provider(OpenIDConnectProviderArn=provider_arn)
        current = [t.lower() for t in existing.get("ThumbprintList", [])]
        if thumbprint.lower() not in current:
            # Repair a provider that has a stale/placeholder thumbprint
            iam.update_open_id_connect_provider_thumbprint(
                OpenIDConnectProviderArn=provider_arn,
                ThumbprintList=[thumbprint],
            )
            print(f"  [~] OIDC provider exists; updated thumbprint: {GITHUB_OIDC_HOST}")
        else:
            print(f"  [=] OIDC provider already exists with correct thumbprint: {GITHUB_OIDC_HOST}")
    except ClientError as e:
        if e.response["Error"]["Code"] != "NoSuchEntity":
            raise
        iam.create_open_id_connect_provider(
            Url=GITHUB_OIDC_URL,
            ClientIDList=[GITHUB_OIDC_AUDIENCE],
            ThumbprintList=[thumbprint],
        )
        print(f"  [+] Created OIDC provider: {GITHUB_OIDC_HOST}")

    return provider_arn


# ---------------------------------------------------------------------------
# Deploy IAM role
# ---------------------------------------------------------------------------

def _trust_policy(provider_arn: str, github_repo: str, branches: list[str]) -> dict:
    subs = [f"repo:{github_repo}:ref:refs/heads/{b}" for b in branches]
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"Federated": provider_arn},
                "Action": "sts:AssumeRoleWithWebIdentity",
                "Condition": {
                    "StringEquals": {
                        f"{GITHUB_OIDC_HOST}:aud": GITHUB_OIDC_AUDIENCE
                    },
                    "StringLike": {f"{GITHUB_OIDC_HOST}:sub": subs},
                },
            }
        ],
    }


def _deploy_policy(account_id: str, region: str, project: str, state_bucket: str) -> dict:
    return {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "ECRAuth",
                "Effect": "Allow",
                "Action": ["ecr:GetAuthorizationToken"],
                "Resource": "*",
            },
            {
                "Sid": "ECRPushPull",
                "Effect": "Allow",
                "Action": [
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:BatchGetImage",
                    "ecr:PutImage",
                    "ecr:InitiateLayerUpload",
                    "ecr:UploadLayerPart",
                    "ecr:CompleteLayerUpload",
                    "ecr:DescribeRepositories",
                    "ecr:ListImages",
                ],
                "Resource": f"arn:aws:ecr:{region}:{account_id}:repository/{project}",
            },
            {
                "Sid": "ECSDeploy",
                "Effect": "Allow",
                "Action": [
                    "ecs:UpdateService",
                    "ecs:DescribeServices",
                    "ecs:DescribeTaskDefinition",
                    "ecs:RegisterTaskDefinition",
                    "ecs:DescribeClusters",
                    "ecs:ListTasks",
                    "ecs:DescribeTasks",
                ],
                "Resource": "*",
            },
            {
                "Sid": "PassECSRoles",
                "Effect": "Allow",
                "Action": ["iam:PassRole"],
                "Resource": "*",
                "Condition": {
                    "StringEquals": {"iam:PassedToService": "ecs-tasks.amazonaws.com"}
                },
            },
            {
                "Sid": "TerraformState",
                "Effect": "Allow",
                "Action": [
                    "s3:ListBucket",
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:DeleteObject",
                ],
                "Resource": [
                    f"arn:aws:s3:::{state_bucket}",
                    f"arn:aws:s3:::{state_bucket}/*",
                ],
            },
            {
                "Sid": "TerraformManageProjectRoles",
                "Effect": "Allow",
                "Action": [
                    "iam:GetRole",
                    "iam:CreateRole",
                    "iam:DeleteRole",
                    "iam:TagRole",
                    "iam:AttachRolePolicy",
                    "iam:DetachRolePolicy",
                    "iam:PutRolePolicy",
                    "iam:DeleteRolePolicy",
                    "iam:GetRolePolicy",
                    "iam:ListRolePolicies",
                    "iam:ListAttachedRolePolicies",
                    "iam:ListInstanceProfilesForRole",
                ],
                "Resource": f"arn:aws:iam::{account_id}:role/{project}-*",
            },
        ],
    }


def ensure_deploy_role(
    session,
    provider_arn: str,
    project: str,
    region: str,
    github_repo: str,
    branches: list[str],
    state_bucket: str,
) -> str:
    iam = session.client("iam")
    account_id = session.client("sts").get_caller_identity()["Account"]
    role_name = f"{project}-github-deploy"
    trust = _trust_policy(provider_arn, github_repo, branches)
    inline_policy = _deploy_policy(account_id, region, project, state_bucket)

    try:
        iam.get_role(RoleName=role_name)
        # Keep the trust policy in sync with the requested repo/branches
        iam.update_assume_role_policy(
            RoleName=role_name, PolicyDocument=json.dumps(trust)
        )
        print(f"  [=] Deploy role already exists, updated trust policy: {role_name}")
    except ClientError as e:
        if e.response["Error"]["Code"] != "NoSuchEntity":
            raise
        iam.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust),
            Description="GitHub Actions deploy role for DeterminEat (assumed via OIDC)",
        )
        print(f"  [+] Created deploy role: {role_name}")

    # Inline permissions policy (PutRolePolicy is create-or-replace = idempotent)
    iam.put_role_policy(
        RoleName=role_name,
        PolicyName=f"{project}-github-deploy",
        PolicyDocument=json.dumps(inline_policy),
    )

    # Broad management for `terraform apply` (everything except IAM/Organizations).
    # Tighten in a shared/production account.
    iam.attach_role_policy(
        RoleName=role_name,
        PolicyArn="arn:aws:iam::aws:policy/PowerUserAccess",
    )
    print("  [=] Ensured inline deploy policy + PowerUserAccess")

    return f"arn:aws:iam::{account_id}:role/{role_name}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bootstrap DeterminEat prerequisites (S3 state bucket + GitHub OIDC role)."
    )
    parser.add_argument(
        "--github-repo",
        required=True,
        help="GitHub repository in owner/repo form (scopes which repo may deploy)",
    )
    parser.add_argument("--project", default="determineat", help="Project/name prefix")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument(
        "--branches",
        default="main",
        help="Comma-separated branches allowed to deploy (default: main)",
    )
    parser.add_argument(
        "--state-bucket",
        default=None,
        help="State bucket name (default: <project>-terraform-state)",
    )
    args = parser.parse_args()

    branches = [b.strip() for b in args.branches.split(",") if b.strip()]
    state_bucket = args.state_bucket or f"{args.project}-terraform-state"

    session = boto3.Session(region_name=args.region)

    # Fail fast with a clear message if credentials are missing
    try:
        identity = session.client("sts").get_caller_identity()
    except Exception as e:  # noqa: BLE001 - surface any auth error clearly
        sys.exit(f"Unable to authenticate to AWS: {e}")

    print(f"AWS account: {identity['Account']}  region: {args.region}")
    print(f"Project: {args.project}  repo: {args.github_repo}  branches: {branches}\n")

    print("State bucket:")
    ensure_state_bucket(session, state_bucket, args.region)

    print("\nOIDC provider:")
    provider_arn = ensure_oidc_provider(session)

    print("\nDeploy role:")
    role_arn = ensure_deploy_role(
        session,
        provider_arn=provider_arn,
        project=args.project,
        region=args.region,
        github_repo=args.github_repo,
        branches=branches,
        state_bucket=state_bucket,
    )

    print("\n" + "=" * 70)
    print("Bootstrap complete. Next steps:")
    print("=" * 70)
    print(f"""
1. Configure the Terraform backend (infra/backend.hcl):

     bucket = "{state_bucket}"
     region = "{args.region}"

2. Set these GitHub repository variables
   (Settings -> Secrets and variables -> Actions -> Variables):

     AWS_ROLE_ARN         = {role_arn}
     AWS_REGION           = {args.region}
     ECR_REPOSITORY       = {args.project}
     ECS_CLUSTER          = {args.project}
     ECS_SERVICE          = {args.project}
     COGNITO_USER_POOL_ID = <from `terraform output cognito_user_pool_id`>
     COGNITO_CLIENT_ID    = <from `terraform output cognito_client_id`>

3. Run the first deploy locally:

     cd infra
     terraform init -backend-config=backend.hcl
     terraform apply -var="github_repository={args.github_repo}"
""")


if __name__ == "__main__":
    main()
