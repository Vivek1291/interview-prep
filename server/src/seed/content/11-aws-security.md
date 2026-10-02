@section AWS Security
@icon 🔐
@color #dc2626
@desc IAM users, roles, policies and least privilege; security groups; secrets management. Policies were tested against an AWS mock with IAM enforcement on, leak detection with gitleaks, and secrets caching against a Secrets Manager mock.

=== IAM: user vs role vs policy (and least privilege)
@p 3
@tags iam, security, roles
@quick
- **User** = long-term identity (a person or legacy tool) with a password and/or **access keys**; apps shouldn't use one.
- **Role** = identity that is **assumed** for a while: STS hands out **temporary credentials** (`ASIA…` key + session token + expiry). EC2/ECS/Lambda, CI via OIDC and other accounts use roles.
- **Policy** = JSON: `Effect`, `Action`, `Resource`, optional `Condition`. Identity policies attach to users/roles; resource policies (bucket policy) attach to resources; a **trust policy** says who may assume a role.
- Evaluation: **default deny** → any matching **explicit Deny wins** → otherwise a matching **Allow** grants. Tested: the role could put/get under `avatars/*` but got **AccessDenied** for `invoices/*`, `ListBuckets` and (explicit deny) `DeleteObject`.
- **Least privilege**: exact actions on exact ARNs, conditions where useful; no root account use, MFA for humans, SSO (IAM Identity Center) instead of IAM users.

::: text 🧒 In simple words
Think of an office building. An **IAM user** is a **permanent employee badge**: useful for people, dangerous if lost because it works until someone cancels it. A **role** is a **visitor pass** printed at reception for a specific job and valid for only a few hours; machines (servers, CI jobs) should always use visitor passes. A **policy** is the **list printed on the pass** of which doors it opens. "Least privilege" means the pass opens only the doors needed for today's job, and a "Deny" sticker on a door beats any pass.
:::

::: text 📖 Detailed answer
**IAM (Identity and Access Management)** decides **who** may do **what** on **which** resources.

| Concept | What it is | Example |
|---|---|---|
| Root user | The account owner, all powers | MFA, lock away, never used day to day |
| IAM user | Long-lived identity, password and/or access keys | Legacy; prefer SSO for people |
| Group | Users that share policies | `developers` |
| **Role** | Assumable identity, **temporary credentials** | `fullstack-api` attached to EC2 via an instance profile |
| **Policy** | JSON permissions | Allow `s3:PutObject` on `arn:aws:s3:::fullstack-app-uploads/avatars/*` |
| **Trust policy** | Who may assume a role | `ec2.amazonaws.com`, a GitHub OIDC provider, another account |

### Why roles for applications
- No secret on disk or in code; credentials rotate automatically and expire (tested: 15-minute session, key starting `ASIA`, with a session token).
- The SDK's default provider chain finds them (instance metadata / ECS task role / Lambda environment).
- Leaked access keys in `.env`, git or logs are one of the most common AWS incidents.

### Policy evaluation (tested with an AWS mock enforcing IAM)
| Request with the role's temporary credentials | Result | Why |
|---|---|---|
| `PutObject avatars/42/a.png` | Allowed | Matching Allow |
| `GetObject avatars/42/a.png` | Allowed | Matching Allow |
| `PutObject invoices/1.pdf` | AccessDenied | No Allow → implicit deny |
| `ListBuckets` | AccessDenied | Not granted |
| `DeleteObject avatars/42/a.png` | AccessDenied | **Explicit Deny** wins |
| Same `PutObject` with the base user's own keys | AccessDenied | The user may only assume the role |
In real accounts, also: Service Control Policies (Organizations), permission boundaries and session policies can only **restrict** further.

### Least privilege in practice
- Specific actions (`s3:GetObject`, not `s3:*`) on specific ARNs (bucket/prefix, parameter path, table).
- Conditions: `aws:SecureTransport`, source VPC/VPC endpoint, tags, MFA present.
- IAM Access Analyzer: find unused permissions and generate policies from CloudTrail activity.
:::

::: diagram How the API gets permissions without keys
flowchart LR
  TP["trust policy: ec2.amazonaws.com may assume"] --> ROLE["role: fullstack-api"]
  PP["permission policy: avatars/*, SSM path, Deny delete"] --> ROLE
  ROLE -->|"instance profile"| EC2["EC2 / ECS task"]
  EC2 -->|"SDK: temporary credentials from metadata"| STS["STS (expire automatically)"]
  EC2 -->|"signed request"| S3[("S3")]
  S3 -->|"deny? allow? default deny"| D{"decision"}
:::

::: image Permanent badges, short-lived visitor passes and the list of doors each pass opens
/images/aws-security/iam.svg
:::

::: text 🪜 Step by step
What happens when the API on EC2 calls `PutObject avatars/42/a.png`:
1. The SDK's default chain finds no env keys, then asks the instance metadata service (IMDSv2, with a session token) for the role's temporary credentials.
2. Those credentials (key `ASIA…`, secret, session token, expiry) are cached and refreshed before they expire.
3. The request is signed with SigV4 and sent to S3.
4. IAM collects the role's policies (and the bucket policy, SCPs, boundaries).
5. Any explicit Deny for `s3:PutObject` on that ARN? No. Any Allow? Yes (`avatars/*`) → allowed.
6. The same role calling `DeleteObject` matches the explicit Deny → AccessDenied, even if someone later adds an Allow.
:::

::: code json aws-security/iam/api-role-permissions.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "UploadsReadWrite",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::fullstack-app-uploads/avatars/*"
    },
    {
      "Sid": "ReadOwnSecrets",
      "Effect": "Allow",
      "Action": "ssm:GetParametersByPath",
      "Resource": "arn:aws:ssm:ap-south-1:123456789012:parameter/fullstack-app/prod*"
    },
    {
      "Sid": "NeverDeleteEvenIfSomeoneAddsIt",
      "Effect": "Deny",
      "Action": "s3:DeleteObject",
      "Resource": "*"
    }
  ]
}
:::
::: code json aws-security/iam/ec2-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Principal": { "Service": "ec2.amazonaws.com" }, "Action": "sts:AssumeRole" }
  ]
}
:::

::: code javascript No keys in code: the SDK uses the role automatically (node no-keys.js)
// How to run on EC2/ECS/Lambda with a role attached: npm install @aws-sdk/client-s3 && node no-keys.js
// Locally the same code uses your SSO/profile session (aws sso login) or env vars.
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// ✅ No credentials passed. The default provider chain checks, in order:
// env vars → SSO/shared config (~/.aws) → ECS task role → EC2 instance metadata (IMDSv2) role
const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });

async function main() {
  await s3.send(new PutObjectCommand({ Bucket: 'fullstack-app-uploads', Key: 'avatars/test.txt', Body: 'hello' }));
  const creds = await s3.config.credentials();
  console.log('used temporary credentials:', creds.accessKeyId.startsWith('ASIA'), '| expires:', creds.expiration?.toISOString());
}
main().catch((err) => { console.error(err.name, err.message); process.exit(1); });

// ❌ Never:
// new S3Client({ credentials: { accessKeyId: 'AKIA…', secretAccessKey: '…' } })
:::

::: code bash Create the role and attach it to EC2 (AWS CLI)
aws iam create-role --role-name fullstack-api --assume-role-policy-document file://ec2-trust-policy.json
aws iam put-role-policy --role-name fullstack-api --policy-name app --policy-document file://api-role-permissions.json
aws iam attach-role-policy --role-name fullstack-api --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore   # Session Manager
aws iam create-instance-profile --instance-profile-name fullstack-api
aws iam add-role-to-instance-profile --instance-profile-name fullstack-api --role-name fullstack-api
aws ec2 associate-iam-instance-profile --instance-id i-0abc123def4567890 --iam-instance-profile Name=fullstack-api
:::

::: code javascript Browser demo: IAM evaluation with wildcards and explicit deny (runnable)
const toRegex = (p) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
function evaluate(statements, action, resource) {
  const matching = statements.filter((s) => [].concat(s.Action).some((a) => toRegex(a).test(action)) && [].concat(s.Resource).some((r) => toRegex(r).test(resource)));
  if (matching.some((s) => s.Effect === 'Deny')) return 'explicit deny';
  if (matching.some((s) => s.Effect === 'Allow')) return 'allow';
  return 'implicit deny';
}
const policy = [
  { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject'], Resource: 'arn:aws:s3:::fullstack-app-uploads/avatars/*' },
  { Effect: 'Deny', Action: 's3:DeleteObject', Resource: '*' },
  { Effect: 'Allow', Action: 's3:*', Resource: 'arn:aws:s3:::fullstack-app-uploads/avatars/*' },   // someone added this later
];
const b = 'arn:aws:s3:::fullstack-app-uploads';
const cases = [
  ['s3:PutObject', `${b}/avatars/42/a.png`, 'allow'],
  ['s3:PutObject', `${b}/invoices/1.pdf`, 'implicit deny'],
  ['s3:ListAllMyBuckets', '*', 'implicit deny'],
  ['s3:DeleteObject', `${b}/avatars/42/a.png`, 'explicit deny'],
];
for (const [action, res, want] of cases) {
  const got = evaluate(policy, action, res);
  console.log(`${action} on ${res.replace('arn:aws:s3:::', '')} → ${got}`, got === want ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- Access keys in code, `.env` on servers or CI secrets instead of roles and OIDC.
- `"Action": "*"` / `"Resource": "*"` "just to make it work".
- Using the root account, or IAM users without MFA.
- Confusing the trust policy (who may assume) with the permission policy (what it may do).
- Forgetting that an explicit Deny anywhere (SCP, bucket policy) overrides your Allow when debugging AccessDenied.
:::

::: understand
- Identity = **who** (user, role); policy = **what**; trust policy = **who may become this role**.
- Temporary credentials are the default for anything that isn't a human.
- Start from nothing and add permissions; review them with Access Analyzer.
:::

::: ask
- *"How do developers sign in: IAM users or IAM Identity Center (SSO)?"*
- *"How does CI deploy?"* (GitHub OIDC → role, no stored keys)
- *"Multiple accounts (dev/prod) with Organizations and SCPs?"*
:::

::: important ⭐ Say this in the interview
"IAM controls who can do what on which resources. A user is a long-lived identity with a password or access keys, which I keep for humans only and prefer SSO. A role is assumed and gives temporary credentials from STS, so EC2, ECS, Lambda and CI through OIDC all use roles and no keys ever sit in code or on servers. Policies are JSON with effect, action, resource and conditions, and a trust policy says who may assume the role. Evaluation starts from deny, any explicit Deny wins, otherwise an Allow grants. I tested a least-privilege role against an AWS mock with IAM enforcement: it could read and write avatars, but writing invoices, listing buckets and deleting objects, which had an explicit deny, were all refused."
:::

::: links
AWS: IAM security best practices | https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html
AWS: IAM roles | https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html
AWS: Policy evaluation logic | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html
AWS SDK for JavaScript: credential provider chain | https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html
:::

=== What is a security group? (inbound, outbound, port, protocol, source)
@p 3
@tags security-group, networking, firewall
@quick
- A **stateful virtual firewall** attached to network interfaces (EC2, ALB, RDS, Lambda in a VPC, ECS tasks).
- **Inbound rule** = protocol + port range + **source** (CIDR like `203.0.113.10/32`, or **another security group**); **outbound** defaults to allow all.
- **Allow-only** (no deny rules); anything not allowed is dropped. **Stateful**: replies to allowed traffic flow back automatically.
- Professional pattern (tested with the AWS CLI on a mock): ALB SG **443/80 from 0.0.0.0/0** → app SG **80 from the ALB SG** → DB SG **27017 from the app SG**.
- **NACLs** are subnet-level, **stateless**, allow + deny, numbered rules: a coarse extra guardrail; use WAF to block specific attackers.

::: text 🧒 In simple words
A security group is a **bouncer with a guest list** at each door. The list says things like "anyone may enter door 443" or "only people wearing a load-balancer wristband may enter door 80". The bouncer never needs a "banned" list, because anyone not on the guest list is turned away. And when a guest who was let in leaves, the bouncer lets them out without checking again (stateful). The best guest lists name **wristbands** (other security groups) instead of addresses, because addresses change and wristbands don't.
:::

::: text 📖 Detailed answer
### Rule anatomy
| Field | Example |
|---|---|
| Protocol | TCP (also UDP, ICMP, all) |
| Port range | 443, or 1024–65535 |
| Source (inbound) / destination (outbound) | `0.0.0.0/0`, `::/0`, `203.0.113.10/32`, **`sg-…`** (another group), a prefix list |
| Description | "HTTPS from internet" |

### Properties
- **Stateful**: allowing inbound 443 automatically allows the response out.
- **Allow-only**: to block one IP, use a NACL or AWS WAF.
- **Group references**: "app accepts only from the ALB" stays true as instances scale and IPs change.
- Changes apply immediately; several groups can be attached to one interface (rules add up).

### Three-tier layout (created by the script below; verified with `describe-security-groups`)
| Group | Inbound | Outbound |
|---|---|---|
| `fullstack-alb` | 443, 80 from `0.0.0.0/0` | all (default) |
| `fullstack-app` | 80 from `fullstack-alb` | all (default) |
| `fullstack-db` | 27017 from `fullstack-app` | all (default) |
For MongoDB Atlas the database isn't in your VPC: use PrivateLink or VPC peering plus Atlas's IP access list.

### Security group vs NACL
| | Security group | Network ACL |
|---|---|---|
| Attached to | Network interface | Subnet |
| State | **Stateful** | Stateless (allow return traffic yourself) |
| Rules | Allow only | Allow and deny, evaluated by number |
| Use | Primary firewall | Coarse guardrail, emergency blocks |
:::

::: diagram Layered security groups
flowchart LR
  I(["Internet 0.0.0.0/0"]) -->|"TCP 443"| ALB["ALB, sg-alb: in 443/80 from anywhere"]
  ALB -->|"TCP 80"| APP["App, sg-app: in 80 from sg-alb"]
  APP -->|"TCP 27017"| DB[("DB, sg-db: in 27017 from sg-app")]
  I -.->|"dropped: not on the list"| APP
  I -.->|"dropped"| DB
  ADMIN(["admin"]) -.->|"SSM Session Manager, no inbound port"| APP
:::

::: image A bouncer with a guest list at every door, naming wristbands instead of addresses
/images/aws-security/security-groups.svg
:::

::: text 🪜 Step by step
A user request travelling through the three groups:
1. Browser → ALB public IP on 443: `fullstack-alb` allows 443 from anywhere → accepted.
2. ALB → app instance on 80: the source is a network interface in `fullstack-alb` → matches "80 from sg-alb" → accepted.
3. App → MongoDB on 27017: the source is in `fullstack-app` → matches the DB rule → accepted.
4. Every reply flows back automatically because security groups are stateful.
5. An internet scanner trying the app instance's port 80 or the DB's 27017 directly matches no rule → silently dropped.
6. A new app instance launched by Auto Scaling gets `fullstack-app` and works immediately: no IPs in any rule.
:::

::: code bash aws-security/three-tier-sgs.sh
#!/usr/bin/env bash
# Three security groups that reference each other: internet → ALB → app → database.
# Usage: ./three-tier-sgs.sh <vpc-id>      (in real projects: Terraform/CDK)
set -euo pipefail
VPC=${1:?usage: three-tier-sgs.sh <vpc-id>}
sg() { aws ec2 create-security-group --group-name "$1" --description "$2" --vpc-id "$VPC" --query GroupId --output text; }

ALB_SG=$(sg fullstack-alb "Load balancer")
APP_SG=$(sg fullstack-app "App instances")
DB_SG=$(sg fullstack-db "Database")

# Internet → ALB: HTTPS (and HTTP only to redirect)
aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --protocol tcp --port 443 --cidr 0.0.0.0/0 >/dev/null
aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --protocol tcp --port 80 --cidr 0.0.0.0/0 >/dev/null
# ALB → app: source is the ALB's GROUP, so new instances and changing IPs need no rule changes
aws ec2 authorize-security-group-ingress --group-id "$APP_SG" --protocol tcp --port 80 --source-group "$ALB_SG" >/dev/null
# app → database (self-managed MongoDB on EC2; for Atlas use PrivateLink/VPC peering + its IP access list)
aws ec2 authorize-security-group-ingress --group-id "$DB_SG" --protocol tcp --port 27017 --source-group "$APP_SG" >/dev/null

echo "ALB_SG=$ALB_SG APP_SG=$APP_SG DB_SG=$DB_SG"
:::

::: code javascript Browser demo: stateful allow-list evaluation with group references (runnable)
const groups = {
  'sg-alb': { inbound: [{ port: 443, cidr: '0.0.0.0/0' }, { port: 80, cidr: '0.0.0.0/0' }] },
  'sg-app': { inbound: [{ port: 80, fromGroup: 'sg-alb' }] },
  'sg-db': { inbound: [{ port: 27017, fromGroup: 'sg-app' }] },
};
const connections = new Set();                              // state table: allowed flows
function connect({ to, port, fromIp, fromGroup }) {
  const ok = groups[to].inbound.some((r) => r.port === port && (r.fromGroup ? r.fromGroup === fromGroup : r.cidr === '0.0.0.0/0' || r.cidr === `${fromIp}/32`));
  if (ok) connections.add(`${fromGroup ?? fromIp}->${to}:${port}`);
  return ok;
}
const reply = (from, to, port) => connections.has(`${to}->${from}:${port}`);   // stateful: replies need no rule
const cases = [
  ['internet → ALB:443', connect({ to: 'sg-alb', port: 443, fromIp: '198.51.100.7' }), true],
  ['ALB → app:80', connect({ to: 'sg-app', port: 80, fromGroup: 'sg-alb' }), true],
  ['app → db:27017', connect({ to: 'sg-db', port: 27017, fromGroup: 'sg-app' }), true],
  ['internet → app:80 directly', connect({ to: 'sg-app', port: 80, fromIp: '198.51.100.7' }), false],
  ['internet → db:27017', connect({ to: 'sg-db', port: 27017, fromIp: '198.51.100.7' }), false],
  ['db reply → app (stateful)', reply('sg-db', 'sg-app', 27017), true],
];
for (const [label, got, want] of cases) console.log(`${label}: ${got ? 'allowed' : 'dropped'}`, got === want ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- 22 (SSH) or 27017 (MongoDB) open to `0.0.0.0/0`: internet-wide scanners find them within minutes and exposed databases get ransomed.
- Opening the app port to the internet although an ALB or Nginx sits in front.
- IP-based rules between tiers that break when instances are replaced.
- "Temporary" wide rules that are never removed; no descriptions on rules.
- Expecting a security group to block one bad IP (use WAF or a NACL).
:::

::: understand
- Security groups are the per-resource, stateful, allow-list firewall; NACLs are a coarser, stateless subnet filter.
- Chaining groups by reference expresses intent ("only the tier above may call me").
- Fewer open ports = fewer things to patch and monitor.
:::

::: ask
- *"Is there a load balancer, bastion or VPN?"*
- *"Where does the database run?"* (same VPC, Atlas with PrivateLink, RDS)
- *"Do we need egress restrictions?"* (e.g. only to known APIs via a proxy or VPC endpoints)
:::

::: important ⭐ Say this in the interview
"A security group is a stateful, allow-only virtual firewall on a network interface. Each inbound rule is a protocol, a port and a source, which can be a CIDR or another security group; outbound is open by default, and replies to allowed traffic are automatically allowed. Anything not listed is dropped, so to block a specific IP I'd use WAF or a network ACL, which is stateless, subnet-level and supports deny rules. My standard layout chains groups by reference: the ALB accepts 443 from the internet, the app accepts its port only from the ALB's group, and the database accepts 27017 only from the app's group, so it keeps working as instances scale and nothing but the load balancer is exposed. SSH stays closed and I use Session Manager."
:::

::: links
AWS: Security group rules | https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
AWS: Control traffic with network ACLs | https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html
AWS: Security groups for your Application Load Balancer | https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-update-security-groups.html
:::

=== Why shouldn't you put secrets in source code? How do you manage secrets?
@p 3
@tags secrets, security, secrets-manager
@quick
- Hard-coded secrets live **forever in git history** (tested: deleting the line left **2 leaks** that gitleaks found in history), in every clone, fork, CI log and frontend bundle.
- Public repos are scanned by bots for AWS keys continuously; rotation would need a code change; everyone with repo access has production credentials.
- Use **IAM roles** (no AWS keys at all) and **OIDC** for CI; put other secrets in **Secrets Manager** (rotation) or **SSM SecureString**; inject at runtime; `.env` only locally and git-ignored.
- Read with a **cache**: tested, 1,000 concurrent reads → **1** Secrets Manager call; a rotated value was picked up after the TTL; during an AWS error the last good value was served.
- Prevent and respond: gitleaks pre-commit hook (blocked a staged key) + GitHub push protection; if leaked → **rotate first**, check CloudTrail, then rewrite history (`git filter-repo`).

::: text 🧒 In simple words
Writing a password in your code is like **writing your house key's code on a postcard**. Even if you scribble it out later, every photocopy of the postcard (every git clone, fork and backup) still shows it, and there are people whose whole job is reading postcards. The safe way is to keep codes in a **safe deposit box** (Secrets Manager) that only your house (the server's role) may open, to change the codes regularly, and to have a doorman (a pre-commit hook) who stops you from posting a postcard with a code on it.
:::

::: text 📖 Detailed answer
### What goes wrong with hard-coded secrets
| Risk | Why |
|---|---|
| Permanent exposure | Git history keeps it after you delete the line; every clone/fork has it |
| Automated abuse | Leaked cloud keys get picked up by scanners and abused quickly |
| Wide blast radius | Everyone with repo or CI-log access holds production credentials |
| No rotation | Changing the secret needs a commit and a deploy |
| Frontend leakage | Anything in React code or `VITE_*` ships to every browser |
| Compliance | SOC 2 / PCI audits fail |

### The right approach
1. **Need no secret**: IAM roles for AWS access, GitHub OIDC for CI.
2. **Store** the rest (DB password, JWT keys, Stripe key) in Secrets Manager (built-in rotation) or SSM Parameter Store SecureString.
3. **Inject** at runtime: ECS task `secrets`, a startup fetch, or an env file written at deploy time (`chmod 600`).
4. **Cache** reads with a TTL so rotations are picked up and API calls stay low.
5. **Local dev**: `.env` git-ignored, `.env.example` committed with placeholders.
6. **Prevent**: gitleaks pre-commit hook and CI scan, GitHub secret scanning with push protection, redaction in logs.
7. **Respond** to a leak: revoke/rotate immediately, check CloudTrail for misuse, then purge history and force-push.

### Tested
| Check | Result |
|---|---|
| Commit a fake AWS key, then delete it in the next commit | HEAD clean, `gitleaks git` → **2 leaks** in history |
| `git filter-repo --replace-text` | Old commit now shows `REMOVED`; gitleaks → no leaks |
| Pre-commit scan of a staged key / clean file | exit **1** (commit blocked) / exit 0 |
| 1,000 concurrent `getSecret()` | **1** API call |
| Rotation (`PutSecretValue`) | Old value until the TTL, then the new one |
| AWS error after the TTL | Last good value served |
:::

::: diagram Where secrets should live
flowchart LR
  DEV["developer laptop: .env (git-ignored)"] -.->|"never committed: pre-commit gitleaks"| GIT[("git repo")]
  SM[("Secrets Manager / SSM SecureString")] -->|"IAM role, cached with TTL"| APP["API process"]
  ROT["rotation (Lambda or manual put)"] --> SM
  CI["CI: GitHub OIDC → role"] -->|"no stored keys"| AWS["AWS APIs"]
  APP --> DB[("MongoDB")]
:::

::: chart bar Measured: Secrets Manager API calls for 1,000 concurrent reads
Approach,API calls
No cache,1000
Cache + in-flight dedupe,1
:::

::: image A code on a postcard vs a safe deposit box with a doorman
/images/aws-security/secrets.svg
:::

::: text 🪜 Step by step
If someone pushes an AWS key to GitHub:
1. **Revoke/rotate immediately**: deactivate the access key (or rotate the DB password) before anything else; history clean-up takes longer and copies may exist.
2. Check **CloudTrail** for actions by that key (unexpected regions, EC2 launches, IAM changes) and billing for spikes.
3. Replace the code path with a role or a Secrets Manager read.
4. Purge history: `git filter-repo --replace-text replacements.txt`, force-push, ask collaborators to re-clone.
5. Add the pre-commit hook and enable GitHub push protection so it can't happen again.
:::

::: code javascript aws-security/secrets.js
// secrets.js: read secrets from AWS Secrets Manager with a small cache (credentials from the IAM role).
// How to run: AWS_REGION=ap-south-1 node -e "require('./secrets').getSecret('fullstack-app/prod/mongo').then(console.log)"
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const client = new SecretsManagerClient({});
const TTL_MS = Number(process.env.SECRET_TTL_MS) || 5 * 60 * 1000;   // re-read every 5 min → picks up rotations
const cache = new Map();                                          // secretId → { value, expires, pending }

async function getSecret(secretId) {
  const hit = cache.get(secretId);
  if (hit?.value && hit.expires > Date.now()) return hit.value;
  if (hit?.pending) return hit.pending;                           // many callers at once → one API call
  const pending = client.send(new GetSecretValueCommand({ SecretId: secretId }))
    .then((res) => {
      const value = JSON.parse(res.SecretString);
      cache.set(secretId, { value, expires: Date.now() + TTL_MS });
      return value;
    })
    .catch((err) => {
      cache.delete(secretId);
      if (hit?.value) return hit.value;                           // AWS hiccup: keep using the last good value
      throw err;
    });
  cache.set(secretId, { ...hit, pending });
  return pending;
}

module.exports = { getSecret };
:::
::: code text aws-security/.githooks/pre-commit
#!/bin/sh
# Block commits that contain secrets. Enable once per clone:  git config core.hooksPath .githooks
# Needs gitleaks (brew install gitleaks, or a release binary). CI runs "gitleaks git ." on every push too.
if ! gitleaks git --pre-commit --staged --redact --no-banner .; then
  echo "❌ Secret detected in staged changes. Remove it, and rotate it if it was ever pushed."
  exit 1
fi
:::

::: code bash .gitignore, scanning and cleaning history
# .gitignore
.env
.env.*
!.env.example
*.pem

# scan everything (working tree + history); add to CI as well
gitleaks git . --redact

# enable the pre-commit hook in this clone
git config core.hooksPath .githooks

# a secret was committed: ROTATE IT FIRST, then rewrite history
pip install git-filter-repo
printf 'AKIA_THE_LEAKED_KEY==>REMOVED\n' > replacements.txt
git filter-repo --replace-text replacements.txt
git push --force --all
:::

::: code javascript Browser demo: TTL cache with in-flight de-duplication and fallback (runnable)
function createSecretCache(fetchSecret, ttlMs) {
  const cache = new Map();
  let calls = 0;
  async function get(id) {
    const hit = cache.get(id);
    if (hit?.value && hit.expires > Date.now()) return hit.value;
    if (hit?.pending) return hit.pending;
    const pending = (calls++, fetchSecret(id))
      .then((value) => { cache.set(id, { value, expires: Date.now() + ttlMs }); return value; })
      .catch((err) => { cache.delete(id); if (hit?.value) return hit.value; throw err; });
    cache.set(id, { ...hit, pending });
    return pending;
  }
  return { get, get calls() { return calls; } };
}
let current = 'v1', failing = false;
const fakeAws = async () => { await new Promise((r) => setTimeout(r, 5)); if (failing) throw new Error('Throttling'); return current; };
(async () => {
  const secrets = createSecretCache(fakeAws, 50);
  const all = await Promise.all(Array.from({ length: 1000 }, () => secrets.get('db')));
  console.log('1,000 reads → 1 call', secrets.calls === 1 && all.every((v) => v === 'v1') ? '✅' : '❌ FAIL');
  current = 'v2';
  console.log('cached value before the TTL', (await secrets.get('db')) === 'v1' ? '✅' : '❌ FAIL');
  await new Promise((r) => setTimeout(r, 60));
  console.log('rotation picked up after the TTL', (await secrets.get('db')) === 'v2' ? '✅' : '❌ FAIL');
  await new Promise((r) => setTimeout(r, 60));
  failing = true;
  console.log('AWS error → last good value', (await secrets.get('db')) === 'v2' ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Deleting the line and thinking the secret is gone (it's still in history and every clone).
- Cleaning history but not rotating the secret.
- Secrets in `VITE_*`/`REACT_APP_*`, Docker images, CI logs or error messages.
- Fetching the secret on every request (slow, costly, throttled) or caching it forever (rotations never apply).
- One shared secret for dev, staging and prod.
:::

::: understand
- The best secret is no secret: roles and OIDC remove most credentials entirely.
- Secrets have a lifecycle: create, store, deliver, cache, rotate, revoke, audit.
- Prevention (hooks, push protection) is cheaper than incident response.
:::

::: ask
- *"Where do secrets live today, and who can read production ones?"*
- *"Is automatic rotation required (DB passwords)?"*
- *"Is the repository public or will it ever be?"*
:::

::: important ⭐ Say this in the interview
"Secrets in source code live forever in git history, every clone and CI logs, can't be rotated without a deploy, and give production access to everyone with the repo; in a test, deleting a committed key still left two leaks that gitleaks found in history. So first I avoid secrets: IAM roles for AWS and GitHub OIDC for CI. The rest go in Secrets Manager, which can rotate them, or SSM SecureString, read by the app's role at runtime with a TTL cache: a thousand concurrent reads made one API call, rotated values were picked up after the TTL, and the last good value survives an AWS hiccup. Locally I use a git-ignored .env. A gitleaks pre-commit hook and GitHub push protection stop leaks, and if one happens I rotate first, check CloudTrail, then rewrite history."
:::

::: links
AWS: Secrets Manager best practices | https://docs.aws.amazon.com/secretsmanager/latest/userguide/best-practices.html
OWASP: Secrets management cheat sheet | https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
gitleaks | https://github.com/gitleaks/gitleaks
GitHub: Push protection | https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection
:::
