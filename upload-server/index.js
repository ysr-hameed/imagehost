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

// ---------- Config ----------
const PORT = process.env.PORT || 3000;

const B2_PUBLIC_BUCKET_ID = process.env.B2_PUBLIC_BUCKET_ID;
const B2_PUBLIC_BUCKET_NAME = process.env.B2_PUBLIC_BUCKET_NAME;
const B2_PUBLIC_HOST = process.env.B2_PUBLIC_HOST || 'f005.backblazeb2.com';

const B2_PRIVATE_BUCKET_ID = process.env.B2_PRIVATE_BUCKET_ID;
const B2_PRIVATE_BUCKET_NAME = process.env.B2_PRIVATE_BUCKET_NAME;
const B2_PRIVATE_HOST = process.env.B2_PRIVATE_HOST || 'f006.backblazeb2.com';

const PLAN_CACHE_DURATION = parseInt(process.env.PLAN_CACHE_DURATION || '604800000', 10); // 7 days default
const MAX_EXPIRE_DELETE_SECONDS = 7 * 24 * 3600; // hard cap 7 days for deletion
const TRUSTED_ORIGINS = (process.env.TRUSTED_ORIGINS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// ---------- Helpers ----------
function isFromTrustedFrontend(req) {
  const origin = String(req.headers['origin'] || '').toLowerCase();
  const internalFlag =
    String(req.headers['x-internal-call'] || '').toLowerCase() === 'true' ||
    String(req.headers['x-platform-request'] || '').toLowerCase() === 'true';
  return internalFlag || (origin && TRUSTED_ORIGINS.includes(origin));
}

function formatBaseHost(host) {
  if (!host) return '';
  const trimmed = String(host).trim().replace(/\/+$/g, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const fastify = Fastify({ logger: true });

fastify.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB hard multipart cap
fastify.register(cors, { origin: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function randomString(len = 10) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
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
    'image/tiff': '.tiff',
  };
  return filename + (map[String(mimetype).toLowerCase()] || '');
}

function joinKeyPath(dir, file) {
  return dir ? `${dir}/${file}` : file;
}

// ---------- DB Bootstrapping ----------
async function ensureTables() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

  // Base plan catalog (unchanged)
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

  // Per-file metadata
  await pool.query(`
    CREATE TABLE IF NOT EXISTS images (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      path text,
      filename text NOT NULL,
      original_filename text,
      content_type text,
      size bigint,
      url text,
      is_private boolean DEFAULT false,
      expire_at timestamptz,
      expire_token_seconds int,
      description text,
      tags jsonb,
      b2_file_id text,
      created_at timestamptz DEFAULT now()
    );
  `);

  // Per-user request counting
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_requests (
      user_id uuid PRIMARY KEY,
      request_count int DEFAULT 0,
      last_reset timestamptz DEFAULT now()
    );
  `);

  // Deletion queue
  await pool.query(`
    CREATE TABLE IF NOT EXISTS files_to_delete (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid NOT NULL,
      bucket_id text NOT NULL,
      file_name text NOT NULL,
      url text NOT NULL,
      path text NOT NULL,
      is_private boolean DEFAULT false,
      b2_file_id text NOT NULL,
      created_at timestamptz DEFAULT now(),
      expire_at timestamptz
    );
  `);

  // NEW: per-user custom plan override
  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_plans (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      price_text text,
      storage_limit bigint,
      max_file_size bigint,
      max_api_requests bigint,
      max_signed_url_expiry_seconds int,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);

  // Seed just free & paid (PAYG removed)
  const res = await pool.query(`SELECT plan FROM plans`);
  const existing = new Set(res.rows.map(r => r.plan));
  const insert = [];
  if (!existing.has('free')) {
    insert.push(
      `('free','Free',${5 * 1024 * 1024 * 1024},${10 * 1024 * 1024},500,${7 * 24 * 3600},false)`
    );
  }
  if (!existing.has('paid')) {
    insert.push(
      `('paid','₹499/month',${100 * 1024 * 1024 * 1024},${50 * 1024 * 1024},100000,${7 * 24 * 3600},false)`
    );
  }
  if (insert.length) {
    await pool.query(`
      INSERT INTO plans (
        plan, price_text, storage_limit, max_file_size,
        max_api_requests, max_signed_url_expiry_seconds, custom
      ) VALUES ${insert.join(',')}
    `);
  }
}

// ---------- Plan logic ----------
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
  return map;
}

async function getCustomPlan(userId) {
  const r = await pool.query(
    `SELECT price_text, storage_limit, max_file_size, max_api_requests, max_signed_url_expiry_seconds
     FROM custom_plans WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

function mergePlan(basePlan, custom) {
  if (!custom) return basePlan;
  // Any non-null value in custom overrides base
  return {
    ...basePlan,
    price_text: custom.price_text ?? basePlan.price_text,
    storage_limit: custom.storage_limit ?? basePlan.storage_limit,
    max_file_size: custom.max_file_size ?? basePlan.max_file_size,
    max_api_requests: custom.max_api_requests ?? basePlan.max_api_requests,
    max_signed_url_expiry_seconds:
      custom.max_signed_url_expiry_seconds ?? basePlan.max_signed_url_expiry_seconds,
  };
}

async function getEffectivePlanForUser(user) {
  const plans = await getPlans();
  const base = plans[user.plan] || plans['free'];
  const custom = await getCustomPlan(user.id);
  return mergePlan(base, custom);
}

// ---------- Users / quotas ----------
async function getUserByApiKey(apiKey) {
  if (!apiKey) return null;
  const res = await pool.query(
    `SELECT u.* FROM api_keys k
     JOIN users u ON u.id = k.user_id
     WHERE k.key = $1 AND k.active = true
     LIMIT 1`,
    [apiKey]
  );
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
    await pool.query(
      `UPDATE user_requests SET request_count = 0, last_reset = now() WHERE user_id = $1`,
      [userId]
    );
    return 0;
  }
  return row.request_count || 0;
}

async function incrementUserRequestCount(userId) {
  const count = await getUserRequestCount(userId);
  if (count === 0) {
    await pool.query(
      `INSERT INTO user_requests (user_id, request_count, last_reset)
       VALUES ($1, 1, now())
       ON CONFLICT (user_id) DO UPDATE SET request_count = 1, last_reset = now()`,
      [userId]
    );
  } else {
    await pool.query(
      `UPDATE user_requests SET request_count = request_count + 1 WHERE user_id = $1`,
      [userId]
    );
  }
}

async function getUserStorageUsed(userId) {
  const r = await pool.query(`SELECT storage_used FROM users WHERE id = $1`, [userId]);
  return r.rows.length ? Number(r.rows[0].storage_used || 0) : 0;
}

async function updateUserStorageUsed(userId, bytes) {
  await pool.query(
    `UPDATE users SET storage_used = COALESCE(storage_used,0) + $1 WHERE id = $2`,
    [bytes, userId]
  );
}

function validatePlanLimits(plan, fileSize, expireSeconds) {
  if (plan.max_file_size && fileSize > Number(plan.max_file_size)) {
    throw new Error(`File size ${fileSize} exceeds plan max ${plan.max_file_size}`);
  }
  if (plan.max_signed_url_expiry_seconds && expireSeconds && expireSeconds > plan.max_signed_url_expiry_seconds) {
    throw new Error(
      `Expiry seconds ${expireSeconds} exceeds plan max ${plan.max_signed_url_expiry_seconds}`
    );
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

// ---------- Files ----------
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

async function enqueueFileForDeletion(
  user_id,
  bucket_id,
  file_name_key,
  url_path,
  dir_path,
  is_private,
  b2_file_id,
  expire_at
) {
  await pool.query(
    `DELETE FROM files_to_delete WHERE user_id = $1 AND bucket_id = $2 AND file_name = $3`,
    [user_id, bucket_id, file_name_key]
  );
  await pool.query(
    `INSERT INTO files_to_delete (user_id, bucket_id, file_name, url, path, is_private, b2_file_id, expire_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [user_id, bucket_id, file_name_key, url_path, dir_path, is_private, b2_file_id, expire_at]
  );
}

// ---------- Backblaze ----------
let b2Client = null;

async function initB2() {
  if (b2Client) return;
  b2Client = new B2({
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APP_KEY,
  });
  await b2Client.authorize();
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
    const bodyText = await res.body.text();
    throw new Error(`B2 upload failed status ${res.statusCode}: ${bodyText}`);
  }
  const json = await res.body.json();
  return json;
}

async function buildDownloadPath(bucketId, bucketName, isPrivate, fileKey, expireSeconds) {
  if (typeof fileKey !== 'string') throw new Error(`Invalid fileKey: ${typeof fileKey}`);
  const pathOnly = `/file/${bucketName}/${fileKey.split('/').map(encodeURIComponent).join('/')}`;

  if (!isPrivate) return pathOnly;

  const seconds = expireSeconds && expireSeconds > 0 ? expireSeconds : MAX_EXPIRE_DELETE_SECONDS;
  const auth = await b2Client.getDownloadAuthorization({
    bucketId,
    fileNamePrefix: fileKey,
    validDurationInSeconds: seconds,
  });
  const token = auth.data.authorizationToken || auth.data.authorization;
  return `${pathOnly}?Authorization=${encodeURIComponent(token)}`;
}

// ---------- Routes ----------
fastify.post('/upload', async (req, reply) => {
  const start = Date.now();

  // Auth
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return reply.code(401).send({ error: 'Missing API key' });
  const user = await getUserByApiKey(apiKey);
  if (!user) return reply.code(401).send({ error: 'Invalid API key' });

  const plan = await getEffectivePlanForUser(user);
  if (!plan) return reply.code(500).send({ error: 'User plan not found' });

  // Parse multipart
  const fields = {};
  const files = [];
  try {
    if (req.isMultipart && req.isMultipart()) {
      for await (const part of req.parts()) {
        if (!part) continue;
        if (part.file) {
          if (!isImageMimeType(part.mimetype)) {
            return reply.code(400).send({ error: `Invalid file type: ${part.mimetype}` });
          }
          const buffer = await streamToBuffer(part.file);
          if (plan.max_file_size && buffer.length > plan.max_file_size) {
            return reply
              .code(413)
              .send({ error: `File ${part.filename} exceeds max allowed size (${plan.max_file_size} bytes)` });
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

  // Quotas: request count & storage
  const totalUploadSize = files.reduce((sum, f) => sum + f.size, 0);
  try {
    await checkRateLimits(user, plan, totalUploadSize);
  } catch (e) {
    return reply.code(429).send({ error: e.message });
  }

  if (!user.internal && !isFromTrustedFrontend(req)) {
    await incrementUserRequestCount(user.id);
  }

  // Pathing: ALWAYS put files under per-user folder in B2
  const cleanedPathInput = sanitizePath(fields.path || '');
  const userFolder = user.id; // per-user root
  const finalPath = cleanedPathInput ? `${userFolder}/${cleanedPathInput}` : userFolder;

  // Privacy / expiry policy
  const isPrivate = String(fields.private || '').toLowerCase() === 'true';
  if (isPrivate && (!B2_PRIVATE_BUCKET_ID || !B2_PRIVATE_BUCKET_NAME)) {
    return reply.code(500).send({ error: 'Private bucket configuration missing' });
  }

  // Deletion expiry from form (optional)
  let expireDeleteSeconds = parseInt(fields.expire_delete ?? '0', 10);
  if (isNaN(expireDeleteSeconds) || expireDeleteSeconds < 0) expireDeleteSeconds = 0;
  if (expireDeleteSeconds > MAX_EXPIRE_DELETE_SECONDS) expireDeleteSeconds = MAX_EXPIRE_DELETE_SECONDS;

  // Token expiry for private files (controls signed URL & also auto-delete if no explicit expire_delete)
  let expireTokenSeconds = 0;
  if (isPrivate) {
    if (
      fields.expire_token_seconds === undefined ||
      fields.expire_token_seconds === null ||
      fields.expire_token_seconds === ''
    ) {
      // Default to max allowed
      expireTokenSeconds = Math.min(
        plan.max_signed_url_expiry_seconds || MAX_EXPIRE_DELETE_SECONDS,
        MAX_EXPIRE_DELETE_SECONDS
      );
    } else {
      const v = parseInt(String(fields.expire_token_seconds), 10);
      const wanted = isNaN(v) || v <= 0 ? MAX_EXPIRE_DELETE_SECONDS : v;
      const capPlan = plan.max_signed_url_expiry_seconds || MAX_EXPIRE_DELETE_SECONDS;
      expireTokenSeconds = Math.min(wanted, capPlan, MAX_EXPIRE_DELETE_SECONDS);
    }
  }

  // Override behaviour for filename
  const queryOverride = String(req.query?.override || '').toLowerCase() === 'true';

  // B2 context
  await initB2();
  const bucketId = isPrivate ? B2_PRIVATE_BUCKET_ID : B2_PUBLIC_BUCKET_ID;
  const bucketName = isPrivate ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME;
  const fallbackHost = isPrivate ? B2_PRIVATE_HOST : B2_PUBLIC_HOST;
  const userDomain = await getUserDomain(user.id);
  const baseHost = formatBaseHost(userDomain || fallbackHost);

  const providedFilename = sanitizeFileName(fields.filename || '');

  async function processFile(file, index) {
    // Build final filename
    let finalFilename = providedFilename || sanitizeFileName(file.originalFilename) || randomString(12);
    finalFilename = ensureExtension(finalFilename, file.mimetype);

    // If client provided a common filename for multiple files, suffix them unless override=true
    if (!queryOverride && providedFilename) {
      const base = path.basename(finalFilename, path.extname(finalFilename));
      const ext = path.extname(finalFilename);
      if (files.length > 1) finalFilename = `${base}-${index + 1}${ext}`;
    }

    // Avoid clobber unless override=true
    if (!queryOverride) {
      const exists = await fileExists(user.id, finalFilename, finalPath);
      if (exists) {
        const base = path.basename(finalFilename, path.extname(finalFilename));
        const ext = path.extname(finalFilename);
        finalFilename = `${base}-${crypto.randomBytes(3).toString('hex')}${ext}`;
      }
    }

    // If override=true, we may need to delete previous metadata / decrement storage
    let existingFile = null;
    if (queryOverride) {
      existingFile = await getFileByUserAndPath(user.id, finalFilename, finalPath);
    }

    // Validate limits for this file
    try {
      validatePlanLimits(plan, file.size, isPrivate ? expireTokenSeconds : undefined);
    } catch (e) {
      return { error: e.message, code: 413 };
    }

    // Upload to B2
    const fileKey = joinKeyPath(finalPath, finalFilename);
    let uploadRes;
    try {
      uploadRes = await b2UploadFile(bucketId, fileKey, file.buffer, file.mimetype);
    } catch (e) {
      fastify.log.error(`B2 upload error: ${e.message}`);
      return { error: `Failed to upload file ${finalFilename}`, code: 500 };
    }

    // If overriding, enqueue previous for deletion now (immediate)
    if (existingFile) {
      const prevKey = joinKeyPath(existingFile.path || '', existingFile.filename);
      await enqueueFileForDeletion(
        user.id,
        bucketId,
        prevKey,
        existingFile.url,
        existingFile.path,
        existingFile.is_private,
        existingFile.b2_file_id,
        null // delete ASAP by your worker
      );
      await updateUserStorageUsed(user.id, -Number(existingFile.size || 0));
      await pool.query(`DELETE FROM images WHERE id = $1`, [existingFile.id]);
    }

    // Decide deletion time:
    // 1) If explicit expire_delete > 0: use that
    // 2) Else if private and expireTokenSeconds > 0: use token time
    // 3) Else: null (no auto delete)
    const deleteAfterSeconds =
      expireDeleteSeconds > 0
        ? expireDeleteSeconds
        : isPrivate && expireTokenSeconds > 0
        ? expireTokenSeconds
        : 0;

    const expireAt = deleteAfterSeconds > 0 ? new Date(Date.now() + deleteAfterSeconds * 1000) : null;

    // Build downloadable path (private gets signed token)
    const dbPathUrl = await buildDownloadPath(
      bucketId,
      bucketName,
      isPrivate,
      fileKey,
      isPrivate ? expireTokenSeconds : 0
    );

    // Persist image row
    await pool.query(
      `INSERT INTO images
        (user_id, path, filename, original_filename, content_type, size, url, is_private, expire_at, expire_token_seconds, b2_file_id, created_at)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())`,
      [
        user.id,
        finalPath,
        finalFilename,
        file.originalFilename,
        file.mimetype,
        file.size,
        dbPathUrl,
        isPrivate,
        expireAt,
        isPrivate ? expireTokenSeconds : null,
        uploadRes.fileId,
      ]
    );

    // Enqueue for future deletion if applicable
    if (expireAt) {
      await enqueueFileForDeletion(
        user.id,
        bucketId,
        fileKey,
        dbPathUrl,
        finalPath,
        isPrivate,
        uploadRes.fileId,
        expireAt
      );
    }

    // Update storage
    await updateUserStorageUsed(user.id, file.size);

    // Full absolute URL for client use
    const fullUrl = `${baseHost}${dbPathUrl.startsWith('/') ? '' : '/'}${dbPathUrl}`;

    return {
      filename: finalFilename,
      path: finalPath,
      size: file.size,
      private: isPrivate,
      url: fullUrl,
    };
  }

  const processed = await Promise.all(files.map((f, i) => processFile(f, i)));
  const failed = processed.find(p => p && p.error);
  if (failed) return reply.code(failed.code || 500).send({ error: failed.error });

  return reply.code(200).send({
    success: true,
    uploaded: processed.length,
    files: processed,
    took_ms: Date.now() - start,
  });
});

// ---------- Boot ----------
(async () => {
  try {
    await ensureTables();
    await initB2();
    fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
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