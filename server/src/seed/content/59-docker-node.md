@section Docker for Node.js
@icon 🐳
@color #0ea5e9
@desc Containers for Node.js and React apps from an interview angle: images vs containers and layers, layer caching and .dockerignore (measured), small production images with multi-stage builds (measured 1.86 GB → 231 MB), PID 1 and SIGTERM (measured docker stop), Docker Compose for full-stack development (measured healthcheck ordering) and running Node in containers in production (measured heap vs memory limit).

=== What are Docker images and containers, and why use them for a Node.js app?
@p 3
@tags docker, containers, images, devops, basics
@quick
- **Image** = read-only, layered template (OS files + Node + `node_modules` + your code + start command). **Container** = a running instance of an image with a thin writable layer, its own process tree, network and resource limits.
- Containers share the **host kernel** (isolated by Linux **namespaces** and limited by **cgroups**), so they start in well under a second; VMs ship a whole guest OS.
- `docker build` turns a **Dockerfile** into an image, `docker run` starts a container, and `docker push`/`pull` move images through a **registry** (Docker Hub, GHCR, ECR).
- The win: the **same artifact** runs on a laptop, in CI, in staging and in production. "Works on my machine" becomes "works in this image".
- Containers are **disposable**: keep state in volumes, databases or S3, never inside the container.

::: text 🧒 In simple words
An **image** is like a frozen meal kit: everything needed is sealed inside, in labelled layers (base, sauce, toppings). A **container** is that meal kit being cooked right now. You can cook the same kit in any kitchen (laptop, CI, cloud) and it tastes the same, and you can cook ten of them at once.
:::

::: text 📖 Detailed answer
### The vocabulary
| Term | Meaning |
|---|---|
| Dockerfile | recipe: `FROM`, `WORKDIR`, `COPY`, `RUN`, `ENV`, `USER`, `EXPOSE`, `CMD` |
| Image | stack of read-only layers + metadata (CMD, ENV, user, ports), identified by a digest; tags like `api:3f2a1c9` point to it |
| Container | process(es) started from an image, plus a writable layer, network interface and limits |
| Registry | stores images: Docker Hub, GitHub Container Registry, AWS ECR |
| Volume | storage that outlives containers (database files, uploads) |
| Network | containers on the same network reach each other by service name |

### Containers vs virtual machines
| | Container | VM |
|---|---|---|
| Isolation | namespaces + cgroups, shared kernel | hypervisor, own kernel |
| Start time | milliseconds to a second | tens of seconds |
| Size | tens to hundreds of MB | GBs |
| Use | packaging and running apps | stronger isolation, different OS |

### Why interviewers care
- **Reproducible builds**: the Node version, OS libraries and dependencies are pinned in the image.
- **Same artifact everywhere**: CI builds an image once, tags it with the git SHA, and every environment runs that exact image.
- **Orchestration**: Kubernetes, ECS and Fly.io all run containers, so the image is the deployable unit.
- **Isolation**: two apps needing Node 18 and Node 22 run side by side.

This Learning Hub itself runs as three containers: `mongo`, `api` (Node) and `web` (Nginx serving the React build).
:::

::: diagram From source to running containers
flowchart LR
  SRC["source + Dockerfile"] -->|"docker build"| IMG["image api:3f2a1c9 (layers)"]
  IMG -->|"docker push"| REG["registry (GHCR / ECR)"]
  REG -->|"docker pull"| S1["server or cluster"]
  S1 -->|"docker run"| C1["container 1"]
  S1 -->|"docker run"| C2["container 2"]
:::

::: image Dockerfile → image → container, containers vs VMs, and registries
/images/docker/image-container.svg
:::

::: text 🪜 Step by step
1. Write a `Dockerfile` that starts `FROM node:22-alpine`, copies `package*.json`, runs `npm ci`, copies the source and sets `CMD ["node", "dist/server.js"]`.
2. `docker build -t api:dev .` builds layers, each cached separately.
3. `docker run -p 3000:3000 --env-file .env api:dev` starts a container and maps host port 3000 to container port 3000.
4. `docker ps`, `docker logs -f <id>`, `docker exec -it <id> sh` to inspect it.
5. In CI: `docker build -t ghcr.io/acme/api:$GIT_SHA .` and `docker push`; servers pull that exact tag.
:::

::: code docker A first Dockerfile for an Express API
FROM node:22-alpine
WORKDIR /app
# dependencies first (cached until package*.json changes)
COPY package*.json ./
RUN npm ci --omit=dev
# then the source
COPY src ./src
ENV NODE_ENV=production
EXPOSE 3000
# exec form: node is PID 1 and receives SIGTERM directly
CMD ["node", "src/server.js"]
:::

::: code bash Everyday Docker commands
docker build -t api:dev .                         # build an image from ./Dockerfile
docker image ls                                   # list images and sizes
docker run -d --name api -p 3000:3000 api:dev     # run in the background, map a port
docker ps                                         # running containers
docker logs -f api                                # follow stdout/stderr
docker exec -it api sh                            # shell inside the container
docker stop api && docker rm api                  # SIGTERM, then remove
docker tag api:dev ghcr.io/acme/api:3f2a1c9 && docker push ghcr.io/acme/api:3f2a1c9
:::

::: code javascript Model: an image is layers, a container adds a writable layer (runnable)
// Files are looked up from the top layer down; writes go to the container's own layer only.
function makeImage(layers) { return Object.freeze(layers.map((l) => Object.freeze({ ...l }))); }
function runContainer(image) {
  const writable = {};
  return {
    read: (path) => { if (path in writable) return writable[path]; for (let i = image.length - 1; i >= 0; i--) if (path in image[i]) return image[i][path]; return undefined; },
    write: (path, data) => { writable[path] = data; },
  };
}
const image = makeImage([
  { '/usr/local/bin/node': 'node v22' },                 // base layer
  { '/app/package.json': '{"name":"api"}' },              // dependencies layer
  { '/app/src/server.js': 'v1 code' },                    // code layer
]);
const a = runContainer(image), b = runContainer(image);
a.write('/app/src/server.js', 'hot-patched in container a');
console.log('container a sees its change:', a.read('/app/src/server.js'));
console.log('container b still sees the image:', b.read('/app/src/server.js'));
console.log(b.read('/app/src/server.js') === 'v1 code' ? '✅ containers share the image but not their writes' : '❌ FAIL');
console.log(Object.isFrozen(image[2]) ? '✅ image layers are read-only' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Treating a container like a VM: SSH-ing in, editing files, installing packages by hand. Rebuild the image instead.
- Storing uploads or a database inside the container's writable layer: it disappears when the container is replaced.
- Using `latest` as the only tag: you can't tell what's running or roll back. Tag with the git SHA (and a version).
- Saying "Docker is a lightweight VM": it's isolated processes on the host kernel.
:::

::: understand
- Image = immutable packaged app; container = running, disposable instance of it. Build once, run the same image everywhere.
:::

::: ask
- *"If this container disappeared right now, would we lose anything?"* If yes, that state belongs in a volume or a managed service.
:::

::: important ⭐ Say this in the interview
"A Docker image is an immutable, layered package of the OS files, the Node runtime, dependencies, our code and the start command; a container is a running instance of it with its own writable layer, process tree, network and cgroup limits, sharing the host kernel, so it starts in milliseconds unlike a VM. We build the image once in CI, tag it with the git SHA, push it to a registry, and every environment runs that exact image, which removes 'works on my machine'. Containers are disposable, so state lives in volumes or managed services."
:::

::: links
Docker docs: What is a container? | https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/
Docker docs: Dockerfile reference | https://docs.docker.com/reference/dockerfile/
:::

=== How do Docker layer caching and .dockerignore speed up Node.js builds?
@p 3
@tags docker, layer-cache, dockerignore, build-performance
@quick
- Every Dockerfile instruction makes a **cached layer**. When an instruction or its input files change, that layer **and every layer after it** are rebuilt.
- Copy **`package*.json` first, run `npm ci`, then copy the source**: code edits then reuse the dependency layer. Measured rebuild after a code change: **5.2 s → 0.8 s**.
- **`.dockerignore`** keeps `node_modules`, `.git`, `dist`, `.env*`, logs out of the build context. Measured context: **106.9 MB → 96 kB**.
- Host `node_modules` must never be copied in: native modules compiled for macOS break on Linux.
- In CI, reuse the cache across runs (`cache-from`/`cache-to: type=gha` or a registry cache), and use `RUN --mount=type=cache,target=/root/.npm` for the npm cache.

::: text 🧒 In simple words
Building an image is like stacking boxes. If you change a box near the **bottom**, you must restack everything above it. So put things that rarely change (Node, your dependency list) at the bottom and things that change all the time (your code) at the top. `.dockerignore` is the list of junk you don't even bring into the room.
:::

::: text 📖 Detailed answer
### How the cache decides
| Instruction | Cache key |
|---|---|
| `FROM` | the base image digest |
| `RUN cmd` | the command string + the previous layer |
| `COPY files` | checksums of the copied files + the previous layer |

When a key changes, that step **and every later step** run again. So the order matters:
1. Base image (`FROM node:22-alpine`)
2. OS packages (`RUN apk add …`), rarely changes
3. `COPY package*.json ./` changes only when dependencies change
4. `RUN npm ci`, the slow step, now cached most of the time
5. `COPY . .` / `COPY src ./src` changes on every commit
6. `RUN npm run build`

### Measured (TypeScript + Express API, BuildKit)
| Dockerfile | Rebuild after editing `server.ts` |
|---|---|
| `COPY . .` then `RUN npm install` | **5.2 s** (reinstalls all dependencies) |
| `COPY package*.json` → `npm ci` → `COPY src` | **0.8 s** |

| Build context | Size sent to the builder |
|---|---|
| no `.dockerignore` (local `node_modules` 61 MB + `.git` 50 MB) | **106.9 MB** |
| with `.dockerignore` | **96 kB** |

### Why `.dockerignore` matters beyond speed
- **Correctness**: a host `node_modules` built on macOS has the wrong native binaries for Linux, and `COPY . .` would overwrite the clean `npm ci` result.
- **Safety**: `.env`, keys and `.git` history would end up inside image layers, and deleting them in a later layer does **not** remove them from the earlier one.
- **Cache hits**: changes in `coverage/` or logs would otherwise invalidate `COPY . .`.
:::

::: diagram Which layers rebuild after a code change?
flowchart TD
  A["FROM node:22-alpine (cached)"] --> B["COPY package*.json (cached: unchanged)"]
  B --> C["RUN npm ci (cached)"]
  C --> D["COPY src (CHANGED: server.ts edited)"]
  D --> E["RUN npm run build (re-runs)"]
  E --> F["new image: only the top layers differ"]
:::

::: image Layer caching and .dockerignore, measured
/images/docker/layer-cache.svg
:::

::: text 🪜 Step by step
1. Add a `.dockerignore` before writing the Dockerfile.
2. `COPY package.json package-lock.json ./` then `RUN npm ci` (never `npm install` in images: `ci` is exact and fails if the lockfile is out of sync).
3. `COPY` only what the build needs (`tsconfig.json`, `src/`), not the whole repo.
4. Run the build step last.
5. Check with `docker build --progress=plain .`: unchanged steps print `CACHED`.
6. In CI, persist the BuildKit cache (`cache-from`/`cache-to`) because runners start empty.
:::

::: code docker Cache-friendly Dockerfile + npm cache mount
# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# the npm download cache survives between builds even when the lockfile changes
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
CMD ["node", "dist/server.js"]
:::

::: code text .dockerignore for a Node.js project
node_modules
dist
build
coverage
.git
.github
*.log
.env
.env.*
Dockerfile*
docker-compose*.yml
.vscode
:::

::: code javascript Simulate the layer cache: which steps re-run? (runnable)
// Each step's cache key = hash(previous key + instruction + input files). A change invalidates everything after it.
async function sha(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function build(steps, files, cache) {
  let parent = 'base', ran = [];
  for (const s of steps) {
    const inputs = (s.copies || []).map((f) => f + '=' + files[f]).join(';');
    const key = await sha(parent + '|' + s.cmd + '|' + inputs);
    if (!cache.has(key)) { ran.push(s.cmd); cache.add(key); }
    parent = key;
  }
  return ran;
}
const good = [{ cmd: 'COPY package*.json', copies: ['package.json'] }, { cmd: 'RUN npm ci' }, { cmd: 'COPY src', copies: ['src/server.ts'] }, { cmd: 'RUN tsc' }];
const bad = [{ cmd: 'COPY . .', copies: ['package.json', 'src/server.ts'] }, { cmd: 'RUN npm install' }, { cmd: 'RUN tsc' }];
(async () => {
  for (const [name, steps] of [['good order', good], ['COPY . . first', bad]]) {
    const cache = new Set(); const files = { 'package.json': 'express@5', 'src/server.ts': 'v1' };
    await build(steps, files, cache);                 // first build fills the cache
    files['src/server.ts'] = 'v2';                    // edit code only
    const ran = await build(steps, files, cache);
    console.log(`${name}: re-ran → ${ran.join(', ')}`);
    if (name === 'good order') console.log(!ran.includes('RUN npm ci') ? '✅ npm ci stayed cached' : '❌ FAIL');
    else console.log(ran.includes('RUN npm install') ? '✅ (as expected) a code edit reinstalled dependencies' : '❌ FAIL');
  }
})();
:::

::: warning ⚠️ Common mistakes
- `COPY . .` before `npm install`: every commit reinstalls everything.
- No `.dockerignore`: a huge context, macOS `node_modules` inside a Linux image, `.env` baked into a layer.
- `RUN rm .env` "to clean up": the file is still in the earlier layer and can be extracted.
- `npm install` instead of `npm ci` in images: non-deterministic, may change the lockfile.
- Expecting the cache in CI without configuring it: GitHub-hosted runners start empty every time.
:::

::: understand
- Order Dockerfile steps from least to most frequently changing, and shrink the context so the cache keys stay stable.
:::

::: ask
- *"Which step re-runs when I change one line of code?"* If the answer is `npm ci`, reorder the Dockerfile.
:::

::: important ⭐ Say this in the interview
"Each Dockerfile instruction produces a cached layer keyed on the instruction, its input files and the previous layer, and a change rebuilds that layer and everything after it. So I copy only package.json and the lockfile, run npm ci, and copy the source afterwards; in a measurement, a code change rebuilt in 0.8 seconds instead of 5.2. A .dockerignore excludes node_modules, .git, dist and env files, which shrank the build context from 107 MB to 96 kB and keeps host binaries and secrets out of the image. In CI I persist the BuildKit cache, because runners start empty."
:::

::: links
Docker docs: Build cache | https://docs.docker.com/build/cache/
Docker docs: .dockerignore | https://docs.docker.com/build/concepts/context/#dockerignore-files
:::

=== How do you write a small, secure production Dockerfile for Node.js? (multi-stage, base images, non-root)
@p 3
@tags docker, multi-stage, production, image-size, security
@quick
- **Multi-stage build**: stage 1 has dev dependencies and compiles (tsc/vite); stage 2 starts from a fresh small base and copies only `dist` + production `node_modules`.
- Measured, same API: **1.86 GB** (`node:22`, `COPY . .`) → **463 MB** (slim, one stage) → **256 MB** (alpine, multi-stage) → **231 MB** (distroless).
- Base images: `node:22-slim` (Debian, glibc) is a safe default; `-alpine` is smallest (musl: check native modules); **distroless** has no shell or package manager.
- Run as a **non-root** user (`USER node`), set `NODE_ENV=production`, use `npm ci --omit=dev`, pin the base image version.
- Never put secrets in `ENV`/`ARG` or copied files; inject them at runtime. Scan images (`docker scout`, Trivy) in CI.

::: text 🧒 In simple words
To ship furniture you build it in a **workshop** full of tools and sawdust, then put **only the finished table** on the truck. A multi-stage Dockerfile does the same: compilers and dev tools stay in the workshop stage, and the production image carries just the app.
:::

::: text 📖 Detailed answer
### Measured: the same TypeScript + Express API
| Dockerfile | Image size |
|---|---|
| `FROM node:22`, `COPY . .`, `npm install`, `tsc` | **1.86 GB** |
| `node:22-slim`, one stage, cached deps | **463 MB** |
| `node:22-alpine`, multi-stage, `npm ci --omit=dev` | **256 MB** |
| distroless `nodejs22-debian12:nonroot`, multi-stage | **231 MB** |

Smaller images pull faster (faster deploys and autoscaling) and contain fewer packages that could have vulnerabilities.

### Choosing a base image
| Base | Pros | Cons |
|---|---|---|
| `node:22` | everything, good for build stages | ~1.1 GB, many packages |
| `node:22-slim` | Debian/glibc, small, compatible | fewer debugging tools |
| `node:22-alpine` | smallest common choice | musl libc: some native modules need rebuilding |
| distroless | no shell, no package manager, non-root user built in | can't `docker exec … sh`; debug with an ephemeral debug image |

### Production checklist
- Pin the version: `node:22.22-alpine` (or a digest), not `node:latest`.
- `NODE_ENV=production`, `npm ci --omit=dev`, `npm cache clean --force`.
- `USER node`: a container escape as root is far worse.
- `CMD ["node", "dist/server.js"]` in exec form (see the PID 1 question).
- `HEALTHCHECK` (Docker/Compose) or Kubernetes probes.
- Secrets come from the runtime (env vars from a secret store, mounted files), never `ENV API_KEY=…` or `ARG`, which are visible in `docker history`.
- Scan in CI: `docker scout cves`, Trivy, Grype; rebuild regularly to pick up base image patches.
:::

::: diagram Multi-stage build
flowchart LR
  subgraph BUILD["stage build: node:22-alpine"]
    B1["npm ci (all deps)"] --> B2["tsc → dist/"]
  end
  subgraph RUN["stage runtime: node:22-alpine"]
    R1["npm ci --omit=dev"] --> R2["COPY --from=build dist"]
    R2 --> R3["USER node, CMD node dist/server.js"]
  end
  B2 -->|"only dist/ crosses over"| R2
:::

::: image Image size by Dockerfile style, measured
/images/docker/image-size.svg
:::

::: text 🪜 Step by step
1. Stage `build`: `FROM node:22-alpine AS build`, copy manifests, `npm ci`, copy source, `npm run build`.
2. Stage `runtime`: `FROM node:22-alpine`, `ENV NODE_ENV=production`, copy manifests, `npm ci --omit=dev`.
3. `COPY --from=build /app/dist ./dist`.
4. `USER node`, `EXPOSE 3000`, `HEALTHCHECK`, `CMD ["node", "dist/server.js"]`.
5. Build, then check `docker image ls` and `docker history` (no secrets, no dev tools) and scan it.
6. For a React app: build stage runs `vite build`, runtime stage is `nginx:alpine` serving `dist/` (that's how this Learning Hub's `web` image works).
:::

::: code docker Production multi-stage Dockerfile (Node + TypeScript API)
# ---- build: dev dependencies + compile ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime: production dependencies + compiled JS only ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "dist/server.js"]
:::

::: code docker React (Vite) frontend: build with Node, serve with Nginx
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=/api
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
:::

::: code javascript Lint a Dockerfile for production rules (runnable)
// A tiny checker for the rules interviewers ask about. Real projects use hadolint.
function lintDockerfile(src) {
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const issues = [];
  const froms = lines.filter((l) => /^FROM /i.test(l));
  if (froms.some((l) => /:latest\b/.test(l) || !/:/.test(l.split(/\s+/)[1]))) issues.push('pin the base image version (no :latest)');
  if (froms.length < 2 && lines.some((l) => /npm run build|tsc/.test(l))) issues.push('use a multi-stage build so build tools stay out of the runtime image');
  if (lines.some((l) => /^RUN npm install\b/.test(l))) issues.push('use npm ci (exact, lockfile-based)');
  if (!lines.some((l) => /^USER (?!root)/.test(l))) issues.push('run as a non-root USER');
  const cmd = lines.filter((l) => /^CMD /.test(l)).pop() || '';
  if (!/^CMD \[/.test(cmd)) issues.push('use exec-form CMD ["node", …] so node receives SIGTERM');
  if (/npm (start|run)/.test(cmd)) issues.push('start node directly instead of through npm');
  if (lines.some((l) => /^(ENV|ARG) .*(SECRET|PASSWORD|TOKEN|API_KEY)/i.test(l))) issues.push('no secrets in ENV/ARG (visible in docker history)');
  return issues;
}
const naive = 'FROM node:latest\nCOPY . .\nRUN npm install\nRUN npm run build\nENV API_KEY=sk_live_123\nCMD npm start';
const good = 'FROM node:22-alpine AS build\nCOPY package*.json ./\nRUN npm ci\nRUN npm run build\nFROM node:22-alpine\nRUN npm ci --omit=dev\nCOPY --from=build /app/dist ./dist\nUSER node\nCMD ["node", "dist/server.js"]';
const a = lintDockerfile(naive), b = lintDockerfile(good);
a.forEach((i) => console.log('naive:', i));
console.log(a.length === 7 ? '✅ naive Dockerfile: 7 problems found' : `❌ FAIL (${a.length})`);
console.log(b.length === 0 ? '✅ production Dockerfile passes' : '❌ FAIL ' + b.join('; '));
:::

::: warning ⚠️ Common mistakes
- Shipping the build stage: TypeScript, Vite, test runners and source maps in production.
- Running as root because "it's just a container".
- `ENV DATABASE_PASSWORD=…` or `ARG NPM_TOKEN` without a secret mount: readable by anyone who can pull the image.
- Switching to Alpine without testing native modules (`bcrypt`, `sharp`, Prisma engines) on musl.
- Never rebuilding: the base image's security patches only arrive when you rebuild.
:::

::: understand
- Build in a fat stage, run from a thin one: only compiled code, production dependencies, a non-root user and a pinned base.
:::

::: ask
- *"What's in this image that production doesn't need?"* `docker history` and `docker run --rm img ls /app` answer it.
:::

::: important ⭐ Say this in the interview
"I use a multi-stage build: the first stage installs all dependencies and compiles TypeScript or the Vite bundle, and the runtime stage starts from a fresh slim or alpine base, installs only production dependencies and copies the dist folder. On the same API that took the image from 1.86 GB to about 250 MB, and distroless got it to 231. The image runs as the non-root node user, pins the base version, starts node in exec form, has a healthcheck, and gets secrets only at runtime, never through ENV or ARG, because those are visible in the image history. CI scans it and we rebuild regularly for base image patches."
:::

::: links
Docker docs: Multi-stage builds | https://docs.docker.com/build/building/multi-stage/
Node.js Docker best practices | https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md
:::

=== Why does docker stop take 10 seconds? (PID 1, SIGTERM and graceful shutdown in containers)
@p 3
@tags docker, signals, sigterm, pid1, graceful-shutdown
@quick
- `docker stop` sends **SIGTERM** to PID 1, waits for the stop timeout (classic default **10 s**; Kubernetes gives **30 s**), then sends **SIGKILL** (exit **137**).
- Node running as **PID 1** gets no default signal behaviour: with no `SIGTERM` listener it ignores the signal. Measured: **10.2 s** then SIGKILL, vs **0.2 s** with a handler.
- Use the **exec form** `CMD ["node", "dist/server.js"]`. The shell form `CMD node …` wraps it in `/bin/sh -c`.
- Add `--init` / **tini** (or `init: true` in Compose) to reap zombie processes and forward signals; it made the no-handler case exit fast (143) but the app still didn't clean up.
- The handler should: stop accepting connections, finish in-flight requests, close DB/Redis/queue connections, then exit, all within the grace period.

::: text 🧒 In simple words
`docker stop` is like a manager saying **"closing time, please finish up"** (SIGTERM). A good worker finishes the current customer and leaves. A worker who ignores it gets **dragged out after 10 seconds** (SIGKILL), possibly in the middle of serving someone. Node in a container only listens to the manager if you tell it to.
:::

::: text 📖 Detailed answer
### Measured: `docker stop` on Node 22 containers
| Setup | Time | Exit code |
|---|---|---|
| `CMD ["node","dist/server.js"]` with `process.on('SIGTERM')` | **0.2 s** | 0 (clean) |
| `CMD ["npm","start"]` (npm 10 forwards the signal) | 0.1 s | 0 |
| node, no SIGTERM handler, stop timeout 10 s | **10.2 s** | **137** (SIGKILL) |
| node, no handler, `docker run --init` | 0.1 s | 143 (killed by SIGTERM, no cleanup) |

Note: this Docker Desktop install reported a 1 s default stop timeout; with `--stop-timeout 10` (the usual default) the unhandled case took exactly 10.2 s.

### Why PID 1 is special
The Linux kernel doesn't apply default signal actions to PID 1 in a namespace. For a normal process, SIGTERM's default is "terminate"; for PID 1 it's ignored unless the program installs a handler. PID 1 also has to **reap zombie** child processes. Node doesn't do that; tini/`--init` does.

### Exit codes to recognise
| Code | Meaning |
|---|---|
| 0 | clean exit |
| 1 | app error (uncaught exception, `process.exit(1)`) |
| 137 | 128 + 9: SIGKILL (stop timeout, or the OOM killer) |
| 143 | 128 + 15: terminated by SIGTERM without handling it |

### What a good shutdown does
1. Mark not-ready (readiness probe fails, so the load balancer stops sending traffic).
2. `server.close()` to stop accepting; close idle keep-alive connections.
3. Let in-flight requests and jobs finish (with a deadline shorter than the grace period).
4. Close the DB pool, Redis, queue consumers and flush logs/traces.
5. `process.exit(0)`; force-exit if the deadline passes.
:::

::: diagram docker stop / Kubernetes pod termination
sequenceDiagram
  participant O as "Docker or Kubernetes"
  participant N as "node (PID 1)"
  participant LB as "load balancer"
  O->>LB: remove from endpoints (k8s)
  O->>N: SIGTERM
  N->>N: server.close(), finish in-flight, close pools
  N-->>O: exit 0
  Note over O,N: no exit before the grace period ends → SIGKILL (137)
:::

::: image PID 1, SIGTERM and docker stop, measured
/images/docker/signals.svg
:::

::: text 🪜 Step by step
1. Use the exec form `CMD ["node", "dist/server.js"]` (or `ENTRYPOINT`), not `CMD node …` or a shell script without `exec`.
2. In the app: `process.on('SIGTERM', shutdown)` (and `SIGINT` for Ctrl+C locally).
3. In `shutdown`: flip readiness, `server.close()`, wait for in-flight work, close pools, exit; add a force-exit timer.
4. If the app spawns child processes, add `--init` / `init: true` / tini.
5. Make the app's deadline shorter than the platform grace period (e.g. 25 s for Kubernetes' 30 s), or raise `terminationGracePeriodSeconds` / `stop_grace_period`.
6. Test it: `docker stop` should take well under the timeout and exit 0.
:::

::: code javascript Graceful shutdown for a containerised Express API
const express = require('express');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
let shuttingDown = false;

app.get('/healthz', (req, res) => res.json({ ok: true }));                          // liveness
app.get('/readyz', (req, res) => res.status(shuttingDown ? 503 : 200).json({ ready: !shuttingDown })); // readiness
app.get('/api/orders', async (req, res) => res.json((await pool.query('SELECT id, status FROM orders LIMIT 20')).rows));

const server = app.listen(Number(process.env.PORT || 3000), () => console.log('listening'));

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received: draining`);
  const force = setTimeout(() => { console.error('forced exit after 25 s'); process.exit(1); }, 25_000);
  force.unref();
  server.close(async () => {                 // stops accepting; callback runs when in-flight requests finish
    await pool.end();                        // close DB connections
    console.log('clean exit');
    process.exit(0);
  });
  server.closeIdleConnections();             // don't wait for idle keep-alive sockets
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
:::

::: code docker Exec form vs shell form
# 🚨 shell form: PID 1 is /bin/sh, which may not forward SIGTERM to node
# CMD node dist/server.js

# ✅ exec form: node is PID 1 and receives SIGTERM
CMD ["node", "dist/server.js"]

# if you need a start script, end it with exec so node replaces the shell:
#   #!/bin/sh
#   node dist/migrate.js
#   exec node dist/server.js
:::

::: code javascript Simulate: stop with and without a SIGTERM handler (runnable)
// Models docker stop: SIGTERM, wait up to the timeout, then SIGKILL. Time is simulated, not real.
function dockerStop(container, timeoutMs = 10_000) {
  const t = container.onSigterm ? container.onSigterm() : Infinity;     // ms the app needs to exit, Infinity = ignores it
  if (t <= timeoutMs) return { tookMs: t, exitCode: 0, signal: 'SIGTERM' };
  return { tookMs: timeoutMs, exitCode: 137, signal: 'SIGKILL', lostInFlight: container.inFlight };
}
const handled = { inFlight: 3, onSigterm() { const drain = this.inFlight * 40; this.inFlight = 0; return 150 + drain; } };
const unhandled = { inFlight: 3 };                                            // Node as PID 1 with no listener
const slow = { inFlight: 3, onSigterm() { return 45_000; } };                 // job longer than the grace period
const r1 = dockerStop(handled), r2 = dockerStop(unhandled), r3 = dockerStop(slow, 30_000);
console.log('with handler   :', r1); console.log('no handler     :', r2); console.log('slow handler   :', r3);
console.log(r1.exitCode === 0 && r1.tookMs < 1000 ? '✅ handler drains requests and exits fast' : '❌ FAIL');
console.log(r2.exitCode === 137 && r2.tookMs === 10_000 ? '✅ no handler: waits the full timeout, then SIGKILL (137)' : '❌ FAIL');
console.log(r3.exitCode === 137 ? '✅ work longer than the grace period is killed: use a deadline or a queue' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Shell-form `CMD`, or an `entrypoint.sh` without `exec`: the shell is PID 1.
- No `SIGTERM` handler: every deploy waits for the timeout and kills in-flight requests.
- Calling `process.exit()` immediately in the handler: drops in-flight requests anyway.
- A shutdown that waits longer than the grace period: SIGKILL arrives mid-cleanup.
- Ignoring exit code 137 in logs: it's either a stop timeout or the OOM killer.
:::

::: understand
- In a container, shutdown is your app's job: receive SIGTERM as PID 1, drain, close, exit before the grace period ends.
:::

::: ask
- *"How long does `docker stop` take for our API, and what's the exit code?"* Anything near the timeout or 137 means signals aren't handled.
:::

::: important ⭐ Say this in the interview
"docker stop sends SIGTERM to PID 1, waits the stop timeout, 10 seconds by default or 30 in Kubernetes, then SIGKILLs it with exit 137. Node as PID 1 ignores SIGTERM unless it installs a handler, so I measured a container without one taking the full timeout and getting killed, versus 0.2 seconds with a handler. So I use exec-form CMD so node is PID 1, handle SIGTERM by failing readiness, closing the server, finishing in-flight requests, closing pools and exiting before the deadline, and add --init or tini when the app spawns child processes."
:::

::: links
Docker docs: docker container stop | https://docs.docker.com/reference/cli/docker/container/stop/
Kubernetes: Pod termination | https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination
:::

=== How do you use Docker Compose for a full-stack app (React, Node, Postgres, Redis)?
@p 3
@tags docker-compose, docker, fullstack, local-development, healthcheck
@quick
- **Compose** describes several containers in one `compose.yaml`: services, ports, environment, volumes, networks, healthchecks. `docker compose up -d --build` starts them all.
- Services share a project **network** and reach each other **by service name** (`postgres://db:5432`), never `localhost`.
- `depends_on` alone waits only for "started". Measured: the API got **ECONNREFUSED**; with `condition: service_healthy` + a DB healthcheck it **connected in 18 ms**.
- **Named volumes** keep database data across restarts; `docker compose down` keeps them, `down -v` deletes them.
- For development: bind-mount the source and run a watcher (or `docker compose watch`); keep the production image for CI and deploys.

::: text 🧒 In simple words
Compose is a **seating plan for a dinner party**: who comes (services), where they sit (ports), what they bring (environment, volumes), and who must arrive first (the database before the API). One command (`up`) seats everyone; one command (`down`) clears the table.
:::

::: text 📖 Detailed answer
### Key fields
| Field | Use |
|---|---|
| `build` / `image` | build from a Dockerfile or pull an image |
| `ports: ["3000:80"]` | host:container port mapping (only for things you open from the host) |
| `environment` / `env_file` | configuration (secrets via `secrets:` or an untracked `.env`) |
| `volumes` | named volumes for data, bind mounts for source code in dev |
| `depends_on` + `condition` | start order: `service_started`, `service_healthy`, `service_completed_successfully` (migrations) |
| `healthcheck` | `pg_isready`, `redis-cli ping`, `wget /healthz` |
| `restart: unless-stopped` | restart crashed containers |
| `profiles` | optional services (e.g. `tools`: pgAdmin) |

### Measured: startup order
| `api` → `db` dependency | Result |
|---|---|
| `depends_on: [db]` | `ECONNREFUSED`, exit 1: Postgres was started but not ready |
| `depends_on: db: condition: service_healthy` + `pg_isready` healthcheck | connected in **18 ms** |

Healthchecks fix startup; the app should still **retry** connections, because databases restart in production too.

### This Learning Hub
Its own `docker-compose.yml` runs `mongo`, `api` and `web`, with a `mongo_data` volume holding your saved edits. That's why the project rules say never run `docker compose down -v`.
:::

::: diagram A Compose project
flowchart LR
  BROWSER["browser :3000"] --> WEB["web: nginx + React build"]
  WEB -->|"/api proxy"| API["api: Node"]
  API -->|"db:5432"| DB[("db: postgres")]
  API -->|"cache:6379"| CACHE[("cache: redis")]
  DB --- VOL["volume pgdata"]
:::

::: image Docker Compose for a full-stack app and measured startup order
/images/docker/compose.svg
:::

::: text 🪜 Step by step
1. One service per process: `web`, `api`, `worker`, `db`, `cache`.
2. Give `db` and `cache` healthchecks; make `api` depend on them with `condition: service_healthy`.
3. Run migrations as a one-off service and make `api` wait for `service_completed_successfully`.
4. Use named volumes for data; bind-mount source only in a dev override file.
5. `docker compose up -d --build`, `docker compose logs -f api`, `docker compose exec db psql -U postgres`.
6. In CI: `docker compose up -d --wait` brings the stack up for integration or e2e tests.
:::

::: code yaml compose.yaml: React + Node + Postgres + Redis
services:
  web:
    build: ./client
    ports: ["3000:80"]
    depends_on: [api]
  api:
    build: ./server
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/shop
      REDIS_URL: redis://cache:6379
      NODE_ENV: production
    depends_on:
      migrate:
        condition: service_completed_successfully
      cache:
        condition: service_healthy
    restart: unless-stopped
  migrate:
    build: ./server
    command: ["node", "dist/migrate.js"]
    environment:
      DATABASE_URL: postgres://app:${DB_PASSWORD}@db:5432/shop
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: shop
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d shop"]
      interval: 2s
      timeout: 3s
      retries: 30
  cache:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      retries: 30
volumes:
  pgdata:
:::

::: code yaml compose.override.yaml: hot reload in development
services:
  api:
    build:
      context: ./server
      target: build                 # the stage that has dev dependencies
    command: ["npx", "tsx", "watch", "src/server.ts"]
    volumes:
      - ./server/src:/app/src        # bind mount: edits on the host appear in the container
    ports: ["5050:3000", "9229:9229"] # API + debugger
    environment:
      NODE_ENV: development
:::

::: code javascript Start order from depends_on: a topological sort (runnable)
// Compose starts services in dependency order and refuses cycles. Same algorithm as any build or job graph.
function startOrder(services) {
  const order = [], state = {};
  function visit(name, path) {
    if (state[name] === 'done') return;
    if (state[name] === 'visiting') throw new Error('dependency cycle: ' + [...path, name].join(' → '));
    state[name] = 'visiting';
    for (const dep of Object.keys(services[name].depends_on || {})) visit(dep, [...path, name]);
    state[name] = 'done'; order.push(name);
  }
  Object.keys(services).forEach((s) => visit(s, []));
  return order;
}
const compose = {
  web: { depends_on: { api: 'service_started' } },
  api: { depends_on: { migrate: 'service_completed_successfully', cache: 'service_healthy' } },
  migrate: { depends_on: { db: 'service_healthy' } },
  db: {}, cache: {},
};
const order = startOrder(compose);
console.log('start order:', order.join(' → '));
console.log(order.indexOf('db') < order.indexOf('migrate') && order.indexOf('migrate') < order.indexOf('api') && order.at(-1) === 'web' ? '✅ db before migrations before api before web' : '❌ FAIL');
try { startOrder({ a: { depends_on: { b: 1 } }, b: { depends_on: { a: 1 } } }); console.log('❌ FAIL'); } catch (e) { console.log('✅', e.message); }
:::

::: warning ⚠️ Common mistakes
- `localhost` in a connection string inside a container: that's the container itself. Use the service name.
- `depends_on` without a healthcheck and expecting the DB to be ready.
- `docker compose down -v` "to clean up": deletes the database volume.
- Publishing database ports to the host in production (`5432:5432`) when only the API needs them.
- Committing `.env` with real passwords; use `.env.example` and a secret store.
:::

::: understand
- Compose = the whole local stack as code: service names for networking, healthchecks for order, volumes for data.
:::

::: ask
- *"Can a new teammate run the whole app with one `docker compose up`?"* That's the goal.
:::

::: important ⭐ Say this in the interview
"I describe the stack in a compose file: web, API, worker, Postgres and Redis on one project network, so the API reaches the database at db:5432 by service name. Plain depends_on only waits for the container to start, and I measured the API failing with ECONNREFUSED; with a pg_isready healthcheck and condition: service_healthy it connected in 18 ms. Migrations run as a one-off service the API waits on, data lives in named volumes, and a dev override bind-mounts the source with a watcher. CI uses the same file with up --wait for integration tests."
:::

::: links
Docker docs: Compose file reference | https://docs.docker.com/reference/compose-file/services/
Docker docs: Control startup order | https://docs.docker.com/compose/how-tos/startup-order/
:::

=== How do you run Node.js containers in production? (memory limits, health checks, logs, debugging)
@p 2
@tags docker, production, memory, healthcheck, debugging, nodejs
@quick
- Set **memory and CPU limits**. Measured: Node 22 sizes its default heap to **≈50% of the container limit** (512 MB → 259 MB heap, 2 GB → 1048 MB); without a limit it used the whole Docker VM (2096 MB).
- Exceeding the limit triggers the kernel **OOM killer**: exit **137**, no JavaScript stack trace (measured at 256 MB). Tune with `--max-old-space-size` or `NODE_OPTIONS`.
- **Health**: liveness (`/healthz`: process is alive) vs readiness (`/readyz`: dependencies OK, send traffic). Don't make liveness depend on the database.
- **Logs** go to stdout/stderr as JSON; the platform collects them. No log files inside containers.
- Debug with `docker logs`, `docker exec`, `docker stats`, `docker inspect` (`State.OOMKilled`), and `--inspect` for the Node debugger.

::: text 🧒 In simple words
A container is a **hotel room with a size limit**. If your app's luggage (memory) gets bigger than the room, security throws it out without warning (OOM kill). Node is polite: it only packs about half the room by default. Health checks are the **"do not disturb" sign**: "I'm alive" vs "I'm ready for guests".
:::

::: text 📖 Detailed answer
### Measured: Node 22 heap limit inside containers (8 GB Docker VM)
| `docker run` | `v8.getHeapStatistics().heap_size_limit` | `process.constrainedMemory()` |
|---|---|---|
| no limit | 2096 MB | none |
| `--memory=2g` | **1048 MB** | 2048 MB |
| `--memory=512m` | **259 MB** | 512 MB |
| `--memory=256m` + growing buffers | killed, exit **137** | |

Node reads the cgroup limit, so the heap fits. But Buffers, native memory and thread stacks live **outside** the heap, which is why the 256 MB container was OOM-killed instead of throwing a JS error. Leave headroom: `--max-old-space-size` ≈ 60–75% of the limit.

### Health checks
| Probe | Question | Failing means |
|---|---|---|
| liveness | is the process stuck? | restart it |
| readiness | can it serve traffic now? | stop routing to it (no restart) |
| startup | has it finished booting? | wait before checking liveness |

### Logs and config
- Log JSON to stdout; Docker, ECS or Kubernetes ship it to CloudWatch, Loki or Datadog.
- Configuration via environment variables (twelve-factor); secrets from Secrets Manager, Vault or Kubernetes secrets.

### Debugging checklist
| Symptom | Look at |
|---|---|
| restarts, exit 137 | `docker inspect` → `State.OOMKilled`, memory graphs, heap snapshots |
| exit 1 | `docker logs` for the stack trace |
| slow | `docker stats` (CPU throttling), event-loop delay metric |
| can't connect | `docker exec api wget -qO- db:5432`, network, DNS name |
:::

::: diagram Liveness vs readiness
flowchart TD
  P["probe hits the container"] --> L{"GET /healthz ok?"}
  L -->|"no (3 times)"| R["restart container"]
  L -->|"yes"| RD{"GET /readyz ok? (DB, cache reachable)"}
  RD -->|"no"| OUT["remove from load balancer, keep running"]
  RD -->|"yes"| IN["receives traffic"]
:::

::: image Node in containers: heap vs memory limit (measured), checklists
/images/docker/production.svg
:::

::: text 🪜 Step by step
1. Set limits: `docker run --memory=512m --cpus=1` / Compose `deploy.resources.limits` / Kubernetes `resources`.
2. Set `NODE_OPTIONS=--max-old-space-size=320` for a 512 MB limit (leave room for buffers).
3. Implement `/healthz` (cheap, no dependencies) and `/readyz` (checks DB/cache, fails during shutdown).
4. Log JSON to stdout with request ids.
5. Alert on restarts, OOM kills, memory approaching the limit and event-loop delay.
6. To debug: `docker logs`, `docker exec`, `docker stats`; reproduce a leak with heap snapshots (`--heapsnapshot-signal=SIGUSR2`).
:::

::: code yaml Kubernetes deployment: limits, probes, graceful shutdown
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: api
          image: ghcr.io/acme/api:3f2a1c9
          ports: [{ containerPort: 3000 }]
          env:
            - { name: NODE_OPTIONS, value: "--max-old-space-size=320" }
            - name: DATABASE_URL
              valueFrom: { secretKeyRef: { name: api-secrets, key: database-url } }
          resources:
            requests: { cpu: 250m, memory: 384Mi }
            limits: { memory: 512Mi }
          livenessProbe:
            httpGet: { path: /healthz, port: 3000 }
            periodSeconds: 10
          readinessProbe:
            httpGet: { path: /readyz, port: 3000 }
            periodSeconds: 5
:::

::: code bash Debugging a misbehaving container
docker ps -a --filter name=api                         # status, restarts, exit code
docker inspect api --format '{{.State.ExitCode}} OOMKilled={{.State.OOMKilled}}'
docker logs --tail 100 -f api                          # stack traces, startup errors
docker stats api                                       # live CPU and memory vs the limit
docker exec -it api sh                                 # (not on distroless) look around
docker exec api node -e "console.log(require('v8').getHeapStatistics().heap_size_limit / 1048576)"
docker run --rm -p 9229:9229 api:dev node --inspect=0.0.0.0:9229 dist/server.js   # attach Chrome DevTools
:::

::: code javascript Pick heap size and classify exit codes (runnable)
// Helpers you'd use when setting NODE_OPTIONS and reading container events.
function heapFor(limitMb, { headroom = 0.35 } = {}) { return Math.floor(limitMb * (1 - headroom)); }
function explainExit(code, oomKilled) {
  if (code === 0) return 'clean exit';
  if (code === 137) return oomKilled ? 'OOM killed: memory above the container limit' : 'SIGKILL: did not stop within the grace period';
  if (code === 143) return 'terminated by SIGTERM without a handler';
  if (code === 1) return 'application error: read the logs';
  return code > 128 ? `killed by signal ${code - 128}` : 'non-zero exit';
}
console.log('512 MB limit → --max-old-space-size=' + heapFor(512));
console.log('2 GB limit   → --max-old-space-size=' + heapFor(2048));
console.log(heapFor(512) === 332 ? '✅ leaves ~35% for buffers, stacks and native memory' : '❌ FAIL');
const events = [[0, false], [137, true], [137, false], [143, false], [1, false]];
events.forEach(([c, o]) => console.log(`exit ${c}${o ? ' (OOMKilled)' : ''}: ${explainExit(c, o)}`));
console.log(explainExit(137, true).startsWith('OOM') && explainExit(137, false).startsWith('SIGKILL') ? '✅ 137 needs OOMKilled to tell the two causes apart' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- No memory limit: one leaking container starves its neighbours.
- `--max-old-space-size` equal to the container limit: buffers push it over and the kernel kills it.
- Liveness probe that checks the database: a DB blip restarts every pod at once.
- Writing logs to files inside the container: they're lost and fill the disk.
- Reading only `docker logs` for exit 137: OOM kills leave no stack trace; check `OOMKilled`.
:::

::: understand
- Limits + heap headroom, separate liveness and readiness, logs to stdout, and know what exit codes 1, 137 and 143 mean.
:::

::: ask
- *"What happens to this container when memory hits the limit, and how would we know?"*
:::

::: important ⭐ Say this in the interview
"In production every container gets CPU and memory limits. Node 22 reads the cgroup limit and sizes the heap to about half of it, which I measured as 259 MB for a 512 MB container, but buffers and native memory live outside the heap, so I set max-old-space-size with headroom; a container that exceeds the limit is OOM-killed with exit 137 and no stack trace. I expose a cheap liveness endpoint and a readiness endpoint that checks dependencies and fails during shutdown, log JSON to stdout, and debug with docker logs, stats, exec and inspect's OOMKilled flag."
:::

::: links
Docker docs: Resource constraints | https://docs.docker.com/engine/containers/resource_constraints/
Kubernetes: Liveness, readiness and startup probes | https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/
:::
