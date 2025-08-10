require('dotenv').config();
const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const { Pool } = require('pg');
const B2 = require('backblaze-b2');
const crypto = require('crypto');
const path = require('path');
const { request } = require('undici');

const PORT = process.env.PORT || 3000;

const B2_PUBLIC_BUCKET_ID = process.env.B2_PUBLIC_BUCKET_ID;
const B2_PUBLIC_BUCKET_NAME = process.env.B2_PUBLIC_BUCKET_NAME;
const B2_PUBLIC_HOST = process.env.B2_PUBLIC_HOST || 'f005.backblazeb2.com';

const B2_PRIVATE_BUCKET_ID = process.env.B2_PRIVATE_BUCKET_ID;
const B2_PRIVATE_BUCKET_NAME = process.env.B2_PRIVATE_BUCKET_NAME;
const B2_PRIVATE_HOST = process.env.B2_PRIVATE_HOST || 'f006.backblazeb2.com';

const PLAN_CACHE_DURATION = parseInt(process.env.PLAN_CACHE_DURATION || '604800000', 10); // default 7 days

const fastify = Fastify({ logger: true });
fastify.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ---------- Helpers ----------
function randomString(len = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.randomBytes(len), b => chars[b % chars.length]).join('');
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sanitizeFileName(name) {
  return path.basename(name).toLowerCase().replace(/[^a-z0-9.\-_]/g, '_');
}

function isImageMimeType(mime) {
  return /^image\/(png|jpeg|jpg|gif|webp|bmp|svg|tiff)$/.test(String(mime).toLowerCase());
}

// ---------- DB table creation (ensures) ----------
async function ensureTables() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plans (
      plan text PRIMARY KEY,
      price_text text,
      storage_limit bigint,
      bandwidth_limit bigint,
      max_file_size bigint,
      max_api_requests bigint,
      max_signed_url_expiry_seconds int,
      custom boolean DEFAULT false,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS images (
      id varchar(20) PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path text,
      filename text NOT NULL,
      original_filename text,
      content_type text,
      size bigint,
      url text,
      is_private boolean DEFAULT false,
      expire_at timestamptz,
      created_at timestamptz DEFAULT now()
    );
  `);
}

// ---------- Backblaze B2 ----------
let b2Client = null;
async function initB2() {
  if (b2Client) return;
  b2Client = new B2({
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APP_KEY,
  });
  await b2Client.authorize();
  fastify.log.info('Backblaze authorized, apiUrl=' + (b2Client.apiUrl || 'unknown'));
}

async function b2UploadFile(bucketId, fileName, buffer, mimeType) {
  const uploadUrlRes = await b2Client.getUploadUrl({ bucketId });
  const uploadUrl = uploadUrlRes.data.uploadUrl;
  const uploadAuthToken = uploadUrlRes.data.authorizationToken;

  const headers = {
    Authorization: uploadAuthToken,
    'X-Bz-File-Name': fileName,
    'Content-Type': mimeType || 'b2/x-auto',
    'Content-Length': buffer.length.toString(),
    'X-Bz-Content-Sha1': 'do_not_verify',
  };

  const res = await request(uploadUrl, {
    method: 'POST',
    headers,
    body: buffer,
  });

  if (res.statusCode !== 200) {
    const body = await res.body.text();
    throw new Error(`B2 upload failed status ${res.statusCode}: ${body}`);
  }

  // some b2 SDK returns JSON via body.json(); using res.body.json() as earlier
  return res.body.json();
}

async function b2FileExists(bucketId, fileName) {
  let nextFileName = null;
  let found = false;
  do {
    const res = await b2Client.listFileNames({
      bucketId,
      startFileName: nextFileName,
      maxFileCount: 100,
    });
    for (const file of res.data.files) {
      if (file.fileName === fileName) {
        found = true;
        break;
      }
    }
    if (found) break;
    nextFileName = res.data.nextFileName;
  } while (nextFileName);
  return found;
}

async function buildUrl(bucketId, bucketName, bucketHost, fileName, isPrivate, expireSeconds) {
  const parts = fileName.split('/').map(encodeURIComponent);
  const urlPath = parts.join('/');

  const baseUrl = `https://${bucketHost}/file/${bucketName}/${urlPath}`;
  if (!isPrivate) return baseUrl;

  const ttl = expireSeconds && expireSeconds > 0 ? expireSeconds : 3600;
  const auth = await b2Client.getDownloadAuthorization({
    bucketId,
    fileNamePrefix: fileName,
    validDurationInSeconds: ttl,
  });
  const token = auth.data.authorizationToken || auth.data.authorization;
  return `${baseUrl}?Authorization=${encodeURIComponent(token)}`;
}

// ---------- Plan caching & helpers ----------
let cachedPlans = null;
let plansCacheTs = 0;

async function getPlans(force = false) {
  const now = Date.now();
  if (!force && cachedPlans && (now - plansCacheTs) < PLAN_CACHE_DURATION) return cachedPlans;
  const res = await pool.query(`SELECT * FROM plans`);
  cachedPlans = {};
  for (const row of res.rows) cachedPlans[row.plan] = row;
  plansCacheTs = now;
  fastify.log.info('plans cache refreshed');
  return cachedPlans;
}

// Get user by API key (we assume api_keys table exists)
async function getUserByApiKey(apiKey) {
  if (!apiKey) return null;
  const r = await pool.query(`
    SELECT u.* 
    FROM api_keys k
    JOIN users u ON u.id = k.user_id
    WHERE k."key" = $1 
      AND k.active = true
    LIMIT 1
  `, [apiKey]);
  return r.rows[0] || null;
}

async function updateUserStorageUsed(userId, bytes) {
  await pool.query(`UPDATE users SET storage_used = storage_used + $1 WHERE id = $2`, [bytes, userId]);
}

function getBucketInfo(isPrivate) {
  if (isPrivate) {
    return { bucketId: B2_PRIVATE_BUCKET_ID, bucketName: B2_PRIVATE_BUCKET_NAME, bucketHost: B2_PRIVATE_HOST };
  }
  return { bucketId: B2_PUBLIC_BUCKET_ID, bucketName: B2_PUBLIC_BUCKET_NAME, bucketHost: B2_PUBLIC_HOST };
}

function validatePlanLimits(planRow, totalUploadSize, maxFileSizeRequested, expireSeconds) {
  // planRow.max_file_size may be null (treat as unlimited)
  if (planRow.max_file_size && maxFileSizeRequested > Number(planRow.max_file_size)) {
    throw new Error(`Max file size exceeded for plan ${planRow.plan} (allowed ${planRow.max_file_size} bytes)`);
  }
  if (planRow.storage_limit !== null && planRow.storage_limit !== undefined) {
    // caller will check against user's current storage_used separately
    // nothing to do here
  }
  if (planRow.max_signed_url_expiry_seconds && expireSeconds > planRow.max_signed_url_expiry_seconds) {
    throw new Error(`Requested signed URL expiry ${expireSeconds}s exceeds plan limit ${planRow.max_signed_url_expiry_seconds}s`);
  }
}

// ---------- Upload endpoint ----------
fastify.post('/upload', async (req, reply) => {
  const start = Date.now();
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return reply.code(401).send({ error: 'x-api-key required' });

    const user = await getUserByApiKey(apiKey);
    if (!user) return reply.code(403).send({ error: 'Invalid or inactive API key' });

    // multipart parse
    const parts = req.parts();
    const fields = {};
    const files = [];
    for await (const part of parts) {
      if (!part) continue;
      if (part.file) {
        if (!isImageMimeType(part.mimetype)) {
          return reply.code(400).send({ error: 'Only image files allowed' });
        }
        const buffer = await streamToBuffer(part.file);
        files.push({ buffer, originalFilename: part.filename, mimetype: part.mimetype, size: buffer.length });
      } else {
        fields[part.fieldname] = part.value;
      }
    }

    if (!files.length) return reply.code(400).send({ error: 'No files provided' });

    const rawPath = (fields.path || '').trim();
    const cleanedPath = rawPath.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');

    const isPrivate = String(fields.is_private || 'false').toLowerCase() === 'true';

    let expireSeconds = parseInt(fields.expire_seconds, 10);
    if (isNaN(expireSeconds) || expireSeconds < 0) expireSeconds = 3600;
    // Cap to 7 days absolute
    const MAX_7_DAYS = 7 * 24 * 3600;
    if (expireSeconds > MAX_7_DAYS) expireSeconds = MAX_7_DAYS;

    const customFilename = fields.filename ? sanitizeFileName(fields.filename) : null;

    // Load plans (cached)
    const plans = await getPlans();

    // determine plan row for user
    const planName = user.plan || 'free';
    const planRow = plans[planName];
    if (!planRow) return reply.code(500).send({ error: `Plan ${planName} not configured` });

    // Compute totals
    const totalUploadSize = files.reduce((s, f) => s + f.size, 0);
    const maxFileSizeRequested = Math.max(...files.map(f => f.size));

    // Validate limits (file size, expiry)
    validatePlanLimits(planRow, totalUploadSize, maxFileSizeRequested, expireSeconds);

    // Check storage limit vs user's current usage
    if (planRow.storage_limit !== null && planRow.storage_limit !== undefined) {
      const currentStorageUsed = Number(user.storage_used || 0);
      if (currentStorageUsed + totalUploadSize > Number(planRow.storage_limit)) {
        return reply.code(413).send({ error: 'Upload exceeds your plan storage limit' });
      }
    }
    // TODO: API request counts and bandwidth checks can be implemented similarly (tracking required)

    // Initialize B2
    await initB2();

    const { bucketId, bucketName, bucketHost } = getBucketInfo(isPrivate);

    const results = [];
    for (const file of files) {
      const ext = path.extname(customFilename || file.originalFilename).toLowerCase() || '.jpg';
      const baseName = (customFilename ? path.basename(customFilename, ext) : path.basename(file.originalFilename, ext))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');

      let finalFileName = `${baseName}${ext}`;
      let b2FileName = user.id;
      if (cleanedPath) b2FileName += `/${cleanedPath}`;
      b2FileName += `/${finalFileName}`;

      // collision check
      const exists = await b2FileExists(bucketId, b2FileName);
      if (exists) {
        const uniqueSuffix = randomString(6);
        finalFileName = `${baseName}-${uniqueSuffix}${ext}`;
        b2FileName = user.id;
        if (cleanedPath) b2FileName += `/${cleanedPath}`;
        b2FileName += `/${finalFileName}`;
      }

      try {
        // Upload
        await b2UploadFile(bucketId, b2FileName, file.buffer, file.mimetype);

        const imageId = randomString(12);
        const fullUrl = await buildUrl(bucketId, bucketName, bucketHost, b2FileName, isPrivate, expireSeconds);
        const urlObj = new URL(fullUrl);
        const urlPathOnly = urlObj.pathname + urlObj.search;

        let expireAt = null;
        if (isPrivate && expireSeconds > 0) expireAt = new Date(Date.now() + expireSeconds * 1000);

        const insertRes = await pool.query(`
          INSERT INTO images (id, user_id, path, filename, original_filename, content_type, size, url, is_private, expire_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING *`,
          [imageId, user.id, cleanedPath || null, finalFileName, file.originalFilename, file.mimetype, file.size, urlPathOnly, isPrivate, expireAt]
        );

        // update storage usage
        await updateUserStorageUsed(user.id, file.size);

        results.push({ original: file.originalFilename, filename: finalFileName, success: true, url: urlPathOnly, db: insertRes.rows[0] });
      } catch (err) {
        fastify.log.error('Upload error: ' + err.message);
        results.push({ original: file.originalFilename, success: false, error: err.message });
      }
    }

    const took = Date.now() - start;
    fastify.log.info(`/upload completed in ${took}ms`);
    return reply.send({ ok: true, files: results });
  } catch (err) {
    fastify.log.error('Unexpected error: ' + (err && err.stack || err));
    return reply.code(500).send({ error: String(err && err.message ? err.message : err) });
  }
});

// ---------- startup ----------
(async () => {
  try {
    await ensureTables();
    await initB2();
    await getPlans(true); // preload plans cache
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info('Server listening on port ' + PORT);
  } catch (err) {
    console.error('Startup fatal error:', err && (err.stack || err));
    process.exit(1);
  }
})();