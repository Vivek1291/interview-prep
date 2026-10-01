@section AWS EC2 & Deployment
@icon ☁️
@color #f97316
@desc EC2, deploying Node with Nginx + PM2, ports 80/443, SSH, env vars, monitoring, Docker on EC2, CI/CD and frontend hosting.

=== How do you deploy a Node.js application to EC2? (explain the full request path)
@p 3
@tags ec2, deployment, nginx, pm2
@quick
- Path: **User → Domain (Route 53) → EC2 (Elastic IP / ALB) → Nginx :80/:443 → Node/Express :5000 → MongoDB (Atlas)**.
- Steps: launch EC2 (Ubuntu/AL2023) + key pair + **security group (22 from my IP, 80/443 from anywhere)** → SSH → install Node (nvm) + git + Nginx + PM2 → clone → `npm ci` → env vars → `pm2 start` → Nginx reverse proxy → **Certbot HTTPS** → DNS A record.
- Node listens on localhost:5000; **only Nginx is public**.
- `pm2 startup` + `pm2 save` = auto-start on reboot.
- Better at scale: Docker + ALB + Auto Scaling / ECS.

::: text
### Architecture you should be able to draw
**User** → **Domain** (Route 53 DNS A record) → **EC2** public IP / Elastic IP → **Nginx** (ports 80/443, TLS termination, gzip, static files, reverse proxy) → **Node.js / Express** on `localhost:5000` managed by **PM2** → **MongoDB** (Atlas, or a DB in a private subnet).

### Step by step
1. **Launch EC2**: Ubuntu 24.04 / Amazon Linux 2023, t3.small, a key pair (.pem), a **security group**: SSH 22 from *your IP only*, HTTP 80 + HTTPS 443 from `0.0.0.0/0`. Attach an **IAM role** if the app uses S3 etc. Allocate an **Elastic IP** (static).
2. **SSH in**: `ssh -i key.pem ubuntu@<ip>`
3. **Install runtime**: Node LTS (nvm or NodeSource), git, Nginx, PM2 (`npm i -g pm2`).
4. **Get the code**: `git clone` (deploy key) or a CI artifact → `npm ci --omit=dev` → build if needed.
5. **Configure env**: `.env` file with `chmod 600`, or better, fetch from **SSM Parameter Store / Secrets Manager** at start.
6. **Run with PM2**: `pm2 start ecosystem.config.js --env production` → `pm2 save` → `pm2 startup` (systemd).
7. **Nginx reverse proxy**: `/etc/nginx/sites-available/app` → `proxy_pass http://127.0.0.1:5000` → `nginx -t && systemctl reload nginx`.
8. **DNS**: Route 53 A record `api.example.com` → Elastic IP.
9. **HTTPS**: `sudo certbot --nginx -d api.example.com` (Let's Encrypt, auto-renew). Or put an **ALB + ACM certificate** in front.
10. **Verify**: `curl https://api.example.com/health`; set up logs + monitoring.
:::

::: diagram
flowchart LR
  U(["User browser"]) -->|"api.example.com"| DNS["Route 53 DNS"]
  DNS --> EIP["Elastic IP"]
  subgraph EC2["EC2 instance, Security Group: 80, 443 open, 22 my IP"]
    NG["Nginx :80 / :443, TLS, gzip, proxy"] -->|"127.0.0.1:5000"| PM["PM2 cluster: Node/Express x N cores"]
  end
  EIP --> NG
  PM --> DB[("MongoDB Atlas")]
  PM --> S3[("S3 via IAM role")]
:::

::: code bash Server setup script (Ubuntu)
# 1) connect
chmod 400 mykey.pem
ssh -i mykey.pem ubuntu@13.233.10.20

# 2) system packages
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc && nvm install --lts
npm install -g pm2

# 3) app
git clone https://github.com/you/shop-api.git && cd shop-api
npm ci --omit=dev
cp .env.example .env && nano .env && chmod 600 .env   # or pull from SSM (see env vars question)

# 4) run & persist
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd   # prints a command — run it with sudo

# 5) nginx + https
sudo nano /etc/nginx/sites-available/shop   # paste config below
sudo ln -s /etc/nginx/sites-available/shop /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com --redirect -m you@example.com --agree-tos
:::

::: code nginx /etc/nginx/sites-available/shop
server {
  listen 80;
  server_name api.example.com;

  client_max_body_size 10m;
  gzip on;
  gzip_types application/json text/css application/javascript;

  location / {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;        # WebSocket support
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
# certbot later adds the listen 443 ssl block + redirect
:::

::: code javascript ecosystem.config.js (PM2)
module.exports = {
  apps: [
    {
      name: 'shop-api',
      script: 'src/server.js',
      instances: 'max',          // one process per CPU core (cluster mode)
      exec_mode: 'cluster',
      max_memory_restart: '400M',
      env_production: { NODE_ENV: 'production', PORT: 5000 },
      out_file: '/var/log/shop-api/out.log',
      error_file: '/var/log/shop-api/err.log',
      time: true,
    },
  ],
};
:::

::: understand
- **Why Nginx in front of Node?** TLS termination, serving static files efficiently, gzip, buffering slow clients, rate limiting, load balancing across multiple Node processes, and hiding the Node port.
- **Why PM2?** It restarts on crash, runs cluster mode across all cores, handles zero-downtime reloads, log management and startup on boot.
- A single EC2 is a **single point of failure**. For production: **ALB + Auto Scaling Group across 2+ AZs**, or ECS/Fargate.
:::

::: ask
- *"Single instance acceptable, or do we need high availability?"* *"Where does MongoDB run?"* (Atlas with VPC peering / IP allowlist.)
- *"Manual deploys or CI/CD?"* Mention you'd automate with GitHub Actions (see the CI/CD question).
:::

::: links
AWS: Tutorial get started with EC2 Linux | https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html
PM2 quick start | https://pm2.keymetrics.io/docs/usage/quick-start/
Certbot for Nginx | https://certbot.eff.org/instructions?ws=nginx&os=snap
:::

=== What is EC2 and how does a Node application run on it?
@p 3
@tags ec2, basics
@quick
- **EC2 (Elastic Compute Cloud)** = resizable **virtual servers** in AWS; you manage OS, runtime, app (IaaS).
- Key concepts: **AMI** (OS image), **instance type** (t3/m7/c7 = CPU/RAM), **EBS** (disk), **security group** (firewall), **key pair** (SSH), **Elastic IP**, **IAM role**, region/AZ, user data (boot script).
- Node runs as a normal Linux process: `node server.js` listening on a port, kept alive by **PM2/systemd/Docker**, fronted by Nginx/ALB.
- Pricing: On-Demand, Reserved/Savings Plans, **Spot** (cheap, interruptible).
- Alternatives: ECS/Fargate (containers), Lambda (serverless), Elastic Beanstalk, App Runner.

::: text
**Amazon EC2** provides virtual machines ("instances") in the cloud. You choose the OS, CPU/RAM and storage, and you're responsible for patching, installing Node and running the app (the **shared responsibility model**).

| Concept | What it is |
|---|---|
| **AMI** | Template image (Ubuntu, Amazon Linux, or your custom image with Node pre-installed) |
| **Instance type** | Size: `t3.micro` (burstable, free tier), `t3.medium`, `c7g` (compute, ARM Graviton), `m7i` (general) |
| **EBS volume** | Persistent network disk (root volume); snapshots for backup |
| **Security group** | Stateful virtual firewall (allowed ports/sources) |
| **Key pair** | SSH authentication |
| **Elastic IP** | Static public IPv4 |
| **IAM instance role** | Gives the app AWS permissions **without access keys** |
| **User data** | Script that runs at first boot (install Node, start the app) |
| **Region / AZ** | Location; spread across AZs for availability |

### How Node runs on it
EC2 is just Linux. Node is a process: `node dist/server.js` binds to port 5000. To be production-ready it needs a **process manager** (PM2 or systemd) for restarts and boot, a **reverse proxy** (Nginx) or **ALB** for 80/443, and logs/monitoring.
:::

::: code bash User data script: auto-provision a Node app at boot (Amazon Linux 2023)
#!/bin/bash
dnf update -y
dnf install -y nodejs git nginx
npm install -g pm2
cd /home/ec2-user
git clone https://github.com/you/shop-api.git app && cd app
npm ci --omit=dev
# fetch secrets from SSM Parameter Store using the instance IAM role
export MONGO_URI=$(aws ssm get-parameter --name /shop/prod/MONGO_URI --with-decryption --query Parameter.Value --output text)
pm2 start src/server.js --name shop-api -i max
pm2 save && pm2 startup systemd -u ec2-user --hp /home/ec2-user
systemctl enable --now nginx
:::

::: ask
- *"Why EC2 instead of ECS/Lambda?"* EC2 gives full control and is good for learning or long-running processes; ECS/Fargate removes server management; Lambda suits spiky, event-driven workloads. Show you know the trade-off.
:::

::: links
What is Amazon EC2 | https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/concepts.html
EC2 instance types | https://aws.amazon.com/ec2/instance-types/
:::

=== PM2 vs running Node directly? How do you restart the application?
@p 3
@tags pm2, process-manager, zero-downtime
@quick
- `node server.js` in SSH: dies when you log out / on crash / on reboot; single core; no log management.
- **PM2**: auto-restart on crash, **cluster mode** (all CPU cores), **zero-downtime reload** (`pm2 reload`), startup on boot, logs + rotation, `pm2 monit`, memory-limit restarts.
- Restart commands: `pm2 restart app` (brief downtime), **`pm2 reload app`** (rolling, zero-downtime in cluster mode), `pm2 logs`, `pm2 status`.
- Alternatives: **systemd** service, **Docker** `restart: unless-stopped`, ECS/Kubernetes (the orchestrator restarts containers).
- Implement **graceful shutdown** (SIGINT/SIGTERM → stop accepting, finish requests, close DB).

::: text
| | `node server.js` | PM2 |
|---|---|---|
| Crash recovery | ❌ stays dead | ✅ auto-restart (with backoff) |
| Survives SSH logout / reboot | ❌ | ✅ `pm2 startup` + `pm2 save` |
| Multi-core | ❌ one process | ✅ `-i max` cluster mode |
| Zero-downtime deploy | ❌ | ✅ `pm2 reload` (restarts workers one by one) |
| Logs | stdout only | ✅ files, `pm2 logs`, rotation module |
| Monitoring | ❌ | ✅ `pm2 monit`, memory/CPU, restart count |
| Memory leak mitigation | ❌ | ✅ `max_memory_restart` |

### Graceful shutdown (needed for zero-downtime reloads)
When PM2/Docker/ECS stops a process it sends **SIGINT/SIGTERM**. Your app should: stop accepting new connections (`server.close()`), finish in-flight requests, close DB/Redis connections, then `process.exit(0)`, with a timeout fallback.
:::

::: code bash Everyday PM2 commands
pm2 start src/server.js --name api -i max     # cluster mode on all cores
pm2 status                                     # list processes
pm2 logs api --lines 100                       # tail logs
pm2 monit                                      # live CPU/memory dashboard
pm2 restart api                                # hard restart (short downtime)
pm2 reload api                                 # zero-downtime rolling reload
pm2 stop api && pm2 delete api
pm2 save && pm2 startup                        # resurrect on reboot
pm2 install pm2-logrotate                      # rotate logs

# deploy flow on the server
git pull && npm ci --omit=dev && pm2 reload ecosystem.config.js --env production
:::

::: code javascript Graceful shutdown in server.js
const mongoose = require('mongoose');
const app = require('./app');

const server = app.listen(process.env.PORT || 5000, () => {
  console.log('listening');
  if (process.send) process.send('ready'); // PM2 wait_ready support
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received: closing server`);
  server.close(async () => {             // stop accepting, wait for in-flight requests
    await mongoose.connection.close();
    console.log('closed cleanly');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // force exit if stuck
}
process.on('SIGTERM', shutdown); // Docker / ECS / systemd
process.on('SIGINT', shutdown);  // PM2 / Ctrl+C
:::

::: ask
- *"Are we running on bare EC2, Docker, or ECS/Kubernetes?"* In containers you usually **don't** use PM2; the orchestrator handles restarts and scaling (one process per container).
:::

::: links
PM2 cluster mode | https://pm2.keymetrics.io/docs/usage/cluster-mode/
PM2 graceful shutdown | https://pm2.keymetrics.io/docs/usage/signals-clean-restart/
:::

=== How do you manage environment variables on EC2 / in production?
@p 3
@tags env, config, secrets, ssm
@quick
- 12-factor: config lives in the **environment**, not code. Read once in `config/index.js`, **validate at startup** (Zod), fail fast.
- Local: `.env` (+ `.env.example` committed, `.env` in `.gitignore`).
- EC2: **SSM Parameter Store (SecureString)** / **Secrets Manager** fetched via the **IAM role** at boot/start; or PM2 ecosystem env; or systemd `EnvironmentFile` with `chmod 600`.
- Containers: ECS task definition `secrets` from SSM/Secrets Manager; Docker `--env-file`.
- Frontend env vars (`VITE_*`) are **public** (baked into the JS bundle), so never put secrets there.

::: text
### Options, worst → best
| Option | Notes |
|---|---|
| Hard-coded in source | ❌ Never (leaks via git, can't change per env) |
| `.env` file on the server | OK for small setups; `chmod 600`, never committed, manual to rotate |
| PM2 `ecosystem.config.js` env | Convenient, but the file contains secrets |
| **SSM Parameter Store** (SecureString, KMS-encrypted) | ✅ Free tier, IAM-controlled, versioned; fetched at startup |
| **Secrets Manager** | ✅ Automatic **rotation** (e.g. DB passwords), cross-account; costs per secret |
| ECS/EKS secret injection | ✅ Injected as env vars at container start |

### Good practices
- **Validate** all required env vars at startup (crash early with a clear error).
- Separate values per environment: `/shop/dev/...`, `/shop/prod/...`.
- Use the **IAM role** on EC2/ECS to read parameters, so there are no AWS keys on the server.
- Don't log env values; redact them in error reports.
- React: `import.meta.env.VITE_API_URL` is **public config**, fine for URLs but never for secrets.
:::

::: code javascript config/index.js: load + validate env with Zod
require('dotenv').config(); // local dev only; in prod the env comes from SSM/ECS
const { z } = require('zod');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(5000),
  MONGO_URI: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  AWS_REGION: z.string().default('ap-south-1'),
  S3_BUCKET: z.string(),
  CORS_ORIGINS: z.string().transform((s) => s.split(',')),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1); // fail fast
}
module.exports = Object.freeze(parsed.data);
:::

::: code javascript Load secrets from SSM Parameter Store at startup (AWS SDK v3)
const { SSMClient, GetParametersByPathCommand } = require('@aws-sdk/client-ssm');

async function loadSsmParams(path = `/shop/${process.env.NODE_ENV}/`) {
  const ssm = new SSMClient({ region: process.env.AWS_REGION }); // credentials from the EC2 IAM role
  let NextToken;
  do {
    const res = await ssm.send(new GetParametersByPathCommand({ Path: path, WithDecryption: true, Recursive: true, NextToken }));
    for (const p of res.Parameters) process.env[p.Name.replace(path, '')] = p.Value; // /shop/prod/MONGO_URI → MONGO_URI
    NextToken = res.NextToken;
  } while (NextToken);
}

(async () => {
  await loadSsmParams();
  const config = require('./config'); // validate AFTER loading
  require('./server').start(config);
})();
:::

::: code bash Create parameters (AWS CLI)
aws ssm put-parameter --name /shop/prod/MONGO_URI --type SecureString --value "mongodb+srv://user:pass@cluster/shop"
aws ssm put-parameter --name /shop/prod/JWT_SECRET --type SecureString --value "$(openssl rand -hex 32)"
aws ssm get-parameters-by-path --path /shop/prod/ --with-decryption
:::

::: ask
- *"Do secrets need automatic rotation?"* → Secrets Manager. *"How many environments?"* *"Who can read prod secrets?"* → IAM policies.
:::

::: links
The Twelve-Factor App: Config | https://12factor.net/config
SSM Parameter Store | https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html
AWS Secrets Manager | https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html
:::

=== How do you deploy with Docker on EC2?
@p 3
@tags docker, ec2, containers
@quick
- **Dockerfile** (multi-stage, `node:22-alpine`, `npm ci --omit=dev`, non-root `USER node`, `HEALTHCHECK`) → image.
- CI builds & pushes the image to **ECR** (tagged with git SHA) → EC2 pulls & runs (`docker compose up -d`), or **ECS** runs it for you.
- Containers = same environment everywhere ("works on my machine" solved), easy rollback (previous tag), isolation.
- Nginx/ALB in front; `restart: unless-stopped`; logs → CloudWatch (awslogs driver).
- Secrets via env at runtime (never baked into the image).

::: text
### Why Docker?
- **Reproducible** builds: the same image runs locally, in CI and in prod.
- **Immutable deploys**: deploy = run a new image tag; rollback = run the previous tag.
- Bundles OS libs and the Node version, so there's no "which Node is on the server?".
- Stepping stone to **ECS/Fargate/Kubernetes**.

### Flow
GitHub → CI (test) → `docker build` → push to **Amazon ECR** (`shop-api:<git-sha>`) → EC2 (with an IAM role allowing ECR pull) runs `docker pull` + `docker compose up -d` (via SSH, SSM Run Command or a CD tool) → Nginx/ALB routes traffic → health check.

### Dockerfile best practices
Multi-stage builds, a small base (alpine/distroless), `npm ci` with the lockfile, copy `package*.json` first (layer cache), `.dockerignore`, **non-root user**, `NODE_ENV=production`, `HEALTHCHECK`, one process per container.
:::

::: diagram
flowchart LR
  GH["GitHub push"] --> CI["GitHub Actions: test + docker build"]
  CI --> ECR[("Amazon ECR: shop-api:sha")]
  CI -->|"SSM / SSH deploy"| HOST["EC2 host with Docker"]
  ECR -->|"docker pull"| HOST
  subgraph DOCKER["containers on EC2"]
    NGX["nginx container :80/:443"] --> API["api container :5000"]
  end
  HOST --> NGX
  API --> DB[("MongoDB Atlas")]
:::

::: code docker Dockerfile (production, multi-stage)
# ---- deps + build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build --if-present && npm prune --omit=dev

# ---- runtime ----
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/src ./src
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:5000/health || exit 1
CMD ["node", "src/server.js"]
:::

::: code yaml docker-compose.prod.yml on the EC2 host
services:
  api:
    image: 123456789012.dkr.ecr.ap-south-1.amazonaws.com/shop-api:${TAG}
    restart: unless-stopped
    env_file: /etc/shop/api.env          # chmod 600, or inject from SSM before start
    expose: ["5000"]
    logging:
      driver: awslogs
      options: { awslogs-region: ap-south-1, awslogs-group: /shop/api }
  nginx:
    image: nginx:1.27-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on: [api]
:::

::: code bash Deploy commands
# build & push (CI)
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-south-1.amazonaws.com
docker build -t shop-api:$GITHUB_SHA .
docker tag shop-api:$GITHUB_SHA 123456789012.dkr.ecr.ap-south-1.amazonaws.com/shop-api:$GITHUB_SHA
docker push 123456789012.dkr.ecr.ap-south-1.amazonaws.com/shop-api:$GITHUB_SHA

# on EC2
TAG=$GITHUB_SHA docker compose -f docker-compose.prod.yml pull
TAG=$GITHUB_SHA docker compose -f docker-compose.prod.yml up -d
docker image prune -f
# rollback = run again with the previous TAG
:::

::: ask
- *"Why not ECS/Fargate?"* For multiple instances and autoscaling, ECS is the natural next step, because it handles scheduling, health checks, rolling deploys and ALB integration.
:::

::: links
Docker: Node.js best practices | https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
Amazon ECR | https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html
:::

=== Explain a basic CI/CD pipeline for deploying your app
@p 3
@tags ci-cd, github-actions, deployment
@quick
- **CI** (every push/PR): install → lint → type-check → unit + integration tests → build → security scan.
- **CD** (merge to main): build Docker image → push to ECR (tag = git SHA) → deploy (EC2 via SSM/SSH, or ECS update-service) → smoke test/health check → notify.
- Frontend: `npm run build` → upload `dist/` to **S3** → **CloudFront invalidation**.
- Use **OIDC** (GitHub → AWS role) instead of long-lived AWS keys in GitHub secrets.
- Strategies: rolling, **blue/green**, canary; keep the previous version for **rollback**.

::: text
### Pipeline stages
**GitHub** push → **CI**: checkout, `npm ci`, lint, test (Jest + Supertest + mongodb-memory-server), build → **Docker** build → push to **ECR** → **Deploy** to EC2/ECS → **Nginx/ALB** health check → **Node.js** new version live.

Frontend: **React** → `npm run build` → **static files** → **S3** (+ CloudFront) or EC2 Nginx.

### Environments
`feature branch → PR (CI only) → main → staging (auto deploy) → production (manual approval / tag)`.

### Deployment strategies
| Strategy | How | Pros / cons |
|---|---|---|
| Recreate | Stop old, start new | Simple; downtime |
| **Rolling** | Replace instances gradually | No downtime; mixed versions briefly |
| **Blue/green** | Deploy a full new env, switch traffic (ALB) | Instant rollback; double cost during the switch |
| **Canary** | Send 5% of traffic to the new version, then increase | Safest; needs good metrics |
:::

::: diagram
flowchart LR
  P["git push / PR"] --> CI["CI: lint, test, build"]
  CI -->|"merge to main"| IMG["docker build + push ECR :sha"]
  IMG --> STG["Deploy staging"] --> SMK["Smoke tests"] --> APR{"Manual approval"}
  APR --> PRD["Deploy production: rolling / blue-green"] --> HC["Health checks + alarms"]
  HC -->|"fail"| RB["Rollback to previous sha"]
  CI --> FE["React build → S3 → CloudFront invalidation"]
:::

::: code yaml .github/workflows/deploy.yml
name: CI-CD
on:
  push: { branches: [main] }
  pull_request:

permissions:
  id-token: write   # OIDC to AWS (no long-lived keys)
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --coverage

  deploy-api:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-deploy
          aws-region: ap-south-1
      - uses: aws-actions/amazon-ecr-login@v2
        id: ecr
      - name: Build & push image
        run: |
          IMAGE=${{ steps.ecr.outputs.registry }}/shop-api:${{ github.sha }}
          docker build -t $IMAGE ./api
          docker push $IMAGE
      - name: Deploy to EC2 via SSM Run Command
        run: |
          aws ssm send-command --document-name AWS-RunShellScript \
            --targets Key=tag:App,Values=shop-api \
            --parameters commands="cd /opt/shop && TAG=${{ github.sha }} docker compose pull && TAG=${{ github.sha }} docker compose up -d"

  deploy-web:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: cd web && npm ci && npm run build
        env: { VITE_API_URL: https://api.example.com/api/v1 }
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: arn:aws:iam::123456789012:role/github-deploy, aws-region: ap-south-1 }
      - run: aws s3 sync web/dist s3://shop-web-prod --delete
      - run: aws cloudfront create-invalidation --distribution-id E123ABC --paths "/index.html"
:::

::: ask
- *"Which environments exist and who approves prod deploys?"* *"Do we need DB migrations in the pipeline?"* (Run them before switching traffic, and keep them backward compatible.)
- Be ready to explain **how you deployed your own project**: interviewers often ask for your real story.
:::

::: links
GitHub Actions docs | https://docs.github.com/en/actions
Configure AWS credentials with OIDC | https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
:::

=== How do you deploy the React frontend? (S3 + CloudFront vs EC2)
@p 2
@tags react, s3, cloudfront, static-hosting
@quick
- `npm run build` → static files (`index.html` + hashed JS/CSS) → host anywhere static.
- **S3 + CloudFront** ✅: cheap, global CDN, HTTPS via ACM, no servers; use **OAC** (private bucket).
- SPA routing: CloudFront custom error 403/404 → `/index.html` (200).
- Caching: hashed assets `Cache-Control: max-age=31536000, immutable`; `index.html` `no-cache`; invalidate `/index.html` on deploy.
- Alternative: Nginx on the same EC2 as the API (simple, same origin → no CORS).

::: text
A React (Vite) build produces **static files**, so there's no Node server needed to serve them.

| Option | Pros | Cons |
|---|---|---|
| **S3 + CloudFront** ✅ | CDN edge caching worldwide, scales infinitely, very cheap, HTTPS | CORS config if the API is on another domain (or route `/api/*` through CloudFront to the ALB) |
| Nginx on EC2 | Simple, same origin as the API | Single server, no CDN, you patch the server |
| Amplify Hosting / Vercel / Netlify | Easiest CI/CD + previews | Less control, vendor-specific |

### Key settings for S3 + CloudFront
- The bucket is **private**; CloudFront accesses it via **Origin Access Control (OAC)**.
- **Default root object**: `index.html`.
- **SPA fallback**: custom error responses 403/404 → `/index.html` with status 200 (so React Router handles `/orders/42`).
- **Cache policy**: long cache for `/assets/*` (filenames contain a content hash), short/no cache for `index.html`.
- **Env vars** are baked in at build time (`VITE_API_URL`), so build per environment.
:::

::: code bash Build & deploy commands
npm run build                                    # → dist/
aws s3 sync dist/ s3://shop-web-prod --delete \
  --exclude index.html --cache-control "public,max-age=31536000,immutable"
aws s3 cp dist/index.html s3://shop-web-prod/index.html --cache-control "no-cache"
aws cloudfront create-invalidation --distribution-id E123ABC --paths "/index.html"
:::

::: ask
- *"Is SEO important?"* A client-rendered SPA may need SSR/SSG (Next.js) for SEO-heavy pages.
- *"Same domain for API?"* CloudFront can route `/api/*` to the ALB, which gives one domain and no CORS.
:::

::: links
Host a static website on S3 + CloudFront | https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/getting-started-secure-static-website-cloudformation-template.html
Vite: deploying a static site | https://vite.dev/guide/static-deploy
:::

=== How do you expose ports 80/443? (and what is SSH?)
@p 2
@tags ports, ssh, networking
@quick
- Security group inbound: **80 & 443 from 0.0.0.0/0** (and ::/0), **22 only from your IP** (or no SSH at all → **SSM Session Manager**).
- Node listens on **5000 (localhost)**; **Nginx** listens on 80/443 and proxies. Ports < 1024 need root, which is another reason not to run Node on 80.
- 443 needs a **TLS certificate**: Let's Encrypt (Certbot) on Nginx or **ACM** on an ALB/CloudFront. Redirect 80 → 443.
- **SSH** = Secure Shell: encrypted remote terminal using **key pairs** (private `.pem` stays with you, public key on the server).
- Harden: key-only auth, no root login, restrict source IPs, or skip SSH entirely with SSM.

::: text
### Exposing a web app
1. **Security group** inbound rules: HTTP 80 and HTTPS 443 from anywhere; SSH 22 from `your.ip/32` only.
2. **Nginx** binds 80/443 (runs as root to bind, then workers drop privileges) and proxies to `127.0.0.1:5000`.
3. **HTTPS**: `certbot --nginx` (free, auto-renewing) or terminate TLS on an **ALB with an ACM certificate** (then the instance only accepts traffic **from the ALB's security group**).
4. Redirect all HTTP → HTTPS; add HSTS.

### SSH (Secure Shell)
An encrypted protocol for remote login and command execution (port 22).
- **Key pair**: AWS keeps the **public key** on the instance (`~/.ssh/authorized_keys`); you keep the **private key** (`.pem`, `chmod 400`).
- `ssh -i key.pem ubuntu@<public-ip>` · copy files: `scp -i key.pem file ubuntu@ip:/path`.
- **Better**: **AWS Systems Manager Session Manager**. No port 22 open, access controlled by IAM, and sessions are logged.
:::

::: diagram Port exposure
flowchart LR
  I(["Internet"]) -->|"443 / 80 allowed"| SG{"Security Group"}
  I -.->|"22 only from my IP"| SG
  SG --> NGX["Nginx :80 :443"]
  NGX -->|"127.0.0.1:5000, not public"| NODE["Node"]
  X(["Internet"]) -.->|"5000 blocked by SG"| NODE
:::

::: code bash SSH & firewall basics
chmod 400 mykey.pem
ssh -i mykey.pem ubuntu@13.233.10.20
scp -i mykey.pem .env ubuntu@13.233.10.20:/home/ubuntu/app/.env

# ~/.ssh/config for convenience
# Host shop-prod
#   HostName 13.233.10.20
#   User ubuntu
#   IdentityFile ~/.ssh/mykey.pem
ssh shop-prod

# Harden sshd
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

# SSM alternative (no SSH port at all)
aws ssm start-session --target i-0abc123def456
:::

::: ask
- *"Is there a load balancer?"* Then instances should accept 80/5000 **only from the ALB security group**, not the internet.
:::

::: links
EC2 security groups | https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html
Session Manager | https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html
:::

=== How do you monitor the server?
@p 2
@tags monitoring, cloudwatch, logging, observability
@quick
- **Metrics**: CPU, memory, disk, network (CloudWatch + **CloudWatch Agent** for memory/disk), request rate, latency p95/p99, error rate (5xx), event-loop lag.
- **Logs**: structured JSON (pino/winston) with requestId → CloudWatch Logs / ELK / Datadog; log rotation.
- **Alarms**: CloudWatch Alarms → SNS → email/Slack (CPU > 80%, 5xx spike, health check failing, disk > 85%).
- **Health checks**: `/health` (liveness) + `/ready` (DB reachable) used by ALB/uptime monitors.
- **APM/Tracing**: X-Ray / OpenTelemetry / Datadog / New Relic; errors → **Sentry**.

::: text
### The three pillars of observability
| Pillar | What | Tools |
|---|---|---|
| **Metrics** | Numbers over time: CPU, memory, req/s, latency, error %, DB connections, event-loop lag | CloudWatch, Prometheus + Grafana, Datadog |
| **Logs** | Discrete events with context (JSON, requestId, userId, duration) | CloudWatch Logs, ELK/OpenSearch, Loki |
| **Traces** | One request's journey across services with timings | AWS X-Ray, OpenTelemetry, Jaeger |

### What to alert on (golden signals)
**Latency**, **traffic**, **errors**, **saturation** (CPU/memory/disk/connections).

### On the instance
- `pm2 monit`, `htop`, `df -h`, `free -m`, `journalctl -u nginx`, `tail -f /var/log/nginx/error.log`.
- The CloudWatch Agent is needed for **memory & disk** metrics, because EC2 doesn't report them by default.
:::

::: code javascript Structured logging with pino + request id + health endpoints
const pino = require('pino');
const pinoHttp = require('pino-http');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { monitorEventLoopDelay } = require('perf_hooks');

const logger = pino({ level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] });

app.use(pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || crypto.randomUUID(),
  customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
}));

// liveness: process is up
app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// readiness: dependencies are OK (ALB target group health check can use this)
app.get('/ready', async (req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  res.status(dbOk ? 200 : 503).json({ db: dbOk ? 'up' : 'down' });
});

// event loop lag metric
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => {
  logger.info({ eventLoopLagMs: h.mean / 1e6, memMB: process.memoryUsage().rss / 1e6 }, 'runtime-metrics');
  h.reset();
}, 60_000).unref();
:::

::: code bash CloudWatch alarm for high CPU (AWS CLI)
aws cloudwatch put-metric-alarm \
  --alarm-name shop-api-high-cpu \
  --metric-name CPUUtilization --namespace AWS/EC2 \
  --dimensions Name=InstanceId,Value=i-0abc123def456 \
  --statistic Average --period 300 --evaluation-periods 2 \
  --threshold 80 --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:ap-south-1:123456789012:ops-alerts
:::

::: ask
- *"What are the SLOs (e.g. 99.9% availability, p95 < 300ms)?"* Alerts should map to them.
- *"Who's on call, and where do alerts go (Slack/PagerDuty)?"*
:::

::: links
CloudWatch agent | https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Install-CloudWatch-Agent.html
Google SRE: the four golden signals | https://sre.google/sre-book/monitoring-distributed-systems/
pino logger | https://getpino.io
:::
