// The default navigation tree. Each node has a stable `key` (its path) so seeding, resets and
// migrations can find it again even if an admin renames it.
// `files` lists seed content files (seed/content/*.md) whose section becomes a child node here.
// Empty nodes are placeholders for the admin to fill.

const TREE = [
  {
    key: 'frontend', title: 'Frontend', icon: '🎨', color: '#ec4899', description: 'Everything that runs in the browser.',
    children: [
      {
        key: 'frontend/javascript', title: 'JavaScript', icon: '🟨', color: '#eab308', description: 'The language: core concepts, async, the browser and hand-written polyfills.',
        children: [
          { key: 'frontend/javascript/core', title: 'Core Concepts', icon: '🧠', color: '#eab308', description: 'Scope, closures, this, prototypes, types, equality.', files: ['27-js-basics.md', '28-js-functions-scope.md', '29-js-objects-prototypes.md'] },
          { key: 'frontend/javascript/async', files: ['30-js-async.md'] },
          { key: 'frontend/javascript/polyfills', title: 'Polyfills & Implementations', icon: '🧩', color: '#eab308', description: 'Write it yourself: Promise, call/apply/bind, debounce, throttle, Promise.all…', files: ['12-js-implementations.md', '32-js-polyfills.md'] },
          { key: 'frontend/javascript/browser', files: ['31-js-browser.md'] },
          { key: 'frontend/javascript/patterns', files: ['33-js-design-patterns.md'] },
        ],
      },
      { key: 'frontend/typescript', title: 'TypeScript', icon: '🔷', color: '#3b82f6', description: 'Types, generics, utility types, typing React.' },
      {
        key: 'frontend/react', title: 'React', icon: '⚛️', color: '#06b6d4', description: 'Components, hooks, state, performance.',
        children: [
          { key: 'frontend/react/fundamentals', files: ['22-react-fundamentals.md'] },
          { key: 'frontend/react/hooks', files: ['23-react-hooks.md'] },
          { key: 'frontend/react/performance', files: ['24-react-performance.md'] },
          { key: 'frontend/react/suspense', files: ['25-react-suspense.md'] },
          { key: 'frontend/react/react-19', files: ['26-react-19.md'] },
        ],
      },
      { key: 'frontend/nextjs', title: 'Next.js', icon: '▲', color: '#64748b', description: 'Routing, server components, data fetching, rendering strategies.' },
      { key: 'frontend/html-css', title: 'HTML & CSS', icon: '🎨', color: '#f97316', description: 'Semantics, accessibility, layout, responsive design.' },
    ],
  },
  {
    key: 'backend', title: 'Backend', icon: '⚙️', color: '#22c55e', description: 'Servers, APIs and data.',
    children: [
      {
        key: 'backend/nodejs', title: 'Node.js', icon: '🟢', color: '#22c55e', description: 'The runtime and its ecosystem.',
        children: [
          { key: 'backend/nodejs/core', files: ['01-node-core.md'] },
          { key: 'backend/nodejs/express', files: ['02-express.md'] },
        ],
      },
      {
        key: 'backend/java', title: 'Java', icon: '☕', color: '#f97316', description: 'Core Java and the Spring ecosystem.',
        children: [
          { key: 'backend/java/core', title: 'Core Java', icon: '☕', color: '#f97316', description: 'OOP, collections, concurrency, JVM.' },
          { key: 'backend/java/spring-boot', title: 'Spring Boot', icon: '🌱', color: '#16a34a', description: 'REST APIs, data access, security.' },
        ],
      },
      {
        key: 'backend/databases', title: 'Databases', icon: '🗄️', color: '#0ea5e9', description: 'Storing and querying data.',
        children: [
          {
            key: 'backend/databases/mongodb', title: 'MongoDB', icon: '🍃', color: '#10b981', description: 'Documents, modelling, indexes, aggregation and Mongoose.',
            files: ['04-mongodb-fundamentals.md', '05-mongodb-aggregation-indexing.md', '06-mongoose.md', '07-mongodb-scenarios.md'],
          },
          { key: 'backend/databases/sql', title: 'SQL', icon: '🧾', color: '#6366f1', description: 'Relational modelling, joins, normalisation, transactions.' },
          { key: 'backend/databases/postgresql', title: 'PostgreSQL', icon: '🐘', color: '#3b82f6', description: 'Postgres features, indexing, JSONB, performance.' },
          { key: 'backend/databases/redis', title: 'Redis', icon: '🟥', color: '#ef4444', description: 'Caching, data structures, rate limiting, queues.' },
        ],
      },
      {
        key: 'backend/common', title: 'Common Topics', icon: '🔗', color: '#8b5cf6', description: 'Concepts every backend needs, whatever the language.',
        files: ['03-rest-auth.md'],
        children: [
          { key: 'backend/common/caching', title: 'Caching', icon: '🗃️', color: '#8b5cf6', description: 'Cache-aside, TTLs, invalidation, CDNs.' },
          { key: 'backend/common/messaging', title: 'Messaging & Queues', icon: '📨', color: '#8b5cf6', description: 'Queues, pub/sub, retries, idempotency.' },
          { key: 'backend/common/security', title: 'Web Security', icon: '🛡️', color: '#8b5cf6', description: 'OWASP Top 10, XSS, CSRF, injection.' },
        ],
      },
    ],
  },
  {
    key: 'system-design', title: 'System Design', icon: '🏗️', color: '#6366f1', description: 'Designing components, services and whole systems.',
    children: [
      {
        key: 'system-design/frontend', title: 'Frontend', icon: '🎨', color: '#ec4899', description: 'Designing UI components and front-end architecture.',
        children: [
          { key: 'system-design/frontend/react', title: 'React', icon: '⚛️', color: '#06b6d4', description: 'Component and app design in React.', files: ['13-frontend-lld.md'] },
          { key: 'system-design/frontend/nextjs', title: 'Next.js', icon: '▲', color: '#64748b', description: 'Designing apps with Next.js.' },
        ],
      },
      {
        key: 'system-design/backend', title: 'Backend', icon: '⚙️', color: '#22c55e', description: 'Designing APIs and services.',
        children: [
          { key: 'system-design/backend/nodejs', title: 'Node.js', icon: '🟢', color: '#22c55e', description: 'Service design in Node.js.', files: ['14-backend-lld.md'] },
          { key: 'system-design/backend/java', title: 'Java', icon: '☕', color: '#f97316', description: 'Service design in Java.' },
        ],
      },
      {
        key: 'system-design/fullstack', title: 'Full-Stack', icon: '🔗', color: '#7c3aed', description: 'End-to-end features: frontend, API and data together.',
        children: [
          { key: 'system-design/fullstack/nodejs', title: 'Node.js + React', icon: '🟢', color: '#22c55e', description: 'Full-stack designs with React and Node.js.', files: ['08-fullstack-integration.md', '15-fullstack-lld.md'] },
          { key: 'system-design/fullstack/java', title: 'Java + React', icon: '☕', color: '#f97316', description: 'Full-stack designs with a Java backend.' },
        ],
      },
      { key: 'system-design/common', title: 'Common Topics', icon: '🧭', color: '#6366f1', description: 'Scalability, load balancing, caching, consistency, trade-offs.' },
    ],
  },
  {
    key: 'devops', title: 'DevOps', icon: '🚀', color: '#f97316', description: 'Shipping and running software.',
    children: [
      { key: 'devops/aws', title: 'AWS', icon: '☁️', color: '#f97316', description: 'EC2, S3, IAM and deployment.', files: ['09-aws-ec2-deploy.md', '10-aws-s3.md', '11-aws-security.md'] },
      { key: 'devops/docker', title: 'Docker', icon: '🐳', color: '#0ea5e9', description: 'Images, containers, Compose.' },
      { key: 'devops/kubernetes', title: 'Kubernetes', icon: '☸️', color: '#3b82f6', description: 'Pods, deployments, services.' },
      { key: 'devops/ci-cd', title: 'CI/CD', icon: '🔁', color: '#22c55e', description: 'Pipelines, GitHub Actions, release strategies.' },
      { key: 'devops/linux-networking', title: 'Linux & Networking', icon: '🐧', color: '#64748b', description: 'Shell, processes, DNS, HTTP, TLS.' },
      { key: 'devops/common', title: 'Common Topics', icon: '🧭', color: '#f97316', description: 'Monitoring, logging, infrastructure as code.' },
    ],
  },
  {
    key: 'testing', title: 'Testing', icon: '🧪', color: '#14b8a6', description: 'Making sure it works, and keeps working.',
    children: [
      {
        key: 'testing/frontend', title: 'Frontend', icon: '🎨', color: '#ec4899', description: 'Testing UIs.',
        children: [
          { key: 'testing/frontend/react', title: 'React', icon: '⚛️', color: '#06b6d4', description: 'React Testing Library, Vitest, mocking.' },
          { key: 'testing/frontend/nextjs', title: 'Next.js', icon: '▲', color: '#64748b', description: 'Testing Next.js apps, Playwright end-to-end.' },
        ],
      },
      {
        key: 'testing/backend', title: 'Backend', icon: '⚙️', color: '#22c55e', description: 'Testing APIs and services.',
        children: [
          { key: 'testing/backend/nodejs', title: 'Node.js', icon: '🟢', color: '#22c55e', description: 'node:test, Jest, Supertest, test databases.' },
          { key: 'testing/backend/java', title: 'Java', icon: '☕', color: '#f97316', description: 'JUnit, Mockito, Spring Boot tests.' },
        ],
      },
      { key: 'testing/common', title: 'Common Topics', icon: '🧭', color: '#14b8a6', description: 'Test pyramid, TDD, mocking strategy, coverage.' },
    ],
  },
  {
    key: 'dsa', title: 'DSA', icon: '🧮', color: '#a855f7', description: 'Data structures and algorithms for coding interviews.',
    files: [
      '16-dsa-arrays-hashing.md', '17-dsa-sliding-window-two-pointers.md', '18-dsa-stack-queue-linkedlist.md',
      '19-dsa-binary-search-trees.md', '20-dsa-heap-graphs.md', '21-dsa-recursion-dp.md',
    ],
  },
];

// Nodes whose title/icon come from the content file itself (they have `files` but no `title`)
// are "file nodes": the file's @section becomes that node, with the file's questions as its pages.
// Nodes WITH a title and `files` get one child node per file.

/** Flatten the tree into a list of { key, parentKey, order, ...fields } in depth-first order. */
function flatten(nodes = TREE, parentKey = null) {
  const out = [];
  nodes.forEach((n, order) => {
    out.push({ ...n, parentKey, order, children: undefined });
    if (n.children) out.push(...flatten(n.children, n.key));
  });
  return out;
}

/** Map every seed file name → { parentKey, nodeKey|null } describing where its section goes. */
function filePlacements() {
  const map = {};
  for (const n of flatten()) {
    if (!n.files) continue;
    for (const f of n.files) {
      // A titled node with files: the file becomes a child of this node.
      // An untitled "file node": the file's section IS this node.
      map[f] = n.title ? { parentKey: n.key, nodeKey: `${n.key}/${f.replace(/^\d+-|\.md$/g, '')}` } : { parentKey: n.parentKey, nodeKey: n.key };
    }
  }
  return map;
}

module.exports = { TREE, flatten, filePlacements };
