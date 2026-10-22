@section CI/CD with Jenkins
@icon 🤵
@color #dc2626
@desc Jenkins from an interview angle: controller and agents, Jenkins vs GitHub Actions, declarative Jenkinsfiles (measured on a real Jenkins 2.580.1 pipeline: sequential vs parallel, failing tests, JUnit reports), pipelines for frontend, backend and full-stack apps with Docker agents, credentials and shared libraries, and how to keep any pipeline fast and reliable.

=== What is Jenkins, and how does it compare to GitHub Actions?
@p 3
@tags jenkins, ci-cd, github-actions, devops, comparison
@quick
- **Jenkins** is a self-hosted, open-source automation server: a **controller** (UI, configuration, scheduling, plugins, credentials) and **agents** (machines or containers that run the builds).
- Pipelines are code: a **Jenkinsfile** (Groovy, declarative or scripted) in the repo; a **multibranch pipeline** builds every branch and PR automatically.
- Huge **plugin** ecosystem (Git, Docker, Kubernetes agents, JUnit, Slack…), but plugins need updating and can conflict.
- **GitHub Actions**: hosted runners, YAML, marketplace actions, zero servers to run, tightly tied to GitHub. **Jenkins**: any SCM, on-prem/air-gapped, full control, but you operate and secure it.
- Keep builds **off the controller** (0 executors there); run them on ephemeral agents (Docker/Kubernetes).

::: text 🧒 In simple words
GitHub Actions is like **renting a fully staffed kitchen** by the minute: easy, but it's their kitchen. Jenkins is **owning a restaurant kitchen**: you choose every appliance (plugins) and can cook anything, but you also clean, repair and secure it yourself.
:::

::: text 📖 Detailed answer
### Jenkins architecture
| Part | Job |
|---|---|
| Controller | web UI, job configuration, scheduling, plugin host, credential store, build history |
| Agent | runs the build steps; static VMs, Docker containers, or Kubernetes pods created per build |
| Executor | a build slot on an agent |
| Job types | Pipeline, **Multibranch Pipeline** (one job per branch/PR), Organization folder |
| Pipeline | Jenkinsfile: declarative (`pipeline { … }`) or scripted (`node { … }` Groovy) |
| Shared library | reusable Groovy steps (`vars/deployApp.groovy`) used by many repos |

### Jenkins vs GitHub Actions
| | GitHub Actions | Jenkins |
|---|---|---|
| Hosting | GitHub-hosted or self-hosted runners | you host the controller and agents |
| Config | YAML workflows | Groovy Jenkinsfile |
| Reuse | marketplace actions, reusable workflows | plugins, shared libraries |
| Secrets | repo/org/environment secrets, OIDC | Credentials plugin, `withCredentials` |
| Best when | code on GitHub, cloud deploys, small ops team | on-prem, regulated or air-gapped, many SCMs, complex legacy pipelines |
| Cost | per-minute (free tier) | servers and admin time |

### What interviewers want to hear
You can use both, you know the trade-off (managed vs control), and you know Jenkins hygiene: pipelines as code, no builds on the controller, ephemeral agents, plugins kept updated, credentials never printed.
:::

::: diagram Jenkins controller and agents
flowchart LR
  GIT["Git push / PR webhook"] --> CTRL["Jenkins controller (UI, scheduler, credentials)"]
  CTRL -->|"schedules"| A1["agent: Linux VM"]
  CTRL -->|"creates pod per build"| A2["agent: Kubernetes pod node:22"]
  A1 --> RES["results, JUnit, artifacts back to controller"]
  A2 --> RES
:::

::: image GitHub Actions vs Jenkins
/images/cicd/gha-vs-jenkins.svg
:::

::: text 🪜 Step by step
1. Run Jenkins (the `jenkins/jenkins:lts` image or a managed offering) with persistent `JENKINS_HOME`.
2. Install the Pipeline, Git, Docker/Kubernetes, JUnit and credentials plugins; set the controller to 0 executors.
3. Add agents (Docker cloud or Kubernetes plugin) so each build gets a clean environment.
4. Create a Multibranch Pipeline pointing to the repo; it finds the `Jenkinsfile` in each branch.
5. Add a webhook from GitHub/GitLab so pushes trigger builds immediately.
6. Store secrets as Jenkins credentials and read them with `withCredentials`.
:::

::: code bash Run Jenkins locally in Docker
docker run -d --name jenkins -p 127.0.0.1:8080:8080 -p 127.0.0.1:50000:50000 \
  -v jenkins_home:/var/jenkins_home jenkins/jenkins:lts-jdk21
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword   # first-login password
# plugins can be pre-installed in a custom image:
#   RUN jenkins-plugin-cli --plugins workflow-aggregator git junit docker-workflow
:::

::: code javascript Choose a CI tool from requirements (runnable)
// A small scoring helper to explain the trade-off in an interview, not a real product decision engine.
function chooseCi(req) {
  const reasons = [];
  let jenkins = 0, actions = 0;
  if (req.scm !== 'github') { jenkins += 3; reasons.push('code not on GitHub → Jenkins (any SCM)'); } else { actions += 2; reasons.push('code on GitHub → Actions integrates natively'); }
  if (req.airGapped) { jenkins += 5; reasons.push('air-gapped/on-prem → self-hosted Jenkins'); }
  if (req.opsTeam === 'small') { actions += 3; reasons.push('small ops team → no CI servers to run'); }
  if (req.legacyPipelines) { jenkins += 2; reasons.push('existing Jenkins pipelines/shared libraries → migration cost'); }
  if (req.cloudDeploys) { actions += 1; reasons.push('cloud deploys → OIDC and marketplace actions'); }
  return { pick: jenkins > actions ? 'Jenkins' : 'GitHub Actions', jenkins, actions, reasons };
}
const startup = chooseCi({ scm: 'github', opsTeam: 'small', cloudDeploys: true });
const bank = chooseCi({ scm: 'bitbucket-server', airGapped: true, legacyPipelines: true, opsTeam: 'platform' });
console.log('startup →', startup.pick, startup.reasons);
console.log('bank    →', bank.pick, bank.reasons);
console.log(startup.pick === 'GitHub Actions' && bank.pick === 'Jenkins' ? '✅ different constraints, different answer' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Running builds on the controller: one bad build can take down Jenkins and read its secrets.
- Configuring jobs only through the UI ("snowflake" jobs nobody can review or restore).
- Never updating plugins: Jenkins plugin vulnerabilities are a common incident source.
- Exposing Jenkins to the internet with weak auth or anonymous read access.
- Saying "Jenkins is outdated": it's still widely used, especially in enterprises.
:::

::: understand
- Jenkins = self-hosted controller + agents running Jenkinsfiles; you gain control and flexibility and take on operating it.
:::

::: ask
- *"Who patches and backs up our CI server, and what happens to deploys if it's down?"*
:::

::: important ⭐ Say this in the interview
"Jenkins is a self-hosted automation server: a controller that holds configuration, plugins, credentials and scheduling, and agents that actually run builds, ideally ephemeral Docker or Kubernetes agents with zero executors on the controller. Pipelines are code in a Jenkinsfile, and a multibranch pipeline builds every branch and pull request. Compared to GitHub Actions, which is hosted, YAML-based and needs no servers, Jenkins works with any source control and in on-prem or air-gapped environments with full control, but we have to operate, update and secure it."
:::

::: links
Jenkins: Pipeline documentation | https://www.jenkins.io/doc/book/pipeline/
Jenkins: Architecting for scale | https://www.jenkins.io/doc/book/scaling/architecting-for-scale/
:::

=== How do you write a declarative Jenkinsfile? (agent, stages, steps, parallel, when, post)
@p 3
@tags jenkins, jenkinsfile, declarative-pipeline, ci-cd, parallel
@quick
- Skeleton: `pipeline { agent … ; options { … } ; environment { … } ; stages { stage('X') { steps { … } } } ; post { … } }`.
- **`parallel`** runs independent stages at once. Measured on Jenkins 2.580.1 (server + client monorepo): **13.1 s** sequential → **11.3 s** parallel → **3.3 s** with a warm npm cache.
- **`when`** makes stages conditional (`branch 'main'`, `changeset 'server/**'`, `expression { … }`); **`post`** runs `always` / `success` / `failure` / `unstable` actions.
- Publish test results with **`junit`**, keep build outputs with **`archiveArtifacts`**, and set **`timeout`**, **`timestamps()`**, **`disableConcurrentBuilds()`** in `options`.
- Measured failing build: JUnit showed **1 passed / 1 failed**, the stage went red, Archive and Deploy were **skipped due to earlier failure(s)**, and `post { failure }` ran.

::: text 🧒 In simple words
A Jenkinsfile is a **checklist with chapters**. Each stage is a chapter; steps are the lines in it. `parallel` lets two people work on two chapters at once, `when` says "only do this chapter on Fridays", and `post` is the note at the end: "whatever happened, tidy up and tell the team".
:::

::: text 📖 Detailed answer
### Building blocks
| Directive | Purpose |
|---|---|
| `agent any` / `agent { docker { image 'node:22' } }` / `agent { kubernetes { … } }` | where it runs |
| `options` | `timeout`, `timestamps()`, `buildDiscarder`, `disableConcurrentBuilds()`, `retry` |
| `environment` | env vars; `credentials('id')` binds a secret |
| `parameters` | build inputs (`string`, `booleanParam`, `choice`) |
| `triggers` | `cron`, `pollSCM` (prefer webhooks) |
| `stages` / `stage` / `steps` | the work: `sh`, `dir`, `echo`, `junit`, `archiveArtifacts`, `stash` |
| `parallel` | run nested stages at the same time |
| `when` | conditions: `branch`, `changeset`, `environment`, `expression`, `beforeAgent true` |
| `input` | wait for a manual approval |
| `post` | `always`, `success`, `failure`, `unstable`, `changed`, `cleanup` |

### Measured run (Jenkins 2.580.1 in Docker, real Node 22 builds)
| Pipeline | Duration | Notes |
|---|---|---|
| install + build/test in sequence | 13.1 s | server deps 3.6 s, client deps 6.9 s |
| same stages in `parallel` | 11.3 s | both installs took 4.5 s side by side |
| parallel, npm cache warm in the workspace | **3.3 s** | `npm ci` ≈ 0.9 s each |
| one failing assertion | FAILED in 4.0 s | JUnit 1/1, Archive + Deploy skipped, `post { failure }` ran |

Declarative is preferred over scripted: it's validated before running, readable, and supports the Blue Ocean / stage view. Use `script { }` blocks only for small bits of logic.
:::

::: diagram The measured pipeline
flowchart LR
  CO["Checkout SCM"] --> INST{"Install (parallel)"}
  INST --> SD["server deps"]
  INST --> CD["client deps"]
  SD --> BT{"Build and test (parallel)"}
  CD --> BT
  BT --> SV["server: tsc + node --test → JUnit"]
  BT --> CL["client: vite build"]
  SV --> AR["Archive dist"]
  CL --> AR
  AR --> DEP["Deploy (when main)"]
  DEP --> POST["post: success / failure"]
:::

::: image Jenkins controller, agents and the measured pipeline
/images/cicd/jenkins.svg
:::

::: text 🪜 Step by step
1. Start with `pipeline { agent any; stages { … } }` and one `sh 'npm ci'` stage.
2. Add `options { timeout(…); timestamps(); disableConcurrentBuilds() }`.
3. Split install/test into `parallel` stages for independent apps.
4. Publish test results with `junit` in `post { always { … } }` so they appear even when tests fail.
5. `archiveArtifacts` the build output; gate deploy with `when { branch 'main' }` (multibranch) or an expression.
6. Add `post { failure { … } }` to notify the team; validate the file with the declarative linter before committing.
:::

::: code text Jenkinsfile: the pipeline that was measured
pipeline {
  agent any
  options {
    timestamps()
    timeout(time: 15, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }
  environment {
    CI = 'true'
    npm_config_cache = "${WORKSPACE}/.npm"
  }
  stages {
    stage('Install') {
      parallel {
        stage('server deps') { steps { dir('server') { sh 'npm ci --no-audit --no-fund' } } }
        stage('client deps') { steps { dir('client') { sh 'npm ci --no-audit --no-fund' } } }
      }
    }
    stage('Build & test') {
      parallel {
        stage('server') {
          steps { dir('server') { sh 'npx tsc -p . && node --test --test-reporter=junit --test-reporter-destination=test-results.xml "test/**/*.test.js"' } }
          post { always { junit 'server/test-results.xml' } }
        }
        stage('client') { steps { dir('client') { sh 'npm run build' } } }
      }
    }
    stage('Archive') {
      steps { archiveArtifacts artifacts: 'client/dist/**', fingerprint: true }
    }
    stage('Deploy') {
      when { expression { env.GIT_BRANCH == 'origin/main' } }
      steps { echo "deploying build ${env.BUILD_NUMBER}" }
    }
  }
  post {
    success { echo 'pipeline succeeded' }
    failure { echo 'pipeline failed: notify the team' }
  }
}
:::

::: code bash Validate a Jenkinsfile and trigger a build from the command line
# declarative linter (needs a Jenkins URL and an API token)
curl -s -u "$JENKINS_USER:$JENKINS_TOKEN" -X POST -F "jenkinsfile=<Jenkinsfile" "$JENKINS_URL/pipeline-model-converter/validate"
# trigger a job and read the stage timings
curl -s -u "$JENKINS_USER:$JENKINS_TOKEN" -X POST "$JENKINS_URL/job/shop/job/main/build"
curl -s -u "$JENKINS_USER:$JENKINS_TOKEN" "$JENKINS_URL/job/shop/job/main/lastBuild/wfapi/describe"
:::

::: code javascript Simulate declarative semantics: parallel, skip after failure, post (runnable)
// Models how Jenkins marks stages: a failure skips later stages, `post` blocks still run.
async function runDeclarative(def) {
  const result = { stages: {}, status: 'SUCCESS', post: [] };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function runStage(s) {
    if (result.status === 'FAILURE') { result.stages[s.name] = 'SKIPPED (earlier failure)'; return; }
    if (s.when && !s.when()) { result.stages[s.name] = 'SKIPPED (when)'; return; }
    if (s.parallel) { await Promise.all(s.parallel.map(runStage)); result.stages[s.name] = result.status === 'FAILURE' ? 'FAILED' : 'SUCCESS'; return; }
    await wait(s.ms || 1);
    if (s.fail) { result.stages[s.name] = 'FAILED'; result.status = 'FAILURE'; } else result.stages[s.name] = 'SUCCESS';
  }
  const t = Date.now();
  for (const s of def.stages) await runStage(s);
  result.ms = Date.now() - t;
  result.post.push('always: junit');
  result.post.push(result.status === 'SUCCESS' ? 'success: done' : 'failure: notify the team');
  return result;
}
const branch = 'main';
const stages = (fail) => [
  { name: 'Install', parallel: [{ name: 'server deps', ms: 40 }, { name: 'client deps', ms: 40 }] },
  { name: 'Build & test', parallel: [{ name: 'server', ms: 10, fail }, { name: 'client', ms: 15 }] },
  { name: 'Archive' },
  { name: 'Deploy', when: () => branch === 'main' },
];
(async () => {
  const ok = await runDeclarative({ stages: stages(false) });
  const bad = await runDeclarative({ stages: stages(true) });
  console.log('green:', ok.stages, ok.post);
  console.log('red  :', bad.stages, bad.post);
  console.log(ok.ms < 75 ? `✅ parallel installs took ~${ok.ms} ms, not 80+` : '❌ FAIL');
  console.log(bad.stages.Deploy.startsWith('SKIPPED') && bad.post.includes('failure: notify the team') ? '✅ failure skips Archive/Deploy and still runs post' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Publishing JUnit only on success: you lose the report exactly when you need it (use `post { always }`).
- No `timeout`: a hung test holds an executor forever.
- Huge `script { }` blocks of Groovy: move logic to shell scripts or a shared library.
- `sh "echo ${env.SECRET}"` with double-quoted Groovy interpolation: the secret ends up in the command line; use single quotes and let the shell read the env var.
- Parallel stages writing to the same directory or port.
:::

::: understand
- Declarative Jenkinsfile = agent + options + stages(steps) + post; parallelise independent work and always publish test reports.
:::

::: ask
- *"Which stages are independent and could run in parallel, and does a failure still publish the report and notify someone?"*
:::

::: important ⭐ Say this in the interview
"A declarative Jenkinsfile has a pipeline block with an agent, options like timeout, timestamps and disableConcurrentBuilds, an environment, stages with steps, and a post section for always, success and failure. I run independent work in parallel: on a real Jenkins pipeline for a server and client monorepo that took 13.1 seconds sequentially, 11.3 in parallel and 3.3 with a warm npm cache. Tests publish JUnit in post always; when a test failed, the report showed one failure, archive and deploy were skipped automatically and the failure post block notified the team. Deploys are gated with when on the main branch."
:::

::: links
Jenkins: Pipeline syntax | https://www.jenkins.io/doc/book/pipeline/syntax/
Jenkins: Using a Jenkinsfile | https://www.jenkins.io/doc/book/pipeline/jenkinsfile/
:::

=== How do you build Jenkins pipelines for frontend, backend and full-stack apps? (Docker agents, credentials, shared libraries)
@p 2
@tags jenkins, docker, credentials, shared-library, fullstack, multibranch
@quick
- Run each stage in a **Docker agent** (`agent { docker { image 'node:22-alpine' } }`) or a Kubernetes pod: clean, versioned tools per build, nothing installed on the agent.
- **Frontend**: `npm ci` → lint → test → `vite build` → `archiveArtifacts`/`stash` → deploy to S3/CDN with `withCredentials` or an instance role.
- **Backend**: tests against a real DB (sidecar container or `docker compose`), `docker build` once, push `api:${GIT_COMMIT[0..6]}`, deploy that tag, then smoke test.
- **Full-stack**: `when { changeset 'client/**' }` per app, `stash`/`unstash` to move files between agents, `input` for production approval, `lock` to serialise deploys.
- **Shared libraries** (`@Library('ci-lib') _`) turn common steps into one-liners like `nodeCi(dir: 'client')` across many repos.

::: text 🧒 In simple words
Docker agents are **disposable workbenches**: every build gets a fresh one with exactly the right tools, then it's thrown away. Credentials are a **locked drawer** Jenkins opens only for the steps that need the key. A shared library is the **company handbook**: every team follows the same build recipe instead of writing their own.
:::

::: text 📖 Detailed answer
### Pieces you'll use
| Feature | Example | Why |
|---|---|---|
| Docker agent | `agent { docker { image 'node:22-alpine'; args '-v $HOME/.npm:/root/.npm' } }` | reproducible tools, cached npm |
| Kubernetes agent | pod template with `node`, `docker`/`kaniko` containers | scale agents on demand |
| Credentials | `withCredentials([string(credentialsId: 'npm-token', variable: 'NPM_TOKEN')])` | masked in logs, scoped to the block |
| stash / unstash | `stash includes: 'client/dist/**', name: 'web'` | move files between agents/stages |
| changeset | `when { changeset 'server/**' }` | build only what changed |
| input | `input message: 'Deploy to production?'` | manual approval (continuous delivery) |
| lock | `lock('prod-deploy') { … }` (Lockable Resources plugin) | one deploy at a time |
| Shared library | `vars/nodeCi.groovy` | DRY across repositories |

### Typical full-stack flow
1. Parallel: `client` (lint, test, build, stash) and `server` (tests with Postgres, build image).
2. Integration: `docker compose up -d --wait`, Playwright e2e, `docker compose down`.
3. On `main`: push the image, deploy to staging, smoke test.
4. `input` approval, then production with the same tag, inside a `lock`.
:::

::: diagram Full-stack Jenkins pipeline
flowchart TD
  START["webhook: push to main"] --> P{"parallel"}
  P --> FE["client: docker agent node:22 → lint, test, vite build → stash"]
  P --> BE["server: tests + Postgres sidecar → docker build api:sha"]
  FE --> E2E["e2e: compose up --wait + Playwright"]
  BE --> E2E
  E2E --> STG["deploy staging + smoke test"]
  STG --> APP["input: approve production?"]
  APP --> PROD["lock prod: deploy same tag"]
:::

::: chart bar Measured Jenkins pipeline duration (seconds)
run,seconds
stages in sequence,13.1
install and test in parallel,11.3
parallel with warm npm cache,3.3
failing test (stops early),4.0
:::

::: text 🪜 Step by step
1. Choose agents: Docker agents per stage, or a Kubernetes pod template.
2. Store tokens/keys as Jenkins credentials; reference them only inside `withCredentials`.
3. Build frontend and backend in parallel; `stash` artifacts needed later.
4. Run integration/e2e against the real stack.
5. Gate production with `when { branch 'main' }`, `input`, and `lock`.
6. Extract repeated steps into a shared library once two or more repos copy them.
:::

::: code text Jenkinsfile: full-stack with Docker agents, credentials and approval
@Library('ci-lib') _
pipeline {
  agent none
  options { timeout(time: 30, unit: 'MINUTES'); timestamps() }
  environment { IMAGE = "ghcr.io/acme/api:${env.GIT_COMMIT.take(7)}" }
  stages {
    stage('Build') {
      parallel {
        stage('client') {
          when { changeset 'client/**' }
          agent { docker { image 'node:22-alpine'; args '-v npm-cache:/root/.npm' } }
          steps {
            dir('client') { sh 'npm ci && npm run lint && npm test -- --run && npm run build' }
            stash includes: 'client/dist/**', name: 'web'
          }
        }
        stage('server') {
          agent { label 'docker' }
          steps {
            sh 'docker compose -f ci/compose.test.yaml up -d --wait'
            sh 'docker compose -f ci/compose.test.yaml run --rm api-test npm test'
            sh 'docker build -t $IMAGE server'
          }
          post { always { sh 'docker compose -f ci/compose.test.yaml down -v' } }
        }
      }
    }
    stage('Push image') {
      when { branch 'main' }
      agent { label 'docker' }
      steps {
        withCredentials([usernamePassword(credentialsId: 'ghcr', usernameVariable: 'U', passwordVariable: 'P')]) {
          sh 'echo "$P" | docker login ghcr.io -u "$U" --password-stdin && docker push $IMAGE'
        }
      }
    }
    stage('Production') {
      when { branch 'main' }
      steps {
        input message: "Deploy ${env.IMAGE} to production?"
        lock('prod-deploy') { deployApp(env: 'production', image: env.IMAGE) }
      }
    }
  }
  post { failure { slackSend channel: '#deploys', message: "❗ ${env.JOB_NAME} #${env.BUILD_NUMBER} failed" } }
}
:::

::: code text Shared library step: vars/deployApp.groovy
def call(Map cfg) {
  echo "deploying ${cfg.image} to ${cfg.env}"
  withCredentials([file(credentialsId: "kubeconfig-${cfg.env}", variable: 'KUBECONFIG')]) {
    sh "kubectl set image deployment/api api=${cfg.image} && kubectl rollout status deployment/api --timeout=5m"
  }
}
:::

::: code javascript Mask secrets in build logs, like Jenkins credentials binding (runnable)
// Jenkins replaces bound secret values with **** in console output. A minimal version of that idea.
function maskingLogger(secrets) {
  const values = secrets.filter((s) => s && s.length >= 4).sort((a, b) => b.length - a.length);
  const lines = [];
  return { log: (msg) => { let out = String(msg); for (const v of values) out = out.split(v).join('****'); lines.push(out); }, lines };
}
const token = 'ghp_example0123456789';
const logger = maskingLogger([token, 'abc']);
logger.log(`docker login -u ci -p ${token}`);
logger.log('pushing ghcr.io/acme/api:3f2a1c9');
logger.log(`retrying with ${token.slice(0, 8)}…`);
logger.lines.forEach((l) => console.log(l));
console.log(!logger.lines[0].includes(token) ? '✅ full secret masked' : '❌ FAIL');
console.log(logger.lines[2].includes('ghp_exam') ? '✅ but fragments are NOT masked: never print or transform secrets' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Installing Node, Docker and tools by hand on agents: builds drift and break when someone upgrades.
- Groovy string interpolation of secrets (`sh "… ${PASSWORD}"`): use single-quoted shell strings.
- Rebuilding the image in the production stage instead of promoting the tested tag.
- No `lock` on deploy stages: two builds deploy at once.
- Copy-pasting the same 200-line Jenkinsfile across 30 repos instead of a shared library.
:::

::: understand
- Ephemeral Docker/Kubernetes agents, credentials scoped with `withCredentials`, build in parallel, promote one artifact with approval and a lock.
:::

::: ask
- *"If two teams need the same deploy step, where does it live?"* In a shared library.
:::

::: important ⭐ Say this in the interview
"I run every stage in a Docker or Kubernetes agent so tools are versioned and builds are clean. The frontend and backend build in parallel: the client stage lints, tests, builds and stashes dist; the server stage runs tests against a real Postgres with docker compose and builds one image tagged with the commit. Secrets come from Jenkins credentials inside withCredentials with single-quoted shell commands so they aren't interpolated. On main the image is pushed, deployed to staging and smoke-tested, then an input approval and a lock guard the production deploy of the same tag. Common steps live in a shared library."
:::

::: links
Jenkins: Using Docker with Pipeline | https://www.jenkins.io/doc/book/pipeline/docker/
Jenkins: Extending with Shared Libraries | https://www.jenkins.io/doc/book/pipeline/shared-libraries/
:::

=== How do you make CI pipelines fast and reliable? (caching, parallelism, flaky tests, artifacts)
@p 2
@tags ci-cd, performance, flaky-tests, caching, reliability
@quick
- Measure first: per-stage timings (Jenkins stage view, Actions job summaries). Optimise the **critical path**, not the total.
- **Cache** dependencies keyed by the lockfile (measured `npm ci` 10.8 s → 2.1 s; Jenkins 4.5 s → 0.9 s per app) and Docker layers (BuildKit cache).
- **Parallelise** independent jobs, **shard** long test suites (`--shard=1/4`), and run only **affected** projects in monorepos.
- **Flaky tests**: detect (retry data), quarantine, fix the cause (time, order, shared state, network). Never "re-run until green" as a habit.
- **Reliability**: pinned versions, `timeout`s, idempotent deploy steps, artifacts promoted (not rebuilt), and notifications that reach the owner.

::: text 🧒 In simple words
A pipeline is a **morning routine**. To get out faster you prepare things the night before (cache), do two things at once (parallel), and skip what you don't need today (affected only). A **flaky test** is an alarm clock that sometimes doesn't ring: you don't just hit it harder, you replace the battery.
:::

::: text 📖 Detailed answer
### Speed levers
| Lever | Typical win | Example |
|---|---|---|
| dependency cache | 3–5× faster installs | `setup-node cache: npm`, `npm_config_cache` in the workspace |
| Docker layer cache | rebuilds in seconds | `cache-from/to: type=gha`, registry cache |
| parallel jobs | wall time = slowest branch | lint ‖ test ‖ build |
| test sharding | N× for long suites | Playwright `--shard=2/4`, Jest `--shard` |
| affected only | skip unchanged apps | path filters, Nx/Turborepo `affected` |
| fail fast | stop wasting minutes | lint before e2e, `fail-fast` in matrices when appropriate |
| bigger runners | CPU-bound builds | larger runners or self-hosted agents |

### Flaky tests: causes and fixes
| Cause | Fix |
|---|---|
| real time / timezones | fake timers, fixed clock, UTC |
| test order / shared state | isolate data per test, reset DB, unique ids |
| waiting with `sleep` | wait for a condition (Playwright auto-waits, `expect.poll`) |
| network to third parties | mock at the boundary (MSW, nock), contract tests |
| resource contention | fewer workers, separate ports/DBs per worker |

Track flakiness (a test that both passed and failed on the same commit), quarantine it with an owner and a deadline, and fix it.

### Reliability
- Pin tool and action versions; lockfiles committed.
- Timeouts on every job/stage.
- Deploy steps idempotent (re-running sets the same tag).
- Artifacts promoted, never rebuilt.
- Failure notifications to the author/owner, not a channel everybody ignores.
:::

::: diagram Critical path: what actually decides the pipeline time
flowchart LR
  I["install 2 s (cached)"] --> L["lint 20 s"]
  I --> U["unit 60 s"]
  I --> B["build 40 s"]
  U --> E["e2e 4 shards × 90 s in parallel"]
  B --> E
  L --> D["deploy"]
  E --> D
:::

::: chart bar Measured: effect of caching and parallelism (seconds)
case,seconds
npm ci client no cache (GitHub-style),10.8
npm ci client warm cache,2.1
Jenkins sequential,13.1
Jenkins parallel,11.3
Jenkins parallel + warm cache,3.3
:::

::: text 🪜 Step by step
1. Collect stage timings for the last 20 runs; find the critical path.
2. Add dependency and Docker layer caching.
3. Parallelise independent work; shard the slowest test suite.
4. Run only affected apps on PRs; run everything on `main` or nightly.
5. Measure flakiness; quarantine and fix the worst offenders.
6. Add timeouts, pin versions, and alert owners on red `main`.
:::

::: code javascript Find the critical path and detect flaky tests (runnable)
// 1) Longest path through a job graph = minimum pipeline time. 2) A test that passed AND failed on the same commit is flaky.
function criticalPath(jobs) {
  const memo = {};
  const finish = (j) => memo[j] ?? (memo[j] = jobs[j].s + Math.max(0, ...(jobs[j].needs || []).map(finish)));
  const end = Object.keys(jobs).reduce((a, b) => (finish(a) >= finish(b) ? a : b));
  const path = [end];
  let cur = end;
  while ((jobs[cur].needs || []).length) { cur = jobs[cur].needs.reduce((a, b) => (finish(a) >= finish(b) ? a : b)); path.unshift(cur); }
  return { seconds: finish(end), path };
}
const jobs = { install: { s: 2 }, lint: { s: 20, needs: ['install'] }, unit: { s: 60, needs: ['install'] }, build: { s: 40, needs: ['install'] }, e2e: { s: 360, needs: ['unit', 'build'] }, deploy: { s: 30, needs: ['lint', 'e2e'] } };
const before = criticalPath(jobs);
const after = criticalPath({ ...jobs, e2e: { s: 90, needs: ['unit', 'build'] } }); // 4 shards
console.log('before:', before.path.join(' → '), before.seconds + ' s');
console.log('after sharding e2e ×4:', after.seconds + ' s');
console.log(before.seconds === 452 && after.seconds === 182 ? '✅ speeding up lint would change nothing; e2e was the critical path' : '❌ FAIL');
function flaky(runs) {
  const byKey = new Map();
  for (const r of runs) { const k = r.commit + '|' + r.test; byKey.set(k, (byKey.get(k) || new Set()).add(r.result)); }
  return [...new Set([...byKey].filter(([, s]) => s.size > 1).map(([k]) => k.split('|')[1]))];
}
const runs = [
  { commit: 'a1', test: 'checkout e2e', result: 'fail' }, { commit: 'a1', test: 'checkout e2e', result: 'pass' },
  { commit: 'a1', test: 'pricing', result: 'pass' }, { commit: 'b2', test: 'pricing', result: 'fail' }, { commit: 'b2', test: 'pricing', result: 'fail' },
];
console.log('flaky:', flaky(runs));
console.log(JSON.stringify(flaky(runs)) === '["checkout e2e"]' ? '✅ pricing failing consistently on b2 is a real bug, not flakiness' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Optimising a stage that isn't on the critical path.
- Caching `node_modules` across Node versions or OSes (cache the npm download cache, keyed by lockfile + OS + Node version).
- Automatic retries that hide flaky tests forever.
- Sharding tests that share one database without isolation.
- Nobody owning red builds on `main`.
:::

::: understand
- Fast = cache + parallel + only what changed along the critical path; reliable = deterministic tests, pinned versions, timeouts, promoted artifacts.
:::

::: ask
- *"Which single job, if it were twice as fast, would make the whole pipeline faster?"*
:::

::: important ⭐ Say this in the interview
"I start from stage timings and optimise the critical path. Dependency caching keyed by the lockfile took npm ci from 10.8 to 2.1 seconds, and in Jenkins parallel stages plus a warm cache took a pipeline from 13.1 to 3.3 seconds. Independent jobs run in parallel, slow suites are sharded, and monorepos build only affected apps on PRs. Flaky tests are detected as pass and fail on the same commit, quarantined with an owner and fixed at the cause, usually time, shared state or real network calls. For reliability I pin versions, set timeouts, promote the same artifact and make sure failures reach the owner."
:::

::: links
GitHub Docs: Caching dependencies | https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching
Playwright: Sharding | https://playwright.dev/docs/test-sharding
:::
