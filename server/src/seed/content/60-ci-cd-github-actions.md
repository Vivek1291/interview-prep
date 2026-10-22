@section CI/CD with GitHub Actions
@icon 🔁
@color #22c55e
@desc Continuous integration and delivery from an interview angle: what CI/CD is and what a good pipeline looks like (measured dependency cache), GitHub Actions concepts (workflows, jobs, runners, matrix, cache, artifacts, secrets, validated with actionlint), real pipelines for frontend, backend and full-stack monorepos, and deployment strategies with safe database migrations and rollbacks.

=== What is CI/CD, and what does a good pipeline look like?
@p 3
@tags ci-cd, devops, pipeline, continuous-integration, continuous-delivery
@quick
- **CI (continuous integration)**: every push/PR is automatically installed, linted, type-checked, tested and built, so problems surface in minutes, not at release time.
- **Continuous delivery**: every green build of `main` is **deployable** (a human clicks deploy). **Continuous deployment**: it deploys automatically.
- **Build once, promote the same artifact** (image tagged with the git SHA) through staging → production. Never rebuild per environment.
- **Fail fast**: cheapest checks first (lint, types, unit), slow ones later (integration, e2e), and run independent jobs in parallel.
- Cache dependencies: measured `npm ci` for this app's client **10.8 s → 2.1 s** with the npm cache restored.

::: text 🧒 In simple words
CI is a **robot reviewer** that checks every change the moment you push it: "does it build? do the tests pass?" CD is the **delivery van** that takes the approved package to customers. The robot catches problems while they're small, and the van always delivers the exact package the robot approved.
:::

::: text 📖 Detailed answer
### The three terms
| Term | Means | Trigger to production |
|---|---|---|
| Continuous Integration | merge small changes often; every change is built and tested automatically | none |
| Continuous Delivery | `main` is always releasable; deploy is one click | a person |
| Continuous Deployment | every green `main` goes to production automatically | the pipeline |

### A typical pipeline
| Stage | Examples | Why here |
|---|---|---|
| install | `npm ci` with cache | everything needs it |
| static checks | ESLint, Prettier, `tsc --noEmit` | seconds; catches most mistakes |
| tests | unit, integration (real DB in a service container) | correctness |
| build | `vite build`, `docker build`, push image `api:<sha>` | one artifact |
| deploy staging | apply the artifact | real environment |
| e2e / smoke | Playwright, `curl /healthz` | user flows |
| deploy production | same artifact, approval or automatic, canary | release |

### Principles interviewers listen for
- **Trunk-based development**: short-lived branches, small PRs, feature flags for unfinished work.
- **Main is always green**: a red build is fixed (or reverted) first.
- **Reproducible**: lockfiles, pinned tool versions, pinned action versions.
- **Fast**: under ~10 minutes for PR feedback; cache, parallelise, run only affected parts.
- **Secure**: least-privilege tokens, OIDC to the cloud instead of long-lived keys, protected environments.
- **Observable deploys**: every deploy is tagged, and you can roll back by redeploying the previous tag.
:::

::: diagram Build once, promote everywhere
flowchart LR
  PR["pull request"] --> CI["CI: lint, types, tests, build"]
  CI -->|"merge"| MAIN["main"]
  MAIN --> IMG["image api:3f2a1c9 pushed once"]
  IMG --> STG["staging"]
  STG -->|"smoke + e2e green"| PROD["production (approval or auto)"]
  PROD -.->|"rollback = previous tag"| IMG
:::

::: image A CI/CD pipeline and the measured effect of a dependency cache
/images/cicd/pipeline.svg
:::

::: text 🪜 Step by step
1. On every PR: install (cached) → lint + type-check → unit tests → integration tests → build.
2. Make the PR merge require those checks (branch protection / rulesets).
3. On merge to `main`: build the artifact once, tag it with the commit SHA, push it.
4. Deploy that tag to staging automatically; run smoke and e2e tests.
5. Promote the same tag to production (manual approval = delivery, automatic = deployment).
6. Watch error rate and latency after the deploy; roll back by redeploying the previous tag.
:::

::: code yaml A minimal CI workflow (.github/workflows/ci.yml)
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build
:::

::: code javascript A pipeline runner: stages in order, stop on first failure (runnable)
// What every CI system does at its core: run steps in order, stop at the first failure, report timings.
async function runPipeline(stages) {
  const report = [];
  for (const s of stages) {
    const t = Date.now();
    try { await s.run(); report.push({ stage: s.name, status: 'passed', ms: Date.now() - t }); }
    catch (e) {
      report.push({ stage: s.name, status: 'FAILED', error: e.message });
      for (const rest of stages.slice(stages.indexOf(s) + 1)) report.push({ stage: rest.name, status: 'skipped' });
      return { ok: false, report };
    }
  }
  return { ok: true, report };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stage = (name, ms, fail) => ({ name, run: async () => { await wait(ms); if (fail) throw new Error(fail); } });
(async () => {
  const green = await runPipeline([stage('install', 5), stage('lint', 2), stage('test', 5), stage('build', 3), stage('deploy', 1)]);
  const red = await runPipeline([stage('install', 5), stage('lint', 2), stage('test', 5, 'expected 2499, got 2500'), stage('build', 3), stage('deploy', 1)]);
  console.table(red.report);
  console.log(green.ok ? '✅ green pipeline reaches deploy' : '❌ FAIL');
  console.log(!red.ok && red.report.find((r) => r.stage === 'deploy').status === 'skipped' ? '✅ a failing test stops the pipeline before deploy' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Rebuilding the app separately for staging and production: you deploy something you didn't test.
- Long-lived feature branches merged once a month: that's not continuous integration.
- 40-minute pipelines: developers stop waiting for them and merge red.
- Flaky tests that everyone re-runs until green: quarantine and fix them.
- Saying CD means "continuous deployment" only; know the delivery vs deployment difference.
:::

::: understand
- CI = every change verified automatically; CD = the verified artifact is always ready to (or automatically does) ship.
:::

::: ask
- *"If this commit is bad, how fast do we find out, and how fast can we undo it?"*
:::

::: important ⭐ Say this in the interview
"CI means every push and pull request is automatically installed, linted, type-checked, tested and built, so integration problems show up in minutes. Continuous delivery means main is always releasable with a one-click deploy; continuous deployment ships every green build automatically. I build the artifact once, a Docker image tagged with the commit SHA, and promote that same artifact through staging to production, with cheap checks first, parallel jobs and dependency caching to keep feedback under ten minutes. Rollback is redeploying the previous tag."
:::

::: links
Martin Fowler: Continuous Integration | https://martinfowler.com/articles/continuousIntegration.html
GitHub Docs: Continuous integration | https://docs.github.com/en/actions/get-started/continuous-integration
:::

=== How does GitHub Actions work? (workflows, events, jobs, steps, runners, matrix, cache, artifacts, secrets)
@p 3
@tags github-actions, ci-cd, workflows, yaml, devops
@quick
- A **workflow** is a YAML file in `.github/workflows/`, triggered by **events** (`push`, `pull_request`, `schedule`, `workflow_dispatch`, `release`).
- A workflow has **jobs**; each job runs on a fresh **runner** VM (`runs-on: ubuntu-latest`), jobs run **in parallel** unless linked with `needs:`.
- A job has **steps**: `uses:` an action (`actions/checkout@v4`, `actions/setup-node@v4`) or `run:` a shell command. Steps share the job's filesystem; jobs don't (use **artifacts** or outputs).
- **Matrix** runs a job per combination (`node: [20, 22]`); **cache** (`setup-node` `cache: npm`) restores dependencies; **concurrency** cancels outdated runs.
- **Secrets** (`secrets.X`) and **vars** (`vars.X`) come from repo/org/environment settings; set least-privilege `permissions:`; validate workflows with **actionlint** (it caught 5 mistakes in a broken file).

::: text 🧒 In simple words
A workflow is a **recipe card** pinned in your repo. An event (like a push) is the doorbell that starts it. Each job is a **separate cook in a separate kitchen** (runner); steps are the instructions that cook follows. If cooks need to share something, they put it on the **pass-through shelf** (artifacts).
:::

::: text 📖 Detailed answer
### Building blocks
| Concept | Example | Notes |
|---|---|---|
| Event | `on: pull_request` with `paths: ['server/**']` | filters by branch, path, type |
| Job | `test:` with `runs-on: ubuntu-latest` | fresh VM; parallel by default |
| `needs` | `deploy: needs: test` | ordering + access to `needs.test.outputs` |
| Step | `uses: actions/setup-node@v4` / `run: npm test` | same VM, same workspace |
| Matrix | `strategy.matrix.node: [20, 22]` | one job per combination |
| Services | `services: postgres:` | sidecar containers for integration tests |
| Cache | `setup-node` with `cache: npm`, `actions/cache` | keyed by the lockfile hash |
| Artifacts | `upload-artifact` / `download-artifact` | pass files between jobs, keep reports |
| Environments | `environment: production` | approvals, per-environment secrets |
| Concurrency | `group: deploy-${{ github.ref }}` | cancel or queue overlapping runs |
| Expressions | `if: github.ref == 'refs/heads/main'` | contexts: github, env, vars, secrets, matrix, needs, steps |

### Secrets and permissions (the safe defaults)
- `permissions: contents: read` at the top; grant more per job (`packages: write`, `id-token: write`).
- Deploy to AWS/GCP/Azure with **OIDC** (`id-token: write` + a role to assume) instead of storing cloud keys.
- Secrets are masked in logs and not passed to workflows triggered from forks.
- Pin third-party actions to a version (or a commit SHA for strict supply-chain control).
- Don't put `${{ github.event.* }}` text (PR titles, branch names) straight into `run:` scripts; pass it through `env:`.

### Measured: actionlint on a broken workflow
| Mistake | actionlint said |
|---|---|
| `branchs: [main]` | unexpected key, expected `branches` |
| `node-versoin: 22` | input not defined in `actions/setup-node` |
| `needs: tests` | job `tests` does not exist |
| `${{ secret.AWS_KEY }}` | undefined variable `secret` (it's `secrets`) |
| PR title inside `run:` | potentially untrusted, pass it through an environment variable |

The four production workflows below passed with zero findings.
:::

::: diagram How a push becomes jobs
flowchart TD
  EV["push to main"] --> WF["workflow ci.yml"]
  WF --> J1["job lint (runner 1)"]
  WF --> J2["job test node 20 (runner 2)"]
  WF --> J3["job test node 22 (runner 3)"]
  J1 --> J4["job build (needs lint, test)"]
  J2 --> J4
  J3 --> J4
  J4 -->|"upload-artifact dist"| J5["job deploy (environment production)"]
:::

::: image GitHub Actions concepts and what actionlint caught
/images/cicd/gha-concepts.svg
:::

::: text 🪜 Step by step
1. Create `.github/workflows/ci.yml` with `on:` triggers.
2. Add a job with `runs-on`, `actions/checkout`, `actions/setup-node` (`cache: npm`).
3. Add `run:` steps: `npm ci`, lint, test, build.
4. Add a matrix if you support several Node versions; add `services:` for a database.
5. Add a deploy job with `needs:`, `if:` for `main`, and `environment: production`.
6. Set top-level `permissions`, `concurrency`, and run `actionlint` locally or in CI.
:::

::: code yaml Matrix, cache, artifacts, concurrency and outputs
name: build
on:
  pull_request:
  workflow_dispatch:
    inputs:
      debug:
        type: boolean
        default: false
concurrency:
  group: build-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: [20, 22]
        os: [ubuntu-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm test -- --reporter=junit --outputFile=junit-${{ matrix.node }}.xml
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: junit-node-${{ matrix.node }}
          path: junit-${{ matrix.node }}.xml
  version:
    runs-on: ubuntu-latest
    outputs:
      tag: ${{ steps.meta.outputs.tag }}
    steps:
      - id: meta
        run: echo "tag=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
  report:
    needs: [test, version]
    runs-on: ubuntu-latest
    steps:
      - run: echo "built version ${{ needs.version.outputs.tag }}"
:::

::: code bash Validate workflows before pushing
# actionlint checks syntax, expressions, action inputs, job graph and shell scripts
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest -oneline
# run a workflow locally (approximation of GitHub's runners)
act pull_request -j test
:::

::: code javascript Expand a matrix and order jobs by needs (runnable)
// GitHub turns `strategy.matrix` into jobs and runs them level by level following `needs`.
function expandMatrix(matrix) {
  const { include = [], exclude = [], ...axes } = matrix;
  let combos = [{}];
  for (const [k, values] of Object.entries(axes)) combos = combos.flatMap((c) => values.map((v) => ({ ...c, [k]: v })));
  combos = combos.filter((c) => !exclude.some((e) => Object.entries(e).every(([k, v]) => c[k] === v)));
  return [...combos, ...include];
}
function levels(jobs) {
  const done = new Set(), out = [];
  while (done.size < Object.keys(jobs).length) {
    const ready = Object.keys(jobs).filter((j) => !done.has(j) && (jobs[j].needs || []).every((n) => done.has(n)));
    if (!ready.length) throw new Error('cycle or missing job in needs');
    ready.forEach((j) => done.add(j)); out.push(ready);
  }
  return out;
}
const combos = expandMatrix({ node: [20, 22], os: ['ubuntu', 'windows'], exclude: [{ node: 20, os: 'windows' }], include: [{ node: 24, os: 'ubuntu', experimental: true }] });
console.log(combos.map((c) => `${c.os}/node${c.node}${c.experimental ? '*' : ''}`).join(', '));
console.log(combos.length === 4 ? '✅ 2×2 matrix, minus 1 exclude, plus 1 include = 4 jobs' : '❌ FAIL');
const graph = levels({ lint: {}, test: {}, build: { needs: ['lint', 'test'] }, e2e: { needs: ['build'] }, deploy: { needs: ['build', 'e2e'] } });
console.log(graph.map((l) => l.join(' + ')).join('  →  '));
console.log(JSON.stringify(graph) === JSON.stringify([['lint', 'test'], ['build'], ['e2e'], ['deploy']]) ? '✅ independent jobs run in parallel, needs creates the order' : '❌ FAIL');
try { levels({ a: { needs: ['tests'] } }); console.log('❌ FAIL'); } catch (e) { console.log('✅ needs: tests → ' + e.message + ' (what actionlint reports before you push)'); }
:::

::: warning ⚠️ Common mistakes
- Expecting files from one job in another without artifacts: each job is a new VM.
- No `permissions:` block: the token gets broad default rights.
- Long-lived cloud keys in secrets instead of OIDC.
- Interpolating PR titles or branch names directly into `run:` scripts.
- `actions/some-action@main`: an unpinned action can change under you.
- No `concurrency`: two deploys to the same environment race.
:::

::: understand
- Event → workflow → parallel jobs on fresh runners → steps; connect jobs with `needs`, share files with artifacts, speed up with cache and matrix.
:::

::: ask
- *"Which jobs actually depend on each other, and which could run in parallel?"*
:::

::: important ⭐ Say this in the interview
"A GitHub Actions workflow is YAML in .github/workflows triggered by events like push, pull_request, schedule or workflow_dispatch. It contains jobs that run in parallel on fresh runners unless ordered with needs, and each job runs steps that either use an action or run shell commands. I use a matrix for Node versions, setup-node's npm cache, service containers for the database, artifacts to pass builds between jobs, environments with approvals for production, concurrency to cancel stale runs, least-privilege permissions and OIDC instead of stored cloud keys. I lint workflows with actionlint, which catches typos like branchs or a needs pointing at a job that doesn't exist."
:::

::: links
GitHub Docs: Workflow syntax | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
actionlint | https://github.com/rhysd/actionlint
:::

=== How would you build CI/CD pipelines for a frontend, a backend and a full-stack monorepo with GitHub Actions?
@p 3
@tags github-actions, ci-cd, frontend, backend, fullstack, monorepo, docker
@quick
- **Frontend (React/Vite)**: `npm ci` → lint → unit tests → `vite build` → upload `dist` → deploy to S3 + CloudFront (hashed assets `immutable`, `index.html` `no-cache`) or Vercel/Netlify; preview deploys per PR.
- **Backend (Node API)**: matrix of Node versions, **service containers** (Postgres, Redis) for integration tests → build the **Docker image once**, push `ghcr.io/…/api:<sha>` with BuildKit cache → deploy that tag (ECS, Kubernetes, `docker compose pull`).
- **Full-stack monorepo**: a `changes` job (paths filter) decides what runs; client and server call one **reusable workflow** (`on: workflow_call`); e2e (`docker compose up --wait` + Playwright) runs when nothing failed.
- Production deploys use **environments** (approvals, per-environment secrets) and **OIDC** roles instead of stored cloud keys.
- All four workflows here were validated with actionlint (0 findings).

::: text 🧒 In simple words
Think of three assembly lines. The **frontend line** packs a box of static files and puts it on a shelf (CDN). The **backend line** builds a sealed engine (Docker image) and tests it with a real fuel tank (database). The **full-stack line** looks at what changed, runs only the lines that need it, then test-drives the whole car (e2e).
:::

::: text 📖 Detailed answer
### Frontend pipeline
| Step | Detail |
|---|---|
| Trigger | PRs and pushes touching `client/**` |
| Checks | `npm ci` (cached), ESLint, Vitest/RTL, `tsc`, `vite build` |
| Artifact | `dist/` uploaded, reused by the deploy job |
| Deploy | S3 sync with long cache for hashed files, `no-cache` for `index.html`, CloudFront invalidation of `/index.html` |
| Extras | preview URL per PR, Lighthouse/bundle-size budget, Playwright smoke test |

### Backend pipeline
| Step | Detail |
|---|---|
| Tests | matrix `node: [20, 22]`, `services:` Postgres + Redis with health options, real migrations |
| Image | `docker/build-push-action` with `cache-from/to: type=gha`, tag = short SHA |
| Deploy | update the service to that tag; run DB migrations as a separate step/job before the new code |
| Verify | smoke test `/healthz`, watch error rate; roll back = previous tag |

### Full-stack monorepo
| Problem | Solution |
|---|---|
| don't run everything for a README change | `dorny/paths-filter` → `needs.changes.outputs.client` |
| duplicated YAML for each app | reusable workflow with `inputs.directory` |
| shared API contracts | changes in `packages/contracts/**` trigger both apps |
| integration confidence | e2e job: `docker compose up -d --build --wait` + Playwright |
| skipped jobs blocking e2e | `if: always() && !contains(needs.*.result, 'failure')` |
| bigger repos | Nx/Turborepo `affected` commands + remote cache |
:::

::: diagram Monorepo pipeline
flowchart LR
  PR["PR"] --> CH["changes (paths filter)"]
  CH -->|"client changed"| C["client: reusable node-ci"]
  CH -->|"server changed"| S["server: reusable node-ci + services"]
  C --> E2E["e2e: compose up --wait + Playwright"]
  S --> E2E
  E2E -->|"main only"| DEP["deploy: S3/CloudFront + image to ECS"]
:::

::: image GitHub Actions for frontend, backend and full-stack
/images/cicd/gha-fullstack.svg
:::

::: text 🪜 Step by step
1. Split workflows by app (or one monorepo workflow with path filters).
2. Frontend: lint → test → build → upload `dist` → deploy job on `main` with OIDC → S3 + CloudFront.
3. Backend: matrix tests with service containers → image job pushes `api:<sha>` → deploy job with `environment: production`.
4. Monorepo: a `changes` job, a reusable `node-ci.yml`, an e2e job that tolerates skipped apps.
5. Protect `main`: required checks, required reviews.
6. Add `concurrency` to every deploy job so two deploys never overlap.
:::

::: code yaml frontend.yml: React app → S3 + CloudFront
name: frontend
on:
  pull_request:
    paths: ['client/**', '.github/workflows/frontend.yml']
  push:
    branches: [main]
    paths: ['client/**', '.github/workflows/frontend.yml']
concurrency:
  group: frontend-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  ci:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: client
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: client/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm test -- --run
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: client-dist
          path: client/dist
          retention-days: 7
  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: ci
    runs-on: ubuntu-latest
    environment: production
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: client-dist
          path: dist
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: eu-west-1
      - name: Upload hashed assets with long cache, then index.html with no-cache
        run: |
          aws s3 sync dist s3://${{ vars.SITE_BUCKET }} --delete --exclude index.html --cache-control "public,max-age=31536000,immutable"
          aws s3 cp dist/index.html s3://${{ vars.SITE_BUCKET }}/index.html --cache-control "no-cache"
          aws cloudfront create-invalidation --distribution-id ${{ vars.CF_DISTRIBUTION_ID }} --paths /index.html
:::

::: code yaml backend.yml: tests with Postgres + Redis, one image, deploy that tag
name: backend
on:
  pull_request:
    paths: ['server/**', '.github/workflows/backend.yml']
  push:
    branches: [main]
    paths: ['server/**', '.github/workflows/backend.yml']
concurrency:
  group: backend-${{ github.ref }}
  cancel-in-progress: true
permissions:
  contents: read
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    services:
      postgres:
        image: postgres:17
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: app_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 2s --health-timeout 2s --health-retries 20
      redis:
        image: redis:7
        ports: ['6379:6379']
        options: --health-cmd "redis-cli ping" --health-interval 2s --health-retries 20
    env:
      DATABASE_URL: postgres://postgres:test@localhost:5432/app_test
      REDIS_URL: redis://localhost:6379
    defaults:
      run:
        working-directory: server
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
          cache-dependency-path: server/package-lock.json
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm test
  image:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      tag: ${{ steps.meta.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository }}/api
          tags: type=sha,format=short
      - uses: docker/build-push-action@v6
        with:
          context: server
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
  deploy:
    needs: image
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy the new image tag
        env:
          TAG: ${{ needs.image.outputs.tag }}
        run: echo "deploying api:$TAG (kubectl set image / aws ecs update-service / ssh docker compose pull && up -d)"
:::

::: code yaml fullstack.yml + node-ci.yml: path filters and a reusable workflow
# .github/workflows/fullstack.yml
name: fullstack
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  changes:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: read
    outputs:
      client: ${{ steps.filter.outputs.client }}
      server: ${{ steps.filter.outputs.server }}
    steps:
      - uses: actions/checkout@v4
      - id: filter
        uses: dorny/paths-filter@v3
        with:
          filters: |
            client: ['client/**', 'packages/contracts/**']
            server: ['server/**', 'packages/contracts/**']
  client:
    needs: changes
    if: needs.changes.outputs.client == 'true'
    uses: ./.github/workflows/node-ci.yml
    with:
      directory: client
  server:
    needs: changes
    if: needs.changes.outputs.server == 'true'
    uses: ./.github/workflows/node-ci.yml
    with:
      directory: server
  e2e:
    needs: [client, server]
    if: always() && !contains(needs.*.result, 'failure') && !contains(needs.*.result, 'cancelled')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker compose up -d --build --wait
      - run: npx playwright install --with-deps chromium && npx playwright test

# .github/workflows/node-ci.yml (reusable)
# on:
#   workflow_call:
#     inputs:
#       directory: { required: true, type: string }
# jobs:
#   ci:
#     runs-on: ubuntu-latest
#     defaults: { run: { working-directory: "${{ inputs.directory }}" } }
#     steps: checkout → setup-node (cache) → npm ci → lint → test → build
:::

::: code javascript Which apps run for a set of changed files? (runnable)
// Same logic as a paths filter: glob-ish prefixes per app; shared packages trigger every consumer.
const filters = { client: ['client/', 'packages/contracts/'], server: ['server/', 'packages/contracts/'], infra: ['infra/', '.github/workflows/'] };
function affected(changedFiles) {
  return Object.keys(filters).filter((app) => changedFiles.some((f) => filters[app].some((p) => f.startsWith(p))));
}
const cases = [
  [['client/src/App.jsx'], ['client']],
  [['server/src/orders.ts', 'server/test/orders.test.js'], ['server']],
  [['packages/contracts/order.schema.json'], ['client', 'server']],
  [['README.md'], []],
];
for (const [files, expected] of cases) {
  const got = affected(files);
  console.log(`${files.join(', ').padEnd(48)} → ${got.join(' + ') || '(nothing to build)'}`, JSON.stringify(got) === JSON.stringify(expected) ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- Deploying the frontend with `index.html` cached for a year: users keep loading old bundles.
- Mocking the database in "integration" tests when a service container costs seconds.
- Building separate images for staging and production.
- An e2e job with `needs: [client, server]` that is skipped whenever one app didn't change (use the `always() && !failure` condition).
- Running DB migrations from every app instance at startup in parallel instead of once per deploy.
:::

::: understand
- Frontend ships static files to a CDN; backend ships one tested image; a monorepo runs only what changed and tests the whole system end to end.
:::

::: ask
- *"What's the smallest set of jobs that gives us confidence for this particular change?"*
:::

::: important ⭐ Say this in the interview
"For a React frontend the pipeline runs npm ci with cache, lint, unit tests and the Vite build, uploads dist as an artifact, and on main deploys it to S3 and CloudFront through an OIDC role, with hashed assets cached immutably and index.html not cached. For a Node backend it runs a Node-version matrix with Postgres and Redis service containers, then builds the Docker image once with the BuildKit cache, pushes it tagged with the commit SHA and deploys that tag through a protected environment. In a monorepo a paths filter decides which apps run, both use one reusable workflow, and an end-to-end job brings the stack up with docker compose and runs Playwright."
:::

::: links
GitHub Docs: Reusing workflows | https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
GitHub Docs: Configuring OpenID Connect in Amazon Web Services | https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws
:::

=== What deployment strategies do you know, and how do you release and roll back safely? (rolling, blue-green, canary, feature flags, migrations)
@p 3
@tags deployment, blue-green, canary, rolling, feature-flags, migrations, rollback
@quick
- **Rolling**: replace instances a few at a time (Kubernetes default); both versions serve briefly, so they must be compatible.
- **Blue-green**: bring up a full new copy, switch traffic at once, keep the old one for instant rollback (costs double capacity during the switch).
- **Canary**: send 1% → 10% → 50% → 100% to the new version while watching error rate and p99; roll back automatically on regression.
- **Feature flags** separate **deploy** (code is on servers) from **release** (users see it); kill switches turn a feature off without a deploy.
- Database changes use **expand → migrate → contract** so old and new code both work; rollback = redeploy the previous image tag, never undo a destructive migration.

::: text 🧒 In simple words
Changing a plane's engine **in flight**: rolling swaps one engine at a time; blue-green builds a second plane and moves passengers over in one go; canary lets a few passengers try the new plane first; feature flags are seats you can switch on or off for certain passengers without landing.
:::

::: text 📖 Detailed answer
| Strategy | How | Pros | Cons |
|---|---|---|---|
| Recreate | stop old, start new | simple | downtime |
| Rolling | replace N at a time (`maxSurge`, `maxUnavailable`) | no extra capacity, default | mixed versions; slow rollback |
| Blue-green | full new environment, switch the load balancer | instant switch and rollback | double capacity, DB shared by both |
| Canary | small % of traffic first, increase while metrics are healthy | limits blast radius, data-driven | needs good metrics and routing |
| Feature flags | ship code off, enable per user/% | release without deploy, kill switch | flag debt, testing combinations |
| Shadow | copy real traffic to the new version, discard responses | test under real load | side effects must be disabled |

### Zero-downtime database migrations: expand and contract
Renaming `users.name` to `full_name`:
1. **Expand**: add `full_name` (nullable). Old code ignores it.
2. Deploy code that **writes both** columns and reads `full_name` with a fallback to `name`.
3. **Backfill** `full_name` in batches.
4. Deploy code that **only** uses `full_name`.
5. **Contract**: drop `name` in a later release.

Every step is compatible with the version before it, so rolling deploys and rollbacks are safe.

### Rollback
- Keep the last N image tags; rollback = deploy the previous tag (`kubectl rollout undo`, ECS previous task definition).
- Prefer **roll forward** for small fixes, but have a one-command rollback.
- Automate: canary analysis compares error rate/latency of the new version against the old one and aborts.
:::

::: diagram Canary rollout with automatic rollback
flowchart LR
  D["deploy v2 next to v1"] --> C1["1% traffic to v2"]
  C1 --> CHK{"error rate and p99 vs v1 ok?"}
  CHK -->|"yes"| C2["10% → 50% → 100%"]
  CHK -->|"no"| RB["route 100% to v1, alert"]
  C2 --> DONE["remove v1"]
:::

::: image Deployment strategies and safe migrations
/images/cicd/deploy-strategies.svg
:::

::: text 🪜 Step by step
1. Make the app safe for mixed versions: backward-compatible APIs and DB schema (expand/contract).
2. Choose the strategy: rolling by default, canary for risky or high-traffic services, blue-green when you need an instant switch.
3. Define health signals before the release: error rate, p99 latency, saturation, key business metric.
4. Roll out gradually; pause and compare against the old version.
5. Roll back automatically when signals degrade; keep the previous tag ready.
6. Ship unfinished or risky features behind flags, then clean up the flags.
:::

::: code yaml Kubernetes rolling update settings
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 6
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2            # up to 8 pods during the rollout
      maxUnavailable: 0      # never drop below 6 ready pods
  minReadySeconds: 10        # a new pod must stay ready 10 s before it counts
  revisionHistoryLimit: 10   # keep old ReplicaSets for kubectl rollout undo
  selector:
    matchLabels: { app: api }
  template:
    metadata:
      labels: { app: api }
    spec:
      containers:
        - name: api
          image: ghcr.io/acme/api:3f2a1c9
          readinessProbe:
            httpGet: { path: /readyz, port: 3000 }
:::

::: code javascript Canary analysis and percentage feature flags (runnable)
// 1) Compare the canary to the stable version and decide. 2) Deterministic % rollout for a feature flag.
function canaryDecision(stable, canary, { maxErrorRatio = 1.5, maxP99Ms = 50, minRequests = 500 } = {}) {
  if (canary.requests < minRequests) return 'wait';
  const errStable = stable.errors / stable.requests, errCanary = canary.errors / canary.requests;
  if (errCanary > Math.max(errStable * maxErrorRatio, 0.001)) return 'rollback: error rate';
  if (canary.p99 - stable.p99 > maxP99Ms) return 'rollback: latency';
  return 'promote';
}
const stable = { requests: 50000, errors: 40, p99: 180 };
console.log(canaryDecision(stable, { requests: 200, errors: 0, p99: 170 }));
console.log(canaryDecision(stable, { requests: 2000, errors: 9, p99: 190 }));
console.log(canaryDecision(stable, { requests: 2000, errors: 1, p99: 320 }));
console.log(canaryDecision(stable, { requests: 2000, errors: 1, p99: 185 }));
// feature flag: hash(userId + flag) → bucket 0..99, so a user always gets the same answer
function bucket(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % 100; }
const isOn = (flag, userId, percent) => bucket(flag + ':' + userId) < percent;
const users = Array.from({ length: 10000 }, (_, i) => 'user-' + i);
const on10 = users.filter((u) => isOn('new-checkout', u, 10)).length;
const stableAssignment = users.every((u) => isOn('new-checkout', u, 10) === isOn('new-checkout', u, 10));
const grows = users.filter((u) => isOn('new-checkout', u, 10)).every((u) => isOn('new-checkout', u, 50));
console.log(`10% rollout → ${on10} of 10000 users`);
console.log(on10 > 900 && on10 < 1100 && stableAssignment && grows ? '✅ ~10%, sticky per user, and users stay in when raised to 50%' : '❌ FAIL');
console.log(canaryDecision(stable, { requests: 2000, errors: 9, p99: 190 }).startsWith('rollback') ? '✅ canary with 5.6× the error rate is rolled back' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Renaming or dropping a column in the same deploy as the code change: the old pods still running crash.
- Blue-green with a schema change that the blue version can't read: rollback becomes impossible.
- Canary without metrics split by version: you can't tell which version is failing.
- Feature flags never removed: dead branches and untested combinations pile up.
- "Rollback" that means rebuilding an old commit: slow and not the same artifact.
:::

::: understand
- Release gradually, measure, and keep every step backward compatible so rolling back is just redeploying the previous artifact.
:::

::: ask
- *"If this release is bad, how many users notice, and how many seconds until we're back?"*
:::

::: important ⭐ Say this in the interview
"Rolling updates replace instances a few at a time and are the Kubernetes default, so versions must be compatible. Blue-green brings up a full new environment and switches traffic at once, giving instant rollback at the cost of double capacity. Canary sends a small percentage to the new version and promotes or rolls back automatically by comparing error rate and p99 against the stable version. Feature flags separate deploy from release and give kill switches. Database changes follow expand, migrate, contract so old and new code both work, and rollback is redeploying the previous image tag."
:::

::: links
Kubernetes: Rolling update deployment | https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-update-deployment
Martin Fowler: Blue-green deployment | https://martinfowler.com/bliki/BlueGreenDeployment.html
:::
