@section AWS S3
@icon 🪣
@color #16a34a
@desc Buckets & objects, upload/download, public vs private, presigned URLs, security, large files, images, and why files don't belong in MongoDB.

=== What is a pre-signed URL?
@p 3
@tags s3, presigned-url, security
@quick
- A **temporary URL** that grants **one specific action** (GET or PUT) on **one object** for a limited time (seconds to max 7 days).
- Generated **server-side** with AWS credentials (IAM role); the signature is in the query string. No AWS keys are exposed to the browser.
- Upload: React **PUTs directly to S3** → offloads bandwidth/CPU from Node. Download: time-limited access to **private** files.
- Permissions = those of the signer at request time; can't exceed them.
- Keep expiry short; validate type/size before signing; unique keys; still verify the upload afterwards.

::: text
A **presigned URL** is an S3 URL with a cryptographic **signature** and **expiry** in its query string (`X-Amz-Signature`, `X-Amz-Expires`, `X-Amz-Credential`…). Anyone holding the URL can perform **exactly that operation** (e.g. `PUT avatars/42/abc.png`) until it expires.

### Why it's used
- **Uploads**: the browser uploads **directly to S3**. Your Node server doesn't handle the bytes, so there are no memory spikes, timeouts or bandwidth costs, and it scales for free.
- **Downloads of private files**: invoices, reports, user documents. The bucket stays private and users get a link valid for e.g. 5–60 minutes.
- **Security**: AWS credentials never leave the server; you control **who** can upload **what**, **where**, and **for how long**.

### Limits & tips
- Max expiry: **7 days** (SigV4); if signed with temporary role credentials, it expires when those credentials expire.
- Content-Type (and optionally checksum/size) can be part of the signature, and the client must send matching headers.
- For **size limits** use a **presigned POST** with a policy (`content-length-range`); a presigned PUT can't enforce size by itself.
- Large files: **multipart upload** with a presigned URL per part.
:::

::: diagram Upload via presigned URL
sequenceDiagram
  participant B as Browser (React)
  participant API as Node API (IAM role)
  participant S3 as S3 private bucket
  B->>API: POST /uploads/presign (contentType, size)
  API->>API: auth, validate, key = docs/u42/uuid.pdf
  API-->>B: signed PUT URL (valid 60s)
  B->>S3: PUT file bytes directly
  S3-->>B: 200 ETag
  B->>API: POST /documents (key)
  API->>S3: HeadObject verify
  API-->>B: saved
:::

::: code javascript Generate presigned PUT, GET and POST (AWS SDK v3)
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const crypto = require('crypto');

const s3 = new S3Client({ region: 'ap-south-1' });
const Bucket = process.env.S3_BUCKET;

// 1) Upload URL (PUT)
async function presignUpload(userId, contentType) {
  const Key = `uploads/${userId}/${crypto.randomUUID()}`;
  const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key, ContentType: contentType }), { expiresIn: 60 });
  return { url, key: Key };
}

// 2) Download URL (GET) for a private file, forcing a download filename
async function presignDownload(Key, fileName) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket, Key, ResponseContentDisposition: `attachment; filename="${fileName}"` }),
    { expiresIn: 300 }
  );
}

// 3) Presigned POST: can ENFORCE max size + content type prefix
async function presignPost(userId) {
  return createPresignedPost(s3, {
    Bucket,
    Key: `uploads/${userId}/${crypto.randomUUID()}`,
    Conditions: [['content-length-range', 0, 5 * 1024 * 1024], ['starts-with', '$Content-Type', 'image/']],
    Expires: 60,
  }); // → { url, fields } → browser sends multipart/form-data with fields + file
}
:::

::: ask
- *"Upload or download? Max size? Who may access the file later?"* *"Should URLs be shareable (longer expiry) or strictly per-session?"*
- Mention you'd **verify the upload** server-side (HeadObject) before saving the key, and consider S3 event → Lambda for virus scan/thumbnails.
:::

::: links
Sharing objects with presigned URLs | https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html
Uploading with presigned URLs | https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html
:::

=== What is S3? Bucket vs object?
@p 3
@tags s3, basics
@quick
- **S3 (Simple Storage Service)** = object storage: virtually unlimited, **11 nines durability**, pay per GB + requests.
- **Bucket** = container with a **globally unique name**, in one region; settings: versioning, encryption, policies, lifecycle, CORS.
- **Object** = file + metadata, identified by a **key** (`users/42/avatar.png`); max **5 TB** (single PUT ≤ 5 GB → multipart).
- "Folders" are just **key prefixes**.
- Storage classes: Standard, Intelligent-Tiering, Standard-IA, Glacier (archive), with lifecycle rules to move/delete.

::: text
**Amazon S3** stores **objects** (files) in **buckets**. It's not a file system and not a database: you PUT and GET whole objects over HTTPS.

| | Bucket | Object |
|---|---|---|
| What | Top-level container | The file itself + metadata |
| Naming | Globally unique (`shop-prod-uploads-ap-south-1`) | Key within a bucket (`invoices/2026/09/inv-1001.pdf`) |
| Settings | Region, versioning, default encryption, Block Public Access, bucket policy, CORS, lifecycle | Content-Type, Cache-Control, tags, storage class, version id |
| Limits | 100 buckets per account (soft) | Up to 5 TB; unlimited count |

### Why developers love it
- **Durability** 99.999999999% (data copied across ≥3 AZs), 99.99% availability (Standard).
- **Cheap and infinite**: no capacity planning.
- Integrates with **CloudFront** (CDN), **Lambda** (event triggers on upload), **Athena** (query files), IAM and KMS encryption.
- Common uses: user uploads, static website/React hosting, backups, logs, data lakes.
:::

::: diagram
flowchart TD
  ACC["AWS account"] --> B1[("Bucket: shop-prod-uploads, region ap-south-1")]
  ACC --> B2[("Bucket: shop-web-prod")]
  B1 --> K1["key: avatars/42/a1b2.png"]
  B1 --> K2["key: invoices/2026/09/inv-1001.pdf"]
  B2 --> K3["key: index.html"]
  B2 --> K4["key: assets/index-9f8e.js"]
:::

::: code bash AWS CLI essentials
aws s3 mb s3://shop-prod-uploads-ap-south-1 --region ap-south-1   # make bucket
aws s3 cp ./logo.png s3://shop-prod-uploads-ap-south-1/brand/logo.png
aws s3 ls s3://shop-prod-uploads-ap-south-1/brand/
aws s3 sync ./dist s3://shop-web-prod --delete                      # deploy React build
aws s3 presign s3://shop-prod-uploads-ap-south-1/brand/logo.png --expires-in 300
aws s3 rm s3://shop-prod-uploads-ap-south-1/brand/logo.png
:::

::: ask
- *"Which region? Is versioning needed (accidental deletes)? Retention requirements?"* → lifecycle rules to Glacier / expiry.
:::

::: links
What is Amazon S3 | https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html
S3 storage classes | https://aws.amazon.com/s3/storage-classes/
:::

=== How do you upload and download files with S3 from Node?
@p 3
@tags s3, sdk, upload, download
@quick
- SDK v3: `PutObjectCommand` (upload), `GetObjectCommand` (download stream), `DeleteObjectCommand`, `HeadObjectCommand`, `ListObjectsV2Command`.
- Credentials from the **IAM role** (EC2/ECS/Lambda) via the default provider chain; never hard-coded.
- Large uploads/streams: `@aws-sdk/lib-storage` **`Upload`** (automatic multipart + progress).
- Download: stream `Body` to the response (`pipeline`), or return a **presigned GET URL** (better: no proxying).
- Set `ContentType` on upload so browsers render/download correctly.

::: code javascript s3.service.js: complete service (AWS SDK v3)
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { pipeline } = require('stream/promises');

const s3 = new S3Client({ region: process.env.AWS_REGION }); // creds: IAM role / env / ~/.aws (default chain)
const Bucket = process.env.S3_BUCKET;

const s3Service = {
  // Small buffer upload (e.g. from multer memoryStorage)
  async putBuffer(Key, buffer, ContentType) {
    await s3.send(new PutObjectCommand({ Bucket, Key, Body: buffer, ContentType, ServerSideEncryption: 'AES256' }));
    return Key;
  },

  // Stream / large upload with automatic multipart + progress
  async putStream(Key, stream, ContentType, onProgress) {
    const upload = new Upload({ client: s3, params: { Bucket, Key, Body: stream, ContentType }, queueSize: 4, partSize: 10 * 1024 * 1024 });
    upload.on('httpUploadProgress', (p) => onProgress?.(p.loaded, p.total));
    await upload.done();
    return Key;
  },

  // Stream a private object through the API (use when you must add auth/processing)
  async streamTo(res, Key) {
    const obj = await s3.send(new GetObjectCommand({ Bucket, Key }));
    res.setHeader('Content-Type', obj.ContentType || 'application/octet-stream');
    res.setHeader('Content-Length', obj.ContentLength);
    await pipeline(obj.Body, res);
  },

  // Preferred for downloads: short-lived link, browser downloads directly from S3
  signedGetUrl: (Key, expiresIn = 300) => getSignedUrl(s3, new GetObjectCommand({ Bucket, Key }), { expiresIn }),

  exists: (Key) => s3.send(new HeadObjectCommand({ Bucket, Key })).then(() => true).catch((e) => (e.name === 'NotFound' ? false : Promise.reject(e))),
  remove: (Key) => s3.send(new DeleteObjectCommand({ Bucket, Key })),
  list: (Prefix) => s3.send(new ListObjectsV2Command({ Bucket, Prefix, MaxKeys: 100 })).then((r) => r.Contents || []),
};

// Routes
router.get('/files/:id/download', authenticate, asyncHandler(async (req, res) => {
  const file = await File.findOne({ _id: req.params.id, ownerId: req.user.id }).lean();   // authorization!
  if (!file) return res.status(404).json({ message: 'Not found' });
  res.json({ url: await s3Service.signedGetUrl(file.key) });
}));

module.exports = s3Service;
:::

::: ask
- *"Do files need processing (resize/compress) before storage?"* Proxy through Node or use Lambda triggers. Otherwise, presigned direct upload.
:::

::: links
AWS SDK v3 S3 examples | https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html
lib-storage Upload | https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-lib-storage/
:::

=== Public vs private bucket? How do you secure S3 files?
@p 3
@tags s3, security, iam, cloudfront
@quick
- Default & best: **private** buckets with **Block Public Access ON**.
- Access via: **IAM role** (server), **presigned URLs** (users), **CloudFront + OAC** (public assets through the CDN only).
- **Bucket policy**: deny non-HTTPS (`aws:SecureTransport`), restrict to the CloudFront distribution / VPC endpoint.
- **Encryption**: SSE-S3 (default) or SSE-KMS; **versioning** + MFA delete for critical data; lifecycle rules.
- Least-privilege IAM (only `s3:GetObject/PutObject` on `arn:aws:s3:::bucket/uploads/*`), access logs / CloudTrail, never make a bucket public to "fix" access errors.

::: text
### Public vs private
| | Public bucket/objects | Private bucket ✅ |
|---|---|---|
| Access | Anyone with the URL, forever | Only authorised principals / signed URLs |
| Use | Truly public static assets (better via CloudFront) | User uploads, invoices, reports, anything personal |
| Risk | **Data leaks** (a classic breach headline) | Minimal |

### Security checklist
1. **Block Public Access** at account and bucket level.
2. **Least-privilege IAM**: the app role gets only the actions and prefixes it needs.
3. Serve public assets through **CloudFront with Origin Access Control (OAC)**. The bucket policy allows only CloudFront.
4. **Presigned URLs** for private user files (short expiry, authz check before signing).
5. **Encryption at rest** (SSE-S3/SSE-KMS) and **in transit** (deny HTTP via `aws:SecureTransport`).
6. **Versioning** + **Object Lock** (compliance) + lifecycle rules for old versions.
7. **Logging/monitoring**: CloudTrail data events, S3 server access logs, AWS Config rules, Macie (PII detection).
8. Validate uploads (type/size), use random keys, and scan for malware if files are shared between users.
:::

::: diagram
flowchart LR
  U(["User"]) -->|"public assets"| CF["CloudFront"] -->|"OAC signed request"| S3[("Private bucket, Block Public Access ON")]
  U -->|"private file: presigned GET, 5 min"| S3
  API["Node API with IAM role"] -->|"Put/Get on uploads/*"| S3
  X(["Anonymous direct URL"]) -.->|"403 Access Denied"| S3
:::

::: code json Bucket policy: CloudFront-only reads + enforce HTTPS
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontOAC",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::shop-web-prod/*",
      "Condition": { "StringEquals": { "AWS:SourceArn": "arn:aws:cloudfront::123456789012:distribution/E123ABC" } }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::shop-web-prod", "arn:aws:s3:::shop-web-prod/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
:::

::: code json IAM policy for the API role (least privilege)
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::shop-prod-uploads/uploads/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::shop-prod-uploads",
      "Condition": { "StringLike": { "s3:prefix": ["uploads/*"] } }
    }
  ]
}
:::

::: ask
- *"Which files are genuinely public?"* *"Any compliance (PII, GDPR, HIPAA)?"* → KMS keys, access logging, retention.
:::

::: links
S3 security best practices | https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html
CloudFront Origin Access Control | https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
:::

=== How would you upload large files?
@p 2
@tags s3, multipart, large-files
@quick
- **Multipart upload**: split into parts (5 MB–5 GB each, up to 10,000 parts), upload **in parallel**, retry failed parts only, then complete.
- Required > 5 GB; recommended > 100 MB.
- Browser-direct: server calls `CreateMultipartUpload` → presigned URL **per part** → browser PUTs parts (collects ETags) → server `CompleteMultipartUpload`.
- Resumable uploads, progress bars, abort on cancel; lifecycle rule to **abort incomplete multipart uploads** (they cost money).
- Optional: **S3 Transfer Acceleration** for far-away users.

::: text
### Why multipart?
- **Parallelism** = faster throughput.
- **Resilience**: a network glitch only retries one part, not a 2 GB file.
- **Resumable**: keep the uploadId + uploaded part ETags and continue later.
- Required above **5 GB** (the single PUT limit).

### Browser-direct multipart flow
1. `POST /uploads/multipart/start { fileName, size, type }` → server: `CreateMultipartUpload` → returns `uploadId`, `key`.
2. The client slices the file (`file.slice(start, end)`) into e.g. 10 MB parts → asks for presigned URLs for part numbers 1…N.
3. The client PUTs the parts in parallel (e.g. 4 at a time) and records each `ETag` from the response headers (bucket CORS must **expose `ETag`**).
4. `POST /uploads/multipart/complete { uploadId, key, parts: [{ PartNumber, ETag }] }` → server: `CompleteMultipartUpload`.
5. On cancel/failure → `AbortMultipartUpload`.
:::

::: diagram
sequenceDiagram
  participant B as Browser
  participant A as API
  participant S as S3
  B->>A: start (name, size)
  A->>S: CreateMultipartUpload
  A-->>B: uploadId + key
  B->>A: presign parts 1..N
  A-->>B: N signed URLs
  par parallel parts
    B->>S: PUT part 1
    B->>S: PUT part 2
    B->>S: PUT part 3
  end
  B->>A: complete (ETags)
  A->>S: CompleteMultipartUpload
  S-->>A: object assembled
:::

::: code javascript Server: multipart endpoints (SDK v3)
const { CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } = require('@aws-sdk/client-s3');

router.post('/uploads/multipart/start', authenticate, asyncHandler(async (req, res) => {
  const Key = `videos/${req.user.id}/${crypto.randomUUID()}`;
  const { UploadId } = await s3.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType: req.body.contentType }));
  res.json({ uploadId: UploadId, key: Key });
}));

router.post('/uploads/multipart/sign', authenticate, asyncHandler(async (req, res) => {
  const { key, uploadId, partNumbers } = req.body;
  const urls = await Promise.all(partNumbers.map((PartNumber) =>
    getSignedUrl(s3, new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber }), { expiresIn: 3600 })));
  res.json({ urls });
}));

router.post('/uploads/multipart/complete', authenticate, asyncHandler(async (req, res) => {
  const { key, uploadId, parts } = req.body; // [{ PartNumber, ETag }]
  await s3.send(new CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) } }));
  res.json({ key });
}));

router.post('/uploads/multipart/abort', authenticate, asyncHandler(async (req, res) => {
  await s3.send(new AbortMultipartUploadCommand({ Bucket, Key: req.body.key, UploadId: req.body.uploadId }));
  res.status(204).end();
}));
:::

::: code javascript Client: slice + parallel part uploads with a concurrency limit (browser)
async function uploadLargeFile(file, onProgress) {
  const PART_SIZE = 10 * 1024 * 1024;
  const partCount = Math.ceil(file.size / PART_SIZE);
  const { uploadId, key } = await api.post('/uploads/multipart/start', { contentType: file.type }).then((r) => r.data);
  const { urls } = await api.post('/uploads/multipart/sign', { key, uploadId, partNumbers: [...Array(partCount)].map((_, i) => i + 1) }).then((r) => r.data);

  let uploaded = 0;
  const parts = [];
  const queue = urls.map((url, i) => async () => {
    const blob = file.slice(i * PART_SIZE, Math.min((i + 1) * PART_SIZE, file.size));
    const res = await fetch(url, { method: 'PUT', body: blob });
    if (!res.ok) throw new Error(`Part ${i + 1} failed`);
    parts.push({ PartNumber: i + 1, ETag: res.headers.get('ETag') });
    uploaded += blob.size;
    onProgress(Math.round((uploaded / file.size) * 100));
  });

  // run with concurrency 4
  const workers = Array.from({ length: 4 }, async () => { while (queue.length) await queue.shift()(); });
  try {
    await Promise.all(workers);
    return api.post('/uploads/multipart/complete', { key, uploadId, parts }).then((r) => r.data);
  } catch (e) {
    await api.post('/uploads/multipart/abort', { key, uploadId });
    throw e;
  }
}
:::

::: ask
- *"Typical file sizes and user locations?"* *"Is resumability after a browser refresh required?"* (Store the upload state in localStorage/DB.)
- Libraries such as **Uppy** (with the AWS S3 multipart plugin) implement all of this.
:::

::: links
Multipart upload overview | https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html
Uppy S3 multipart | https://uppy.io/docs/aws-s3/
:::

=== How do you store images in S3? Why shouldn't you store large files in MongoDB?
@p 3
@tags s3, images, mongodb, architecture
@quick
- Pattern: **file bytes → S3**, **metadata → MongoDB** (`key`, size, contentType, ownerId, width/height, createdAt).
- Store the **key**, not a full URL (URLs change: CDN domain, presigned expiry); build URLs when reading.
- Serve via **CloudFront** (cache, resize via Lambda@Edge/CloudFront Functions or a service like imgix/Cloudinary); generate thumbnails with **S3 event → Lambda (sharp)**.
- Why not MongoDB: **16 MB doc limit**, base64 bloats **~33%**, bloats RAM/working set and backups, slows queries & replication, expensive storage, no CDN.
- GridFS exists for > 16 MB, but S3 is cheaper and better for serving.

::: text
### Recommended design
1. Upload to S3 (presigned PUT) with key `images/{entity}/{id}/{uuid}.webp`.
2. Save a **metadata document** in MongoDB:
   `{ _id, ownerId, key: "images/products/42/9f8e.webp", contentType: "image/webp", size: 183422, width: 1200, height: 800, variants: { thumb: "…/thumb.webp" }, createdAt }`
3. An S3 `ObjectCreated` event → **Lambda** uses **sharp** to create thumbnails/WebP variants → updates the metadata.
4. Serve through **CloudFront** (`https://cdn.example.com/images/...`) with long cache headers.

### Why not store files in MongoDB?
| Problem | Explanation |
|---|---|
| **16 MB document limit** | Bigger files need GridFS (chunking), which adds complexity |
| **Base64 overhead** | Embedding binary as base64 JSON increases size by ~**33%** |
| **Working set / RAM** | MongoDB tries to keep hot data in memory; large blobs evict useful indexes/data → slower queries for everyone |
| **Backups & replication** | Every replica and backup copies the blobs, making them slow and costly |
| **Cost** | DB storage (Atlas/EBS) is ~5–10× pricier than S3 per GB |
| **Delivery** | No CDN, no range requests, and the API must stream every byte |

**S3 is purpose-built** for objects: cheap, durable, CDN-friendly, and supports range requests, lifecycle and events.
:::

::: chart bar Storage cost per TB per month (approx., USD)
Storage,USD per TB-month
S3 Standard,23
S3 Standard-IA,12.5
EBS gp3 (DB disk),80
MongoDB Atlas storage (typical),250
:::

::: code javascript Metadata model + thumbnail Lambda (sharp)
// ---------- Mongo metadata ----------
const ImageSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, index: true },
  key: { type: String, required: true, unique: true },
  contentType: String,
  size: Number,
  width: Number,
  height: Number,
  variants: { thumb: String, medium: String },
}, { timestamps: true });

ImageSchema.virtual('url').get(function () { return `${process.env.CDN_URL}/${this.key}`; });

// ---------- Lambda triggered by S3 ObjectCreated on prefix images/originals/ ----------
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const s3 = new S3Client({});

exports.handler = async (event) => {
  for (const record of event.Records) {
    const Bucket = record.s3.bucket.name;
    const Key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const original = await s3.send(new GetObjectCommand({ Bucket, Key }));
    const input = Buffer.from(await original.Body.transformToByteArray());

    const thumb = await sharp(input).resize(300, 300, { fit: 'cover' }).webp({ quality: 80 }).toBuffer();
    const thumbKey = Key.replace('images/originals/', 'images/thumbs/').replace(/\.\w+$/, '.webp');
    await s3.send(new PutObjectCommand({ Bucket, Key: thumbKey, Body: thumb, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' }));
    // then call your API / update MongoDB with variants.thumb = thumbKey
  }
};
:::

::: code javascript Try it: base64 overhead (runs in browser)
const bytes = new Uint8Array(3 * 1024 * 1024); // a 3 MB "image"
crypto.getRandomValues(bytes.subarray(0, 65536));
let binary = '';
for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
const b64 = btoa(binary);
console.log('binary size :', (bytes.length / 1024 / 1024).toFixed(2), 'MB');
console.log('base64 size :', (b64.length / 1024 / 1024).toFixed(2), 'MB');
console.log('overhead    :', ((b64.length / bytes.length - 1) * 100).toFixed(1) + '%');
:::

::: ask
- *"Do we need multiple sizes / formats (WebP/AVIF)?"* *"Are images public (CDN) or private (signed URLs)?"* *"What happens when a product is deleted?"* (Clean up S3 objects: lifecycle rule or async job.)
:::

::: links
Using an S3 trigger to create thumbnails | https://docs.aws.amazon.com/lambda/latest/dg/with-s3-tutorial.html
MongoDB GridFS (when you must) | https://www.mongodb.com/docs/manual/core/gridfs/
:::
