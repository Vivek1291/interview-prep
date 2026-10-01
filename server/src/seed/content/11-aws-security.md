@section AWS Security
@icon 🔐
@color #dc2626
@desc IAM users, roles, policies and least privilege; security groups; secrets management.

=== IAM: user vs role vs policy (and least privilege)
@p 3
@tags iam, security, roles
@quick
- **User** = long-term identity (a person/CI) with password and/or **access keys**; avoid for apps.
- **Role** = identity **assumed temporarily** (STS temporary credentials) by EC2/ECS/Lambda/another account/GitHub OIDC. **Apps should use roles.**
- **Policy** = JSON document: `Effect` (Allow/Deny), `Action`, `Resource`, `Condition`. Attached to users/groups/roles (identity-based) or resources (bucket policy).
- **Least privilege**: grant only the exact actions on exact resources needed; start from zero, add as required.
- Explicit **Deny always wins**; default is implicit deny. Enable **MFA**, don't use the root account, rotate/avoid access keys.

::: text
**IAM (Identity and Access Management)** controls **who** can do **what** on **which** AWS resources.

| Concept | What | Example |
|---|---|---|
| **Root user** | Account owner, with full power | Lock it away with MFA; never use it day to day |
| **User** | Long-lived identity for a human (or legacy app) | `vivek` logs into the console with MFA |
| **Group** | Collection of users sharing policies | `developers`, `admins` |
| **Role** | Assumable identity with **temporary credentials** (auto-rotated) | `shop-api-ec2-role` attached to EC2 through an instance profile |
| **Policy** | JSON permissions | Allow `s3:PutObject` on `arn:aws:s3:::shop-uploads/uploads/*` |

### Why roles over access keys for apps
- No secrets on disk or in code; credentials **rotate automatically** (every few hours).
- The SDK picks them up automatically (EC2 instance metadata / ECS task role).
- Access keys in `.env` leak via git, logs or laptops, which is one of the most common AWS breaches.

### Policy evaluation
1. Default: **implicit deny**.
2. Any applicable **explicit Deny** → denied (it always wins).
3. Otherwise, an explicit **Allow** → allowed.
(Plus boundaries: SCPs in Organizations, permission boundaries, session policies.)

### Least privilege in practice
- Scope **actions** (`s3:GetObject`, not `s3:*`) and **resources** (a specific bucket/prefix/table ARN).
- Add **conditions** (source VPC, MFA present, tags, IP ranges).
- Use **IAM Access Analyzer** to generate policies from real usage and find unused permissions.
:::

::: diagram How an app gets AWS permissions
flowchart LR
  POL["Policy: Allow s3:PutObject on shop-uploads/uploads/*"] --> ROLE["Role: shop-api-role"]
  ROLE -->|"instance profile"| EC2["EC2 / ECS task"]
  EC2 -->|"SDK gets temporary creds from metadata"| STS["STS"]
  EC2 -->|"signed request"| S3[("S3 bucket")]
  S3 -->|"IAM evaluates: explicit deny? allow?"| OK["Allowed"]
:::

::: code json Policy + trust policy for an EC2 role
{
  "PermissionsPolicy": {
    "Version": "2012-10-17",
    "Statement": [
      { "Sid": "UploadsRW", "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"], "Resource": "arn:aws:s3:::shop-uploads/uploads/*" },
      { "Sid": "ReadAppSecrets", "Effect": "Allow", "Action": ["ssm:GetParametersByPath"], "Resource": "arn:aws:ssm:ap-south-1:123456789012:parameter/shop/prod/*" },
      { "Sid": "SendEmails", "Effect": "Allow", "Action": ["ses:SendEmail"], "Resource": "*", "Condition": { "StringEquals": { "ses:FromAddress": "no-reply@example.com" } } }
    ]
  },
  "TrustPolicy_who_can_assume_the_role": {
    "Version": "2012-10-17",
    "Statement": [{ "Effect": "Allow", "Principal": { "Service": "ec2.amazonaws.com" }, "Action": "sts:AssumeRole" }]
  }
}
:::

::: code javascript No keys in code: the SDK uses the role automatically
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// ✅ No credentials passed. The default provider chain checks:
// env vars → shared config (~/.aws) → ECS task role → EC2 instance metadata (IMDSv2) role
const s3 = new S3Client({ region: 'ap-south-1' });
await s3.send(new PutObjectCommand({ Bucket: 'shop-uploads', Key: 'uploads/test.txt', Body: 'hello' }));

// ❌ Never:
// const s3 = new S3Client({ credentials: { accessKeyId: 'AKIA…', secretAccessKey: 'abc123' } });
:::

::: ask
- *"How do developers get access: IAM users or SSO (IAM Identity Center)?"* SSO is modern best practice.
- *"How does CI deploy?"* → GitHub OIDC assuming a role, with no stored keys.
:::

::: links
IAM best practices | https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
IAM roles | https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html
Policy evaluation logic | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html
:::

=== What is a security group? (inbound, outbound, port, protocol, source)
@p 3
@tags security-group, networking, firewall
@quick
- Security group = **stateful virtual firewall** attached to an instance/ENI (EC2, RDS, ALB, Lambda in VPC).
- **Inbound rules**: protocol (TCP/UDP/ICMP) + port/range + **source** (CIDR like `203.0.113.5/32`, or **another security group**). **Outbound**: default allow all.
- **Allow rules only** (no deny); unmatched = denied. **Stateful**: replies to allowed traffic are automatically allowed.
- Pattern: ALB SG (443 from internet) → App SG (5000 **from ALB SG only**) → DB SG (27017 **from App SG only**).
- vs **NACL**: subnet level, stateless, allow + deny, numbered rules.

::: text
### Rule anatomy
| Field | Example |
|---|---|
| Type / Protocol | TCP |
| Port range | 443 |
| Source (inbound) / Destination (outbound) | `0.0.0.0/0`, `203.0.113.5/32` (your IP), or `sg-0abc` (another security group) |
| Description | "HTTPS from internet" |

### Key properties
- **Stateful**: if inbound 443 is allowed, the response goes out automatically (no outbound rule needed for it).
- **Allow-only**: you can't write "deny this IP". For that use **NACLs** or a **WAF**.
- **Referencing security groups** instead of IPs is the professional pattern. "App servers accept traffic only from the load balancer" stays true even when IPs change or autoscaling adds instances.

### Security group vs NACL
| | Security group | Network ACL |
|---|---|---|
| Level | Instance / ENI | Subnet |
| State | **Stateful** | Stateless (must allow return traffic) |
| Rules | Allow only | Allow and deny, evaluated in order |
| Typical use | Primary firewall | Extra coarse subnet-level guardrail |
:::

::: diagram Layered security groups
flowchart LR
  I(["Internet 0.0.0.0/0"]) -->|"TCP 443"| ALB["ALB, sg-alb: in 443 from 0.0.0.0/0"]
  ALB -->|"TCP 5000"| APP["EC2 app, sg-app: in 5000 from sg-alb"]
  ADMIN(["Your IP /32"]) -.->|"TCP 22, or use SSM"| APP
  APP -->|"TCP 27017"| DB[("DB, sg-db: in 27017 from sg-app")]
  I -.->|"blocked by sg-app"| APP
:::

::: code bash Create the layered setup with AWS CLI
VPC=vpc-0abc
ALB_SG=$(aws ec2 create-security-group --group-name sg-alb --description "ALB" --vpc-id $VPC --query GroupId --output text)
APP_SG=$(aws ec2 create-security-group --group-name sg-app --description "App" --vpc-id $VPC --query GroupId --output text)
DB_SG=$(aws ec2 create-security-group --group-name sg-db --description "DB" --vpc-id $VPC --query GroupId --output text)

# Internet → ALB on 443
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port 443 --cidr 0.0.0.0/0
# ALB → App on 5000 (source = ALB security group, not an IP)
aws ec2 authorize-security-group-ingress --group-id $APP_SG --protocol tcp --port 5000 --source-group $ALB_SG
# App → DB on 27017
aws ec2 authorize-security-group-ingress --group-id $DB_SG --protocol tcp --port 27017 --source-group $APP_SG
# SSH only from my IP (prefer SSM Session Manager instead)
aws ec2 authorize-security-group-ingress --group-id $APP_SG --protocol tcp --port 22 --cidr $(curl -s https://checkip.amazonaws.com)/32
:::

::: warning
- Opening **27017 (MongoDB) or 22 (SSH) to `0.0.0.0/0`**: bots scan the entire internet within minutes, and exposed databases get ransomed.
- Opening app port 5000 to the internet when there's a load balancer or Nginx in front.
- Using wide ranges "temporarily" and forgetting them.
:::

::: ask
- *"Is there a load balancer / bastion / VPN?"* *"Where does the database live (Atlas → use IP access list / VPC peering / PrivateLink)?"*
:::

::: links
Security group rules | https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
Compare security groups and NACLs | https://docs.aws.amazon.com/vpc/latest/userguide/infrastructure-security.html
:::

=== Why shouldn't you put secrets in source code? How do you manage secrets?
@p 3
@tags secrets, security, secrets-manager
@quick
- `const AWS_SECRET = "abc123"` → leaks through **git history** (forever, even after deletion), forks, logs, screenshots, the frontend bundle, and ex-employees.
- Bots scan GitHub for AWS keys **within minutes** → crypto-mining bills / data theft.
- Can't rotate without a redeploy; same secret across envs; no audit trail.
- Use: **IAM roles** (no AWS keys at all) + **Secrets Manager / SSM Parameter Store** + env injection; `.env` git-ignored for local dev.
- Detect: git-secrets / gitleaks pre-commit, GitHub secret scanning. If leaked → **rotate immediately**, then clean history.

::: text
### What goes wrong with hard-coded secrets
| Risk | Why |
|---|---|
| **Permanent exposure** | Git history keeps it even after you delete the line; every clone/fork has it |
| **Automated abuse** | Public repos are scanned by bots; leaked AWS keys are abused within minutes |
| **Wide blast radius** | Everyone with repo access (contractors, CI logs, laptops) has production credentials |
| **No rotation** | Changing a secret requires a code change + deploy |
| **Frontend leakage** | Anything in React code or `VITE_*` env ships to every browser |
| **Compliance** | PCI/SOC 2 audits fail |

### The right approach
1. **Don't need a secret at all**: use **IAM roles** for AWS access (EC2/ECS/Lambda) and **OIDC** for CI.
2. Other secrets (DB password, JWT secret, Stripe key) go in **AWS Secrets Manager** (with rotation) or **SSM Parameter Store SecureString**.
3. Inject at runtime (ECS task `secrets`, fetched at startup, or env vars set by the platform).
4. Local dev: `.env` in `.gitignore`, with a committed `.env.example` that has placeholder values.
5. Prevent leaks: **gitleaks**/git-secrets pre-commit hooks, GitHub secret scanning + push protection, redact logs.
6. **If leaked**: revoke/rotate first, check CloudTrail for abuse, then purge history (git filter-repo / BFG).
:::

::: code javascript Fetch a secret from AWS Secrets Manager (with caching)
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const client = new SecretsManagerClient({ region: process.env.AWS_REGION }); // uses the IAM role

let cache = { value: null, fetchedAt: 0 };
async function getDbCredentials() {
  if (cache.value && Date.now() - cache.fetchedAt < 5 * 60 * 1000) return cache.value; // 5-min cache (handles rotation)
  const res = await client.send(new GetSecretValueCommand({ SecretId: 'shop/prod/mongo' }));
  cache = { value: JSON.parse(res.SecretString), fetchedAt: Date.now() }; // { username, password, host }
  return cache.value;
}

(async () => {
  const { username, password, host } = await getDbCredentials();
  await mongoose.connect(`mongodb+srv://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}/shop`);
})();
:::

::: code bash .gitignore + leak prevention
# .gitignore
.env
.env.*
!.env.example
*.pem

# scan the repo (and add as a pre-commit hook / CI step)
brew install gitleaks
gitleaks detect --source . --verbose

# if a secret was committed: ROTATE IT FIRST, then rewrite history
pip install git-filter-repo
git filter-repo --path .env --invert-paths
:::

::: ask
- *"Where do secrets live today? Is rotation required? Who has access to production secrets?"*
:::

::: links
AWS Secrets Manager best practices | https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html
OWASP Secrets management cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
gitleaks | https://github.com/gitleaks/gitleaks
:::
