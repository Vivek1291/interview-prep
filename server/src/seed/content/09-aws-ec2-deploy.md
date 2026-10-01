@section AWS EC2 & Deployment
@icon ☁️
@color #f97316
@desc Deploying the Full-Stack Integration project to EC2: Nginx + PM2 or Docker, ports 80/443, SSH, SSM secrets, CI/CD with GitHub Actions, S3 + CloudFront for React, monitoring. Every script was tested in Ubuntu/Amazon Linux containers or against an AWS mock (Moto).

=== How do you deploy a Node.js application to EC2? (explain the full request path)
@p 3
@tags ec2, deployment, nginx, pm2
@quick
- Path: **user → DNS (Route 53) → Elastic IP or ALB → Nginx :80/:443 (TLS) → Node/Express :4000 (PM2 cluster) → MongoDB Atlas, S3 (IAM role)**.
- Steps: launch EC2 (Ubuntu 24.04) with a **security group** (80/443 open, 22 only from your IP), **IAM role**, Elastic IP → install Node 22, Nginx, PM2 → get code → secrets from **SSM** into `.env` → `pm2 start` + `pm2 save` + `pm2 startup` → Nginx reverse proxy → **Certbot** HTTPS → DNS A record.
- Only Nginx is public; Node's port 4000 isn't opened in the security group.
- Tested: the setup script ran in an Ubuntu 24.04 container: Node 22.23, PM2 7.0.4, Nginx 1.24, Certbot 2.9, 11 PM2 workers online, `/api/health` through Nginx → 200.
- One instance is a single point of failure; production grows to **ALB + Auto Scaling across 2 AZs** or ECS.

::: text 🧒 In simple words
Deploying is like **opening a shop in a rented building**. EC2 is the building. Your shop's address (domain) points to the building's front door. At the door stands a **receptionist** (Nginx) who checks visitors' ID badges (HTTPS), hands out printed leaflets directly (the React files), and walks everyone else to the right back office (the Node API). In the back offices several **identical clerks** (PM2 workers) do the real work, and a **manager** (PM2) replaces any clerk who faints. The safe with the keys (secrets) is kept by the building owner (SSM), not taped under the counter.
:::

::: text 📖 Detailed answer
### The request path
1. Browser asks DNS for `app.example.com` → Route 53 answers with the instance's **Elastic IP** (or an ALB).
2. The **security group** allows 80/443 from the internet; everything else is blocked.
3. **Nginx** terminates TLS (Let's Encrypt), serves `web/dist` (the React build) and proxies `/api/*` to `127.0.0.1:4000` with `X-Forwarded-*` and `X-Request-Id`.
4. **PM2** runs the Express API in cluster mode (one worker per vCPU) and restarts crashed workers.
5. The API talks to **MongoDB Atlas** (connection string from SSM) and **S3** with the instance's **IAM role** (no access keys on the server).

### Steps (the script below does 3–9)
| # | Step | Detail |
|---|---|---|
| 1 | Launch EC2 | Ubuntu 24.04, `t3.small`, key pair or SSM only, security group, IAM role, Elastic IP |
| 2 | DNS | Route 53 A record → Elastic IP (needed before Certbot) |
| 3 | Packages | Nginx, git, Certbot; Node 22 from NodeSource; `npm i -g pm2@7` |
| 4 | Code | `git clone` → `npm install --omit=dev` (API), `npm run build` (web) |
| 5 | Secrets | `fetch-env.sh` writes SSM parameters to `api/.env` (`chmod 600`) |
| 6 | Run | `pm2 start ecosystem.config.cjs --env production`, `pm2 save`, `pm2 startup` |
| 7 | Proxy | Nginx site: static files + `/api` → `127.0.0.1:4000`, `nginx -t`, reload |
| 8 | HTTPS | `certbot --nginx -d app.example.com --redirect` (auto-renews) |
| 9 | Verify | `curl -f https://app.example.com/api/health` |

### What testing found
PM2 starts cluster workers from its own working directory, so `node_args: '--env-file=.env'` silently loaded nothing and all 11 workers crash-looped; the fix is an **absolute** path (`${__dirname}/.env`) in `ecosystem.config.cjs`.
:::

::: diagram Request path on a single EC2 instance
flowchart LR
  U(["Browser"]) -->|"app.example.com"| DNS["Route 53"]
  DNS --> EIP["Elastic IP"]
  subgraph EC2["EC2 instance, security group: 80, 443 open, 22 my IP"]
    NG["Nginx :80 :443, TLS, static React build"] -->|"/api → 127.0.0.1:4000"| PM["PM2 cluster: Express workers"]
  end
  EIP --> NG
  PM --> DB[("MongoDB Atlas")]
  PM --> S3[("S3 via IAM role")]
  PM -.->|"secrets at deploy"| SSM["SSM Parameter Store"]
:::

::: image A shop in a rented building: receptionist at the door, identical clerks in the back offices
/images/aws-ec2-deploy/request-path.svg
:::

::: text 🪜 Step by step
What the tested setup run did inside the Ubuntu 24.04 container (as user `ubuntu`):
1. `apt-get install nginx git curl certbot python3-certbot-nginx` and Node 22 from NodeSource; `npm i -g pm2@7`.
2. Installed API dependencies and built the React app (`web/dist` with hashed assets).
3. `fetch-env.sh` wrote 3 variables to `api/.env` with permissions `-rw-------`.
4. `pm2 start ecosystem.config.cjs --env production` → 11 workers `online` (one per CPU).
5. Installed the Nginx site, removed the default site, `nginx -t` → "test is successful", reload.
6. `curl localhost/api/health` → `{"status":"ok"}`; `/orders` → 200 (SPA fallback); `/assets/*.js` → `Cache-Control: public, max-age=31536000, immutable`.
7. On a real instance, Certbot then adds the 443 server block and the HTTP→HTTPS redirect.
:::

::: code bash fullstack-app/deploy/setup-ubuntu.sh
#!/usr/bin/env bash
# One-time setup of an Ubuntu 24.04 EC2 instance for the PM2 + Nginx path. Run as the ubuntu user:
#   ./setup-ubuntu.sh app.example.com you@example.com
# Needs: security group with 80/443 open, DNS A record → the Elastic IP, instance role with SSM read.
set -euo pipefail
DOMAIN=${1:?usage: setup-ubuntu.sh <domain> <email>}
EMAIL=${2:?usage: setup-ubuntu.sh <domain> <email>}
APP=/opt/fullstack-app

sudo apt-get update
sudo apt-get install -y nginx git curl ca-certificates certbot python3-certbot-nginx

# Node.js 22 LTS (NodeSource) and PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2@7

# Code: clone once, later deploys do git pull (or CI copies a build artifact)
sudo mkdir -p "$APP" && sudo chown "$USER:$USER" "$APP"
[ -d "$APP/.git" ] || git clone https://github.com/you/fullstack-app.git "$APP"
cd "$APP/api" && npm install --omit=dev --no-audit --no-fund
cd "$APP/web" && npm install --no-audit --no-fund && npm run build

# Secrets from SSM Parameter Store → api/.env (owner-only)
"$APP/deploy/fetch-env.sh" /fullstack-app/prod "$APP/api/.env"

# Run the API with PM2 and start it on boot
cp "$APP/deploy/ecosystem.config.cjs" "$APP/api/"
pm2 start "$APP/api/ecosystem.config.cjs" --env production
pm2 save
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME"

# Nginx reverse proxy, then HTTPS with Let's Encrypt (auto-renewing)
sed "s/app.example.com/$DOMAIN/" "$APP/deploy/nginx-site.conf" | sudo tee /etc/nginx/sites-available/fullstack-app >/dev/null
sudo ln -sf /etc/nginx/sites-available/fullstack-app /etc/nginx/sites-enabled/fullstack-app
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d "$DOMAIN" --redirect --agree-tos -m "$EMAIL" --non-interactive
curl -fsS "https://$DOMAIN/api/health" && echo " ✅ live"
:::
::: code nginx fullstack-app/deploy/nginx-site.conf
# /etc/nginx/sites-available/fullstack-app   (Certbot adds the 443 server block and the HTTP→HTTPS redirect)
server {
  listen 80;
  listen [::]:80;
  server_name app.example.com;

  root /opt/fullstack-app/web/dist;                   # React build
  client_max_body_size 1m;                            # uploads go to S3 directly, the API only gets JSON

  location /api/ {
    proxy_pass http://127.0.0.1:4000;                 # Node listens on localhost only
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;
    proxy_read_timeout 30s;
  }

  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }

  location / {
    add_header Cache-Control "no-cache";
    try_files $uri /index.html;                       # SPA fallback for React Router
  }

  gzip on;
  gzip_types application/javascript text/css application/json image/svg+xml;
}
:::
::: code javascript fullstack-app/deploy/ecosystem.config.cjs
// PM2 process file for the API (non-Docker path). Start: pm2 start ecosystem.config.cjs --env production
module.exports = {
  apps: [{
    name: 'api',
    script: 'src/server.js',
    cwd: __dirname,                                   // this file lives in api/
    // ABSOLUTE path: PM2 starts cluster workers from its own working directory, so ".env" alone isn't found
    node_args: `--env-file-if-exists=${__dirname}/.env`, // written by fetch-env.sh from SSM (chmod 600)
    instances: 'max',                                 // one worker per CPU core
    exec_mode: 'cluster',                             // workers share port 4000; enables zero-downtime reload
    max_memory_restart: '400M',                       // restart a worker that leaks memory
    kill_timeout: 10000,                              // time for graceful shutdown before SIGKILL
    listen_timeout: 8000,                             // a new worker must be listening within 8 s
    time: true,                                       // timestamps in log lines
    env_production: { NODE_ENV: 'production', PORT: 4000 },
  }],
};
:::

::: code javascript Browser demo: trace a request through the layers (runnable)
// Each layer either answers, forwards, or rejects, like the real deployment.
const securityGroup = { open: [80, 443], sshFrom: '203.0.113.10/32' };
function nginx(path) {
  if (path.startsWith('/api/')) return { by: 'nginx → node:4000', status: 200 };
  if (path.startsWith('/assets/')) return { by: 'nginx static (cached 1 year)', status: 200 };
  return { by: 'nginx static index.html (SPA fallback)', status: 200 };
}
function request({ port, path = '/' }) {
  if (!securityGroup.open.includes(port)) return { by: 'security group', status: 'dropped' };
  if (port === 80) return { by: 'nginx', status: 301, location: `https://app.example.com${path}` };
  return nginx(path);
}
const cases = [
  [{ port: 443, path: '/api/health' }, 'nginx → node:4000'],
  [{ port: 443, path: '/orders' }, 'nginx static index.html (SPA fallback)'],
  [{ port: 80, path: '/orders' }, 'nginx'],
  [{ port: 4000, path: '/api/health' }, 'security group'],
  [{ port: 27017 }, 'security group'],
];
for (const [req, expected] of cases) {
  const res = request(req);
  console.log(`:${req.port}${req.path ?? ''} → ${res.by} (${res.status})`, res.by === expected ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- Running `node server.js` in an SSH session (dies on logout or crash, never starts on reboot).
- Opening port 4000 (or 27017) to the internet instead of proxying through Nginx.
- Long-lived AWS access keys in `.env` on the server instead of an IAM role.
- Running Certbot before DNS points to the instance (validation fails).
- Relative paths in PM2 `node_args` (the env file isn't found in cluster mode).
- Treating one EC2 instance as "production-ready" without backups, monitoring or a plan for failure.
:::

::: understand
- EC2 gives you a Linux server; **you** own the OS, runtime, process management, proxy, TLS and patching.
- Nginx + PM2 is the classic single-server setup; containers + ALB/ECS is the scalable version of the same idea.
- Everything that matters should be in scripts (or AMIs/IaC) so a new instance can be built in minutes.
:::

::: ask
- *"Is one instance acceptable, or do we need high availability?"*
- *"Where does MongoDB run?"* (Atlas with VPC peering/PrivateLink or an IP allowlist)
- *"Manual deploys or CI/CD?"*
:::

::: important ⭐ Say this in the interview
"The request goes from the browser to DNS, to the instance's Elastic IP or a load balancer, through a security group that only opens 80 and 443, to Nginx. Nginx terminates TLS with a Let's Encrypt certificate, serves the React build and proxies /api to Node on port 4000, which runs under PM2 in cluster mode. The API reaches MongoDB Atlas and S3 using the instance's IAM role, and secrets come from SSM Parameter Store into a chmod 600 env file. I script the whole setup: packages, Node 22, PM2 with save and startup, the Nginx site, Certbot. I tested it in an Ubuntu container, and it caught one real bug: PM2 cluster workers need an absolute path to the env file. For production I'd move to an ALB with an Auto Scaling group across two AZs or ECS."
:::

::: links
AWS: Get started with Amazon EC2 | https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/EC2_GetStarted.html
PM2: Application declaration (ecosystem file) | https://pm2.keymetrics.io/docs/usage/application-declaration/
Certbot: Nginx on Ubuntu | https://certbot.eff.org/instructions?ws=nginx&os=snap
:::

=== What is EC2 and how does a Node application run on it?
@p 3
@tags ec2, basics
@quick
- **EC2** = virtual servers ("instances") you rent by the second; **IaaS**: AWS runs the hardware, **you** run the OS, Node, app, patches (shared responsibility).
- Building blocks: **AMI** (OS image), **instance type** (vCPU/RAM: `t3.small`, `m7g.large`), **EBS** (disk), **security group** (firewall), **key pair**/SSM (access), **Elastic IP**, **IAM role**, **user data** (first-boot script), region/AZ.
- Node is just a Linux process listening on a port; production needs a **process manager** (PM2/systemd/Docker), a **reverse proxy** or ALB, logs and monitoring.
- Pricing: On-Demand, Savings Plans/Reserved (1–3 years), **Spot** (up to ~90% cheaper, can be reclaimed); Graviton (`g`) types are cheaper per performance.
- Alternatives: **ECS/Fargate** (containers, no servers), **Lambda** (functions), Elastic Beanstalk, App Runner.

::: text 🧒 In simple words
EC2 is **renting a computer in Amazon's data centre**. You choose how big it is (CPU and memory), which operating system it starts with (the AMI), how big its disk is, and which doors are open (security group). Once it's running it's just a Linux computer: you install Node, copy your app and run it, like on your laptop. The difference is that it runs 24/7 with a public address, so you also need something to restart your app if it crashes and something to bring it back after a reboot.
:::

::: text 📖 Detailed answer
| Concept | What it is | In this project |
|---|---|---|
| **AMI** | Template disk image | Ubuntu 24.04 (PM2 path) or Amazon Linux 2023 (Docker path) |
| **Instance type** | vCPU + RAM family/size | `t3.small` (2 vCPU, 2 GiB, burstable) to start; `m7g` (Graviton) for steady load |
| **EBS volume** | Network disk; snapshots for backup | 20 GiB gp3 root volume |
| **Security group** | Stateful firewall per instance | 80 from the ALB SG, 22 from admin IP (see ports question) |
| **Key pair** | SSH public/private key | Optional when using **SSM Session Manager** |
| **Elastic IP** | Static public IPv4 | Needed for DNS when there's no load balancer |
| **IAM instance role** | Temporary AWS credentials for the app | ECR pull, SSM read, S3 access, CloudWatch logs |
| **User data** | Script run once at first boot | `user-data-al2023.sh`: Docker, Compose, first deploy |
| **Region / AZ** | Location; AZs are separate data centres | 2 AZs for availability |

### How Node runs on it
A process: `node src/server.js` binds port 4000. To be production-grade it needs:
- **Process manager**: PM2 (cluster, restarts, reload), systemd, or Docker `restart: unless-stopped`.
- **Front door**: Nginx (TLS, static files) or an ALB.
- **Config and secrets**: environment variables loaded from SSM.
- **Observability**: logs, metrics, alarms.

### Choosing compute
| Option | You manage | Good for |
|---|---|---|
| EC2 | OS, runtime, scaling | Full control, long-running processes, learning |
| ECS on Fargate | Container images | Most web APIs without server care |
| Lambda | Functions | Spiky, event-driven work, low traffic |
| Elastic Beanstalk / App Runner | Very little | Quick PaaS-style deploys |
:::

::: diagram What you get vs what you manage
flowchart TB
  subgraph AWS["AWS manages"]
    HW["hardware, network, hypervisor"]
  end
  subgraph YOU["You manage on EC2"]
    OS["OS + patches (AMI)"] --> RT["Node 22 + Nginx"] --> PMGR["PM2 / Docker"] --> APP["your app"]
  end
  HW --> OS
  ROLE["IAM role"] -.->|"temporary credentials"| APP
  SG["security group"] -.->|"allowed ports"| RT
:::

::: image Renting a computer: you pick size, OS, disk and open doors, then run Node like on a laptop
/images/aws-ec2-deploy/ec2-basics.svg
:::

::: text 🪜 Step by step
What happens when an Amazon Linux 2023 instance with the user-data script boots (the Docker path):
1. EC2 copies the AMI onto a new EBS volume and starts the virtual machine.
2. cloud-init runs the user data as root: installs Docker, enables it, adds `ec2-user` to the `docker` group.
3. It downloads the Docker Compose plugin and **verifies its SHA-256** before making it executable.
4. It copies `deploy.sh`, `fetch-env.sh` and `docker-compose.prod.yml` from an S3 bucket using the instance role.
5. It reads the current release tag from SSM and runs `deploy.sh <tag>`: pull images from ECR, start, health-check.
6. Output goes to `/var/log/cloud-init-output.log` (first place to look when an instance "doesn't work").
Tested in an `amazonlinux:2023` container: Docker 25.0.14, Compose v5.5.1 (checksum OK), `ec2-user` in the docker group.
:::

::: code bash fullstack-app/deploy/user-data-al2023.sh
#!/bin/bash
# EC2 user data for Amazon Linux 2023 (Docker path). Runs once, as root, at first boot.
# Output: /var/log/cloud-init-output.log. The instance role needs: ECR pull, SSM read, S3 read of the deploy bucket.
set -euxo pipefail

dnf install -y docker
systemctl enable --now docker
usermod -aG docker ec2-user

# Docker Compose v2+ CLI plugin (not packaged for AL2023): download and verify the checksum
COMPOSE_VERSION=v5.5.1
ARCH=$(uname -m)                                   # x86_64 or aarch64 (Graviton)
BIN=/usr/local/lib/docker/cli-plugins/docker-compose
mkdir -p "$(dirname "$BIN")"
curl -fsSL -o "$BIN" "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${ARCH}"
echo "$(curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${ARCH}.sha256" | cut -d' ' -f1)  $BIN" | sha256sum -c -
chmod +x "$BIN"

# Deploy files (deploy.sh, fetch-env.sh, docker-compose.prod.yml) are published to S3 by CI
mkdir -p /opt/fullstack-app
aws s3 cp s3://fullstack-app-deploy/ /opt/fullstack-app/ --recursive
chmod +x /opt/fullstack-app/*.sh

# First deploy: CI stores the current release tag in SSM
TAG=$(aws ssm get-parameter --name /fullstack-app/prod/RELEASE_TAG --query Parameter.Value --output text)
/opt/fullstack-app/deploy.sh "$TAG"
:::

::: code javascript Browser demo: size an instance for a Node API (runnable)
// Rough sizing: Node workers ≈ vCPUs; memory = workers × per-worker RSS + OS headroom.
const types = [
  { name: 't3.micro', vcpu: 2, gib: 1 },
  { name: 't3.small', vcpu: 2, gib: 2 },
  { name: 't3.medium', vcpu: 2, gib: 4 },
  { name: 'm7g.large', vcpu: 2, gib: 8 },
  { name: 'm7g.xlarge', vcpu: 4, gib: 16 },
];
function fits(type, { perWorkerMiB, osMiB = 600, nginxMiB = 50 }) {
  const workers = type.vcpu;                                  // PM2 instances: 'max'
  const needMiB = workers * perWorkerMiB + osMiB + nginxMiB;
  return { workers, needMiB, ok: needMiB <= type.gib * 1024 * 0.85 };   // keep 15% free
}
const app = { perWorkerMiB: 120 };                            // measured: ~60–120 MB RSS per API worker
const choice = types.find((t) => fits(t, app).ok);
console.log('smallest type that fits:', choice.name, JSON.stringify(fits(choice, app)));
console.log('t3.micro (1 GiB) is too small for 2 workers + OS', !fits(types[0], app).ok ? '✅' : '❌ FAIL');
console.log('t3.small fits 2 workers', choice.name === 't3.small' ? '✅' : '❌ FAIL');
console.log('a 4 vCPU box runs 4 workers', fits(types[4], app).workers === 4 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Treating EC2 as managed: nobody patches the OS or restarts your app unless you set it up.
- Storing data only on the instance (uploads, sessions, a self-hosted DB without backups); instances can be replaced.
- Using burstable `t` types for constant heavy load (CPU credits run out → throttling).
- Putting AWS access keys on the instance instead of attaching an IAM role.
- Not reading `/var/log/cloud-init-output.log` when user data fails.
:::

::: understand
- EC2 = **control + responsibility**. You choose everything, so you must also operate everything.
- Treat instances as **cattle, not pets**: reproducible from scripts/AMIs, data elsewhere (Atlas, S3).
- Higher-level services (ECS/Fargate, Lambda) trade control for less operational work.
:::

::: ask
- *"Why EC2 rather than ECS/Fargate or Lambda for this workload?"*
- *"x86 or Graviton (ARM)?"* (cheaper, but images must be built for arm64)
- *"What's the expected load and memory per worker?"*
:::

::: important ⭐ Say this in the interview
"EC2 is infrastructure as a service: virtual machines where AWS runs the hardware and I run the operating system, Node and the app. I pick an AMI, an instance type for CPU and memory, an EBS disk, a security group as the firewall, an IAM role so the app gets temporary credentials without access keys, and user data to bootstrap at first boot. Node is just a Linux process on a port, so in production I add a process manager like PM2 or Docker, Nginx or an ALB in front, secrets from SSM, and monitoring. I keep instances disposable: data in Atlas and S3, setup in scripts. When I don't need that control, ECS on Fargate or Lambda remove the server management."
:::

::: links
AWS: What is Amazon EC2? | https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/concepts.html
AWS: EC2 instance types | https://aws.amazon.com/ec2/instance-types/
AWS: Run commands at launch with user data | https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html
:::

=== PM2 vs running Node directly? How do you restart the application?
@p 3
@tags pm2, process-manager, zero-downtime
@quick
- `node server.js` alone: dies on crash, logout or reboot; one CPU core; no log files.
- **PM2**: auto-restart, **cluster mode** (one worker per core sharing a port), **zero-downtime `pm2 reload`**, `pm2 startup` + `pm2 save` for boot, logs, `pm2 monit`, `max_memory_restart`.
- Measured under load (Node 22, PM2 7): `pm2 restart` → **10,532 failed requests**; `pm2 reload` → **0 failed**.
- Measured crash (`kill -9`): 1 worker → 12,571 failed requests until PM2 restarted it **1.7 s** later; 2 workers → **0 failed**.
- Cluster throughput: **4,744 → 7,550 → 10,185 req/s** with 1 → 2 → 4 workers. In containers use one process per container and let Docker/ECS restart it.

::: text 🧒 In simple words
Running `node server.js` by hand is like a shop with **one cashier and no manager**: if the cashier faints, the shop is closed until you notice. PM2 is the **manager**: it hires several cashiers (one per checkout lane = CPU core), replaces anyone who faints within a second or two, and when you change the uniform (deploy), it swaps cashiers **one at a time** so a lane is always open (reload). A "restart" sends everyone home at once and reopens: customers at the counters get turned away.
:::

::: text 📖 Detailed answer
| | `node server.js` | PM2 |
|---|---|---|
| Crash recovery | ❌ stays down | ✅ restarts (with backoff, gives up after repeated instant crashes) |
| Survives logout/reboot | ❌ | ✅ `pm2 startup` + `pm2 save` (systemd unit) |
| Multi-core | ❌ one process | ✅ `instances: 'max'`, cluster mode shares the port |
| Deploy without downtime | ❌ | ✅ `pm2 reload` (rolling, one worker at a time) |
| Logs | stdout | ✅ per-worker files, `pm2 logs`, `pm2-logrotate` |
| Memory leak guard | ❌ | ✅ `max_memory_restart` |

### Measured (PM2 7.0.4, Node 22, the Full-Stack API in a container, autocannon 20 connections)
| Operation during load | Requests | Failed |
|---|---|---|
| `pm2 restart api` (2 workers) | 18,961 | **10,532** |
| `pm2 reload api` (2 workers) | 52,647 | **0** |
| `kill -9` the only worker | 20,217 | 12,571 (back after 1.7 s) |
| `kill -9` one of 2 workers | 39,349 | **0** |

| Workers | Throughput (`/api/health`, 50 connections) |
|---|---|
| 1 | 4,744 req/s |
| 2 | 7,550 req/s |
| 4 | 10,185 req/s |

### Restart vs reload
- `pm2 restart`: kills all workers, then starts new ones → requests fail meanwhile.
- `pm2 reload`: starts a new worker, waits until it's **listening** (`listen_timeout`), then gracefully stops an old one (`kill_timeout`), one by one.
- Reload needs **graceful shutdown** in the app: on SIGINT/SIGTERM call `server.close()`, finish in-flight requests, close DB connections, exit (the project's `server.js` does this).

### In containers
Don't run PM2 inside a container: one Node process per container, `restart: unless-stopped` (Docker) or ECS/Kubernetes restarts and rolls containers; scale by running more containers.
:::

::: diagram pm2 reload: one worker at a time
sequenceDiagram
  participant PM as PM2
  participant W0 as old worker 0
  participant W1 as old worker 1
  participant N as new workers
  PM->>N: start new worker A
  N-->>PM: listening on :4000
  PM->>W0: SIGINT, graceful shutdown
  W0-->>PM: in-flight requests done, exit 0
  PM->>N: start new worker B
  N-->>PM: listening
  PM->>W1: SIGINT, graceful shutdown
  Note over PM,N: a worker is always accepting connections: 0 failed requests
:::

::: chart bar Measured: failed requests during a deploy under load (2 workers)
Command,Failed requests
pm2 restart,10532
pm2 reload,0
:::

::: image A manager swapping cashiers one lane at a time instead of closing the shop
/images/aws-ec2-deploy/pm2.svg
:::

::: text 🪜 Step by step
Everyday PM2 on the server:
1. `pm2 start ecosystem.config.cjs --env production` → workers start in cluster mode.
2. `pm2 status` / `pm2 monit` → see CPU, memory, restarts; `pm2 logs api --lines 100` → tail logs.
3. `pm2 save` → remember the process list; `pm2 startup systemd` → prints a `sudo` command that installs a boot service.
4. Deploy: `git pull && npm install --omit=dev && pm2 reload ecosystem.config.cjs --env production` (zero-downtime).
5. A worker leaks memory past 400 MB → PM2 restarts just that worker (`max_memory_restart`).
6. A worker crashes → PM2 starts a replacement; with ≥ 2 workers users don't notice.
:::

::: code javascript fullstack-app/api/src/server.js
const mongoose = require('mongoose');
const config = require('./config');
const { createApp } = require('./app');
const cache = require('./lib/cache');

async function main() {
  await mongoose.connect(config.mongoUri, { maxPoolSize: 20, serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.syncIndexes();                         // small app: sync on boot; big apps do it in a deploy step
  const server = createApp().listen(config.port, () => console.log(`API listening on :${config.port}`));

  // Graceful shutdown: stop accepting connections, finish in-flight requests, then close the DB.
  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => { await mongoose.disconnect(); await cache.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => { console.error(err); process.exit(1); });
:::

::: code bash Everyday PM2 commands
# start, inspect, logs
pm2 start ecosystem.config.cjs --env production
pm2 status
pm2 monit
pm2 logs api --lines 100

# deploy without downtime (cluster mode)
git pull && (cd api && npm install --omit=dev) && pm2 reload ecosystem.config.cjs --env production

# hard restart (drops requests) and cleanup
pm2 restart api
pm2 delete api

# survive reboots and rotate logs
pm2 save
pm2 startup systemd        # run the sudo command it prints
pm2 install pm2-logrotate
:::

::: code javascript Browser demo: restart vs reload with two workers (runnable)
// Simulate 1,000 requests arriving every millisecond while workers are replaced.
function simulate(mode, { workers = 2, bootMs = 300, requests = 1000, deployAt = 200 }) {
  let failed = 0;
  const up = Array(workers).fill(true);
  const events = [];
  if (mode === 'restart') for (let w = 0; w < workers; w++) events.push({ at: deployAt, w, up: false }, { at: deployAt + bootMs, w, up: true });
  else for (let w = 0; w < workers; w++) events.push({ at: deployAt + w * bootMs, w, up: true });   // new worker is ready BEFORE the old one stops
  for (let t = 0; t < requests; t++) {
    for (const e of events) if (e.at === t) up[e.w] = e.up;
    if (!up.some(Boolean)) failed++;
  }
  return failed;
}
const restart = simulate('restart', {});
const reload = simulate('reload', {});
console.log(`restart: ${restart} failed, reload: ${reload} failed`);
console.log('restart drops requests while all workers boot', restart === 300 ? '✅' : '❌ FAIL');
console.log('reload drops none', reload === 0 ? '✅' : '❌ FAIL');
console.log('one worker + crash also drops requests', simulate('restart', { workers: 1 }) > 0 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Using `pm2 restart` for deploys (drops traffic) instead of `pm2 reload` in cluster mode.
- No graceful shutdown in the app → reload still cuts in-flight requests.
- Forgetting `pm2 save` after changes → the old process list comes back after reboot.
- Running a single worker in production (any crash = downtime).
- PM2 inside Docker containers (two supervisors fighting; the orchestrator should own restarts).
:::

::: understand
- PM2 turns "a Node process" into "a service": supervised, multi-core, restartable without downtime.
- Zero-downtime is a contract between the process manager (start new, then stop old) and the app (graceful shutdown).
- The same idea in containers is a rolling deployment with health checks.
:::

::: ask
- *"Bare EC2, Docker or ECS?"* (decides PM2 vs container restarts)
- *"How many vCPUs?"* (number of workers)
- *"Does the app hold in-memory state?"* (cluster workers don't share memory → use Redis)
:::

::: important ⭐ Say this in the interview
"Running node directly gives no crash recovery, no restart on reboot and one CPU core. PM2 supervises the app: it restarts crashed workers, runs one worker per core in cluster mode sharing the port, starts on boot with pm2 startup and save, manages logs and restarts leaking workers. For deploys I use pm2 reload, which replaces workers one at a time, and the app shuts down gracefully on SIGINT. I measured it under load: restart dropped about ten thousand requests, reload dropped none, and killing one of two workers caused no failures while a single worker was down for 1.7 seconds. In containers I don't use PM2; Docker or ECS restart and roll the containers."
:::

::: links
PM2: Cluster mode | https://pm2.keymetrics.io/docs/usage/cluster-mode/
PM2: Graceful start and shutdown | https://pm2.keymetrics.io/docs/usage/signals-clean-restart/
PM2: Startup script | https://pm2.keymetrics.io/docs/usage/startup/
:::

=== How do you manage environment variables on EC2 / in production?
@p 3
@tags env, config, secrets, ssm
@quick
- 12-factor: config lives in the **environment**, not in code; read it in one module and **validate at startup** (fail fast, print names never values).
- Local: `.env` + committed `.env.example`; `.env` in `.gitignore`. Node 22 loads it natively: `node --env-file-if-exists=.env`.
- EC2: **SSM Parameter Store** (SecureString, KMS-encrypted) or **Secrets Manager** (rotation), read with the **instance IAM role**, never with access keys.
- Two tested ways: `fetch-env.sh` writes SSM values to a `chmod 600` env file (Docker/PM2 read it), or the app loads SSM at startup with the SDK (paging: max 10 per call).
- Frontend `VITE_*` variables are **public** (compiled into the JS bundle): never put secrets there.

::: text 🧒 In simple words
Your app's settings and secrets are like the **codes for a building's doors**. You don't write them on the wall (in the code) where every visitor and every copy of the plans (git history) would see them. Instead they're kept in a **locked key cabinet** (SSM Parameter Store), and only the building itself (the EC2 instance with its IAM role) is allowed to open it. When the app starts, it reads the codes, checks that every one is present and looks right, and refuses to open if something is missing, rather than failing later in front of a customer.
:::

::: text 📖 Detailed answer
### Options, worst → best
| Option | Notes |
|---|---|
| Hard-coded in source | ❌ Leaks via git; can't differ per environment |
| `.env` copied by hand to the server | OK for tiny setups; `chmod 600`; manual rotation; easy to lose |
| PM2 ecosystem `env` block | Convenient but the file now contains secrets |
| **SSM Parameter Store** (SecureString) | ✅ Free standard tier, KMS-encrypted, IAM-controlled, versioned |
| **Secrets Manager** | ✅ Automatic rotation (DB passwords), cross-account; paid per secret |
| ECS task definition `secrets` | ✅ ECS injects SSM/Secrets Manager values as env vars at start |

### Two tested patterns (against Moto, an AWS mock)
| Pattern | How | When |
|---|---|---|
| **File at deploy time** | `fetch-env.sh /fullstack-app/prod .env` → `KEY='value'` lines, `install -m 600` | Docker `env_file`, PM2 `--env-file`; values refreshed on each deploy |
| **Load at startup** | `GetParametersByPath` with paging → `process.env` → Zod validation | No files on disk; restart picks up new values |

Both were checked: Node's `--env-file` and Docker Compose's `env_file` read the generated file identically (including values with spaces); a value containing `'` is **refused** rather than written broken; 15 parameters were loaded across two SSM pages; a 3-character JWT secret stopped startup with `❌ JWT_ACCESS_SECRET: must be at least 32 characters`.

### IAM for the instance role (least privilege)
`ssm:GetParametersByPath` on `arn:aws:ssm:<region>:<acct>:parameter/fullstack-app/prod/*` plus `kms:Decrypt` for the key used by the SecureStrings. Nothing else needs AWS keys.

### Rules
- One `config` module; everything else imports it.
- Validate types and formats (URI, length, enums) at startup.
- Separate paths per environment: `/fullstack-app/dev/…`, `/fullstack-app/prod/…`.
- Never log values; redact secrets in error reports.
:::

::: diagram Where secrets live and how they reach the app
flowchart LR
  ADM["admin or IaC"] -->|"put-parameter SecureString"| SSM[("SSM Parameter Store, KMS-encrypted")]
  ROLE["EC2 instance role: ssm GetParametersByPath, kms Decrypt"] -.-> SSM
  SSM -->|"deploy: fetch-env.sh"| ENV[".env chmod 600"]
  ENV --> APP["API process"]
  SSM -->|"or: SDK at startup"| APP
  APP --> V{"Zod validation"}
  V -->|"missing or weak"| X["exit 1 with names only"]
  V -->|"ok"| RUN["start serving"]
:::

::: image A locked key cabinet that only the building can open
/images/aws-ec2-deploy/env-secrets.svg
:::

::: text 🪜 Step by step
First production deploy of secrets for the project:
1. `aws ssm put-parameter --name /fullstack-app/prod/MONGO_URI --type SecureString --value "mongodb+srv://…"` (and the JWT secrets from `openssl rand -hex 32`).
2. Attach a policy to the instance role allowing `ssm:GetParametersByPath` on `/fullstack-app/prod/*` and `kms:Decrypt`.
3. `deploy.sh` runs `fetch-env.sh /fullstack-app/prod .env` → `wrote 3 variables to .env`, permissions `-rw-------`.
4. Docker Compose (`env_file: .env`) or PM2 (`--env-file`) passes them to the API.
5. The API's config check runs before listening; a bad value exits with a clear message and the deploy's health check fails → rollback.
6. Rotating a secret = put a new version in SSM + redeploy/restart; nothing changes in git.
:::

::: code bash fullstack-app/deploy/fetch-env.sh
#!/usr/bin/env bash
# Writes every SSM parameter under a path to an env file (KEY='value'), readable only by its owner.
# Usage on the EC2 host: ./fetch-env.sh /fullstack-app/prod .env
# Needs: AWS CLI v2 and an instance IAM role allowed to ssm:GetParametersByPath + kms:Decrypt.
set -euo pipefail
PREFIX=${1:?usage: fetch-env.sh <ssm-path> <output-file>}
OUT=${2:?usage: fetch-env.sh <ssm-path> <output-file>}
TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT

aws ssm get-parameters-by-path --path "$PREFIX" --recursive --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text |
while IFS=$'\t' read -r name value; do
  key=${name##*/}                                  # /fullstack-app/prod/MONGO_URI → MONGO_URI
  case "$value" in *"'"*) echo "value of $key contains a single quote; refusing to write it" >&2; exit 1 ;; esac
  printf "%s='%s'\n" "$key" "$value"
done > "$TMP"

install -m 600 "$TMP" "$OUT"                       # atomic-ish replace with owner-only permissions
echo "wrote $(wc -l < "$OUT" | tr -d ' ') variables to $OUT"
:::
::: code javascript Load SSM at startup and validate config with Zod (node start.js)
// How to run (EC2 with an IAM role):  SSM_PATH=/fullstack-app/prod node start.js
// Locally without AWS:                 MONGO_URI=... JWT_ACCESS_SECRET=... node start.js
const { SSMClient, GetParametersByPathCommand } = require('@aws-sdk/client-ssm');
const { z } = require('zod');

// 1) Load secrets from SSM Parameter Store into process.env (credentials come from the instance role)
async function loadSsm(path) {
  const ssm = new SSMClient({});                                   // region from AWS_REGION / instance metadata
  let NextToken;
  let count = 0;
  do {
    const page = await ssm.send(new GetParametersByPathCommand({ Path: path, Recursive: true, WithDecryption: true, NextToken }));
    for (const p of page.Parameters ?? []) {
      const key = p.Name.slice(p.Name.lastIndexOf('/') + 1);       // /fullstack-app/prod/MONGO_URI → MONGO_URI
      process.env[key] ??= p.Value;                                // a real env var wins (handy for overrides)
      count += 1;
    }
    NextToken = page.NextToken;                                    // SSM returns at most 10 per page
  } while (NextToken);
  return count;
}

// 2) Validate everything once, at startup. Crash with a clear message instead of failing on the first request.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGO_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI'),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  CORS_ORIGINS: z.string().default('').transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
});

async function main() {
  if (process.env.SSM_PATH) console.log(`loaded ${await loadSsm(process.env.SSM_PATH)} parameters from ${process.env.SSM_PATH}`);
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) console.error(`❌ ${issue.path.join('.')}: ${issue.message}`);   // names only, never values
    process.exit(1);
  }
  const config = Object.freeze(parsed.data);
  console.log('config ok:', { ...config, MONGO_URI: '[set]', JWT_ACCESS_SECRET: '[set]', JWT_REFRESH_SECRET: '[set]' });
  // require('./src/server').start(config);
}
main().catch((err) => { console.error(err.message); process.exit(1); });
:::

::: code bash Create and read parameters (AWS CLI)
aws ssm put-parameter --name /fullstack-app/prod/MONGO_URI --type SecureString \
  --value "mongodb+srv://app:PASSWORD@cluster0.example.mongodb.net/fullstack_app"
aws ssm put-parameter --name /fullstack-app/prod/JWT_ACCESS_SECRET --type SecureString --value "$(openssl rand -hex 32)"
aws ssm put-parameter --name /fullstack-app/prod/JWT_REFRESH_SECRET --type SecureString --value "$(openssl rand -hex 32)"
aws ssm get-parameters-by-path --path /fullstack-app/prod --with-decryption --query 'Parameters[].Name'
# rotate: same name with --overwrite creates version 2; redeploy or restart to pick it up
aws ssm put-parameter --name /fullstack-app/prod/JWT_ACCESS_SECRET --type SecureString --value "$(openssl rand -hex 32)" --overwrite
:::

::: code javascript Browser demo: validate config and never print secret values (runnable)
function loadConfig(env) {
  const errors = [];
  const need = (name, check, message) => { if (!check(env[name])) errors.push(`${name}: ${message}`); return env[name]; };
  const config = {
    port: Number(env.PORT ?? 4000),
    mongoUri: need('MONGO_URI', (v) => /^mongodb(\+srv)?:\/\//.test(v ?? ''), 'must be a mongodb:// or mongodb+srv:// URI'),
    accessSecret: need('JWT_ACCESS_SECRET', (v) => (v ?? '').length >= 32, 'must be at least 32 characters'),
  };
  if (errors.length) return { ok: false, errors };
  return { ok: true, config, safeToLog: { ...config, mongoUri: '[set]', accessSecret: '[set]' } };
}
const bad = loadConfig({ MONGO_URI: 'localhost:27017', JWT_ACCESS_SECRET: 'abc' });
console.log(bad.errors.join(' | '));
console.log('both problems reported at once', bad.errors.length === 2 ? '✅' : '❌ FAIL');
console.log('error messages never contain the secret', !bad.errors.join(' ').includes('abc') ? '✅' : '❌ FAIL');
const good = loadConfig({ MONGO_URI: 'mongodb+srv://u:p@c.example.net/app', JWT_ACCESS_SECRET: 'x'.repeat(64) });
console.log('valid config loads', good.ok && good.config.port === 4000 ? '✅' : '❌ FAIL');
console.log('log-safe copy hides values', JSON.stringify(good.safeToLog).includes('[set]') && !JSON.stringify(good.safeToLog).includes('u:p@') ? '✅' : '❌ FAIL');
console.log('VITE_ variables are public: anything in the bundle can be read by users', '✅ (never put secrets there)');
:::

::: warning ⚠️ Common mistakes
- Committing `.env` (or secrets in `docker-compose.yml`, CI logs, Docker image layers).
- AWS access keys on the instance instead of an IAM role.
- Reading `process.env.X` all over the code with no validation (crashes later, at the worst time).
- Logging the whole config object or `process.env` on startup.
- Putting API keys in `VITE_*`/`REACT_APP_*` variables (they ship to every browser).
:::

::: understand
- Secrets management = **storage** (SSM/Secrets Manager), **access** (IAM role, least privilege), **delivery** (file or SDK), **validation** (fail fast), **rotation**.
- The instance role is what makes "no keys on servers" possible.
- Config is part of the deploy: a bad value should fail the health check and roll back, not reach users.
:::

::: ask
- *"Do secrets need automatic rotation?"* → Secrets Manager.
- *"Who may read production secrets?"* → IAM policies and audit with CloudTrail.
- *"How many environments, and are they separate accounts?"*
:::

::: important ⭐ Say this in the interview
"Configuration comes from the environment, never from code. Locally I use a git-ignored .env that Node 22 loads with --env-file. On EC2 secrets live in SSM Parameter Store as KMS-encrypted SecureStrings, or Secrets Manager when I need rotation, and the instance reads them with its IAM role, so there are no AWS keys on the server. Either a deploy script writes them to a chmod 600 env file that Docker or PM2 load, or the app fetches them with the SDK at startup, handling paging. Then one config module validates everything with Zod and exits with the names of bad variables, never the values. Frontend VITE variables are public, so they never hold secrets."
:::

::: links
The Twelve-Factor App: Config | https://12factor.net/config
AWS: Systems Manager Parameter Store | https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html
Node.js: --env-file | https://nodejs.org/api/cli.html#--env-fileconfig
:::

=== How do you deploy with Docker on EC2?
@p 3
@tags docker, ec2, containers
@quick
- Build small images (**multi-stage**, `node:22-alpine`, production deps only, **non-root** `USER node`, `HEALTHCHECK`) in CI → push to **ECR** tagged with the **git SHA**.
- The EC2 host only **pulls and runs**: `docker compose -f docker-compose.prod.yml up -d` with `env_file` from SSM, `restart: unless-stopped`, logs to **CloudWatch** (`awslogs`).
- Measured: naive `FROM node:22` + `COPY . .` + `npm install` → **1.76 GB**, runs as **root**; the project's Alpine image → **295 MB**, runs as `node`.
- `deploy.sh` pulls, starts, waits for `/api/health`, and **rolls back** to the last good tag on failure (tested: broken v2 → back to v1 automatically).
- Next step: **ECS on Fargate** does the pulling, health checks and rolling updates for you across instances.

::: text 🧒 In simple words
A Docker image is a **sealed lunchbox**: the food (your code), the cutlery (Node and libraries) and the recipe are packed together, so it tastes the same in the kitchen (your laptop), the test lab (CI) and the restaurant (EC2). The server doesn't cook anymore; it just opens lunchboxes. Each box has a label with the exact recipe version (the git SHA), so if today's box is bad, you open yesterday's box again. Smaller boxes are faster to deliver and have fewer places for bugs to hide.
:::

::: text 📖 Detailed answer
### Why containers
- **Same artefact everywhere**: what CI tested is what runs in production.
- **Immutable deploys**: deploy = run a new tag; rollback = run the previous tag.
- No "which Node version is on that server?"; the OS libraries ship with the image.
- The same images run on ECS/Fargate or Kubernetes later.

### Measured: image size (the Full-Stack API)
| Dockerfile | Size on disk | Compressed (pull) | User |
|---|---|---|---|
| `FROM node:22`, `COPY . .`, `npm install` (dev deps too) | 1.76 GB | 420 MB | root |
| Project Dockerfile: `node:22-alpine`, `npm install --omit=dev`, only `src/` + `shared/`, `USER node` | **295 MB** | **67 MB** | node |

### Dockerfile checklist
Small base (alpine/distroless), copy `package*.json` first for layer caching, `npm ci`/`--omit=dev`, `.dockerignore` (no `node_modules`, `.env`, `.git`), **non-root user**, `HEALTHCHECK`, one process per container, no secrets in the image (inject at runtime).

### Deploy flow on the host
1. CI: build → push `…/fullstack-app-api:<sha>` and `…/fullstack-app-web:<sha>` to ECR.
2. CI → SSM Run Command → `deploy.sh <sha>` on the instance.
3. `deploy.sh`: ECR login with the instance role → `fetch-env.sh` → `docker compose pull` → `up -d` → poll `http://localhost/api/health` for 60 s.
4. Healthy → record the tag in `.current-tag`, prune old images. Unhealthy → start the previous tag again and exit 1 (CI turns red).

### Tested with a local registry and Moto
`deploy.sh v1` → "✅ deployed v1"; `deploy.sh v2` (an image whose API exits immediately) → "❌ v2 failed its health check" → "↩️ rolled back to v1" → `/api/health` still 200.
:::

::: diagram Build once, run the same image everywhere
flowchart LR
  GH["git push main"] --> CI["CI: test, docker build"]
  CI --> ECR[("Amazon ECR: api and web :sha")]
  CI -->|"SSM Run Command"| HOST["EC2: deploy.sh sha"]
  ECR -->|"docker compose pull"| HOST
  subgraph HOST2["containers on the EC2 host"]
    WEB["web: Nginx :80"] --> API["api: Node :4000"]
    API --> R["redis"]
  end
  HOST --> WEB
  API --> DB[("MongoDB Atlas")]
  ALB["ALB with ACM certificate :443"] --> WEB
:::

::: chart bar Measured: API image size (MB on disk)
Dockerfile,MB
Naive node:22 + npm install,1760
Multi-stage alpine + omit=dev,295
:::

::: image Sealed lunchboxes labelled with the recipe version
/images/aws-ec2-deploy/docker.svg
:::

::: text 🪜 Step by step
What `deploy.sh <sha>` does on the instance (tested end to end with a local registry):
1. `aws ecr get-login-password | docker login` using the instance role (no stored credentials).
2. `fetch-env.sh /fullstack-app/prod .env` refreshes secrets.
3. `TAG=<sha> docker compose pull` downloads only the changed layers.
4. `docker compose up -d --remove-orphans` recreates the containers whose image changed.
5. Polls `http://localhost/api/health` (through the web container's Nginx to the API) up to 30 times.
6. Success → `.current-tag` = `<sha>`, `docker image prune -f`. Failure → `up -d` with the previous tag, health check again, exit 1.
:::

::: code docker fullstack-app/api/Dockerfile
# Build context: the repository root (so the shared/ folder can be copied too)
FROM node:22-alpine
WORKDIR /app/api
ENV NODE_ENV=production
COPY api/package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY shared /app/shared
COPY api/src ./src
COPY api/scripts ./scripts
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "src/server.js"]
:::
::: code yaml fullstack-app/deploy/docker-compose.prod.yml
# On the EC2 host: /opt/fullstack-app/docker-compose.prod.yml (images come from ECR, nothing is built here)
# MongoDB is Atlas (MONGO_URI in .env from SSM); uploads go to real S3 with the instance role (no keys).
services:
  api:
    image: ${REGISTRY}/fullstack-app-api:${TAG}
    env_file: .env                                   # written by fetch-env.sh, chmod 600
    environment:
      NODE_ENV: production
      REDIS_URL: redis://redis:6379
    restart: unless-stopped
    depends_on: [redis]
    logging:
      driver: awslogs                                # container logs → CloudWatch Logs
      options:
        awslogs-region: ap-south-1
        awslogs-group: /fullstack-app/api
        awslogs-create-group: "true"

  web:
    image: ${REGISTRY}/fullstack-app-web:${TAG}      # Nginx: React build + /api proxy
    ports: ["80:80"]                                 # only the ALB security group may reach port 80
    restart: unless-stopped
    depends_on: [api]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
:::
::: code bash fullstack-app/deploy/deploy.sh
#!/usr/bin/env bash
# Usage on the EC2 host: ./deploy.sh <image tag>   (CI runs it through SSM Run Command with the git SHA)
# Pulls the new images, starts them, waits for the health check, and rolls back to the last good tag if it fails.
set -euo pipefail
cd "$(dirname "$0")"
NEW_TAG=${1:?usage: deploy.sh <image tag>}
PREV_TAG=$(cat .current-tag 2>/dev/null || true)
export REGISTRY=${REGISTRY:-123456789012.dkr.ecr.ap-south-1.amazonaws.com}
export COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}

aws ecr get-login-password --region "${AWS_REGION:-ap-south-1}" | docker login --username AWS --password-stdin "$REGISTRY"
./fetch-env.sh "${SSM_PATH:-/fullstack-app/prod}" .env

start() { TAG=$1 docker compose up -d --remove-orphans; }
healthy() {
  for _ in $(seq 1 30); do
    curl -fsS http://localhost/api/health >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

TAG=$NEW_TAG docker compose pull
start "$NEW_TAG"
if healthy; then
  echo "$NEW_TAG" > .current-tag
  docker image prune -f >/dev/null
  echo "✅ deployed $NEW_TAG"
else
  echo "❌ $NEW_TAG failed its health check" >&2
  if [ -n "$PREV_TAG" ]; then start "$PREV_TAG" && healthy && echo "↩️ rolled back to $PREV_TAG" >&2; fi
  exit 1
fi
:::

::: code javascript Browser demo: deploy with automatic rollback (runnable)
// A tiny model of deploy.sh: start the new version, check health, roll back if needed.
function createHost() {
  let running = null, currentTag = null;
  const images = { v1: { healthy: true }, v2: { healthy: false }, v3: { healthy: true } };
  const start = (tag) => { running = tag; };
  const healthy = () => Boolean(images[running]?.healthy);
  function deploy(tag) {
    const previous = currentTag;
    start(tag);
    if (healthy()) { currentTag = tag; return `deployed ${tag}`; }
    if (previous) { start(previous); return `rolled back to ${previous}`; }
    return `failed ${tag}, nothing to roll back to`;
  }
  return { deploy, get running() { return running; } };
}
const host = createHost();
console.log(host.deploy('v1'), host.running === 'v1' ? '✅' : '❌ FAIL');
console.log(host.deploy('v2'), host.running === 'v1' ? '✅ (broken release never stays live)' : '❌ FAIL');
console.log(host.deploy('v3'), host.running === 'v3' ? '✅' : '❌ FAIL');
const fresh = createHost();
console.log(fresh.deploy('v2'), fresh.running === 'v2' ? '✅ (first deploy has no fallback: watch alarms)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Building images on the production server (slow, and what runs isn't what CI tested).
- `latest` tags in production (you can't tell what's running or roll back precisely).
- Secrets baked into images (`COPY .env`, `ENV JWT_SECRET=…`): anyone who can pull the image can read them.
- Running as root, no `.dockerignore`, dev dependencies in the runtime image.
- No health check after deploy, so a crashing release stays "deployed".
:::

::: understand
- Containers move "how to run the app" into a versioned, tested artefact.
- The host becomes simple and replaceable: Docker + Compose + a deploy script (or ECS).
- Rollback is just running the previous tag, which is why tags must be immutable (git SHA).
:::

::: ask
- *"One instance with Compose, or ECS/EKS?"*
- *"x86 or Graviton?"* (build multi-arch images with `docker buildx`)
- *"How are logs shipped?"* (`awslogs` driver or the CloudWatch agent)
:::

::: important ⭐ Say this in the interview
"CI builds small multi-stage images: Alpine Node 22, production dependencies only, a non-root user and a health check, and pushes them to ECR tagged with the git SHA. The EC2 host never builds; it pulls and runs them with a production Compose file, with secrets injected from SSM into an env file, restart unless-stopped and logs to CloudWatch. A deploy script pulls, starts, polls the health endpoint and rolls back to the previous tag if it fails; I tested that with a deliberately broken image and it rolled back automatically. The naive Dockerfile was 1.76 gigabytes and ran as root; the optimised one is 295 megabytes. The natural next step is ECS on Fargate, which does the rolling updates and health checks across instances."
:::

::: links
Docker: Multi-stage builds | https://docs.docker.com/build/building/multi-stage/
Node.js Docker best practices | https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
AWS: Amazon ECR | https://docs.aws.amazon.com/AmazonECR/latest/userguide/what-is-ecr.html
:::

=== Explain a basic CI/CD pipeline for deploying your app
@p 3
@tags ci-cd, github-actions, deployment
@quick
- **CI** on every PR: install → test (API integration tests against a MongoDB **service container**) → build the web app. Red = can't merge.
- **CD** on merge to `main`: build images → push to **ECR** tagged with the SHA → **manual approval** (GitHub environment) → deploy via **SSM Run Command** → smoke test.
- **OIDC**: GitHub gets short-lived AWS credentials by assuming a role; **no AWS keys stored in GitHub**.
- The workflow passes **actionlint** with current action versions (`checkout@v7`, `setup-node@v7`, `configure-aws-credentials@v6`).
- Strategies: rolling, blue/green, canary; always keep the previous version ready for **rollback** (`deploy.sh` does it automatically).

::: text 🧒 In simple words
CI/CD is a **factory line with quality checks**. Every time someone suggests a change, robots build it and run all the tests (CI); if anything fails, the change is stopped at the door. When a change is accepted, the robots pack it into a labelled box (image with the commit id), a manager presses "approve" for production, the box is delivered to the shop and the robots check the shop's front door still opens (smoke test). If it doesn't, the previous box goes back on the shelf.
:::

::: text 📖 Detailed answer
### Pipeline for the project
| Stage | Trigger | What happens |
|---|---|---|
| `test` | Every PR and push | `api`: `npm install`, `npm test` against `mongo:7` service; `web`: `npm run build` |
| `build` | Push to `main` after tests | OIDC → ECR login → build and push `fullstack-app-api:<sha>` and `fullstack-app-web:<sha>` |
| `deploy` | After `build`, **environment `production`** | Waits for required reviewers → SSM `send-command` runs `deploy.sh <sha>` on instances tagged `App=fullstack-app` → `curl --fail` smoke test |

### OIDC instead of access keys
`permissions: id-token: write` lets the job request a token from GitHub; `configure-aws-credentials` exchanges it for temporary credentials of `role/github-deploy`, whose trust policy only allows this repository and branch. Nothing long-lived to leak.

### SSM Run Command instead of SSH
No port 22, no SSH keys in CI; IAM decides who can run commands on which instances, and every command is logged.

### Deployment strategies
| Strategy | How | Trade-off |
|---|---|---|
| Recreate | Stop old, start new | Simple; downtime |
| **Rolling** | Replace instances/containers gradually (what `pm2 reload` and ECS do) | No downtime; two versions briefly |
| **Blue/green** | New environment, switch the ALB target group | Instant rollback; double capacity during switch |
| **Canary** | Small % of traffic first | Safest; needs good metrics and automation |

### Database migrations
Run them before switching traffic and keep them **backward compatible** (expand → deploy → contract), because old and new versions run side by side during rolling deploys.
:::

::: diagram From pull request to production
flowchart LR
  PR["pull request"] --> T["test job: API tests with mongo service, web build"]
  T -->|"merge to main"| B["build job: OIDC, ECR push :sha"]
  B --> A{"environment production: approval"}
  A --> D["deploy job: SSM send-command deploy.sh sha"]
  D --> S["smoke test /api/health"]
  S -->|"fails"| RB["deploy.sh already rolled back, job red"]
:::

::: image A factory line with quality checks, labelled boxes and a final door test
/images/aws-ec2-deploy/cicd.svg
:::

::: text 🪜 Step by step
What happens after `git push origin main`:
1. GitHub starts the `test` job: a `mongo:7` service container, Node 22, API tests (`node --test`), web build.
2. `build` assumes `role/github-deploy` through OIDC, logs in to ECR and pushes both images tagged with `${{ github.sha }}`.
3. `deploy` pauses until a reviewer approves the `production` environment.
4. `aws ssm send-command` runs `deploy.sh <sha>` on every instance tagged `App=fullstack-app`; `aws ssm wait command-executed` waits for it.
5. `curl --fail --retry 5 https://app.example.com/api/health` confirms the site is up.
6. If the health check in `deploy.sh` failed, the instance is already back on the previous tag and the job is red.
:::

::: code yaml fullstack-app/.github/workflows/deploy.yml
name: ci-cd

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write          # lets GitHub get short-lived AWS credentials via OIDC (no stored AWS keys)

env:
  AWS_REGION: ap-south-1
  REGISTRY: 123456789012.dkr.ecr.ap-south-1.amazonaws.com

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mongo:
        image: mongo:7
        ports: ["27017:27017"]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - name: API integration tests
        working-directory: api
        run: |
          npm install --no-audit --no-fund
          npm test
        env:
          MONGO_URI: mongodb://localhost:27017/fullstack_app_test
      - name: Web build
        working-directory: web
        run: |
          npm install --no-audit --no-fund
          npm run build

  build:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-deploy
          aws-region: ${{ env.AWS_REGION }}
      - uses: aws-actions/amazon-ecr-login@v2
      - name: Build and push images tagged with the commit SHA
        run: |
          for svc in api web; do
            docker build -f "$svc/Dockerfile" -t "$REGISTRY/fullstack-app-$svc:${{ github.sha }}" .
            docker push "$REGISTRY/fullstack-app-$svc:${{ github.sha }}"
          done

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production   # add required reviewers in GitHub → manual approval before this job runs
    steps:
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-deploy
          aws-region: ${{ env.AWS_REGION }}
      - name: Deploy on the EC2 host with SSM Run Command (no SSH keys in CI)
        run: |
          COMMAND_ID=$(aws ssm send-command \
            --document-name AWS-RunShellScript \
            --targets Key=tag:App,Values=fullstack-app \
            --parameters "commands=[\"cd /opt/fullstack-app && ./deploy.sh ${{ github.sha }}\"]" \
            --query Command.CommandId --output text)
          aws ssm wait command-executed --command-id "$COMMAND_ID" --instance-id "$(aws ec2 describe-instances \
            --filters Name=tag:App,Values=fullstack-app Name=instance-state-name,Values=running \
            --query 'Reservations[0].Instances[0].InstanceId' --output text)"
      - name: Smoke test
        run: curl --fail --retry 5 --retry-delay 3 https://app.example.com/api/health
:::

::: code javascript Browser demo: run the pipeline gates (runnable)
function pipeline({ testsPass, approved, healthAfterDeploy, branch }) {
  const log = [];
  log.push('test'); if (!testsPass) return { log, result: 'blocked: tests failed' };
  if (branch !== 'main') return { log, result: 'CI only (not main)' };
  log.push('build+push :sha');
  if (!approved) return { log, result: 'waiting for approval' };
  log.push('deploy');
  log.push(healthAfterDeploy ? 'smoke test ok' : 'smoke test failed → rolled back');
  return { log, result: healthAfterDeploy ? 'live' : 'rolled back' };
}
const cases = [
  [{ testsPass: false, approved: true, healthAfterDeploy: true, branch: 'main' }, 'blocked: tests failed'],
  [{ testsPass: true, approved: true, healthAfterDeploy: true, branch: 'feature/x' }, 'CI only (not main)'],
  [{ testsPass: true, approved: false, healthAfterDeploy: true, branch: 'main' }, 'waiting for approval'],
  [{ testsPass: true, approved: true, healthAfterDeploy: false, branch: 'main' }, 'rolled back'],
  [{ testsPass: true, approved: true, healthAfterDeploy: true, branch: 'main' }, 'live'],
];
for (const [input, expected] of cases) {
  const { log, result } = pipeline(input);
  console.log(`${log.join(' → ')} ⇒ ${result}`, result === expected ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- Long-lived `AWS_ACCESS_KEY_ID` secrets in GitHub instead of OIDC.
- Deploying from a laptop ("works on my machine", no audit trail).
- `latest` image tags; no smoke test; no rollback plan.
- Tests that need a real database skipped in CI (use a service container).
- Breaking database migrations during rolling deploys.
:::

::: understand
- CI protects the main branch; CD makes releases boring and repeatable.
- Identity (OIDC, IAM roles, SSM) replaces stored keys and SSH access.
- Every deploy should be traceable to a commit and reversible in one step.
:::

::: ask
- *"Which environments exist (dev, staging, prod) and who approves production?"*
- *"Do we deploy on every merge or on tags/releases?"*
- *"How are database migrations run?"*
:::

::: important ⭐ Say this in the interview
"On every pull request CI installs, runs the API integration tests against a MongoDB service container and builds the web app; failures block the merge. On merge to main the pipeline authenticates to AWS with OIDC, so there are no stored keys, builds the API and web images and pushes them to ECR tagged with the commit SHA. The deploy job waits for approval on the production environment, then uses SSM Run Command to run the deploy script on instances by tag, which pulls, starts, health-checks and rolls back automatically, and finally a smoke test hits the health endpoint. I validated the workflow with actionlint. For more safety I'd use rolling or blue/green deploys behind an ALB and keep migrations backward compatible."
:::

::: links
GitHub Actions: Configuring OpenID Connect in AWS | https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
GitHub: Deployment environments and required reviewers | https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment
AWS: Systems Manager Run Command | https://docs.aws.amazon.com/systems-manager/latest/userguide/run-command.html
actionlint | https://github.com/rhysd/actionlint
:::

=== How do you deploy the React frontend? (S3 + CloudFront vs EC2)
@p 2
@tags react, s3, cloudfront, static-hosting
@quick
- `npm run build` produces **static files**: `index.html` + hashed `assets/*.js|css`. No Node server is needed to serve them.
- **S3 (private) + CloudFront** with Origin Access Control: global CDN, HTTPS via ACM, almost no ops. Or Nginx on the same EC2 (simple, same origin as the API).
- Caching: `assets/*` → `max-age=31536000, immutable`; `index.html` → `no-cache` + a CloudFront invalidation of `/index.html` on deploy.
- Measured: first visit **113,690 bytes** (gzip); repeat visit → `index.html` **304 with 0 body bytes**, assets straight from the browser cache.
- SPA routes (`/orders/42`): CloudFront custom error 403/404 → `/index.html` (200), or `try_files … /index.html` in Nginx.

::: text 🧒 In simple words
A built React app is like a **printed brochure**: once printed, anyone can hand it out; you don't need the author standing there. S3 is the warehouse where the brochures are stored, and CloudFront is a **network of brochure stands** in every city, so people get a copy from the nearest stand. Each page of the brochure has a version number in its name, so stands can keep them forever; only the cover page (`index.html`) is checked for updates every time, and it points to the right pages.
:::

::: text 📖 Detailed answer
| Option | Pros | Cons |
|---|---|---|
| **S3 + CloudFront** | CDN edge caching, scales without servers, cheap, HTTPS (ACM), WAF | CloudFront setup; API on another origin unless CloudFront also routes `/api/*` |
| Nginx on the API's EC2 | Simple, same origin as `/api`, no CORS | Single server, no CDN, you patch it |
| Amplify Hosting / Vercel / Netlify | Easiest previews and CI | Less control, vendor-specific |

### S3 + CloudFront settings
- Bucket **private**; CloudFront reads it via **Origin Access Control** (bucket policy allows only that distribution).
- Default root object `index.html`; custom error responses 403 and 404 → `/index.html` with status 200 for client-side routes.
- Behaviours: `/assets/*` long TTL; default (index.html) short/no cache; optionally `/api/*` → ALB origin (one domain, no CORS).
- `VITE_*` variables are baked in at build time → one build per environment.

### The deploy script (tested against an S3/CloudFront mock)
1. Sync `assets/` with `Cache-Control: public, max-age=31536000, immutable`.
2. Sync the rest (`index.html`) with `no-cache`.
3. `--delete` old files **after** the new `index.html` is uploaded (users with the old page can still load old chunks until then).
4. Invalidate `/index.html` in CloudFront.
Result: `index.html → no-cache, text/html`; `assets/index-*.js → public, max-age=31536000, immutable, text/javascript`; an old asset from the previous build was removed; the invalidation returned an id.

### Measured: bytes per visit (the Full-Stack web build behind Nginx)
| Visit | Downloaded |
|---|---|
| First | 113,690 B (index 272 B + JS 112,952 B + CSS 466 B, gzip) |
| Repeat | `index.html` revalidation → **304, 0 body bytes**; JS/CSS from cache (immutable) |
:::

::: diagram S3 + CloudFront for the React build
flowchart LR
  U(["Browser"]) --> CF["CloudFront edge (HTTPS, ACM)"]
  CF -->|"/assets/*: cached 1 year"| S3[("S3 private bucket via OAC")]
  CF -->|"/index.html: revalidated"| S3
  CF -->|"/api/*"| ALB["ALB → API"]
  CF -->|"403/404 → /index.html"| SPA["React Router handles /orders/42"]
:::

::: chart bar Measured: bytes downloaded per visit (gzip)
Visit,Bytes
First visit,113690
Repeat visit,0
:::

::: image Printed brochures in a warehouse, handed out by stands in every city
/images/aws-ec2-deploy/frontend.svg
:::

::: text 🪜 Step by step
Releasing a new frontend version with `deploy-web.sh`:
1. CI runs `npm run build` with production `VITE_*` values → `dist/index.html` references `assets/index-BVNta6Bt.js`.
2. The new hashed files are uploaded first (old ones still exist, so open tabs keep working).
3. `index.html` is uploaded with `no-cache`.
4. Old files are deleted; CloudFront's cached `index.html` is invalidated.
5. Next page load: the browser revalidates `index.html` (304 if unchanged), sees new asset names, downloads only those.
:::

::: code bash fullstack-app/deploy/deploy-web.sh
#!/usr/bin/env bash
# Upload the React build to S3 with the right cache headers, then refresh index.html in CloudFront.
# Usage (CI, from the repo root after "npm run build" in web/): ./deploy/deploy-web.sh <bucket> <distribution-id>
set -euo pipefail
BUCKET=${1:?usage: deploy-web.sh <bucket> <distribution-id>}
DIST_ID=${2:?usage: deploy-web.sh <bucket> <distribution-id>}
cd web/dist

# 1) Hashed assets first: safe to cache for a year because every change gets a new file name
aws s3 sync assets "s3://$BUCKET/assets" --cache-control "public, max-age=31536000, immutable"
# 2) Then index.html (and other root files): browsers must revalidate it, so new deploys are picked up at once
aws s3 sync . "s3://$BUCKET" --exclude "assets/*" --cache-control "no-cache"
# 3) Remove files from older builds (after the new index.html no longer references them)
aws s3 sync . "s3://$BUCKET" --delete --size-only
# 4) CloudFront may still hold the old index.html at the edge
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/index.html" --query Invalidation.Id --output text
:::

::: code javascript Browser demo: which file gets which Cache-Control? (runnable)
function cacheControl(path) {
  if (/^assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css|woff2|svg|png)$/.test(path)) return 'public, max-age=31536000, immutable';
  if (path === 'index.html' || path.endsWith('.html')) return 'no-cache';
  return 'public, max-age=3600';
}
const cases = [
  ['index.html', 'no-cache'],
  ['assets/index-BVNta6Bt.js', 'public, max-age=31536000, immutable'],
  ['assets/index-CCD2Sjlv.css', 'public, max-age=31536000, immutable'],
  ['favicon.ico', 'public, max-age=3600'],
];
for (const [p, want] of cases) console.log(`${p} → ${cacheControl(p)}`, cacheControl(p) === want ? '✅' : '❌ FAIL');
const firstVisit = 272 + 112952 + 466, repeatVisit = 0;
console.log(`first visit ${firstVisit} B, repeat ${repeatVisit} B body`, firstVisit === 113690 ? '✅ (measured)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Long cache on `index.html` → users stuck on old JavaScript after a deploy.
- Deleting old assets before uploading the new `index.html` → "chunk failed to load" for open tabs.
- Public S3 bucket website instead of private bucket + OAC.
- Forgetting the SPA fallback → refreshing `/orders/42` returns 403/404.
- Secrets in `VITE_*` variables.
:::

::: understand
- Static frontends are best served from a CDN: fast, cheap, nothing to patch.
- Content-hashed file names make aggressive caching safe; `index.html` is the only file that must stay fresh.
- Routing `/api/*` through the same CloudFront distribution gives one origin and no CORS.
:::

::: ask
- *"Do we need SEO or server rendering?"* (SSR/SSG with Next.js or similar)
- *"Same domain for the API?"*
- *"Preview deployments per pull request?"*
:::

::: important ⭐ Say this in the interview
"A Vite build is static files, so I host it on a private S3 bucket behind CloudFront with Origin Access Control and an ACM certificate. Hashed assets get a one-year immutable cache, index.html gets no-cache, and CloudFront's custom error responses send unknown routes to index.html so React Router works. The deploy uploads new assets first, then index.html, deletes old files and invalidates index.html. In a measurement the first visit downloaded about 114 KB gzipped and a repeat visit only revalidated index.html with a 304. CloudFront can also route /api to the ALB, giving one domain with no CORS. For a single small server, Nginx on the same instance is fine too."
:::

::: links
AWS: Restrict access to an S3 origin (OAC) | https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
Vite: Deploying a static site | https://vite.dev/guide/static-deploy
MDN: Cache-Control | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control
:::

=== How do you expose ports 80/443? (and what is SSH?)
@p 2
@tags ports, ssh, networking
@quick
- **Security groups** are the instance firewall: with an ALB, the ALB SG allows **443/80 from anywhere**; the app SG allows **80 only from the ALB's SG**; SSH 22 only from your IP `/32`, or not at all.
- Node listens on 4000 and is **never** opened in a security group; Nginx (or the ALB) is the public entry. Ports below 1024 need root, another reason Node doesn't bind 80.
- HTTPS: **ACM certificate on the ALB/CloudFront** (free, auto-renewed) or **Let's Encrypt with Certbot** on Nginx; redirect 80 → 443, add HSTS.
- **SSH** = encrypted remote shell with **key pairs** (private key stays with you, `chmod 400`); harden: keys only, no root, `AllowUsers`.
- Better: **SSM Session Manager** → no port 22, IAM-controlled, every session logged.

::: text 🧒 In simple words
Ports are **numbered doors** on the server. Door 443 (HTTPS) and door 80 (HTTP, which only says "please use 443") face the street. Door 4000, where Node actually works, is an **inside door**: only the receptionist (Nginx or the load balancer) uses it. Door 22 (SSH) is the **staff entrance** with a key-card reader; it should only open for your own key card, from your own address, or be bricked up entirely and replaced by an escorted entrance that logs every visit (SSM Session Manager).
:::

::: text 📖 Detailed answer
### Two setups
| | Single instance (Nginx + Certbot) | ALB in front (recommended) |
|---|---|---|
| Public ports on the instance | 80, 443 | **none** (80 only from the ALB SG) |
| TLS certificate | Let's Encrypt on Nginx (renews via timer) | **ACM** on the ALB (free, auto-renew) |
| Instance can be replaced freely | Elastic IP moves with you | ✅ ALB keeps the DNS name |
| SSH | 22 from your IP | 22 from your IP, or none with SSM |

### Security group rules (tested with the AWS CLI against Moto)
| Group | Inbound |
|---|---|
| `fullstack-alb` | TCP 443 and 80 from `0.0.0.0/0` and `::/0` |
| `fullstack-app` | TCP 80 **from `fullstack-alb`** (a group reference, not an IP); TCP 22 from `203.0.113.10/32` |
Security groups are **stateful**: replies to allowed requests are allowed automatically; outbound is open by default.

### SSH in one minute
- AWS puts the key pair's **public** key in `~/.ssh/authorized_keys`; you keep the **private** key (`chmod 400 key.pem`).
- `ssh -i key.pem ubuntu@<ip>`; copy files with `scp`; a `~/.ssh/config` entry saves typing.
- Hardening drop-in (tested with `sshd -t`): `PasswordAuthentication no`, `PermitRootLogin no`, `MaxAuthTries 3`, `AllowUsers ubuntu`.
- **Session Manager**: `aws ssm start-session --target i-…` works with **no inbound ports at all**; access is an IAM permission and sessions can be logged to S3/CloudWatch.

### Defence in depth
Even with the security group closed, a single-host PM2 setup can also bind Node to localhost only (`app.listen(4000, '127.0.0.1')`); in containers it must listen on `0.0.0.0` inside the container network, and simply isn't published.
:::

::: diagram Which doors are open
flowchart LR
  I(["Internet"]) -->|"443, 80"| ALB["ALB (security group: 443/80 from anywhere)"]
  ALB -->|"80, allowed only from ALB SG"| EC2["EC2: Nginx/web container :80"]
  EC2 -->|"inside the host"| NODE["Node :4000 (never published)"]
  I -.->|"4000, 27017: dropped"| EC2
  ME(["your IP /32"]) -.->|"22 (or none with SSM)"| EC2
  SSM["SSM Session Manager (IAM)"] -.->|"no inbound port needed"| EC2
:::

::: image Numbered doors: street doors, an inside door and a staff entrance with a key-card reader
/images/aws-ec2-deploy/ports.svg
:::

::: text 🪜 Step by step
Opening the app to the internet with an ALB:
1. Create `fullstack-alb` SG: 443 and 80 from anywhere (IPv4 and IPv6).
2. Create `fullstack-app` SG: 80 **from the ALB SG**, 22 from your IP (or skip 22 and use Session Manager).
3. Request an ACM certificate for `app.example.com` (DNS validation in Route 53).
4. ALB listeners: 443 with the certificate → target group (instances on port 80, health check `/api/health`); 80 → redirect to 443.
5. Route 53 alias record `app.example.com` → the ALB.
6. Test: `curl -I http://app.example.com` → 301 to HTTPS; `curl https://app.example.com/api/health` → 200; `nc -z <instance-ip> 4000` → refused/timeout.
:::

::: code bash fullstack-app/deploy/security-groups.sh
#!/usr/bin/env bash
# Create the two security groups for "ALB in front of EC2" (run once, or better: Terraform/CDK).
# Usage: ./security-groups.sh <vpc-id> <your-public-ip>
set -euo pipefail
VPC=${1:?usage: security-groups.sh <vpc-id> <your-ip>}
MY_IP=${2:?usage: security-groups.sh <vpc-id> <your-ip>}

# 1) Load balancer: the only thing open to the internet (80 redirects to 443 on the ALB)
ALB_SG=$(aws ec2 create-security-group --group-name fullstack-alb --description "ALB: web traffic" --vpc-id "$VPC" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$ALB_SG" --ip-permissions \
  'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]' \
  'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}],Ipv6Ranges=[{CidrIpv6=::/0}]' >/dev/null

# 2) App instances: port 80 ONLY from the ALB's security group; SSH only from your IP (or none, with SSM)
APP_SG=$(aws ec2 create-security-group --group-name fullstack-app --description "EC2: app hosts" --vpc-id "$VPC" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$APP_SG" --ip-permissions \
  "IpProtocol=tcp,FromPort=80,ToPort=80,UserIdGroupPairs=[{GroupId=$ALB_SG}]" \
  "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MY_IP/32,Description=admin}]" >/dev/null

echo "ALB_SG=$ALB_SG APP_SG=$APP_SG"
:::
::: code text fullstack-app/deploy/99-hardening.conf
# /etc/ssh/sshd_config.d/99-hardening.conf
# Apply with: sudo sshd -t && sudo systemctl reload ssh
# Keys only, no root, few attempts, only the admin user.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 20
X11Forwarding no
AllowUsers ubuntu
:::

::: code bash SSH and Session Manager basics
chmod 400 ~/.ssh/fullstack.pem
ssh -i ~/.ssh/fullstack.pem ubuntu@203.0.113.50

# ~/.ssh/config, then just: ssh fullstack
# Host fullstack
#   HostName 203.0.113.50
#   User ubuntu
#   IdentityFile ~/.ssh/fullstack.pem

# apply the hardening drop-in safely (test before reloading!)
sudo cp 99-hardening.conf /etc/ssh/sshd_config.d/ && sudo sshd -t && sudo systemctl reload ssh

# no SSH at all: needs the SSM agent (preinstalled on Ubuntu/Amazon Linux AMIs) and the
# AmazonSSMManagedInstanceCore policy on the instance role
aws ssm start-session --target i-0abc123def4567890
:::

::: code javascript Browser demo: evaluate security group rules (runnable)
// Stateful firewall model: a request is allowed if any inbound rule matches port + source.
const ALB_SG = 'sg-alb', APP_SG = 'sg-app';
const rules = {
  [ALB_SG]: [{ port: 443, from: '0.0.0.0/0' }, { port: 80, from: '0.0.0.0/0' }],
  [APP_SG]: [{ port: 80, fromGroup: ALB_SG }, { port: 22, from: '203.0.113.10/32' }],
};
const ipMatches = (ip, cidr) => cidr === '0.0.0.0/0' || cidr === `${ip}/32`;
function allowed(targetSg, { port, ip, sourceSg }) {
  return rules[targetSg].some((r) => r.port === port && (r.fromGroup ? r.fromGroup === sourceSg : ipMatches(ip, r.from)));
}
const cases = [
  ['anyone → ALB:443', allowed(ALB_SG, { port: 443, ip: '198.51.100.7' }), true],
  ['anyone → instance:80 directly', allowed(APP_SG, { port: 80, ip: '198.51.100.7' }), false],
  ['ALB → instance:80', allowed(APP_SG, { port: 80, sourceSg: ALB_SG }), true],
  ['anyone → instance:4000', allowed(APP_SG, { port: 4000, ip: '198.51.100.7' }), false],
  ['admin IP → instance:22', allowed(APP_SG, { port: 22, ip: '203.0.113.10' }), true],
  ['other IP → instance:22', allowed(APP_SG, { port: 22, ip: '198.51.100.7' }), false],
];
for (const [label, got, want] of cases) console.log(`${label}: ${got ? 'allowed' : 'blocked'}`, got === want ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- SSH 22 open to `0.0.0.0/0` (constant brute-force attempts).
- Opening the app port (4000) or MongoDB (27017) to the internet.
- Instances accepting traffic from anywhere even though an ALB is in front (bypasses WAF and TLS).
- Running Node as root to bind port 80.
- Losing the only private key with no Session Manager fallback.
:::

::: understand
- Security groups reference **other security groups**, which is how "only the load balancer may talk to me" is expressed.
- TLS belongs at the edge (ALB/CloudFront/Nginx); the app speaks plain HTTP inside the private network.
- The best SSH is no SSH: SSM Session Manager gives audited, IAM-controlled access without an open port.
:::

::: ask
- *"Is there a load balancer, or is the instance public?"*
- *"Do we need SSH at all, or can we use Session Manager?"*
- *"IPv6?"* (add `::/0` rules)
:::

::: important ⭐ Say this in the interview
"Security groups are the instance firewall. With a load balancer, only the ALB's group is open to the internet on 443 and 80, the ALB terminates TLS with a free ACM certificate and redirects HTTP, and the instances only accept port 80 from the ALB's security group. Node's own port is never opened, and neither is the database. On a single server, Nginx listens on 80 and 443 with a Let's Encrypt certificate and proxies to Node. SSH is an encrypted shell with key pairs; I restrict 22 to my IP, disable passwords and root login, or better, skip SSH and use SSM Session Manager, which needs no inbound port and logs every session."
:::

::: links
AWS: Security group rules | https://docs.aws.amazon.com/vpc/latest/userguide/security-group-rules.html
AWS: Systems Manager Session Manager | https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html
AWS: Requesting a public certificate (ACM) | https://docs.aws.amazon.com/acm/latest/userguide/gs-acm-request-public.html
:::

=== How do you monitor the server?
@p 2
@tags monitoring, cloudwatch, logging, observability
@quick
- **Metrics**: CPU, memory and disk (the **CloudWatch agent** is needed for memory/disk), request rate, **p95/p99 latency**, **5xx rate**, Node **event-loop delay**.
- **Logs**: structured JSON (pino) with a **request id**, secrets redacted → CloudWatch Logs (awslogs driver or agent).
- **Alarms** → SNS → email/Slack/PagerDuty: CPU > 80%, 5xx > 10 in 5 min, p95 > 500 ms, disk > 85%, health check failing.
- **Health checks**: `/health` (liveness) and `/ready` (dependencies) for the ALB and uptime monitors; tracing with OpenTelemetry/X-Ray.
- Measured: one 300 ms CPU-bound request pushed event-loop delay from **~11 ms** (idle, sampling resolution) to **302 ms**, and a `/health` call made during it waited **283 ms**.

::: text 🧒 In simple words
Monitoring is the **dashboard and warning lights of a car**. Gauges show speed and fuel all the time (metrics). A trip log records what happened and when (logs), with a receipt number per trip (request id) so you can find one journey later. Warning lights switch on before the engine breaks (alarms), and someone gets a phone call. For Node there's a special gauge, **event-loop delay**: it shows when the single "driver" is stuck doing one heavy job and everyone else is waiting.
:::

::: text 📖 Detailed answer
### Three pillars
| Pillar | Examples | Tools |
|---|---|---|
| **Metrics** | CPU, memory, disk, req/s, latency percentiles, 5xx rate, event-loop delay | CloudWatch (+ agent), Prometheus/Grafana, Datadog |
| **Logs** | One JSON line per request: id, method, path, status, duration; errors with stack | pino → CloudWatch Logs / OpenSearch / Loki |
| **Traces** | One request across Nginx → API → MongoDB → S3 with timings | OpenTelemetry, AWS X-Ray |

### Golden signals → alarms (tested by creating them against the CloudWatch mock)
| Signal | Alarm |
|---|---|
| Latency | ALB `TargetResponseTime` **p95 > 0.5 s** for 15 min |
| Errors | ALB `HTTPCode_Target_5XX_Count` **> 10** in 5 min |
| Saturation | EC2 `CPUUtilization` **> 80%** for 10 min; `disk_used_percent` **> 85%** (agent) |
| Traffic | Sudden drops in `RequestCount` (often means the site is down for users) |
Alarm dimensions must match exactly what is published; the disk metric from the agent includes `fstype`, so the alarm does too.

### Node-specific
- **Event-loop delay** (`perf_hooks.monitorEventLoopDelay`): high values mean CPU-bound work is blocking every request.
- Memory (RSS/heap) trends reveal leaks before `max_memory_restart` kicks in.
- Liveness vs readiness: `/health` says the process answers; `/ready` says MongoDB is connected (returns 503 otherwise) so the load balancer stops sending traffic.

### Measured (the observability example below)
| Situation | Event-loop delay | Effect |
|---|---|---|
| Idle | ~11 ms (≈ the 10 ms sampling resolution) | – |
| One request doing 300 ms of synchronous CPU work | **302 ms max** | A `/health` call sent meanwhile took **283 ms** |
pino redacted the `Authorization` header (`"[Redacted]"`) and kept the caller's `x-request-id`.
:::

::: diagram From the instance to someone's phone
flowchart LR
  APP["API: pino JSON logs, /metrics, event-loop delay"] --> CWL["CloudWatch Logs"]
  AG["CloudWatch agent: memory, disk"] --> CWM["CloudWatch Metrics"]
  ALB["ALB: latency, 5xx, requests"] --> CWM
  EC2["EC2: CPU, network"] --> CWM
  CWM --> AL{"alarms"}
  AL -->|"breach"| SNS["SNS topic"] --> PH["email, Slack, PagerDuty"]
  ALB -->|"health check /api/health"| APP
:::

::: chart bar Measured: Node event-loop delay (ms)
Situation,Milliseconds
Idle,11.5
During one 300 ms CPU-bound request,302.3
:::

::: image A car dashboard: gauges, a trip log and warning lights that call someone
/images/aws-ec2-deploy/monitoring.svg
:::

::: text 🪜 Step by step
Setting up monitoring for the project:
1. The API logs JSON with pino; container logs go to CloudWatch via the `awslogs` driver (Docker path) or the agent tails PM2 log files (PM2 path).
2. Install the CloudWatch agent with `cloudwatch-agent.json` for memory and disk (EC2 doesn't publish those by itself).
3. The ALB health check uses `/api/health`; a readiness endpoint returns 503 when MongoDB is down.
4. `alarms.sh` creates CPU, 5xx, p95 latency and disk alarms that notify an SNS topic.
5. Subscribe email/Slack to the topic; test by stopping the API and watching the 5xx/health alarms fire.
6. When an alarm fires, use the request id from the user's error screen to find the exact log lines.
:::

::: code javascript Structured logs, health/readiness and event-loop delay (node observability.js)
// How to run: npm install express pino pino-http mongoose && MONGO_URI=mongodb://localhost:27017/app node observability.js
//   curl -s localhost:3000/ready ; curl -s localhost:3000/metrics ; curl -s "localhost:3000/slow?ms=300"
const crypto = require('node:crypto');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const express = require('express');
const mongoose = require('mongoose');
const pino = require('pino');
const pinoHttp = require('pino-http');

// JSON logs on stdout → CloudWatch Logs (awslogs driver / CloudWatch agent) can search and graph them
const logger = pino({ level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] });
const app = express();
app.use(pinoHttp({
  logger,
  genReqId: (req, res) => { const id = req.headers['x-request-id'] || crypto.randomUUID(); res.setHeader('X-Request-Id', id); return id; },
  customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  autoLogging: { ignore: (req) => req.url === '/health' },        // don't flood logs with load-balancer checks
}));

// Event-loop delay: the best single "is Node overloaded?" metric
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();
const snapshot = () => ({
  eventLoopP99Ms: Number((loop.percentile(99) / 1e6).toFixed(1)),
  eventLoopMaxMs: Number((loop.max / 1e6).toFixed(1)),
  rssMB: Math.round(process.memoryUsage().rss / 1048576),
  uptimeS: Math.round(process.uptime()),
});
setInterval(() => { logger.info({ metrics: snapshot() }, 'runtime-metrics'); loop.reset(); }, 60_000).unref();

app.get('/health', (req, res) => res.json({ status: 'ok' }));                         // liveness: the process answers
app.get('/ready', (req, res) => {                                                      // readiness: dependencies work
  const db = mongoose.connection.readyState === 1;
  res.status(db ? 200 : 503).json({ db: db ? 'up' : 'down' });
});
app.get('/metrics', (req, res) => res.json(snapshot()));
app.get('/slow', (req, res) => {                                                       // simulates CPU-heavy work
  const until = Date.now() + Math.min(Number(req.query.ms) || 200, 2000);
  while (Date.now() < until);
  res.json({ done: true });
});

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/app', { serverSelectionTimeoutMS: 3000 }).catch((err) => logger.error({ err }, 'db connect failed'));
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => logger.info({ port: PORT }, 'listening'));
}
main();
:::
::: code json fullstack-app/deploy/cloudwatch-agent.json
{
  "agent": { "metrics_collection_interval": 60, "run_as_user": "cwagent" },
  "metrics": {
    "namespace": "CWAgent",
    "append_dimensions": { "InstanceId": "${aws:InstanceId}" },
    "metrics_collected": {
      "mem": { "measurement": ["mem_used_percent"] },
      "disk": { "measurement": ["used_percent"], "resources": ["/"], "drop_device": true }
    }
  },
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          { "file_path": "/var/log/nginx/error.log", "log_group_name": "/fullstack-app/nginx-error", "log_stream_name": "{instance_id}" },
          { "file_path": "/home/ubuntu/.pm2/logs/api-out-*.log", "log_group_name": "/fullstack-app/api", "log_stream_name": "{instance_id}" }
        ]
      }
    }
  }
}
:::
::: code bash fullstack-app/deploy/alarms.sh
#!/usr/bin/env bash
# CloudWatch alarms → SNS topic (email/Slack/PagerDuty). Usage: ./alarms.sh <instance-id> <sns-topic-arn> <alb-arn-suffix>
set -euo pipefail
INSTANCE=${1:?instance id}; TOPIC=${2:?sns topic arn}; ALB=${3:?alb arn suffix, e.g. app/fullstack-alb/123abc}

# Saturation: CPU above 80% for 10 minutes
aws cloudwatch put-metric-alarm --alarm-name fullstack-high-cpu \
  --namespace AWS/EC2 --metric-name CPUUtilization --dimensions Name=InstanceId,Value="$INSTANCE" \
  --statistic Average --period 300 --evaluation-periods 2 --threshold 80 \
  --comparison-operator GreaterThanThreshold --alarm-actions "$TOPIC" --ok-actions "$TOPIC"

# Errors: more than 10 5xx responses from targets in 5 minutes
aws cloudwatch put-metric-alarm --alarm-name fullstack-5xx \
  --namespace AWS/ApplicationELB --metric-name HTTPCode_Target_5XX_Count --dimensions Name=LoadBalancer,Value="$ALB" \
  --statistic Sum --period 300 --evaluation-periods 1 --threshold 10 \
  --comparison-operator GreaterThanThreshold --treat-missing-data notBreaching --alarm-actions "$TOPIC"

# Latency: p95 target response time above 500 ms for 15 minutes
aws cloudwatch put-metric-alarm --alarm-name fullstack-p95-latency \
  --namespace AWS/ApplicationELB --metric-name TargetResponseTime --dimensions Name=LoadBalancer,Value="$ALB" \
  --extended-statistic p95 --period 300 --evaluation-periods 3 --threshold 0.5 \
  --comparison-operator GreaterThanThreshold --alarm-actions "$TOPIC"

# Disk: needs the CloudWatch agent (EC2 doesn't report disk or memory by itself).
# Dimensions must match what the agent sends exactly: fstype is ext4 on Ubuntu, xfs on Amazon Linux.
aws cloudwatch put-metric-alarm --alarm-name fullstack-disk-85 \
  --namespace CWAgent --metric-name disk_used_percent \
  --dimensions Name=InstanceId,Value="$INSTANCE" Name=path,Value=/ Name=fstype,Value="${ROOT_FSTYPE:-ext4}" \
  --statistic Maximum --period 300 --evaluation-periods 1 --threshold 85 \
  --comparison-operator GreaterThanThreshold --alarm-actions "$TOPIC"
:::

::: code javascript Browser demo: measure event-loop delay while blocking (runnable)
// The same idea as monitorEventLoopDelay: schedule a timer every 10 ms and see how late it fires.
function measureLag(ms, work) {
  return new Promise((resolve) => {
    let maxLate = 0, expected = performance.now() + 10;
    const timer = setInterval(() => {
      const now = performance.now();
      maxLate = Math.max(maxLate, now - expected);
      expected = now + 10;
    }, 10);
    setTimeout(work, 30);
    setTimeout(() => { clearInterval(timer); resolve(maxLate); }, ms);
  });
}
const block = (n) => () => { const end = Date.now() + n; while (Date.now() < end); };
(async () => {
  const idle = await measureLag(150, () => {});
  const busy = await measureLag(450, block(300));
  console.log(`idle max lateness ${idle.toFixed(1)} ms, with a 300 ms blocking task ${busy.toFixed(1)} ms`);
  console.log('idle loop is responsive (< 50 ms late)', idle < 50 ? '✅' : '❌ FAIL');
  console.log('blocking work delays everything (> 250 ms late)', busy > 250 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Only watching CPU (memory and disk need the agent; latency and 5xx come from the ALB).
- Unstructured `console.log` text that can't be searched or graphed.
- Logging tokens, cookies or passwords (use redaction).
- Alarms with no one subscribed, or so noisy that everyone ignores them.
- A health check that always returns 200 even when the database is down.
:::

::: understand
- Alert on **symptoms users feel** (latency, errors) first, causes (CPU, disk) second.
- Request ids connect a user's complaint to logs and traces.
- Event-loop delay is the Node-specific early warning for blocking code.
:::

::: ask
- *"What are the SLOs (availability, p95 latency)?"* Alarms should map to them.
- *"Who's on call and where do alerts go?"*
- *"Do we need tracing across services?"*
:::

::: important ⭐ Say this in the interview
"I monitor the golden signals: latency percentiles and 5xx rate from the load balancer, traffic, and saturation like CPU, memory and disk, where memory and disk need the CloudWatch agent. The API writes structured JSON logs with pino including a request id and redacted secrets, shipped to CloudWatch Logs, and exposes liveness and readiness endpoints for the ALB. For Node I also watch event-loop delay: in a test, one request doing 300 milliseconds of synchronous work pushed it to about 300 milliseconds, and a health check sent during that waited 283. CloudWatch alarms on p95 latency, 5xx count, CPU and disk notify an SNS topic that goes to Slack or PagerDuty, and request ids let me jump from a user's error to the exact logs."
:::

::: links
AWS: CloudWatch agent configuration | https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-Agent-Configuration-File-Details.html
AWS: ALB CloudWatch metrics | https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-cloudwatch-metrics.html
Node.js: perf_hooks.monitorEventLoopDelay | https://nodejs.org/api/perf_hooks.html#perf_hooksmonitoreventloopdelayoptions
Google SRE: Monitoring distributed systems | https://sre.google/sre-book/monitoring-distributed-systems/
:::
