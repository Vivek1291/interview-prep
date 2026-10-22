@section Serverless & AWS for Node.js
@icon ⚡
@color #f59e0b
@desc Serverless and the AWS services a Node.js + React app uses, from an interview angle: how Lambda works and cold starts (measured init time: unbundled, bundled, lazy-loaded), writing production Lambda handlers (connection reuse, idempotency, SQS partial batch failures), serverless vs containers with a cost model, and a reference AWS architecture with infrastructure as code.

=== What is serverless, how does AWS Lambda work, and what is a cold start?
@p 3
@tags serverless, aws-lambda, cold-start, nodejs, aws
@quick
- **Serverless** = you deploy functions (or containers) and the cloud provisions, scales and patches the servers; you pay per request and per millisecond, and it **scales to zero**.
- **Lambda** runs your `handler(event, context)` in an **execution environment**; an event source (API Gateway, SQS, S3, EventBridge, schedules) invokes it.
- **Cold start** = a new environment: download code → start Node → run **init code** (top-level requires, SDK clients) → handler. **Warm** invocations reuse the environment and skip init.
- Measured locally (start + init + 1st call): **87 ms** unbundled (AWS SDK S3 + DynamoDB + zod), **85 ms** esbuild bundle, **54 ms** when lazy-loading only what's needed, vs 17 ms for bare Node.
- Reduce cold starts: small bundles, fewer dependencies, lazy imports, more memory (= more CPU), **provisioned concurrency** or SnapStart for latency-critical paths.

::: text 🧒 In simple words
Lambda is a **food truck that only appears when someone is hungry**. The first customer waits while the truck arrives and the grill heats up (cold start). The next customers in the queue get served immediately (warm). If nobody comes for a while, the truck leaves and you pay nothing.
:::

::: text 📖 Detailed answer
### Lambda lifecycle
| Phase | What happens | Billed? |
|---|---|---|
| Init (cold start only) | create the environment, load runtime, run top-level code | yes |
| Invoke | run `handler(event, context)` | yes, per ms |
| Freeze / reuse | environment kept for later events; globals survive | no |
| Shutdown | environment discarded after idle time | no |

One environment handles **one request at a time**. 100 concurrent requests = 100 environments (concurrency), each with its own cold start the first time.

### Measured: init cost of dependencies (Node 22, local, median of 9)
| Handler | Start + init + first call |
|---|---|
| bare `node` | 17 ms |
| top-level `require` of `@aws-sdk/client-s3`, `client-dynamodb`, `lib-dynamodb`, `zod` (41 MB `node_modules`, 1,487 files) | 87 ms |
| same code bundled + minified with esbuild (1.2 MB) | 85 ms |
| lazy-load only the DynamoDB client inside the handler | **54 ms** |

On a laptop disk the bundle barely helped; on Lambda the bundle also shrinks the package to download and unpack, so bundle **and** remove unused imports.

### Limits to remember
| Limit | Value |
|---|---|
| Max duration | 15 minutes |
| Memory | 128 MB – 10 GB (CPU scales with memory) |
| Sync payload | 6 MB request/response |
| `/tmp` storage | 512 MB default, up to 10 GB |
| Concurrency | account limit (default 1,000 per region), reserved/provisioned per function |
:::

::: diagram Cold vs warm invocations
sequenceDiagram
  participant GW as "API Gateway"
  participant L as "Lambda service"
  participant E as "execution environment"
  GW->>L: request 1
  L->>E: create env, start Node, run init code (cold)
  E-->>GW: response (init + handler time)
  GW->>L: request 2
  L->>E: reuse env (warm)
  E-->>GW: response (handler time only)
:::

::: image Lambda lifecycle and measured init time
/images/serverless/lambda-lifecycle.svg
:::

::: text 🪜 Step by step
1. Write `export const handler = async (event) => { … }` (or `exports.handler`).
2. Create SDK clients and DB connections **outside** the handler so warm invocations reuse them.
3. Bundle with esbuild (tree-shaking, minify), and import only the AWS SDK v3 clients you use.
4. Choose memory by measuring (more memory = more CPU = faster init and handler).
5. Connect an event source: API Gateway/Function URL for HTTP, SQS for queues, EventBridge for schedules.
6. Watch `Init Duration` in CloudWatch logs; use provisioned concurrency only where p99 matters.
:::

::: code javascript A Lambda handler: init once, handle many
// handler.mjs (Node.js 22 runtime)
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// init phase: runs once per cold start, reused by warm invocations
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.ORDERS_TABLE;

export const handler = async (event) => {
  const id = event.pathParameters?.id;
  if (!id) return { statusCode: 400, body: JSON.stringify({ error: 'id required' }) };
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id } }));
  return Item
    ? { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(Item) }
    : { statusCode: 404, body: JSON.stringify({ error: 'not found' }) };
};
:::

::: code javascript Simulate cold and warm invocations with concurrency (runnable)
// Each environment serves one request at a time; new environments pay the init cost.
function simulate(arrivalsMs, { initMs, handlerMs, idleTimeoutMs = 300000 }) {
  const envs = []; let cold = 0; const latencies = [];
  for (const t of arrivalsMs) {
    let env = envs.find((e) => e.freeAt <= t && t - e.freeAt < idleTimeoutMs);
    let latency = handlerMs;
    if (!env) { env = { freeAt: 0 }; envs.push(env); cold++; latency += initMs; }
    env.freeAt = t + latency; latencies.push(latency);
  }
  return { environments: envs.length, coldStarts: cold, maxLatency: Math.max(...latencies) };
}
const steady = Array.from({ length: 100 }, (_, i) => i * 100);                // 10 req/s, 40 ms each
const burst = Array.from({ length: 50 }, () => 0);                             // 50 requests at once
const a = simulate(steady, { initMs: 300, handlerMs: 40 });
const b = simulate(burst, { initMs: 300, handlerMs: 40 });
console.log('steady 10 req/s:', a);
console.log('burst of 50    :', b);
console.log(a.coldStarts === 4 ? '✅ steady traffic: 4 cold starts (requests arriving during the first 340 ms init), then 96 warm invocations' : '❌ FAIL');
console.log(b.coldStarts === 50 ? '✅ a burst needs 50 environments → 50 cold starts (provisioned concurrency helps here)' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Creating SDK clients or DB connections inside the handler: every call pays the setup.
- Importing the whole AWS SDK or huge libraries for one function.
- Assuming globals are shared between concurrent invocations (each environment has its own).
- Using Lambda for 20-minute jobs or long-lived WebSocket servers.
- Blaming cold starts without checking `Init Duration`; often the handler itself is slow.
:::

::: understand
- Lambda runs your handler in reusable environments; cold starts add init time, so keep init small and reuse what you create.
:::

::: ask
- *"How many cold starts does our traffic pattern actually cause, and how long is our Init Duration?"*
:::

::: important ⭐ Say this in the interview
"Serverless means the provider runs and scales the servers and we pay per request and per millisecond, scaling to zero. Lambda runs a handler in an execution environment that handles one request at a time; a cold start creates the environment, starts Node and runs our top-level init code, and warm invocations reuse it, so SDK clients and connections are created outside the handler. Measured locally, loading the S3, DynamoDB and zod modules added about 70 ms of init, and lazy-loading only what the handler needed cut it to 37. For latency-critical paths I bundle with esbuild, trim dependencies, tune memory and use provisioned concurrency."
:::

::: links
AWS Lambda: Execution environment lifecycle | https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html
AWS Lambda: Building with Node.js | https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html
:::

=== How do you write production-ready Lambda functions in Node.js? (connections, idempotency, SQS batches, timeouts)
@p 2
@tags aws-lambda, nodejs, sqs, idempotency, rds-proxy, serverless
@quick
- **Reuse** clients across invocations (module scope); for relational DBs use **RDS Proxy** or the Data API, because thousands of environments × a pool each can exhaust database connections.
- Event sources **retry** (SQS, async invokes), so handlers must be **idempotent**: store a processed id (DynamoDB conditional write) and skip duplicates.
- For **SQS** batches return `batchItemFailures` so only failed messages are retried; configure a **DLQ** and `maxReceiveCount`.
- Set the function timeout below the upstream timeout (API Gateway 29 s) and below the SQS **visibility timeout**; use `context.getRemainingTimeInMillis()` for long loops.
- Structured logs + metrics (Powertools for AWS Lambda), least-privilege IAM role per function, config from env/SSM/Secrets Manager.

::: text 🧒 In simple words
A Lambda handler is a **postal worker who may be handed the same letter twice**. A good worker writes down every letter number they've delivered and skips repeats (idempotency). If a bag of 10 letters has one bad address, they return just that one letter, not the whole bag (partial batch failure).
:::

::: text 📖 Detailed answer
### Production concerns
| Concern | Do |
|---|---|
| Connections | create clients outside the handler; SQL through RDS Proxy; keep pool size 1–2 per environment |
| Retries & duplicates | idempotency key (message id, order id) with a conditional write; at-least-once delivery is normal |
| SQS batches | `ReportBatchItemFailures` + return `{ batchItemFailures: [{ itemIdentifier }] }`; DLQ after N receives |
| Timeouts | function timeout < API Gateway 29 s; SQS visibility timeout ≥ 6 × function timeout |
| Config & secrets | env vars for config, Secrets Manager/SSM for secrets (cached in module scope) |
| Permissions | one IAM role per function with only the actions/resources it needs |
| Observability | JSON logs with request id, custom metrics (EMF), X-Ray/OpenTelemetry traces |
| Concurrency | reserved concurrency to protect downstream DBs; provisioned for latency |
| Packaging | esbuild bundle, AWS SDK v3 modular clients, layers only for shared native deps |

### Event source behaviour
| Source | Invocation | Retries |
|---|---|---|
| API Gateway / Function URL | sync | client decides |
| SQS | poll, batches | message returns after the visibility timeout until `maxReceiveCount` → DLQ |
| SNS / EventBridge / S3 | async | 2 retries by default, then on-failure destination/DLQ |
| Kinesis / DynamoDB Streams | poll, ordered per shard | retries block the shard: use bisect + max retries |
:::

::: diagram SQS → Lambda with partial batch failures
flowchart LR
  Q["SQS queue"] -->|"batch of 10"| F["Lambda handler"]
  F -->|"9 ok"| DEL["deleted from queue"]
  F -->|"batchItemFailures: msg 7"| Q
  Q -->|"after maxReceiveCount"| DLQ["dead-letter queue + alarm"]
  F --> IDEM[("DynamoDB idempotency table")]
:::

::: chart bar Measured: start + init + first call (ms)
handler,ms
bare node,17
unbundled SDK S3 + DynamoDB + zod,87
esbuild bundle,85
lazy-load what is needed,54
:::

::: text 🪜 Step by step
1. Move clients and config loading to module scope; cache secrets with a TTL.
2. Pick an idempotency key and write it with a conditional put before (or atomically with) the side effect.
3. For SQS, enable `ReportBatchItemFailures`, process messages independently, return failed ids.
4. Configure the DLQ, `maxReceiveCount`, visibility timeout and alarms on DLQ depth and message age.
5. Set timeouts and reserved concurrency to protect the database.
6. Add Powertools (logger, metrics, tracer) and least-privilege IAM.
:::

::: code javascript SQS consumer: idempotent, partial batch failures
// handler.mjs: event source mapping with FunctionResponseTypes: ["ReportBatchItemFailures"]
import { DynamoDBClient, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.IDEMPOTENCY_TABLE;

async function claim(key) {
  try {
    await ddb.send(new PutCommand({ TableName: TABLE, Item: { pk: key, expiresAt: Math.floor(Date.now() / 1000) + 86400 }, ConditionExpression: 'attribute_not_exists(pk)' }));
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;   // already processed
    throw err;
  }
}

export const handler = async (event, context) => {
  const batchItemFailures = [];
  for (const record of event.Records) {
    if (context.getRemainingTimeInMillis() < 5000) { batchItemFailures.push({ itemIdentifier: record.messageId }); continue; }
    try {
      const msg = JSON.parse(record.body);
      if (!(await claim(`order-email:${msg.orderId}`))) continue;       // duplicate delivery: skip
      await sendOrderEmail(msg);
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', messageId: record.messageId, error: err.message }));
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};

async function sendOrderEmail(msg) { /* call SES / an email API */ }
:::

::: code javascript Partial batch failures + idempotency, simulated with redelivery (runnable)
function makeHandler(processed, sideEffects) {
  return async (event) => {
    const batchItemFailures = [];
    for (const r of event.Records) {
      try {
        const msg = JSON.parse(r.body);
        if (processed.has(msg.orderId)) continue;                 // idempotency: duplicate, skip
        if (msg.orderId === 13 && !msg.retried) throw new Error('email API timeout');
        processed.add(msg.orderId); sideEffects.push('email for order ' + msg.orderId);
      } catch (e) { batchItemFailures.push({ itemIdentifier: r.messageId }); }
    }
    return { batchItemFailures };
  };
}
(async () => {
  const processed = new Set(), sent = [];
  const handler = makeHandler(processed, sent);
  const records = [11, 12, 13, 14].map((id) => ({ messageId: 'm' + id, body: JSON.stringify({ orderId: id }) }));
  const r1 = await handler({ Records: records });
  console.log('first delivery failures:', r1.batchItemFailures);
  // SQS redelivers only m13 … plus a duplicate of m12 (at-least-once delivery)
  const again = [{ messageId: 'm13', body: JSON.stringify({ orderId: 13, retried: true }) }, records[1]];
  const r2 = await handler({ Records: again });
  console.log('sent:', sent);
  console.log(r1.batchItemFailures.length === 1 && r1.batchItemFailures[0].itemIdentifier === 'm13' ? '✅ only the failed message is retried' : '❌ FAIL');
  console.log(r2.batchItemFailures.length === 0 && sent.length === 4 && sent.filter((s) => s.endsWith(' 12')).length === 1 ? '✅ duplicate of order 12 skipped: exactly one email each' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Throwing on one bad SQS message: the whole batch is retried and the good ones are processed twice.
- No DLQ: a poison message is retried until it expires, blocking alarms from telling you.
- Visibility timeout shorter than the function timeout: messages are processed twice in parallel.
- Opening a new Postgres connection per invocation (or a pool of 10 per environment).
- One IAM role with `*` permissions shared by every function.
:::

::: understand
- Assume retries and duplicates: reuse connections, make handlers idempotent, fail individual messages, and send poison messages to a DLQ.
:::

::: ask
- *"What happens if this exact event is delivered twice, or this function times out halfway?"*
:::

::: important ⭐ Say this in the interview
"I create SDK clients and configuration in module scope so warm invocations reuse them, and for relational databases I go through RDS Proxy so thousands of environments don't exhaust connections. Event sources retry and SQS is at-least-once, so handlers are idempotent with a conditional write on a key like the order id. SQS consumers use ReportBatchItemFailures and return only the failed message ids, with a DLQ and alarms after a few receives. Timeouts are set below API Gateway's 29 seconds and the visibility timeout well above the function timeout, each function has a least-privilege role, and logging, metrics and tracing come from Powertools."
:::

::: links
AWS Lambda: Handling errors in SQS event sources (partial batch responses) | https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html
Powertools for AWS Lambda (TypeScript) | https://docs.powertools.aws.dev/lambda/typescript/latest/
:::

=== Serverless or containers: when would you choose Lambda vs ECS/Fargate/Kubernetes for a Node.js backend?
@p 3
@tags serverless, containers, ecs, fargate, kubernetes, architecture, cost
@quick
- **Lambda** fits spiky or low traffic, event processing (S3, SQS, webhooks, cron), glue code, and teams that want zero server management; it scales to zero.
- **Containers** (ECS/Fargate, Kubernetes, App Runner) fit steady traffic, long-running work, **WebSockets**, heavy CPU, big uploads, and local/production parity with Docker.
- **Cost**: Lambda is per request + GB-seconds; containers are per running capacity. At low/spiky load Lambda is cheaper; at **steady high** load containers usually win (see the model below).
- Lambda trade-offs: 15-min limit, cold starts, 6 MB sync payloads, DB connection storms, per-function config sprawl.
- Mixed is normal: an Express API on Fargate, plus Lambdas for image processing, webhooks and scheduled jobs.

::: text 🧒 In simple words
Lambda is a **taxi**: no car to maintain, you pay per ride, great when you travel occasionally. Containers are **owning a car**: you pay whether you drive or not, but if you drive all day it's much cheaper per kilometre, and you can carry big luggage (long jobs, open connections).
:::

::: text 📖 Detailed answer
| Dimension | Lambda | Containers (ECS/Fargate, K8s) |
|---|---|---|
| Scaling | per request, automatic, to zero | autoscaling rules, usually min ≥ 1–2 |
| Cost model | requests + GB-seconds | vCPU + memory per hour while running |
| Limits | 15 min, 6 MB sync payload, cold starts | none of these |
| Connections | short-lived, many environments → RDS Proxy | normal long-lived pools |
| Real-time | WebSockets via API Gateway WebSocket APIs (managed connections) | Socket.IO/ws servers directly |
| Ops | no servers, no patching, per-function deploys | images, task definitions/manifests, cluster |
| Local dev | emulators (SAM, LocalStack) | `docker compose up`, same image as prod |
| Lock-in | event shapes, IAM, service integrations | portable OCI images |

### A rough cost comparison (approximate public us-east-1 list prices; check current pricing)
- Lambda: $0.20 per million requests + $0.0000166667 per GB-second.
- Fargate: $0.04048 per vCPU-hour + $0.004445 per GB-hour.

For an API doing 50 ms at 512 MB per request:
| Traffic | Lambda / month | 2 × Fargate tasks (0.5 vCPU, 1 GB) / month |
|---|---|---|
| 1 M requests | ≈ $0.62 | ≈ $36 |
| 100 M requests | ≈ $62 | ≈ $36 (if 2 tasks handle the load) |
| 1 B requests | ≈ $617 | more tasks needed, still usually far cheaper |

The runnable model below computes these numbers. Include API Gateway or ALB costs too: API Gateway REST APIs add per-request fees that often exceed the Lambda cost.
:::

::: diagram Choosing a compute model
flowchart TD
  Q1{"long-lived connections, jobs over 15 min, or heavy CPU?"} -->|"yes"| C["containers (ECS/Fargate/K8s)"]
  Q1 -->|"no"| Q2{"traffic spiky, low, or event-driven?"}
  Q2 -->|"yes"| L["Lambda"]
  Q2 -->|"no, steady and high"| Q3{"team wants zero infrastructure?"}
  Q3 -->|"yes"| AR["App Runner / Fargate with autoscaling"]
  Q3 -->|"no"| C
:::

::: image Serverless vs containers for Node.js
/images/serverless/serverless-vs-containers.svg
:::

::: text 🪜 Step by step
1. List the workloads: HTTP API, background jobs, scheduled tasks, real-time, file processing.
2. Check hard limits first (duration, connections, payloads).
3. Estimate traffic shape (peak, average, idle time) and model cost for both.
4. Consider the team: who operates clusters, how much local parity matters.
5. Pick per workload; it's fine to mix (API in containers, events in Lambda).
6. Revisit when traffic changes: what was cheap at launch may not be at scale.
:::

::: code javascript Monthly cost model: Lambda vs Fargate (runnable)
// Approximate us-east-1 list prices (x86); always check the current AWS pricing pages.
const PRICE = { lambdaPerMillion: 0.2, lambdaPerGbSecond: 0.0000166667, fargateVcpuHour: 0.04048, fargateGbHour: 0.004445 };
function lambdaMonthly(requests, ms, memoryMb) {
  return (requests / 1e6) * PRICE.lambdaPerMillion + requests * (ms / 1000) * (memoryMb / 1024) * PRICE.lambdaPerGbSecond;
}
function fargateMonthly(tasks, vcpu, gb, hours = 730) { return tasks * hours * (vcpu * PRICE.fargateVcpuHour + gb * PRICE.fargateGbHour); }
const fargate = fargateMonthly(2, 0.5, 1);
for (const req of [1e6, 1e8, 1e9]) {
  const l = lambdaMonthly(req, 50, 512);
  console.log(`${(req / 1e6).toLocaleString().padStart(5)} M req/month → Lambda $${l.toFixed(2).padStart(7)} | 2 Fargate tasks $${fargate.toFixed(2)}`);
}
let lo = 1e6, hi = 1e10;
while (hi - lo > 1e5) { const mid = (lo + hi) / 2; lambdaMonthly(mid, 50, 512) < fargate ? (lo = mid) : (hi = mid); }
console.log(`break-even ≈ ${(lo / 1e6).toFixed(0)} M requests/month (≈ ${(lo / 30 / 86400).toFixed(0)} req/s on average)`);
console.log(lambdaMonthly(1e6, 50, 512) < fargate && lambdaMonthly(1e9, 50, 512) > fargate ? '✅ Lambda wins at low volume, containers at sustained high volume' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Choosing Lambda for a WebSocket chat server or a 30-minute video job.
- Comparing only compute prices and forgetting API Gateway, NAT gateway and data transfer.
- Running Kubernetes for a single small API with three users.
- One giant "Lambda-lith" with every route vs hundreds of tiny functions: both have costs; group by domain.
- Ignoring local development and testing experience in the decision.
:::

::: understand
- Choose per workload by limits, traffic shape, cost and team: Lambda for spiky/event work, containers for steady, long-lived or heavy work.
:::

::: ask
- *"What does this cost at today's traffic and at 10× traffic, and does any request need more than 15 minutes or a persistent connection?"*
:::

::: important ⭐ Say this in the interview
"I decide per workload. Lambda is great for spiky or low traffic and event-driven work like webhooks, S3 and SQS processing and cron jobs: no servers, scales to zero, pay per request. Containers on Fargate or Kubernetes suit steady high traffic, WebSockets, long or CPU-heavy jobs and local parity with Docker. Lambda's limits are 15 minutes, cold starts, payload sizes and database connection storms. On cost, my rough model shows Lambda at under a dollar for a million requests a month versus about 36 dollars for two small Fargate tasks, with break-even around 60 million requests a month, and I also count API Gateway and networking. Mixing both is common."
:::

::: links
AWS Lambda pricing | https://aws.amazon.com/lambda/pricing/
AWS Fargate pricing | https://aws.amazon.com/fargate/pricing/
:::

=== Which AWS services would you use for a Node.js + React app, and how do you manage them with infrastructure as code?
@p 3
@tags aws, architecture, infrastructure-as-code, terraform, cdk, ecs, rds, cloudfront
@quick
- **Frontend**: React build in **S3** behind **CloudFront** (CDN, HTTPS via ACM), DNS in **Route 53**.
- **API**: Node containers on **ECS Fargate** behind an **ALB** (or Lambda behind **API Gateway**); images in **ECR**.
- **Data**: **RDS/Aurora Postgres** (or DynamoDB), **ElastiCache Redis**, **S3** for uploads (pre-signed URLs); async work with **SQS/SNS/EventBridge**.
- **Cross-cutting**: IAM roles (no keys in code), **Secrets Manager/SSM**, **CloudWatch** logs/metrics/alarms, **X-Ray**/OpenTelemetry, a **VPC** with public subnets for the ALB and private subnets for app and DB.
- **IaC**: Terraform, **AWS CDK** (TypeScript), CloudFormation or SAM; reviewed in PRs, `plan`/`diff` in CI, applied by the pipeline, same code for staging and production.

::: text 🧒 In simple words
AWS is a **giant hardware store**. You pick a storefront (CloudFront + S3 for the website), a kitchen (ECS or Lambda for the API), a pantry (RDS, Redis, S3) and a mailroom (SQS). Infrastructure as code is the **shopping list and assembly instructions**, written down so you can rebuild the exact same shop for staging and production.
:::

::: text 📖 Detailed answer
### Reference architecture
| Need | Service | Notes |
|---|---|---|
| DNS + TLS | Route 53, ACM | free certificates for CloudFront/ALB |
| Static frontend | S3 + CloudFront | Origin Access Control: bucket is private; long cache for hashed files |
| API compute | ECS Fargate + ALB, or Lambda + API Gateway | autoscaling on CPU/requests |
| Container registry | ECR | image scanning, lifecycle rules |
| Relational DB | RDS/Aurora Postgres | Multi-AZ, automated backups, read replicas |
| Cache / sessions / rate limits | ElastiCache (Redis/Valkey) | private subnets only |
| Files | S3 + pre-signed URLs | browser uploads directly, API never streams the bytes |
| Async | SQS (queues), SNS (fan-out), EventBridge (events, schedules) | DLQs everywhere |
| Secrets/config | Secrets Manager, SSM Parameter Store | injected into tasks/functions |
| Observability | CloudWatch Logs/Metrics/Alarms, X-Ray | or OpenTelemetry to a vendor |
| Network | VPC, public/private subnets, security groups, NAT/VPC endpoints | DB never public |

### Infrastructure as Code
| Tool | Language | Notes |
|---|---|---|
| Terraform / OpenTofu | HCL | multi-cloud, state file (S3 + locking), huge provider ecosystem |
| AWS CDK | TypeScript (and others) | synthesises CloudFormation; great for JS teams |
| CloudFormation | YAML/JSON | native, stacks with rollback |
| SAM / Serverless Framework | YAML | Lambda-focused shortcuts |

Workflow: change in a PR → CI runs `terraform plan` / `cdk diff` and posts the diff → review → merge → pipeline applies to staging, then production. Drift detection catches console changes.
:::

::: diagram Request path on AWS
flowchart LR
  U["browser"] --> R53["Route 53"]
  R53 --> CF["CloudFront"]
  CF -->|"/*"| S3W["S3: React build"]
  CF -->|"/api/*"| ALB["ALB"]
  ALB --> ECS["ECS Fargate: Node API"]
  ECS --> RDS[("RDS Postgres")]
  ECS --> RED[("ElastiCache Redis")]
  ECS --> SQS["SQS"]
  SQS --> WK["worker: Lambda or ECS"]
:::

::: image AWS services for a Node.js + React app
/images/serverless/aws-architecture.svg
:::

::: text 🪜 Step by step
1. Network: VPC with public subnets (ALB) and private subnets (tasks, RDS, Redis).
2. Data: RDS Postgres (Multi-AZ in production), ElastiCache, S3 buckets.
3. Compute: ECR repository, ECS cluster + Fargate service behind an ALB with health checks.
4. Frontend: S3 bucket (private) + CloudFront with two origins (S3 and the ALB for `/api/*`).
5. Secrets in Secrets Manager, task roles with least privilege, CloudWatch alarms.
6. Express all of it in Terraform or CDK; CI runs plan/diff on PRs and applies on merge.
:::

::: code typescript AWS CDK (TypeScript): Fargate API behind an ALB with Postgres
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as rds from 'aws-cdk-lib/aws-rds';

export class ApiStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2, natGateways: 1 });
    const db = new rds.DatabaseInstance(this, 'Db', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_17 }),
      vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      multiAz: false, credentials: rds.Credentials.fromGeneratedSecret('app'),
    });
    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Api', {
      cluster: new ecs.Cluster(this, 'Cluster', { vpc }),
      cpu: 512, memoryLimitMiB: 1024, desiredCount: 2,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('ghcr.io/acme/api:3f2a1c9'),
        containerPort: 3000,
        secrets: { DATABASE_PASSWORD: ecs.Secret.fromSecretsManager(db.secret!, 'password') },
        environment: { DATABASE_HOST: db.dbInstanceEndpointAddress, NODE_ENV: 'production' },
      },
    });
    service.targetGroup.configureHealthCheck({ path: '/healthz' });
    db.connections.allowDefaultPortFrom(service.service);       // security group rule: API → DB only
    service.service.autoScaleTaskCount({ maxCapacity: 10 }).scaleOnCpuUtilization('Cpu', { targetUtilizationPercent: 60 });
  }
}
:::

::: code bash IaC in the pipeline
# Terraform: plan on PRs, apply on merge (state in S3 with locking)
terraform init -backend-config=env/prod.backend.hcl
terraform plan -var-file=env/prod.tfvars -out=plan.tfplan
terraform apply plan.tfplan
# AWS CDK: show the diff, then deploy
npx cdk diff ApiStack-prod
npx cdk deploy ApiStack-prod --require-approval never
:::

::: code javascript A tiny "plan": diff desired vs actual infrastructure (runnable)
// The core of terraform plan / cdk diff: compare desired resources with what exists.
function plan(desired, actual) {
  const out = { create: [], update: [], destroy: [], replace: [] };
  const immutable = { db: ['engine'], bucket: ['name'] };
  for (const [id, want] of Object.entries(desired)) {
    const have = actual[id];
    if (!have) { out.create.push(id); continue; }
    const changed = Object.keys(want).filter((k) => JSON.stringify(want[k]) !== JSON.stringify(have[k]));
    if (!changed.length) continue;
    (changed.some((k) => (immutable[want.type] || []).includes(k)) ? out.replace : out.update).push(`${id} (${changed.join(', ')})`);
  }
  for (const id of Object.keys(actual)) if (!desired[id]) out.destroy.push(id);
  return out;
}
const actual = { api: { type: 'service', cpu: 256, count: 2 }, db: { type: 'db', engine: 'postgres16', size: 'micro' }, oldBucket: { type: 'bucket', name: 'tmp' } };
const desired = { api: { type: 'service', cpu: 512, count: 2 }, db: { type: 'db', engine: 'postgres17', size: 'micro' }, queue: { type: 'queue' } };
const p = plan(desired, actual);
console.log(p);
console.log(p.create.includes('queue') && p.update[0].startsWith('api') && p.destroy.includes('oldBucket') ? '✅ create, update in place and destroy detected' : '❌ FAIL');
console.log(p.replace[0] === 'db (engine)' ? '✅ engine change means REPLACE: review plans before applying to a database' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Databases in public subnets or a public S3 bucket for the frontend (use CloudFront with Origin Access Control).
- Clicking resources together in the console: nobody can reproduce or review them.
- Applying Terraform from laptops with local state: conflicts and lost state.
- Not reading the plan: a "replace" on a database deletes data.
- Long-lived access keys for the app instead of task/function IAM roles.
:::

::: understand
- S3 + CloudFront for the frontend, Fargate or Lambda for the API, RDS/Redis/S3/SQS for data and async, IAM + secrets + CloudWatch across all of it, all defined as code.
:::

::: ask
- *"Could we recreate production in a new account from the repository alone?"*
:::

::: important ⭐ Say this in the interview
"For a Node and React app on AWS I'd serve the React build from a private S3 bucket through CloudFront with Route 53 and ACM, route /api to an ALB in front of Node containers on ECS Fargate pulled from ECR, or Lambda behind API Gateway for smaller APIs, and use RDS Postgres, ElastiCache Redis, S3 with pre-signed uploads and SQS or EventBridge for async work, all in private subnets of a VPC. Tasks get IAM roles and secrets from Secrets Manager, and CloudWatch and X-Ray provide logs, metrics, alarms and traces. Everything is defined in Terraform or CDK, with the plan or diff reviewed in pull requests and applied by the pipeline."
:::

::: links
AWS Well-Architected Framework | https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html
AWS CDK: Developer guide | https://docs.aws.amazon.com/cdk/v2/guide/home.html
:::
