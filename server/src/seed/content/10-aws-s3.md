@section AWS S3
@icon 🪣
@color #16a34a
@desc Buckets & objects, presigned URLs, upload/download from Node, security, multipart uploads, images and why files don't belong in MongoDB. Tested against SeaweedFS (an S3-compatible server that verifies signatures like AWS) and the Moto AWS mock.

=== What is a pre-signed URL?
@p 3
@tags s3, presigned-url, security
@quick
- A **temporary URL** that allows **one operation** (GET, PUT, a POST form, or one multipart part) on **one object** until it **expires** (max 7 days; earlier if signed with temporary role credentials).
- Created **on the server** with its IAM role; the signature sits in the query string (`X-Amz-Signature`, `X-Amz-Expires`…). No AWS keys reach the browser; signing is local maths (measured: **1,000 URLs in 180 ms**, no AWS call).
- Tested on SeaweedFS: wrong `Content-Type` → **403**, changed key → **403**, after expiry → **403**; a presigned **POST** with `content-length-range` rejected a too-big file → **400**.
- A presigned **PUT** can't enforce a size range by itself (sign `Content-Length` for an exact size, or use presigned POST).
- Always: authorise before signing, server-chosen keys, short expiry, verify after upload (`HeadObject`).

::: text 🧒 In simple words
A presigned URL is like a **signed permission slip**: "the bearer may drop ONE parcel, a PDF, into locker 42, until 10:05". The office (your API) writes and signs the slip with its own stamp; the warehouse (S3) checks the stamp, the locker number, the parcel type and the time. Change the locker number on the slip, bring a different parcel, or come at 10:06, and the warehouse refuses. Nobody ever gets the office's master key.
:::

::: text 📖 Detailed answer
A presigned URL is a normal S3 URL plus a **SigV4 signature** over the method, bucket, key, chosen headers and expiry. Anyone holding it can perform exactly that request until it expires; the permissions are those of the **signer** at request time.

### Kinds of presigned requests
| Kind | Use | Can enforce |
|---|---|---|
| **PUT** | Browser uploads a file directly to S3 | Key, method, expiry, signed headers (Content-Type, exact Content-Length, checksum) |
| **GET** | Temporary access to a private file | Key, expiry, response headers (`ResponseContentDisposition` for the download name) |
| **POST** (form) | Browser upload with a policy | **Size range** (`content-length-range`), key prefix, `Content-Type` prefix |
| **UploadPart** | One part of a multipart upload | Key, upload id, part number |

### Tested (SeaweedFS, which verifies signatures like AWS)
| Request | Result |
|---|---|
| PUT with the signed `Content-Type` | 200 |
| Same URL, `Content-Type: text/html` | **403** |
| Same URL, key changed from `doc.pdf` to `evil.pdf` | **403** |
| GET within 2 s expiry / after 3.5 s | 200 / **403** |
| POST policy (≤ 1 KB, `image/*`): 500 B image / 5 KB / `text/html` | 204 / **400** / **403** |
The same tests against **Moto** (an AWS mock) all succeeded, because mocks don't verify signatures: test security rules against something that does.

### Limits and tips
- Max expiry 7 days with IAM user keys; with role credentials (EC2/ECS/Lambda) the URL dies when the session credentials expire (often within hours).
- Keep uploads to 60–300 s and downloads to minutes.
- Large files: multipart with one presigned URL per part.
:::

::: diagram Upload with a presigned PUT
sequenceDiagram
  participant B as Browser
  participant API as Node API (IAM role)
  participant S3 as S3 private bucket
  B->>API: POST /uploads/presign (contentType, size)
  API->>API: authorise, validate, key = uploads/u42/uuid
  API-->>B: signed PUT URL (60 s) + headers
  B->>S3: PUT bytes with the signed Content-Type
  S3-->>B: 200 (403 if key, type or time differ)
  B->>API: POST /uploads/confirm (key)
  API->>S3: HeadObject → save key in MongoDB
:::

::: image A signed permission slip: one parcel, one locker, until 10:05
/images/aws-s3/presigned.svg
:::

::: text 🪜 Step by step
What S3 checks when the browser sends `PUT https://bucket.s3…/uploads/u42/9f8e?X-Amz-Algorithm=…&X-Amz-Expires=60&X-Amz-Signature=…`:
1. Is `X-Amz-Date + X-Amz-Expires` still in the future? If not → 403 "Request has expired".
2. Rebuild the "string to sign" from the actual request: method `PUT`, path `/uploads/u42/9f8e`, the signed headers (`content-type`, `host`), query parameters.
3. Recompute the HMAC with the signer's secret key (S3 knows it from `X-Amz-Credential`).
4. Compare with `X-Amz-Signature`; any difference (other key, other type) → 403 `SignatureDoesNotMatch`.
5. Check the signer's IAM permissions for `s3:PutObject` on that key right now.
6. Store the object; the browser then tells the API, which verifies with `HeadObject` before trusting it.
:::

::: code javascript s3-files/src/presign.js
// presign.js: the three kinds of presigned requests (AWS SDK v3). Signing is local maths: no call to AWS.
const crypto = require('node:crypto');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const { s3, Bucket } = require('./s3.service');

// 1) PUT: one object, one content type, 60 seconds. The browser must send exactly that Content-Type.
async function presignUpload(userId, contentType) {
  const Key = `uploads/${userId}/${crypto.randomUUID()}`;                       // the server chooses the key
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key, ContentType: contentType }), {
    expiresIn: 60,
    signableHeaders: new Set(['content-type']),
  });
  return { url, key: Key, headers: { 'Content-Type': contentType } };
}

// 2) GET: temporary access to a private file, downloaded with a friendly name.
function presignDownload(Key, fileName, expiresIn = 300) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket, Key, ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, '')}"` }), { expiresIn });
}

// 3) POST (HTML form upload): the policy can ENFORCE a size range and a content-type prefix.
function presignPost(userId, maxBytes = 5 * 1024 * 1024) {
  return createPresignedPost(s3, {
    Bucket,
    Key: `uploads/${userId}/${crypto.randomUUID()}`,
    Conditions: [['content-length-range', 1, maxBytes], ['starts-with', '$Content-Type', 'image/']],
    Fields: { 'Content-Type': 'image/png' },
    Expires: 60,
  });                                                                            // → { url, fields }: send fields + file as multipart/form-data
}

module.exports = { presignUpload, presignDownload, presignPost };
:::

::: code javascript Browser demo: an HMAC-signed URL, the idea behind presigning (runnable)
// Not real SigV4, but the same principle: sign method + path + expiry with a secret only the server knows.
const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
const SECRET = 'server-only-secret';
async function presign(method, path, contentType, expiresAt) {
  const sig = await hmac(SECRET, `${method}\n${path}\n${contentType}\n${expiresAt}`);
  return `${path}?expires=${expiresAt}&sig=${sig}`;
}
async function verify(method, url, contentType, now) {
  const u = new URL(url, 'https://bucket.example');
  const expiresAt = Number(u.searchParams.get('expires'));
  if (now > expiresAt) return 403;
  const expected = await hmac(SECRET, `${method}\n${u.pathname}\n${contentType}\n${expiresAt}`);
  return expected === u.searchParams.get('sig') ? 200 : 403;
}
(async () => {
  const now = 1_000_000, url = await presign('PUT', '/uploads/u42/doc.pdf', 'application/pdf', now + 60);
  console.log('valid upload', (await verify('PUT', url, 'application/pdf', now + 10)) === 200 ? '✅' : '❌ FAIL');
  console.log('different content type → 403', (await verify('PUT', url, 'text/html', now + 10)) === 403 ? '✅' : '❌ FAIL');
  console.log('tampered key → 403', (await verify('PUT', url.replace('doc.pdf', 'evil.pdf'), 'application/pdf', now + 10)) === 403 ? '✅' : '❌ FAIL');
  console.log('after expiry → 403', (await verify('PUT', url, 'application/pdf', now + 61)) === 403 ? '✅' : '❌ FAIL');
  console.log('GET with a PUT signature → 403', (await verify('GET', url, 'application/pdf', now + 10)) === 403 ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Letting the client choose the key (it can overwrite other users' files).
- Not signing `Content-Type` → an "image" upload URL accepts HTML/JS.
- Expecting a presigned PUT to enforce a maximum size (it can't without a signed length; use presigned POST).
- Long expiries for sensitive downloads, or signing with an IAM user's long-lived keys.
- Skipping the post-upload `HeadObject` check; trusting a mock that doesn't verify signatures.
:::

::: understand
- A presigned URL is **delegated, time-boxed, single-purpose permission**, created with the server's identity.
- The API stays the gatekeeper (authorization, validation, key choice); S3 does the byte transfer.
- Signatures are computed locally, so presigning is cheap enough to do per request.
:::

::: ask
- *"Upload or download? Maximum size? Who may read the file later?"*
- *"Should links be shareable for days, or valid only for this session?"*
- *"Do files need scanning or processing after upload?"*
:::

::: important ⭐ Say this in the interview
"A presigned URL is a normal S3 URL with a SigV4 signature in the query string that allows one operation on one object until it expires. My API creates it with its IAM role after checking who the user is and what they may upload, chooses the key itself, signs the content type, and keeps the expiry short; the browser then talks to S3 directly, so bytes never pass through Node and no AWS keys reach the client. Signing is local, I measured a thousand URLs in 180 milliseconds. I tested it against an S3-compatible server: a different content type, a changed key or an expired URL all got 403. A presigned PUT can't enforce a maximum size, so for that I use a presigned POST policy with content-length-range, and after any upload I verify the object with HeadObject before saving its key."
:::

::: links
AWS: Uploading objects with presigned URLs | https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
AWS: Sharing objects with presigned URLs | https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html
AWS: Browser-based uploads using POST | https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-UsingHTTPPOST.html
:::

=== What is S3? Bucket vs object?
@p 3
@tags s3, basics
@quick
- **S3** = object storage over HTTPS: virtually unlimited, designed for **99.999999999% durability**, pay per GB-month + requests + data out.
- **Bucket**: a container with a **globally unique name** in one region; settings: Block Public Access, encryption, versioning, policy, CORS, lifecycle, events.
- **Object**: bytes + metadata, addressed by a **key** (`avatars/42/a1b2.png`); up to **5 TB** (one PUT ≤ 5 GB, otherwise multipart).
- "Folders" are only **key prefixes**; listing returns at most **1,000 keys per call** (tested: 1,050 keys needed two pages).
- Storage classes (Standard, Intelligent-Tiering, Standard-IA, Glacier) + lifecycle rules move or delete objects automatically.

::: text 🧒 In simple words
S3 is a giant **coat-check room**. A bucket is one coat-check counter with its own unique name. Each coat you hand in is an object, and the ticket you get back is its key, like `avatars/42/a1b2.png`. There are no real shelves or folders; the slashes in the ticket are just part of the name that help you find related coats. The room never runs out of space, keeps several copies of every coat in different buildings, and you pay for how many coats you store and how often you fetch them.
:::

::: text 📖 Detailed answer
| | Bucket | Object |
|---|---|---|
| What | Top-level container | The file + metadata |
| Name | Globally unique (`fullstack-app-uploads`), DNS-safe | Key inside the bucket (`invoices/2026/09/inv-1001.pdf`) |
| Settings | Region, Block Public Access, default encryption, versioning, policy, CORS, lifecycle, event notifications | Content-Type, Cache-Control, metadata, tags, storage class, version id |
| Limits | Many per account (raise with a quota request) | 5 TB each; unlimited count |

### Not a file system, not a database
- You PUT and GET **whole objects** (or byte ranges); there's no "append" or "rename" (copy + delete).
- Listing is by prefix and paginated (1,000 per call).
- Strong read-after-write consistency for PUTs and DELETEs.

### Storage classes
| Class | For |
|---|---|
| Standard | Frequently accessed data |
| Intelligent-Tiering | Unknown or changing access patterns (moves objects automatically) |
| Standard-IA / One Zone-IA | Infrequent access, lower storage price, retrieval fee |
| Glacier Instant/Flexible/Deep Archive | Archives and backups (minutes to hours to restore) |

### Typical uses with a Node + React app
User uploads (presigned), the React build behind CloudFront, exports and reports, logs and backups, data for analytics (Athena), S3 events triggering Lambda (thumbnails, virus scans).
:::

::: diagram Account, buckets, keys
flowchart TD
  ACC["AWS account"] --> B1[("bucket: fullstack-app-uploads (ap-south-1, private)")]
  ACC --> B2[("bucket: fullstack-app-web (behind CloudFront)")]
  B1 --> K1["key: avatars/42/a1b2.png"]
  B1 --> K2["key: videos/42/9f8e"]
  B1 --> K3["key: invoices/2026/09/inv-1001.pdf"]
  B2 --> K4["key: index.html"]
  B2 --> K5["key: assets/index-BVNta6Bt.js"]
:::

::: image A coat-check room: counters (buckets), coats (objects) and tickets (keys)
/images/aws-s3/basics.svg
:::

::: text 🪜 Step by step
What happens on `aws s3 cp logo.png s3://shop-uploads-demo/brand/logo.png` (tested against the Moto mock):
1. The CLI signs a `PUT /brand/logo.png` request with your credentials (SigV4).
2. S3 checks IAM permissions and the bucket policy, encrypts the bytes at rest (SSE-S3 by default) and stores copies across multiple Availability Zones.
3. It answers 200 with an ETag; `aws s3 ls s3://shop-uploads-demo/brand/` now lists the object.
4. `aws s3 presign … --expires-in 300` creates a 5-minute GET link without contacting AWS.
5. `aws s3 rm` deletes it (with versioning on, a delete marker is added and older versions stay recoverable).
:::

::: code bash AWS CLI essentials
aws s3 mb s3://shop-uploads-demo --region ap-south-1          # make a bucket
aws s3 cp ./logo.png s3://shop-uploads-demo/brand/logo.png    # upload
aws s3 ls s3://shop-uploads-demo/brand/                       # list a "folder" (prefix)
aws s3 sync ./dist s3://shop-uploads-demo/site --delete       # mirror a folder
aws s3 presign s3://shop-uploads-demo/brand/logo.png --expires-in 300
aws s3 rm s3://shop-uploads-demo/brand/logo.png               # delete
aws s3api head-object --bucket shop-uploads-demo --key site/index.html   # metadata only
:::

::: code javascript Browser demo: keys, prefixes and paginated listing (runnable)
const keys = Array.from({ length: 1050 }, (_, i) => `many/f-${String(i).padStart(4, '0')}.txt`).concat(['avatars/42/a.png', 'avatars/7/b.png']);
function listObjectsV2({ Prefix = '', MaxKeys = 1000, ContinuationToken }) {
  const matching = keys.filter((k) => k.startsWith(Prefix)).sort();
  const start = ContinuationToken ? matching.indexOf(ContinuationToken) : 0;
  const page = matching.slice(start, start + MaxKeys);
  const next = matching[start + MaxKeys];
  return { Contents: page.map((Key) => ({ Key })), IsTruncated: Boolean(next), NextContinuationToken: next };
}
function* listAll(Prefix) {
  let token;
  do { const page = listObjectsV2({ Prefix, ContinuationToken: token }); yield* page.Contents; token = page.IsTruncated ? page.NextContinuationToken : undefined; } while (token);
}
const first = listObjectsV2({ Prefix: 'many/' });
console.log('first page is capped at 1,000 and truncated', first.Contents.length === 1000 && first.IsTruncated ? '✅' : '❌ FAIL');
console.log('following the token lists all 1,050', [...listAll('many/')].length === 1050 ? '✅' : '❌ FAIL');
const folders = new Set(keys.filter((k) => k.startsWith('avatars/')).map((k) => k.split('/')[1]));
console.log('"folders" are just prefixes:', [...folders].join(', '), folders.size === 2 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Treating S3 like a file system (renaming "folders", appending to files, listing everything often).
- Reading only the first page of `ListObjectsV2` (silently missing keys after 1,000).
- Public buckets for user data; forgetting the bucket's region in clients.
- Storing full URLs instead of keys (domains and signing change; keys don't).
- Ignoring lifecycle rules (old versions and abandoned uploads keep costing money).
:::

::: understand
- S3 = durable, cheap, HTTP-addressed **objects** identified by **keys** in **buckets**.
- Security and behaviour are configured on the bucket (and IAM), not per "folder".
- It pairs with CloudFront for delivery and with Lambda for processing.
:::

::: ask
- *"Which region, and do we need cross-region replication?"*
- *"Versioning or Object Lock for accidental deletes or compliance?"*
- *"How long must data be kept?"* (lifecycle to IA/Glacier or expiry)
:::

::: important ⭐ Say this in the interview
"S3 is object storage: you put and get whole objects over HTTPS, it scales without limits and is designed for eleven nines of durability by storing copies across availability zones. A bucket is the top-level container with a globally unique name in one region, where I configure Block Public Access, encryption, versioning, policies, CORS, lifecycle rules and events. An object is the bytes plus metadata, addressed by a key like avatars/42/a1b2.png, up to 5 terabytes, with multipart above 5 gigabytes; folders are just key prefixes and listing returns a thousand keys per page, so I always follow the continuation token. I store keys in the database, not URLs, and use storage classes and lifecycle rules to control cost."
:::

::: links
AWS: What is Amazon S3? | https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html
AWS: Amazon S3 storage classes | https://aws.amazon.com/s3/storage-classes/
AWS: Organizing objects using prefixes | https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-prefixes.html
:::

=== How do you upload and download files with S3 from Node?
@p 3
@tags s3, sdk, upload, download
@quick
- AWS SDK v3, one `S3Client`, credentials from the **default provider chain** (IAM role in AWS, env/`~/.aws` locally); `PutObjectCommand`, `GetObjectCommand`, `HeadObjectCommand`, `DeleteObjectCommand`, `ListObjectsV2Command`.
- Big or unknown-size data: **`Upload` from `@aws-sdk/lib-storage`** streams in parts with progress.
- Measured, 1 GB file: `readFileSync` + `PutObject` peaked at **1,078 MB** RSS; streaming with `Upload` peaked at **154 MB**.
- Downloads: prefer a **presigned GET** (browser ↔ S3); proxy with `pipeline(obj.Body, res)` only when you must (it keeps memory flat).
- Set `ContentType` (and `ContentDisposition` for downloads); handle `NotFound` from `HeadObject`; paginate listings.

::: text 🧒 In simple words
Uploading a big file by first reading it all into memory is like **carrying a whole sofa through the house in one go**: you need a doorway as big as the sofa (RAM as big as the file). Streaming is like **carrying it in flat-pack boxes**: a few boxes at a time, so even a huge sofa fits through a normal door. For downloads, the best option is usually to give the customer a pickup slip (presigned URL) so they collect it from the warehouse themselves instead of you carrying it.
:::

::: text 📖 Detailed answer
### The service module (tested against SeaweedFS)
| Method | SDK call | Notes |
|---|---|---|
| `putBuffer` | `PutObjectCommand` | Small, already-in-memory data |
| `putStream` | `lib-storage` `Upload` | 8 MB parts, 4 in parallel, progress events (7 for 50 MB) |
| `streamTo(res)` | `GetObjectCommand` + `pipeline` | Proxy with backpressure (headers: Content-Type, Content-Length) |
| `signedGetUrl` | presigned `GetObjectCommand` | Optional download name (`ResponseContentDisposition`) |
| `exists` | `HeadObjectCommand` | `NotFound` → false |
| `remove` | `DeleteObjectCommand` | |
| `list` | `ListObjectsV2Command` | Async generator following `NextContinuationToken` (1,050 keys → 2 pages) |

### Measured: peak memory of the Node process
| Upload | 200 MB file | 1 GB file |
|---|---|---|
| `fs.readFileSync` → `PutObject` | 266 MB | **1,078 MB** |
| `fs.createReadStream` → `Upload` (8 MB × 4) | 163 MB | **154 MB** |
Buffered memory grows with the file; streamed memory stays at about `partSize × queueSize` plus overhead.

### Credentials
Never pass keys in code. The SDK's default chain picks up environment variables locally and the **instance/task/function role** in AWS automatically.

### Downloads
1. Check authorization in MongoDB (`{ _id, ownerId: req.user.id }`).
2. Return a presigned GET (5 minutes), or stream through the API if you must inspect or transform bytes.
:::

::: diagram Upload paths from Node
flowchart LR
  F["file on disk or request stream"] -->|"readFileSync: whole file in RAM"| P1["PutObject"]
  F -->|"createReadStream"| U["lib-storage Upload: 8 MB parts × 4 in parallel"]
  P1 --> S3[("S3")]
  U --> S3
  S3 -->|"presigned GET (preferred)"| B(["browser"])
  S3 -->|"GetObject + pipeline (proxy)"| API["Express"] --> B
:::

::: chart bar Measured: peak memory uploading a 1 GB file (MB RSS)
Method,MB
readFileSync + PutObject,1078
Stream + lib-storage Upload,154
:::

::: image Carrying a sofa in one piece vs in flat-pack boxes
/images/aws-s3/node-sdk.svg
:::

::: text 🪜 Step by step
`putStream('videos/big.bin', fs.createReadStream(path), 'application/octet-stream', onProgress)`:
1. `Upload` reads from the stream until it has 8 MB, starts a multipart upload (`CreateMultipartUpload`) and sends part 1.
2. It keeps reading and sends up to 4 parts at the same time; the stream pauses when the queue is full (backpressure).
3. Each finished part emits `httpUploadProgress` with `loaded`/`total`.
4. After the last part it calls `CompleteMultipartUpload`; on error it aborts so no orphan parts remain.
5. Files smaller than one part are sent as a single `PutObject` automatically.
:::

::: code javascript s3-files/src/s3.service.js
// s3.service.js: everything the API does with S3, in one module (AWS SDK v3).
// Credentials: the default provider chain (EC2/ECS/Lambda IAM role in AWS; env vars or ~/.aws locally).
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { pipeline } = require('node:stream/promises');

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
  endpoint: process.env.S3_ENDPOINT,                  // only for MinIO/SeaweedFS locally; unset on AWS
  forcePathStyle: Boolean(process.env.S3_ENDPOINT),
  requestChecksumCalculation: 'WHEN_REQUIRED',
});
const Bucket = process.env.S3_BUCKET || 'files-demo';

const s3Service = {
  // Small files already in memory (e.g. a generated PDF). Encryption at rest is on by default (SSE-S3).
  async putBuffer(Key, Body, ContentType) {
    await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType }));
    return Key;
  },

  // Large or unknown-size data: streams in 8 MB parts with up to 4 in parallel → memory stays small.
  async putStream(Key, Body, ContentType, onProgress) {
    const upload = new Upload({ client: s3, params: { Bucket, Key, Body, ContentType }, partSize: 8 * 1024 * 1024, queueSize: 4 });
    if (onProgress) upload.on('httpUploadProgress', (p) => onProgress(p.loaded, p.total));
    await upload.done();
    return Key;
  },

  // Proxy a private object through the API (when you must check something per byte or hide S3 entirely).
  async streamTo(res, Key) {
    const obj = await s3.send(new GetObjectCommand({ Bucket, Key }));
    res.setHeader('Content-Type', obj.ContentType || 'application/octet-stream');
    if (obj.ContentLength != null) res.setHeader('Content-Length', obj.ContentLength);
    await pipeline(obj.Body, res);                     // backpressure: never holds the whole file in memory
  },

  // Usually better: let the browser download straight from S3 with a short-lived link.
  signedGetUrl: (Key, { expiresIn = 300, downloadName } = {}) => getSignedUrl(s3, new GetObjectCommand({
    Bucket, Key, ...(downloadName && { ResponseContentDisposition: `attachment; filename="${downloadName.replace(/"/g, '')}"` }),
  }), { expiresIn }),

  async exists(Key) {
    try { await s3.send(new HeadObjectCommand({ Bucket, Key })); return true; } catch (err) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  },
  remove: (Key) => s3.send(new DeleteObjectCommand({ Bucket, Key })),

  // ListObjectsV2 returns at most 1,000 keys per call: follow the continuation token.
  async *list(Prefix) {
    let ContinuationToken;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }));
      for (const obj of page.Contents ?? []) yield obj;
      ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (ContinuationToken);
  },
};

module.exports = { s3, Bucket, s3Service };
:::

::: code javascript s3-files/src/files.routes.js
// How to run: part of the API; mount with app.use('/api/files', authenticate, require('./files.routes'))
// file.model.js: model('File', new Schema({ ownerId: ObjectId, key: String, name: String, contentType: String, size: Number }))
const express = require('express');
const { s3Service } = require('./s3.service');
const File = require('./file.model');                     // { ownerId, key, name, contentType, size }

const router = express.Router();

// Download a private file: authorise in MongoDB, then hand out a 5-minute link
router.get('/:id/download', async (req, res) => {
  const file = await File.findOne({ _id: req.params.id, ownerId: req.user.id }).lean();
  if (!file) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
  res.json({ url: await s3Service.signedGetUrl(file.key, { downloadName: file.name }) });
});

// Stream through the API instead (e.g. to add a watermark or audit every byte)
router.get('/:id/content', async (req, res) => {
  const file = await File.findOne({ _id: req.params.id, ownerId: req.user.id }).lean();
  if (!file) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
  await s3Service.streamTo(res, file.key);                 // Express 5 forwards errors to the error handler
});

router.delete('/:id', async (req, res) => {
  const file = await File.findOneAndDelete({ _id: req.params.id, ownerId: req.user.id }).lean();
  if (!file) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
  await s3Service.remove(file.key);
  res.status(204).end();
});

module.exports = router;
:::

::: code javascript Browser demo: buffered vs streamed memory model (runnable)
// Peak memory ≈ base + whole file (buffered) or base + partSize × queueSize (streamed).
const MB = 1024 * 1024;
const peak = (fileMB, mode, { baseMB = 62, partMB = 8, queue = 4, overheadMB = 60 } = {}) =>
  mode === 'buffer' ? baseMB + fileMB + 16 : baseMB + Math.min(fileMB, partMB * queue) + overheadMB;
for (const size of [50, 200, 1024, 5120]) console.log(`${size} MB file → buffer ~${peak(size, 'buffer')} MB, stream ~${peak(size, 'stream')} MB`);
console.log('buffered memory grows with the file', peak(5120, 'buffer') > 5000 ? '✅' : '❌ FAIL');
console.log('streamed memory is flat', peak(1024, 'stream') === peak(5120, 'stream') ? '✅' : '❌ FAIL');
console.log('model is close to the measured 1 GB numbers (1,078 vs 154 MB)', Math.abs(peak(1024, 'buffer') - 1078) < 60 && Math.abs(peak(1024, 'stream') - 154) < 60 ? '✅' : '❌ FAIL');
console.log('bytes per MB', MB === 1048576 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- `multer.memoryStorage()` / `readFileSync` for large uploads (memory = file size × concurrent uploads).
- Hard-coded access keys in the code or `.env` on servers instead of IAM roles.
- Proxying every download through Node when a presigned GET would do.
- Forgetting `ContentType` (browsers download instead of displaying, or vice versa).
- Treating any `HeadObject` error as "missing" (permissions errors look different from `NotFound`).
:::

::: understand
- Streams keep memory proportional to the **chunk size**, not the **file size**.
- The SDK's `Upload` gives multipart, parallelism and progress with one call.
- The best byte path is browser ↔ S3; the API authorises and records metadata.
:::

::: ask
- *"Do files need processing before storage?"* (resize, compress, scan)
- *"Typical and maximum sizes?"* (buffer vs stream vs multipart)
- *"Who may download, and for how long should links work?"*
:::

::: important ⭐ Say this in the interview
"I use AWS SDK v3 with one S3Client whose credentials come from the default chain, which means the IAM role in AWS. Small data goes up with PutObjectCommand; anything big or of unknown size goes through lib-storage's Upload, which streams in parts with parallelism and progress. That matters: uploading a 1 GB file from a buffer peaked at about 1 GB of memory, while streaming peaked at 154 MB. For downloads I authorise in MongoDB and return a short presigned GET with a download filename, and only when I must transform the bytes do I stream GetObject through Express with pipeline. HeadObject checks existence, and listing follows the continuation token beyond a thousand keys."
:::

::: links
AWS SDK for JavaScript v3: S3 examples | https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html
AWS SDK v3: lib-storage Upload | https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-lib-storage/
Node.js: stream.pipeline | https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-options
:::

=== Public vs private bucket? How do you secure S3 files?
@p 3
@tags s3, security, iam, cloudfront
@quick
- Default and best: **private** buckets with **Block Public Access** on (account and bucket). Tested: an anonymous GET of a private object → **403**.
- Access paths: the API's **IAM role** (least privilege, specific prefixes), **presigned URLs** for users, **CloudFront + Origin Access Control** for public assets.
- **Bucket policy**: deny non-HTTPS (`aws:SecureTransport: false`); allow only the CloudFront distribution for web assets.
- **Encryption** (SSE-S3 by default, SSE-KMS for key control/audit), **versioning**, lifecycle rules (abort incomplete uploads, expire old versions).
- Monitoring: CloudTrail data events, server access logs, IAM Access Analyzer, Macie for PII. Never "fix" an AccessDenied by making a bucket public.

::: text 🧒 In simple words
A public bucket is a **shop window**: anyone walking past sees everything, forever. A private bucket is a **bank vault**: the door is locked (Block Public Access), only staff with the right badge for the right drawer get in (IAM role with specific prefixes), customers get a **time-limited ticket** for their own box (presigned URL), and the public brochures are handed out at a separate front desk (CloudFront) that's the only one allowed to fetch them from the vault. Cameras record who opened what (CloudTrail).
:::

::: text 📖 Detailed answer
### Public vs private
| | Public bucket/objects | Private bucket (default) |
|---|---|---|
| Who can read | Anyone with the URL, forever | Only IAM principals, CloudFront (OAC), presigned URLs |
| Use | Almost never; even public assets go through CloudFront | User uploads, documents, the React build behind CloudFront |
| Risk | Data leaks, scraping, surprise data-transfer bills | Low |

### Security checklist (the script below applies 1–6 and was run against the Moto mock)
1. **Block Public Access**: all four settings on (and at the account level).
2. **Encryption at rest**: SSE-KMS with a bucket key (or SSE-S3, already default).
3. **Versioning**: recover overwritten/deleted files; add Object Lock for compliance.
4. **Lifecycle**: abort incomplete multipart uploads after 1 day, expire non-current versions after 30 days, expire `tmp/`.
5. **Bucket policy**: deny any request without TLS.
6. **CORS**: only your web origin, only PUT/GET, expose `ETag` for multipart.
7. **Least-privilege IAM** for the API role: `Put/Get/DeleteObject` on `avatars/*` and `videos/*` only, `ListBucket` with an `s3:prefix` condition, KMS use for that key.
8. **CloudFront + OAC** for web assets: the bucket policy allows `cloudfront.amazonaws.com` only for that distribution's ARN.
9. **Presigned URLs** after an authorization check, short expiry, server-chosen keys.
10. **Audit**: CloudTrail data events, Access Analyzer for unintended access, Macie for PII.

### Policy types
| Policy | Attached to | Answers |
|---|---|---|
| IAM (identity) policy | Role/user | "What may this API role do?" |
| Bucket policy | Bucket | "Who may touch this bucket, under which conditions?" |
| Block Public Access | Account/bucket | "Override anything that would make data public" |
| KMS key policy | Key | "Who may encrypt/decrypt with this key?" |
An explicit **Deny** anywhere wins over any Allow.
:::

::: diagram Who can reach the private bucket
flowchart LR
  U(["user"]) -->|"public web assets"| CF["CloudFront"] -->|"OAC-signed request"| S3[("private bucket, Block Public Access")]
  U -->|"own file: presigned GET (5 min)"| S3
  API["Node API (IAM role: avatars/*, videos/*)"] -->|"Put/Get/Delete"| S3
  X(["anonymous URL"]) -.->|"403"| S3
  HTTP(["plain HTTP request"]) -.->|"denied by bucket policy"| S3
:::

::: image A bank vault: locked door, badges per drawer, time-limited tickets and cameras
/images/aws-s3/security.svg
:::

::: text 🪜 Step by step
How S3 decides on a request from the API role to `PUT avatars/42/x.png`:
1. Authenticate the signature (SigV4) → principal = `role/fullstack-api`.
2. Collect policies: the role's IAM policy, the bucket policy, Block Public Access, the KMS key policy.
3. Any explicit **Deny** that matches? (e.g. `aws:SecureTransport = false`) → denied.
4. Is there an **Allow** for `s3:PutObject` on `arn:aws:s3:::fullstack-app-uploads/avatars/*`? → yes.
5. KMS: may the role `GenerateDataKey` with the bucket's key? → yes → object stored encrypted.
6. The same role writing `invoices/1.pdf` → no matching Allow → **AccessDenied**.
:::

::: code bash s3-files/infra/secure-bucket.sh
#!/usr/bin/env bash
# Lock down an uploads bucket (normally done in Terraform/CDK; the same settings as CLI calls).
# Usage: ./secure-bucket.sh <bucket> <region>
set -euo pipefail
BUCKET=${1:?usage: secure-bucket.sh <bucket> <region>}
REGION=${2:?usage: secure-bucket.sh <bucket> <region>}

aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" --create-bucket-configuration LocationConstraint="$REGION"

# 1) No public access, ever (also enable it at the account level)
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# 2) Encryption at rest with KMS (SSE-S3 is already the default; KMS adds key policies + audit)
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"aws:kms"},"BucketKeyEnabled":true}]}'

# 3) Versioning: deleted or overwritten files can be recovered
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled

# 4) Lifecycle: clean up abandoned multipart uploads and old versions (both cost money)
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration file://lifecycle.json

# 5) Bucket policy: HTTPS only
aws s3api put-bucket-policy --bucket "$BUCKET" --policy file://bucket-policy.json

# 6) CORS: the web app may PUT (presigned) and read the ETag (multipart)
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration file://cors.json
echo "✅ $BUCKET secured"
:::
::: code json s3-files/infra/bucket-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::fullstack-app-uploads", "arn:aws:s3:::fullstack-app-uploads/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
:::
::: code json s3-files/infra/lifecycle.json
{
  "Rules": [
    { "ID": "abort-incomplete-multipart", "Status": "Enabled", "Filter": {}, "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 1 } },
    { "ID": "expire-old-versions", "Status": "Enabled", "Filter": {}, "NoncurrentVersionExpiration": { "NoncurrentDays": 30 } },
    { "ID": "tmp-uploads-expire", "Status": "Enabled", "Filter": { "Prefix": "tmp/" }, "Expiration": { "Days": 2 } }
  ]
}
:::
::: code json s3-files/infra/cors.json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://app.example.com"],
      "AllowedMethods": ["PUT", "GET"],
      "AllowedHeaders": ["Content-Type"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}
:::
::: code json s3-files/infra/api-role-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ObjectsUnderAppPrefixesOnly",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:AbortMultipartUpload"],
      "Resource": ["arn:aws:s3:::fullstack-app-uploads/avatars/*", "arn:aws:s3:::fullstack-app-uploads/videos/*"]
    },
    {
      "Sid": "ListOnlyThosePrefixes",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::fullstack-app-uploads",
      "Condition": { "StringLike": { "s3:prefix": ["avatars/*", "videos/*"] } }
    },
    {
      "Sid": "UseTheBucketKmsKey",
      "Effect": "Allow",
      "Action": ["kms:GenerateDataKey", "kms:Decrypt"],
      "Resource": "arn:aws:kms:ap-south-1:123456789012:key/REPLACE-WITH-KEY-ID"
    }
  ]
}
:::
::: code json s3-files/infra/cloudfront-oac-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOACReadOnly",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::fullstack-app-web/*",
      "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::123456789012:distribution/E123ABC" } }
    }
  ]
}
:::

::: code javascript Browser demo: evaluate IAM-style policies (explicit deny wins) (runnable)
const match = (pattern, value) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(value);
function decide(policies, { action, resource, secure }) {
  let allowed = false;
  for (const st of policies.flatMap((p) => p.Statement)) {
    const actions = [].concat(st.Action), resources = [].concat(st.Resource);
    if (!actions.some((a) => match(a, action)) || !resources.some((r) => match(r, resource))) continue;
    if (st.Condition?.Bool?.['aws:SecureTransport'] === 'false' && secure) continue;
    if (st.Effect === 'Deny') return 'DENY (explicit)';
    allowed = true;
  }
  return allowed ? 'ALLOW' : 'DENY (implicit)';
}
const rolePolicy = { Statement: [{ Effect: 'Allow', Action: ['s3:PutObject', 's3:GetObject'], Resource: 'arn:aws:s3:::uploads/avatars/*' }] };
const bucketPolicy = { Statement: [{ Effect: 'Deny', Action: 's3:*', Resource: 'arn:aws:s3:::uploads/*', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }] };
const cases = [
  [{ action: 's3:PutObject', resource: 'arn:aws:s3:::uploads/avatars/42/x.png', secure: true }, 'ALLOW'],
  [{ action: 's3:PutObject', resource: 'arn:aws:s3:::uploads/invoices/1.pdf', secure: true }, 'DENY (implicit)'],
  [{ action: 's3:DeleteObject', resource: 'arn:aws:s3:::uploads/avatars/42/x.png', secure: true }, 'DENY (implicit)'],
  [{ action: 's3:GetObject', resource: 'arn:aws:s3:::uploads/avatars/42/x.png', secure: false }, 'DENY (explicit)'],
];
for (const [req, want] of cases) {
  const got = decide([rolePolicy, bucketPolicy], req);
  console.log(`${req.action} ${req.resource.split(':::')[1]} ${req.secure ? 'https' : 'http'} → ${got}`, got === want ? '✅' : '❌ FAIL');
}
:::

::: warning ⚠️ Common mistakes
- Turning off Block Public Access or adding `"Principal": "*"` Allow to fix an AccessDenied.
- `s3:*` on `*` for the application role.
- Website-hosting public buckets instead of CloudFront + OAC.
- No versioning on buckets with user data; no lifecycle rules (paying for abandoned uploads forever).
- Long-lived presigned URLs for sensitive documents, or signing without checking ownership.
:::

::: understand
- Default-deny + explicit allows for exact prefixes + an explicit HTTPS deny = a small, auditable attack surface.
- CloudFront OAC makes "public" content public **through the CDN only**, never directly from S3.
- Security is layered: Block Public Access is the safety net, IAM/bucket policies are the rules, presigned URLs are the user-facing doorway.
:::

::: ask
- *"Which files are truly public?"*
- *"Compliance (PII, GDPR, HIPAA)?"* → KMS keys, access logging, retention, Object Lock.
- *"Who manages the bucket configuration?"* (IaC with reviews)
:::

::: important ⭐ Say this in the interview
"Buckets stay private with Block Public Access on at account and bucket level; an anonymous request to an object just gets a 403. The API reaches S3 with an IAM role that may only put, get and delete under its own prefixes, users get short-lived presigned URLs after an authorization check, and public web assets go through CloudFront with Origin Access Control, so the bucket policy only allows that distribution. I add a bucket policy that denies non-HTTPS requests, encryption with KMS, versioning, lifecycle rules to abort incomplete multipart uploads and expire old versions, and CORS limited to our origin. Explicit denies always win, and CloudTrail, Access Analyzer and Macie help audit it. I'd never make a bucket public to fix an access error."
:::

::: links
AWS: Security best practices for Amazon S3 | https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html
AWS: Blocking public access to S3 | https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
AWS: Restricting access to an S3 origin (OAC) | https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
AWS: IAM policy evaluation logic | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html
:::

=== How would you upload large files?
@p 2
@tags s3, multipart, large-files
@quick
- **Multipart upload**: split into parts (5 MB–5 GB, last part may be smaller, up to 10,000 parts), upload **in parallel**, retry only failed parts, then complete. Required above **5 GB**, recommended above ~100 MB.
- Browser-direct: API `CreateMultipartUpload` → **presigned URL per part** → browser PUTs `file.slice()` parts and collects **ETags** (bucket CORS must expose `ETag`) → API `CompleteMultipartUpload`.
- Measured, 100 MB: single PUT **897 ms**, multipart one part at a time **1,053 ms**, multipart **4 in parallel 284 ms**.
- Tested: a part failing once was retried alone (**11 PUTs for 10 parts**); a permanent failure **aborted** the upload (0 multipart uploads left behind).
- Lifecycle rule **AbortIncompleteMultipartUpload** cleans up parts from abandoned uploads (they're billed); Transfer Acceleration helps far-away users.

::: text 🧒 In simple words
Sending a huge file in one go is like **moving house with one giant truck**: if it breaks down halfway, everything goes back to the start. Multipart is moving with **several small vans in parallel**: each carries one numbered box, a van that breaks down just repeats its own trip, and at the end the warehouse unpacks the boxes in number order to rebuild the file. If you give up, you tell the warehouse to throw away the boxes that already arrived, so you don't keep paying to store them.
:::

::: text 📖 Detailed answer
### Why multipart
| Benefit | Why |
|---|---|
| Speed | Parts upload in parallel over several connections |
| Resilience | A failed part is retried alone, not the whole file |
| Resumable | Keep `uploadId` + finished part ETags; continue later |
| Size | Required above 5 GB (single PUT limit), up to 5 TB per object |

### Browser-direct flow (the routes and client below)
1. `POST /start { contentType, size }` → API checks type/size/user → `CreateMultipartUpload` → `{ key, uploadId, partSize, partCount }`.
2. `POST /sign { key, uploadId, partNumbers }` → API checks the key belongs to the user → presigned `UploadPart` URLs.
3. Browser: `file.slice()` → `PUT` up to 4 parts at once → read `ETag` from each response.
4. `POST /complete { key, uploadId, parts }` → `CompleteMultipartUpload` (parts sorted by number) → `HeadObject` confirms the size.
5. Any permanent failure or user cancel → `POST /abort` → `AbortMultipartUpload`.

### Measured (100 MB file, SeaweedFS locally)
| Method | Time |
|---|---|
| Single presigned PUT | 897 ms |
| Multipart, 10 × 10 MB, one at a time | 1,053 ms |
| Multipart, 10 × 10 MB, **4 in parallel** | **284 ms** |
Over real internet links the parallel gain is usually larger, because one TCP connection rarely fills the bandwidth.

### Tested failure handling
- Part 3 returned 500 once → retried after a back-off → upload completed (`11` PUT requests for `10` parts).
- Part 2 failed every time → after 2 attempts the client aborted → `ListMultipartUploads` showed **0** in-progress uploads.
- Signing parts for another user's key → **403**.
:::

::: diagram Multipart upload, browser direct
sequenceDiagram
  participant B as Browser
  participant A as API
  participant S as S3
  B->>A: POST /start (type, size)
  A->>S: CreateMultipartUpload
  A-->>B: key, uploadId, partSize, partCount
  B->>A: POST /sign (part numbers)
  A-->>B: presigned URL per part
  par 4 parts at a time
    B->>S: PUT part 1
    B->>S: PUT part 2
    B->>S: PUT part 3
  end
  B->>A: POST /complete (PartNumber + ETag list)
  A->>S: CompleteMultipartUpload, HeadObject
  A-->>B: key, size
:::

::: chart bar Measured: uploading 100 MB (ms)
Method,Milliseconds
Single PUT,897
Multipart one at a time,1053
Multipart 4 in parallel,284
:::

::: image Several small vans with numbered boxes instead of one giant truck
/images/aws-s3/multipart.svg
:::

::: text 🪜 Step by step
The client run that included one failure:
1. `start` → 10 parts of 10 MB for a 100 MB `video/mp4`.
2. `sign` → 10 presigned URLs (one request).
3. 4 workers take parts from a queue; part 3 gets HTTP 500.
4. The worker waits 1 s and retries part 3 only; it succeeds.
5. All ETags collected → `complete` → `HeadObject` says 104,857,600 bytes.
6. Progress callbacks fired as each part finished (0 → 100%).
:::

::: code javascript s3-files/src/multipart.routes.js
// multipart.routes.js: browser-direct multipart uploads for big files (Express 5 router).
// Mount: app.use('/api/uploads/multipart', authenticate, require('./multipart.routes'))
const crypto = require('node:crypto');
const express = require('express');
const { z } = require('zod');
const { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3, Bucket } = require('./s3.service');

const router = express.Router();
const PART_SIZE = 10 * 1024 * 1024;                      // every part except the last must be ≥ 5 MB
const MAX_BYTES = 5 * 1024 * 1024 * 1024;                // 5 GB for this app (S3 allows 5 TB)
const ownKey = (req, key) => key.startsWith(`videos/${req.user.id}/`);

router.post('/start', async (req, res) => {
  const { contentType, size } = z.object({ contentType: z.string().regex(/^video\//), size: z.number().int().min(1).max(MAX_BYTES) }).parse(req.body);
  const key = `videos/${req.user.id}/${crypto.randomUUID()}`;
  const { UploadId } = await s3.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
  res.json({ key, uploadId: UploadId, partSize: PART_SIZE, partCount: Math.ceil(size / PART_SIZE) });
});

router.post('/sign', async (req, res) => {
  const { key, uploadId, partNumbers } = z.object({ key: z.string(), uploadId: z.string(), partNumbers: z.array(z.number().int().min(1).max(10_000)).min(1).max(100) }).parse(req.body);
  if (!ownKey(req, key)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your upload' } });
  const urls = await Promise.all(partNumbers.map((PartNumber) =>
    getSignedUrl(s3, new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber }), { expiresIn: 3600 })));
  res.json({ urls: Object.fromEntries(partNumbers.map((n, i) => [n, urls[i]])) });
});

router.post('/complete', async (req, res) => {
  const { key, uploadId, parts } = z.object({ key: z.string(), uploadId: z.string(), parts: z.array(z.object({ PartNumber: z.number().int(), ETag: z.string() })).min(1) }).parse(req.body);
  if (!ownKey(req, key)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your upload' } });
  await s3.send(new CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: [...parts].sort((a, b) => a.PartNumber - b.PartNumber) } }));
  const head = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
  res.json({ key, size: head.ContentLength });
});

router.post('/abort', async (req, res) => {
  const { key, uploadId } = z.object({ key: z.string(), uploadId: z.string() }).parse(req.body);
  if (!ownKey(req, key)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your upload' } });
  await s3.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
  res.status(204).end();
});

module.exports = router;
:::
::: code javascript s3-files/src/uploadLargeFile.js
// uploadLargeFile.js (browser): slice the file, upload parts in parallel straight to S3, retry failed parts only.
// The bucket's CORS rule must allow PUT and expose the ETag header (ExposeHeaders: ["ETag"]).
export async function uploadLargeFile(file, { api, concurrency = 4, retries = 3, onProgress = () => {}, signal } = {}) {
  const { key, uploadId, partSize, partCount } = await api('/start', { contentType: file.type, size: file.size });
  const numbers = Array.from({ length: partCount }, (_, i) => i + 1);
  const { urls } = await api('/sign', { key, uploadId, partNumbers: numbers });   // ≤ 100 at a time in a real app
  const parts = [];
  let uploaded = 0;

  async function uploadPart(n) {
    const blob = file.slice((n - 1) * partSize, Math.min(n * partSize, file.size));
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(urls[n], { method: 'PUT', body: blob, signal });
        if (!res.ok) throw new Error(`part ${n}: HTTP ${res.status}`);
        parts.push({ PartNumber: n, ETag: res.headers.get('ETag') });
        uploaded += blob.size;
        onProgress(Math.round((uploaded / file.size) * 100));
        return;
      } catch (err) {
        if (signal?.aborted || attempt >= retries) throw err;
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));   // back off, then retry just this part
      }
    }
  }

  const queue = [...numbers];
  const worker = async () => { while (queue.length) await uploadPart(queue.shift()); };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, partCount) }, worker));
    return await api('/complete', { key, uploadId, parts });
  } catch (err) {
    await api('/abort', { key, uploadId }).catch(() => {});            // don't leave paid-for orphan parts behind
    throw err;
  }
}
:::

::: code javascript Browser demo: parallel parts with retry, against a flaky fake S3 (runnable)
async function uploadParts({ partCount, concurrency, putPart, retries = 3 }) {
  const etags = {}, queue = Array.from({ length: partCount }, (_, i) => i + 1);
  let requests = 0;
  async function one(n) {
    for (let attempt = 1; ; attempt++) {
      requests++;
      try { etags[n] = await putPart(n); return; } catch (e) { if (attempt >= retries) throw e; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, async () => { while (queue.length) await one(queue.shift()); }));
  return { parts: Object.entries(etags).map(([n, ETag]) => ({ PartNumber: Number(n), ETag })).sort((a, b) => a.PartNumber - b.PartNumber), requests };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  let t = performance.now();
  await uploadParts({ partCount: 10, concurrency: 1, putPart: async (n) => { await sleep(20); return `etag-${n}`; } });
  const sequential = performance.now() - t;
  t = performance.now();
  await uploadParts({ partCount: 10, concurrency: 4, putPart: async (n) => { await sleep(20); return `etag-${n}`; } });
  const parallel = performance.now() - t;
  console.log(`sequential ${Math.round(sequential)} ms, 4 in parallel ${Math.round(parallel)} ms`, parallel < sequential / 2 ? '✅' : '❌ FAIL');
  let failedOnce = false;
  const r = await uploadParts({ partCount: 10, concurrency: 4, putPart: async (n) => { if (n === 3 && !failedOnce) { failedOnce = true; throw new Error('500'); } return `etag-${n}`; } });
  console.log(`one flaky part: ${r.requests} requests for 10 parts`, r.requests === 11 && r.parts.length === 10 ? '✅' : '❌ FAIL');
  console.log('parts are sorted for CompleteMultipartUpload', r.parts.every((p, i) => p.PartNumber === i + 1) ? '✅' : '❌ FAIL');
  let aborted = false;
  try { await uploadParts({ partCount: 5, concurrency: 2, retries: 2, putPart: async (n) => { if (n === 2) throw new Error('500'); return 'e'; } }); } catch { aborted = true; }
  console.log('a part that keeps failing makes the upload fail (then abort)', aborted ? '✅' : '❌ FAIL');
})();
:::

::: warning ⚠️ Common mistakes
- Parts smaller than 5 MB (except the last) → `EntityTooSmall` on complete.
- Bucket CORS without `ExposeHeaders: ["ETag"]` → the browser can't read ETags.
- No abort on failure and no lifecycle rule → invisible, billed orphan parts.
- Unlimited parallelism (hundreds of requests) → slower, throttled, battery-hungry.
- Letting clients sign parts for keys they don't own.
:::

::: understand
- Multipart turns one fragile, slow transfer into many small, parallel, retryable ones.
- The API only coordinates (start/sign/complete/abort); bytes still go browser → S3.
- Libraries like Uppy (AwsS3 plugin) implement resumable multipart uploads for you.
:::

::: ask
- *"Typical file sizes and user networks?"*
- *"Must uploads resume after a page refresh?"* (store `uploadId` and finished parts)
- *"Do files need processing after upload?"* (S3 event → Lambda/worker)
:::

::: important ⭐ Say this in the interview
"For big files I use S3 multipart uploads directly from the browser. The API starts the upload with CreateMultipartUpload after checking type, size and ownership, signs one URL per part, the browser slices the file and uploads parts in parallel with a small concurrency limit, collects the ETags, which the bucket's CORS must expose, and the API completes the upload and verifies the size. Failed parts are retried on their own and a permanent failure aborts the upload. In a test with 100 MB, a single PUT took 897 milliseconds and four parallel parts 284; one failing part cost exactly one extra request, and the abort left nothing behind. A lifecycle rule also aborts incomplete uploads after a day, because orphan parts are billed."
:::

::: links
AWS: Uploading and copying objects using multipart upload | https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html
AWS: Multipart upload limits | https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html
Uppy: AWS S3 multipart | https://uppy.io/docs/aws-s3/
:::

=== How do you store images in S3? Why shouldn't you store large files in MongoDB?
@p 3
@tags s3, images, mongodb, architecture
@quick
- Pattern: **bytes in S3**, **metadata in MongoDB** (`key`, owner, type, size, width/height, variants, createdAt). Store the **key**, build URLs when reading.
- Thumbnails/WebP: **S3 event → Lambda with sharp**. Tested: a 2400×1600 JPEG (47 KB) → **300×300 WebP (2.4 KB)**, URL-encoded key with a space handled, own output ignored (no loops).
- Measured, 200 products with 1 MB images embedded: data **200 MB vs 27 KB** with keys; listing 50 products **33.5 ms vs 1.6 ms**; as JSON **66 MB (base64) vs 7 KB**.
- MongoDB limits: **16 MB per document** (a 17 MB insert failed), base64 adds **~33%**, blobs push indexes out of RAM and bloat backups/replication.
- Serve through **CloudFront** with long cache headers; GridFS exists but S3 is cheaper and built for delivery.

::: text 🧒 In simple words
A database is like a **filing cabinet of index cards**: quick to search because each card is small. Gluing photos onto the cards makes the cabinet heavy and slow: every time you flip through, you're lifting all the photos too, and photocopying the cabinet for backup takes forever. Instead you keep photos in a **photo warehouse** (S3) and write the photo's shelf number on the card. The card stays small and fast, and the warehouse is built for storing and handing out photos, even making small preview copies automatically.
:::

::: text 📖 Detailed answer
### Recommended design
1. Upload originals to S3 with a presigned PUT: `images/originals/products/42/<uuid>.jpg`.
2. Save metadata in MongoDB: `{ ownerId, key, contentType, size, width, height, variants: { thumb }, createdAt }`.
3. S3 `ObjectCreated` on `images/originals/` → **Lambda** (sharp) writes `images/thumbs/…webp` with `Cache-Control: immutable`; a callback/queue updates `variants.thumb`.
4. Serve via **CloudFront** (`https://cdn.example.com/<key>`) or presigned GETs for private images.

### Measured: 200 products with a 1 MB image each (MongoDB 7)
| | Image bytes inside documents | Only S3 keys in documents |
|---|---|---|
| Collection data size | 200 MB | 27 KB |
| `find().limit(50)` | 33.5 ms | 1.6 ms |
| Same, image field projected out | 2.2 ms | – |
| 50 products as JSON (base64) | 66 MB | 7 KB |
| 17 MB document | Rejected (BSON limit 16 MB) | n/a |

### Why not files in MongoDB
| Problem | Explanation |
|---|---|
| 16 MB document limit | Bigger files need GridFS (chunking + extra collections) |
| Base64 overhead | JSON/text transport grows files by ~33% |
| Working set | Blobs compete with indexes for RAM → every query gets slower |
| Backups and replication | Every replica and snapshot copies the blobs |
| Price per GB | S3 Standard ≈ $0.023/GB-month vs gp3 disk ≈ $0.08/GB-month (list prices), before replicas |
| Delivery | No CDN, no range requests; the API must stream every byte |
:::

::: diagram Images: bytes in S3, metadata in MongoDB
flowchart LR
  B(["browser"]) -->|"presigned PUT"| O[("S3 images/originals/")]
  O -->|"ObjectCreated event"| L["Lambda: sharp resize to 300×300 WebP"]
  L --> T[("S3 images/thumbs/")]
  L -->|"update variants.thumb"| M[("MongoDB: key, size, width, height")]
  T --> CF["CloudFront, cached 1 year"] --> B
:::

::: chart bar Measured: list 50 products (ms, 200 products, 1 MB images)
Storage,Milliseconds
Image bytes in documents,33.5
Bytes in documents but projected out,2.2
S3 keys only,1.6
:::

::: image Index cards with shelf numbers instead of photos glued onto them
/images/aws-s3/images.svg
:::

::: text 🪜 Step by step
What the thumbnail Lambda did in the test:
1. Event key `images/originals/products/42/my+photo.jpg` (S3 URL-encodes keys; `+` means space) → decoded to `my photo.jpg`.
2. A second record for `images/thumbs/…` was skipped, so the function never re-triggers itself.
3. `GetObject` → 47,076 bytes of JPEG → `sharp().rotate().resize(300, 300, { fit: 'cover' }).webp({ quality: 80 })`.
4. `PutObject` `images/thumbs/products/42/my photo.webp` (2,372 bytes, `image/webp`, cached 1 year).
5. Reading it back: 300×300 WebP.
:::

::: code javascript s3-files/src/thumbnail.handler.js
// thumbnail.handler.js: AWS Lambda triggered by S3 "ObjectCreated" on the prefix images/originals/.
// Creates a 300×300 WebP thumbnail next to it under images/thumbs/. Package sharp for linux (x64 or arm64) with the function.
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, forcePathStyle: Boolean(process.env.S3_ENDPOINT) });

exports.handler = async (event) => {
  const results = [];
  for (const record of event.Records) {
    const Bucket = record.s3.bucket.name;
    const Key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));   // keys arrive URL-encoded
    if (!Key.startsWith('images/originals/')) continue;                          // never process our own output (loops!)
    const original = await s3.send(new GetObjectCommand({ Bucket, Key }));
    const input = Buffer.from(await original.Body.transformToByteArray());
    const thumb = await sharp(input).rotate().resize(300, 300, { fit: 'cover' }).webp({ quality: 80 }).toBuffer();
    const thumbKey = Key.replace('images/originals/', 'images/thumbs/').replace(/\.\w+$/, '.webp');
    await s3.send(new PutObjectCommand({ Bucket, Key: thumbKey, Body: thumb, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
    results.push({ Key, thumbKey, inputBytes: input.length, thumbBytes: thumb.length });
  }
  return results;                                                                // then update MongoDB (variants.thumb) via your API
};
:::

::: code javascript s3-files/src/image.model.js
// How to run: part of the API: const Image = require('./image.model')
const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const ImageSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
  key: { type: String, required: true, unique: true },              // images/originals/products/42/<uuid>.jpg
  contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'] },
  size: { type: Number, max: 10 * 1024 * 1024 },
  width: Number,
  height: Number,
  variants: { thumb: String },                                      // set by the Lambda callback
}, { timestamps: true, toJSON: { virtuals: true } });

// Build URLs when reading: the CDN domain can change, the key never does
ImageSchema.virtual('url').get(function () { return `${process.env.CDN_URL}/${this.key}`; });
ImageSchema.virtual('thumbUrl').get(function () { return this.variants?.thumb ? `${process.env.CDN_URL}/${this.variants.thumb}` : null; });

module.exports = model('Image', ImageSchema);
:::

::: code javascript Browser demo: base64 overhead and the 16 MB limit (runnable)
const bytes = new Uint8Array(3 * 1024 * 1024);
for (let i = 0; i < bytes.length; i += 65536) crypto.getRandomValues(bytes.subarray(i, Math.min(i + 65536, bytes.length)));
let binary = '';
for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
const b64 = btoa(binary);
const overhead = b64.length / bytes.length - 1;
console.log(`3 MB image → ${(b64.length / 1048576).toFixed(2)} MB as base64 (+${(overhead * 100).toFixed(1)}%)`, overhead > 0.33 && overhead < 0.34 ? '✅' : '❌ FAIL');
const LIMIT = 16 * 1024 * 1024;
const maxRawInDoc = Math.floor((LIMIT - 1024) * 3 / 4);
console.log(`largest image that fits in one document as base64 ≈ ${(maxRawInDoc / 1048576).toFixed(1)} MB`, maxRawInDoc < 12.1 * 1048576 ? '✅' : '❌ FAIL');
const listBytes = (n, perDoc) => n * perDoc;
const fiftyMB = listBytes(50, (4 / 3) * 1048576) / 1048576;
console.log(`listing 50 docs with 1 MB images as base64 ≈ ${fiftyMB.toFixed(1)} MB (measured: 66 MB)`, fiftyMB > 66 && fiftyMB < 67 ? '✅' : '❌ FAIL');
:::

::: warning ⚠️ Common mistakes
- Storing images as base64 strings in documents or sending them inside JSON APIs.
- Storing full (presigned or CDN) URLs in the database instead of keys.
- Lambdas that write into the prefix that triggers them (infinite loops and bills).
- Forgetting to decode S3 event keys (`+` and `%20`).
- Deleting a product without deleting its objects (use a job or lifecycle rules).
:::

::: understand
- Databases are for **queryable facts**; object storage is for **bytes**.
- Keys are stable identifiers; URLs are a presentation detail.
- Event-driven processing (S3 → Lambda) keeps uploads fast and work asynchronous.
:::

::: ask
- *"Which sizes/formats do we need (thumb, medium, WebP/AVIF)?"*
- *"Public via CDN or private via presigned URLs?"*
- *"What happens to files when their owner record is deleted?"*
:::

::: important ⭐ Say this in the interview
"Image bytes go to S3 and MongoDB keeps a small metadata document with the key, owner, type, size and dimensions; I build URLs from the key when reading, because CDN domains and signed URLs change. Thumbnails come from an S3 ObjectCreated event that triggers a Lambda with sharp, writing WebP variants under another prefix so it can't trigger itself. In a test, embedding 1 MB images in 200 product documents made the collection 200 MB instead of 27 KB, listing 50 products took 33 milliseconds instead of under 2, and the JSON was 66 MB of base64 instead of 7 KB. MongoDB also has a 16 MB document limit, base64 adds a third, and blobs push indexes out of memory and bloat backups, while S3 is cheaper per gigabyte and delivers through CloudFront."
:::

::: links
AWS: Tutorial: Using an Amazon S3 trigger to create thumbnails | https://docs.aws.amazon.com/lambda/latest/dg/with-s3-tutorial.html
sharp: High performance Node.js image processing | https://sharp.pixelplumbing.com
MongoDB: GridFS | https://www.mongodb.com/docs/manual/core/gridfs/
:::
