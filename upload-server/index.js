// server.js
require('dotenv').config();
const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const cors = require('@fastify/cors');
const { Pool } = require('pg');
const B2 = require('backblaze-b2');
const crypto = require('crypto');
const path = require('path');
const { request } = require('undici');

const PORT = process.env.PORT || 3000;

/** ====================== Bucket Config ====================== */
const B2_PUBLIC_BUCKET_ID = process.env.B2_PUBLIC_BUCKET_ID;
const B2_PUBLIC_BUCKET_NAME = process.env.B2_PUBLIC_BUCKET_NAME;
const B2_PUBLIC_HOST = process.env.B2_PUBLIC_HOST || 'f005.backblazeb2.com';

const B2_PRIVATE_BUCKET_ID = process.env.B2_PRIVATE_BUCKET_ID;
const B2_PRIVATE_BUCKET_NAME = process.env.B2_PRIVATE_BUCKET_NAME;
const B2_PRIVATE_HOST = process.env.B2_PRIVATE_HOST || 'f006.backblazeb2.com';

/** ====================== Limits & Defaults ====================== */
const PLAN_CACHE_DURATION = parseInt(process.env.PLAN_CACHE_DURATION || '604800000', 10); // 7 days
const MAX_EXPIRE_DELETE_SECONDS = 7 * 24 * 3600; // cap deletion scheduling to 7 days
// IMPORTANT: default private token expiry = NEVER (null). You’ll handle extension via cron.
const DEFAULT_PRIVATE_TOKEN_EXPIRY = null;

const fastify = Fastify({ logger: true });
fastify.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } });
fastify.register(cors, { origin: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** ====================== Helpers ====================== */
function randomString(len = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.randomBytes(len), b => chars[b % chars.length]).map(b => chars[b % chars.length]).join('');
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sanitizeFileName(name) {
  return path.basename(name || '').toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function sanitizePath(p) {
  return String(p || '').trim().replace(/^\/+|\/+$/g, '');
}

function isImageMimeType(mime) {
  const m = String(mime || '').toLowerCase();
  return /^image\/(png|jpe?g|gif|webp|bmp|svg\+xml|tiff)$/.test(m);
}

function ensureExtension(filename, mimetype) {
  if (path.extname(filename)) return filename;
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'image/svg+xml': '.svg',
    'image/tiff': '.tiff'
  };
  return filename + (map[String(mimetype).toLowerCase()] || '');
}

function joinKeyPath(dir, file) {
  return dir ? `${dir}/${file}` : file;
}

/** ====================== DB Init ====================== */
async function ensureTables() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS plans (
      plan text PRIMARY KEY,
      price_text text,
      storage_limit bigint,
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
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path text,
      filename text NOT NULL,
      original_filename text,
      content_type text,
      size bigint,
      url text, -- path only: /file/<bucket>/<key>
      is_private boolean DEFAULT false,
      expire_at timestamptz,
      expire_token_seconds int,
      description text,
      tags jsonb,
      b2_file_id text,
      created_at timestamptz DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_requests (
      user_id uuid PRIMARY KEY,
      request_count int DEFAULT 0,
      last_reset timestamptz DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS files_to_delete (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL,
      bucket_id text NOT NULL,
      file_name text NOT NULL,   -- key within bucket (includes path)
      url text NOT NULL,         -- store path-only here as well
      path text NOT NULL,        -- logical folder (for convenience)
      is_private boolean DEFAULT false,
      b2_file_id text NOT NULL,
      created_at timestamptz DEFAULT now(),
      expire_at timestamptz
    );
  `);

  const res = await pool.query(`SELECT plan FROM plans`);
  const existing = new Set(res.rows.map(r => r.plan));

  const insert = [];
  if (!existing.has('free')) {
    insert.push(`('free','Free',${5 * 1024 * 1024 * 1024},${10 * 1024 * 1024},500,${7 * 24 * 3600},false)`);
  }
  if (!existing.has('paid')) {
    insert.push(`('paid','₹499/month',${100 * 1024 * 1024 * 1024},${50 * 1024 * 1024},100000,${7 * 24 * 3600},false)`);
  }
  if (!existing.has('payg')) {
    insert.push(`('payg','Usage-based',NULL,${50 * 1024 * 1024},NULL,${7 * 24 * 3600},false)`);
  }
  if (insert.length) {
    await pool.query(`
      INSERT INTO plans (plan, price_text, storage_limit, max_file_size, max_api_requests, max_signed_url_expiry_seconds, custom)
      VALUES ${insert.join(',')}
    `);
  }
}

/** ====================== Plans Cache ====================== */
let cachedPlans = null;
let plansCacheTs = 0;

async function getPlans(force = false) {
  const now = Date.now();
  if (!force && cachedPlans && now - plansCacheTs < PLAN_CACHE_DURATION) return cachedPlans;
  const res = await pool.query(`SELECT * FROM plans`);
  const map = {};
  for (const row of res.rows) map[row.plan] = row;
  cachedPlans = map;
  plansCacheTs = now;
  fastify.log.info('Plans cache refreshed');
  return map;
}

/** ====================== Users & Limits ====================== */
async function getUserByApiKey(apiKey) {
  if (!apiKey) return null;
  const res = await pool.query(`
    SELECT u.* FROM api_keys k
    JOIN users u ON u.id = k.user_id
    WHERE k.key = $1 AND k.active = true
    LIMIT 1
  `, [apiKey]);
  return res.rows[0] || null;
}

async function getUserDomain(userId) {
  const r = await pool.query(`SELECT domain FROM users WHERE id = $1 LIMIT 1`, [userId]);
  return r.rows.length ? r.rows[0].domain : null;
}

async function getUserRequestCount(userId) {
  const res = await pool.query(`SELECT * FROM user_requests WHERE user_id = $1`, [userId]);
  if (!res.rows.length) return 0;
  const row = res.rows[0];
  const now = Date.now();
  const last = new Date(row.last_reset).getTime();
  if (now - last > 24 * 3600 * 1000) {
    await pool.query(`UPDATE user_requests SET request_count = 0, last_reset = now() WHERE user_id = $1`, [userId]);
    return 0;
  }
  return row.request_count || 0;
}

async function incrementUserRequestCount(userId) {
  const count = await getUserRequestCount(userId);
  if (count === 0) {
    await pool.query(`
      INSERT INTO user_requests (user_id, request_count, last_reset)
      VALUES ($1, 1, now())
      ON CONFLICT (user_id) DO UPDATE SET request_count = 1, last_reset = now()
    `, [userId]);
  } else {
    await pool.query(`UPDATE user_requests SET request_count = request_count + 1 WHERE user_id = $1`, [userId]);
  }
}

async function getUserStorageUsed(userId) {
  const r = await pool.query(`SELECT storage_used FROM users WHERE id = $1`, [userId]);
  return r.rows.length ? Number(r.rows[0].storage_used || 0) : 0;
}

async function updateUserStorageUsed(userId, bytes) {
  await pool.query(`UPDATE users SET storage_used = COALESCE(storage_used,0) + $1 WHERE id = $2`, [bytes, userId]);
}

function validatePlanLimits(plan, fileSize, expireSeconds) {
  if (plan.max_file_size && fileSize > Number(plan.max_file_size)) {
    throw new Error(`File size ${fileSize} exceeds plan max ${plan.max_file_size}`);
  }
  if (plan.max_signed_url_expiry_seconds && expireSeconds && expireSeconds > plan.max_signed_url_expiry_seconds) {
    throw new Error(`Expiry seconds ${expireSeconds} exceeds plan max ${plan.max_signed_url_expiry_seconds}`);
  }
}

async function checkRateLimits(user, plan, uploadSize) {
  if (!user.internal) {
    const requestCount = await getUserRequestCount(user.id);
    if (plan.max_api_requests != null && requestCount >= plan.max_api_requests) {
      throw new Error(`API request limit exceeded (${requestCount}/${plan.max_api_requests})`);
    }
  }
  const storageUsed = await getUserStorageUsed(user.id);
  if (plan.storage_limit != null && storageUsed + uploadSize > plan.storage_limit) {
    throw new Error(`Storage limit exceeded (${storageUsed + uploadSize} / ${plan.storage_limit})`);
  }
}

/** ====================== Files table helpers ====================== */
async function fileExists(userId, filename, dirPath) {
  const r = await pool.query(
    `SELECT 1 FROM images WHERE user_id = $1 AND filename = $2 AND path = $3 LIMIT 1`,
    [userId, filename, dirPath]
  );
  return r.rowCount > 0;
}

async function getFileByUserAndPath(userId, filename, dirPath) {
  const r = await pool.query(
    `SELECT * FROM images WHERE user_id = $1 AND filename = $2 AND path = $3 LIMIT 1`,
    [userId, filename, dirPath]
  );
  return r.rows[0] || null;
}

async function enqueueFileForDeletion(user_id, bucket_id, file_name_key, url_path, dir_path, is_private, b2_file_id, expire_at) {
  // ensure path-only in url_path
  await pool.query(
    `DELETE FROM files_to_delete WHERE user_id = $1 AND bucket_id = $2 AND file_name = $3`,
    [user_id, bucket_id, file_name_key]
  );
  await pool.query(`
    INSERT INTO files_to_delete (user_id, bucket_id, file_name, url, path, is_private, b2_file_id, expire_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `, [user_id, bucket_id, file_name_key, url_path, dir_path, is_private, b2_file_id, expire_at]);
}

/** ====================== Backblaze B2 ====================== */
let b2Client = null;

async function initB2() {
  if (b2Client) return;
  b2Client = new B2({
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APP_KEY,
  });
  await b2Client.authorize();
  fastify.log.info(`Backblaze authorized`);
}

async function b2UploadFile(bucketId, fileKey, buffer, mimeType) {
  const uploadUrlRes = await b2Client.getUploadUrl({ bucketId });
  const { uploadUrl, authorizationToken } = uploadUrlRes.data;
  const res = await request(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: authorizationToken,
      'X-Bz-File-Name': fileKey,
      'Content-Type': mimeType || 'b2/x-auto',
      'Content-Length': buffer.length.toString(),
      'X-Bz-Content-Sha1': 'do_not_verify',
    },
    body: buffer,
  });
  if (res.statusCode !== 200) {
    const body = await res.body.text();
    throw new Error(`B2 upload failed status ${res.statusCode}: ${body}`);
  }
  return res.body.json();
}

/**
 * Build a PATH-ONLY download path the way B2 serves files: /file/<bucketName>/<key>
 * If private and expireSeconds is provided (number), returns the same path (we store path-only in DB).
 * Token is NOT appended here by default unless you explicitly pass expireSeconds.
 * Domain is added only when responding to the client.
 */
async function buildDownloadPath(bucketId, bucketName, isPrivate, fileKey, expireSeconds) {
  if (typeof fileKey !== 'string') throw new Error(`Invalid fileKey: ${typeof fileKey}`);
  const pathOnly = `/file/${bucketName}/${fileKey.split('/').map(encodeURIComponent).join('/')}`;
  if (!isPrivate) return pathOnly;
  // Private: if expireSeconds is null/undefined, we do NOT append token — you handle via cron/edge.
  if (expireSeconds == null) return pathOnly;

  const auth = await b2Client.getDownloadAuthorization({
    bucketId,
    fileNamePrefix: fileKey,
    validDurationInSeconds: expireSeconds,
  });
  const token = auth.data.authorizationToken || auth.data.authorization;
  return `${pathOnly}?Authorization=${encodeURIComponent(token)}`;
}

/** ====================== Upload Route ====================== */
fastify.post('/upload', async (req, reply) => {
  const start = Date.now();
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return reply.code(401).send({ error: 'Missing API key' });

  const user = await getUserByApiKey(apiKey);
  if (!user) return reply.code(401).send({ error: 'Invalid API key' });

  const plans = await getPlans();
  const plan = plans[user.plan] || plans['free'];
  if (!plan) return reply.code(500).send({ error: 'User plan not found' });

  const fields = {};
  const files = [];

  try {
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (!part) continue;
        if (part.file) {
          if (!isImageMimeType(part.mimetype)) {
            return reply.code(400).send({ error: `Invalid file type: ${part.mimetype}` });
          }
          const buffer = await streamToBuffer(part.file);
          if (plan.max_file_size && buffer.length > plan.max_file_size) {
            return reply.code(413).send({ error: `File ${part.filename} exceeds max allowed size (${plan.max_file_size} bytes)` });
          }
          files.push({
            buffer,
            originalFilename: part.filename,
            mimetype: part.mimetype,
            size: buffer.length,
          });
        } else {
          fields[part.fieldname] = part.value;
        }
      }
    } else if (req.body) {
      Object.assign(fields, req.body);
    }
  } catch (err) {
    fastify.log.error(`Error parsing multipart: ${err.message}`);
    return reply.code(500).send({ error: 'Failed to parse multipart form' });
  }

  if (!files.length) return reply.code(400).send({ error: 'No files uploaded' });

  const totalUploadSize = files.reduce((sum, f) => sum + f.size, 0);
  try {
    await checkRateLimits(user, plan, totalUploadSize);
  } catch (e) {
    return reply.code(429).send({ error: e.message });
  }

  if (!user.internal) {
    await incrementUserRequestCount(user.id);
  }

  const cleanedPath = sanitizePath(fields.path || '');
  const isPrivate = String(fields.private || '').toLowerCase() === 'true';
  if (isPrivate && (!B2_PRIVATE_BUCKET_ID || !B2_PRIVATE_BUCKET_NAME)) {
    return reply.code(500).send({ error: 'Private bucket configuration missing' });
  }

  // deletion schedule seconds (cap)
  let expireDeleteSeconds = parseInt(fields.expire_delete ?? '0', 10);
  if (isNaN(expireDeleteSeconds) || expireDeleteSeconds < 0) expireDeleteSeconds = 0;
  if (expireDeleteSeconds > MAX_EXPIRE_DELETE_SECONDS) expireDeleteSeconds = MAX_EXPIRE_DELETE_SECONDS;

  // private token expiry seconds: default = NEVER (null)
  let expireTokenSeconds = 0;
  if (isPrivate) {
    if (fields.expire_token_seconds === undefined || fields.expire_token_seconds === null || fields.expire_token_seconds === '' ) {
      expireTokenSeconds = null; // never
    } else {
      const v = parseInt(String(fields.expire_token_seconds), 10);
      expireTokenSeconds = isNaN(v) || v <= 0 ? null : Math.min(v, MAX_EXPIRE_DELETE_SECONDS);
    }
  }

  // override behavior via query ?override=true
  const queryOverride = String(req.query?.override || '').toLowerCase() === 'true';

  await initB2();

  const bucketId = isPrivate ? B2_PRIVATE_BUCKET_ID : B2_PUBLIC_BUCKET_ID;
  const bucketName = isPrivate ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME;
  const fallbackHost = isPrivate ? B2_PRIVATE_HOST : B2_PUBLIC_HOST;

  const userDomain = await getUserDomain(user.id);
  const results = [];

  let providedFilename = sanitizeFileName(fields.filename || '');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // Determine final filename with extension logic
    let finalFilename = providedFilename || sanitizeFileName(file.originalFilename) || randomString(12);
    finalFilename = ensureExtension(finalFilename, file.mimetype);

    // If multiple files and single provided filename without override, auto-unique
    if (!queryOverride && providedFilename) {
      const base = path.basename(finalFilename, path.extname(finalFilename));
      const ext = path.extname(finalFilename);
      // add suffix to avoid collision among batch itself
      if (files.length > 1) finalFilename = `${base}-${i + 1}${ext}`;
    }

    // If not override, and file already exists in DB for this user/path, auto-rename with a short hex
    if (!queryOverride) {
      const exists = await fileExists(user.id, finalFilename, cleanedPath);
      if (exists) {
        const base = path.basename(finalFilename, path.extname(finalFilename));
        const ext = path.extname(finalFilename);
        finalFilename = `${base}-${crypto.randomBytes(3).toString('hex')}${ext}`;
      }
    }

    // If override, fetch existing record
    let existingFile = null;
    if (queryOverride) {
      existingFile = await getFileByUserAndPath(user.id, finalFilename, cleanedPath);
    }

    // Validate per-file limits
    try {
      validatePlanLimits(plan, file.size, expireTokenSeconds ?? undefined);
    } catch (e) {
      return reply.code(413).send({ error: e.message });
    }

    // Upload to B2
    const fileKey = joinKeyPath(cleanedPath, finalFilename);
    let uploadRes;
    try {
      uploadRes = await b2UploadFile(bucketId, fileKey, file.buffer, file.mimetype);
    } catch (e) {
      fastify.log.error(`B2 upload error: ${e.message}`);
      return reply.code(500).send({ error: `Failed to upload file ${finalFilename}` });
    }

    // If overriding, queue prior file for deletion and adjust storage
    if (existingFile) {
      const prevKey = joinKeyPath(existingFile.path || '', existingFile.filename);
      await enqueueFileForDeletion(
        user.id,
        bucketId,
        prevKey,
        existingFile.url,   // path-only stored previously
        existingFile.path,
        existingFile.is_private,
        existingFile.b2_file_id,
        null                // immediate (you can run a worker to flush)
      );
      await updateUserStorageUsed(user.id, -Number(existingFile.size || 0));
      await pool.query(`DELETE FROM images WHERE id = $1`, [existingFile.id]);
    }

    // Deletion schedule timestamp for the *new* file
    const expireAt = expireDeleteSeconds > 0 ? new Date(Date.now() + expireDeleteSeconds * 1000) : null;

    // Build the *path-only* download path. Append token ONLY if explicit seconds given.
    const dbPathUrl = await buildDownloadPath(bucketId, bucketName, isPrivate, fileKey, expireTokenSeconds);

    // Store path-only in DB
    await pool.query(`
      INSERT INTO images
        (user_id, path, filename, original_filename, content_type, size, url, is_private, expire_at, expire_token_seconds, b2_file_id, created_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
    `, [
      user.id,
      cleanedPath,
      finalFilename,
      file.originalFilename,
      file.mimetype,
      file.size,
      dbPathUrl,                 // path-only (may include token if explicitly requested)
      isPrivate,
      expireAt,
      expireTokenSeconds,        // null = never
      uploadRes.fileId
    ]);

    // If we scheduled deletion, queue it in files_to_delete (store path-only url)
    if (expireAt) {
      await enqueueFileForDeletion(
        user.id,
        bucketId,
        fileKey,
        dbPathUrl,
        cleanedPath,
        isPrivate,
        uploadRes.fileId,
        expireAt
      );
    }

    // Update storage used
    await updateUserStorageUsed(user.id, file.size);

    // Build full URL for response (domain first, else B2 host)
    const fullUrl = `${(userDomain || fallbackHost)}${dbPathUrl}`;

    results.push({
      filename: finalFilename,
      path: cleanedPath,
      size: file.size,
      private: isPrivate,
      url: fullUrl,     // full URL for client use
    });
  }

  return reply.code(200).send({
    success: true,
    uploaded: results.length,
    files: results,
    took_ms: Date.now() - start,
  });
});

/** ====================== Boot ====================== */
(async () => {
  try {
    await ensureTables();
    await initB2();
    fastify.listen({ port: PORT }, (err, address) => {
      if (err) {
        fastify.log.error(err);
        process.exit(1);
      }
      fastify.log.info(`Server listening at ${address}`);
    });
  } catch (e) {
    fastify.log.error(e);
    process.exit(1);
  }
})();