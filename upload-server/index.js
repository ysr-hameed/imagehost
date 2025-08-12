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

const PLAN_CACHE_DURATION = parseInt(process.env.PLAN_CACHE_DURATION || '604800000', 10); // 7 days
const CLEANUP_INTERVAL_MS = 1000 * 60 * 60; // 1 hour
const MAX_EXPIRE_DELETE_SECONDS = 7 * 24 * 3600; // 7 days max delete time
const DEFAULT_PRIVATE_TOKEN_EXPIRY = 24 * 3600; // 1 day default token expiry for private files

const fastify = Fastify({ logger: true });
fastify.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Helpers */
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
  return path.basename(name || '').toLowerCase().replace(/[^a-z0-9.-]/g, '');
}

function sanitizePath(p) {
  if (!p) return '';
  return String(p).trim().replace(/^\/+|\/+$/g, '');
}

function isImageMimeType(mime) {
  return /^image\/(png|jpeg|jpg|gif|webp|bmp|svg|tiff)$/.test(String(mime).toLowerCase());
}

/** DB Initialization */
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
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      email text UNIQUE NOT NULL,
      plan text NOT NULL REFERENCES plans(plan),
      storage_used bigint DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      key text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      active boolean DEFAULT true,
      internal boolean DEFAULT false, -- identifies platform/internal keys
      created_at timestamptz DEFAULT now()
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
      url text,
      is_private boolean DEFAULT false,
      expire_at timestamptz,
      expire_token_seconds int DEFAULT 0,
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

  // files_to_delete table stores info for deferred deletion
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
      created_at timestamptz DEFAULT now()
    );
  `);

  // Insert default plans if missing
  const res = await pool.query(`SELECT plan FROM plans`);
  const existingPlans = res.rows.map(r => r.plan);

  const insertPlans = [];
  if (!existingPlans.includes('free')) {
    insertPlans.push(`('free', 'Free', ${5 * 1024 * 1024 * 1024}, ${10 * 1024 * 1024}, 500, ${7 * 24 * 3600}, false)`);
  }
  if (!existingPlans.includes('paid')) {
    insertPlans.push(`('paid', '₹499/month', ${100 * 1024 * 1024 * 1024}, ${50 * 1024 * 1024}, 100000, ${7 * 24 * 3600}, false)`);
  }
  if (!existingPlans.includes('payg')) {
    insertPlans.push(`('payg', 'Usage-based', NULL, ${50 * 1024 * 1024}, NULL, ${7 * 24 * 3600}, false)`);
  }

  if (insertPlans.length) {
    await pool.query(`
      INSERT INTO plans (plan, price_text, storage_limit, max_file_size, max_api_requests, max_signed_url_expiry_seconds, custom)
      VALUES ${insertPlans.join(',')}
    `);
  }
}

/** Backblaze B2 Client */
let b2Client = null;

async function initB2() {
  if (b2Client) return;
  b2Client = new B2({
    applicationKeyId: process.env.B2_KEY_ID,
    applicationKey: process.env.B2_APP_KEY,
  });
  await b2Client.authorize();
  fastify.log.info(`Backblaze authorized (apiUrl=${b2Client.apiUrl})`);
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

  return res.body.json();
}

/** Build download URL */
async function buildDownloadUrl(bucketId, bucketName, bucketHost, fileName, isPrivate, expireSeconds) {
  if (typeof fileName !== 'string') {
    throw new Error(`Invalid fileName: expected string but got ${typeof fileName}`);
  }
  const parts = fileName.split('/').map(encodeURIComponent);
  const urlPath = parts.join('/');
  const baseUrl = `/file/${bucketName}/${urlPath}`;
  if (!isPrivate) return baseUrl;

  const ttl = expireSeconds && expireSeconds > 0 ? expireSeconds : DEFAULT_PRIVATE_TOKEN_EXPIRY;
  const auth = await b2Client.getDownloadAuthorization({
    bucketId,
    fileNamePrefix: fileName,
    validDurationInSeconds: ttl,
  });
  const token = auth.data.authorizationToken || auth.data.authorization;
  return `${baseUrl}?Authorization=${encodeURIComponent(token)}`;
}

/** Cached Plans */
let cachedPlans = null;
let plansCacheTs = 0;

async function getPlans(force = false) {
  const now = Date.now();
  if (!force && cachedPlans && now - plansCacheTs < PLAN_CACHE_DURATION) {
    return cachedPlans;
  }
  const res = await pool.query(`SELECT * FROM plans`);
  cachedPlans = {};
  for (const row of res.rows) cachedPlans[row.plan] = row;
  plansCacheTs = now;
  fastify.log.info('Plans cache refreshed');
  return cachedPlans;
}

/** User & Limits Helpers */
async function getUserByApiKey(apiKey) {
  if (!apiKey) return null;
  const res = await pool.query(
  `SELECT u.* FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key = $1 AND k.active = true LIMIT 1`,
  [apiKey]
);
  return res.rows[0] || null;
}

async function getUserRequestCount(userId) {
  const res = await pool.query(`SELECT * FROM user_requests WHERE user_id = $1`, [userId]);
  if (res.rows.length === 0) return 0;
  const row = res.rows[0];
  const now = new Date();
  const lastReset = new Date(row.last_reset);
  // Reset count daily
  if (now - lastReset > 24 * 3600 * 1000) {
    await pool.query(`UPDATE user_requests SET request_count = 0, last_reset = now() WHERE user_id = $1`, [userId]);
    return 0;
  }
  return row.request_count;
}

async function incrementUserRequestCount(userId) {
  const current = await getUserRequestCount(userId);
  if (current === 0) {
    await pool.query(
      `INSERT INTO user_requests (user_id, request_count, last_reset) VALUES ($1, 1, now()) ON CONFLICT (user_id) DO UPDATE SET request_count = 1, last_reset = now()`,
      [userId]
    );
  } else {
    await pool.query(`UPDATE user_requests SET request_count = request_count + 1 WHERE user_id = $1`, [userId]);
  }
}

async function getUserStorageUsed(userId) {
  const res = await pool.query(`SELECT storage_used FROM users WHERE id = $1`, [userId]);
  return res.rows.length ? Number(res.rows[0].storage_used) : 0;
}

async function updateUserStorageUsed(userId, bytes) {
  await pool.query(`UPDATE users SET storage_used = storage_used + $1 WHERE id = $2`, [bytes, userId]);
}

function validatePlanLimits(plan, fileSize, expireSeconds) {
  if (plan.max_file_size && fileSize > Number(plan.max_file_size)) {
    throw new Error(`File size ${fileSize} exceeds plan max ${plan.max_file_size}`);
  }
  if (plan.max_signed_url_expiry_seconds && expireSeconds > plan.max_signed_url_expiry_seconds) {
    throw new Error(`Expiry seconds ${expireSeconds} exceeds plan max ${plan.max_signed_url_expiry_seconds}`);
  }
}

async function checkRateLimits(user, plan, uploadSize) {
  // Check API request count only for non-internal keys
  if (!user.internal) {
    const requestCount = await getUserRequestCount(user.id);
    if (plan.max_api_requests !== null && plan.max_api_requests !== undefined && requestCount >= plan.max_api_requests) {
      throw new Error(`API request limit exceeded (${requestCount}/${plan.max_api_requests})`);
    }
  }

  // No bandwidth limit check as per request

  // Check storage limit
  const storageUsed = await getUserStorageUsed(user.id);
  if (plan.storage_limit !== null && plan.storage_limit !== undefined && storageUsed + uploadSize > plan.storage_limit) {
    throw new Error(`Storage limit exceeded (${storageUsed + uploadSize} / ${plan.storage_limit})`);
  }
}

/** Insert file info into files_to_delete for deferred deletion */
async function enqueueFileForDeletion(user_id, bucket_id, file_name, url, path, is_private, b2_file_id) {
  await pool.query(
    `INSERT INTO files_to_delete (user_id, bucket_id, file_name, url, path, is_private, b2_file_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [user_id, bucket_id, file_name, url, path, is_private, b2_file_id]
  );
}

// Helper: check if a file with filename + path exists for the user
async function fileExists(userId, filename, path) {
  const res = await pool.query(
    `SELECT 1 FROM images WHERE user_id = $1 AND filename = $2 AND path = $3 LIMIT 1`,
    [userId, filename, path]
  );
  return res.rowCount > 0;
}

// Helper: get existing file info for override logic
async function getFileByUserAndPath(userId, filename, path) {
  const res = await pool.query(
    `SELECT * FROM images WHERE user_id = $1 AND filename = $2 AND path = $3 LIMIT 1`,
    [userId, filename, path]
  );
  return res.rows[0] || null;
}

fastify.post('/upload', async (req, reply) => {
  const start = Date.now();
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return reply.code(401).send({ error: 'Missing API key' });

  const user = await getUserByApiKey(apiKey);
  if (!user) return reply.code(401).send({ error: 'Invalid API key' });

  const plans = await getPlans();
  const plan = plans[user.plan] || plans['free'];
  if (!plan) return reply.code(500).send({ error: 'User plan not found' });

  // Accept any multipart, json, form, query fields
  // Multipart parts
  const parts = req.isMultipart() ? req.parts() : [];
  const fields = {};
  const files = [];

  try {
    if (req.isMultipart()) {
      for await (const part of parts) {
        if (!part) continue;
        if (part.file) {
          // File part
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
          // Field part
          fields[part.fieldname] = part.value;
        }
      }
    } else {
      // If not multipart, parse JSON or form body
      if (req.body) {
        Object.assign(fields, req.body);
      }
    }
  } catch (err) {
    fastify.log.error(`Error parsing multipart: ${err.message}`);
    return reply.code(500).send({ error: 'Failed to parse multipart form' });
  }

  if (!files.length) return reply.code(400).send({ error: 'No files uploaded' });

  const totalUploadSize = files.reduce((sum, f) => sum + f.size, 0);

  try {
    await checkRateLimits(user, plan, totalUploadSize);
  } catch (rateErr) {
    return reply.code(429).send({ error: rateErr.message });
  }

  // Only increment API request count for external keys (not internal platform)
  if (!user.internal) {
    await incrementUserRequestCount(user.id);
  }

  const rawPath = (fields.path || '').trim();
  const cleanedPath = sanitizePath(rawPath);
  const isPrivate = String(fields.private || '').toLowerCase() === 'true';

  if (isPrivate && (!B2_PRIVATE_BUCKET_ID || !B2_PRIVATE_BUCKET_NAME)) {
    return reply.code(500).send({ error: 'Private bucket configuration missing' });
  }

  let expireDeleteSeconds = parseInt(fields.expire_delete || '0', 10);
  if (isNaN(expireDeleteSeconds) || expireDeleteSeconds < 0) expireDeleteSeconds = 0;
  if (expireDeleteSeconds > MAX_EXPIRE_DELETE_SECONDS) expireDeleteSeconds = MAX_EXPIRE_DELETE_SECONDS;

  let expireTokenSeconds = 0;
  if (isPrivate) {
    expireTokenSeconds = parseInt(fields.expire_token_seconds || String(DEFAULT_PRIVATE_TOKEN_EXPIRY), 10);
    if (isNaN(expireTokenSeconds) || expireTokenSeconds <= 0) expireTokenSeconds = DEFAULT_PRIVATE_TOKEN_EXPIRY;
    if (expireTokenSeconds > MAX_EXPIRE_DELETE_SECONDS) expireTokenSeconds = MAX_EXPIRE_DELETE_SECONDS;
  }

  for (const file of files) {
    try {
      validatePlanLimits(plan, file.size, expireTokenSeconds);
    } catch (err) {
      return reply.code(413).send({ error: err.message });
    }
  }

  await initB2();

  const { bucketId, bucketName, bucketHost } = isPrivate
    ? { bucketId: B2_PRIVATE_BUCKET_ID, bucketName: B2_PRIVATE_BUCKET_NAME, bucketHost: B2_PRIVATE_HOST }
    : { bucketId: B2_PUBLIC_BUCKET_ID, bucketName: B2_PUBLIC_BUCKET_NAME, bucketHost: B2_PUBLIC_HOST };

  const results = [];

  const queryOverride = String(req.query?.override || '').toLowerCase() === 'true';

  for (const file of files) {
    // Filename logic
    let finalFilename;

    if (fields.filename) {
      // Use user provided filename sanitized, without path
      finalFilename = sanitizeFileName(fields.filename);
    } else {
      // Use original filename sanitized
      finalFilename = sanitizeFileName(file.originalFilename);
    } if (!finalFilename) {
      finalFilename = randomString(12);
    }

    // Compose full file path
    const fullFilePath = cleanedPath ? `${cleanedPath}/${finalFilename}` : finalFilename;

    // Check if file exists for override logic
    let existingFile = null;
    if (queryOverride) {
      existingFile = await getFileByUserAndPath(user.id, finalFilename, cleanedPath);
    } else {
      const exists = await fileExists(user.id, finalFilename, cleanedPath);
      if (exists) {
        return reply.code(409).send({ error: `File ${finalFilename} already exists at path ${cleanedPath}. Use override=true to replace.` });
      }
    }

    // Upload file to B2
    let uploadRes;
    try {
      uploadRes = await b2UploadFile(bucketId, fullFilePath, file.buffer, file.mimetype);
    } catch (uploadErr) {
      fastify.log.error(`B2 upload error: ${uploadErr.message}`);
      return reply.code(500).send({ error: `Failed to upload file ${finalFilename}` });
    }

    // If overriding an existing file, enqueue previous file for deletion and adjust storage used
    if (existingFile) {
      await enqueueFileForDeletion(user.id, bucketId, existingFile.path ? `${existingFile.path}/${existingFile.filename}` : existingFile.filename, existingFile.url, existingFile.path, existingFile.is_private, existingFile.b2_file_id);
      // Decrease storage used by old file size
      await updateUserStorageUsed(user.id, -existingFile.size);
      // Remove existing DB record
      await pool.query(`DELETE FROM images WHERE id = $1`, [existingFile.id]);
    }

    // Calculate expire_at timestamp if expire_delete > 0
    let expireAt = null;
    if (expireDeleteSeconds > 0) {
      expireAt = new Date(Date.now() + expireDeleteSeconds * 1000);
    }

    // Generate download URL (private with auth token if needed)
    let fileUrl = await buildDownloadUrl(bucketId, bucketName, bucketHost, fullFilePath, isPrivate, expireTokenSeconds);

    // Insert new file metadata into DB
    const insertRes = await pool.query(
      `INSERT INTO images 
      (user_id, path, filename, original_filename, content_type, size, url, is_private, expire_at, expire_token_seconds, b2_file_id, created_at) 
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) 
      RETURNING id, url`,
      [
        user.id,
        cleanedPath,
        finalFilename,
        file.originalFilename,
        file.mimetype,
        file.size,
        fileUrl,
        isPrivate,
        expireAt,
        expireTokenSeconds,
        uploadRes.fileId,
      ]
    );

    // Increase user's storage used by new file size
    await updateUserStorageUsed(user.id, file.size);

    results.push({
      id: insertRes.rows[0].id,
      url: fileUrl,
      filename: finalFilename,
      path: cleanedPath,
      size: file.size,
      private: isPrivate,
    });
  }

  return reply.code(201).send({
    success: true,
    uploaded: results.length,
    files: results,
    took_ms: Date.now() - start,
  });
});

/** Cleanup: Background deletion of expired files */
async function cleanupExpiredFiles() {
  try {
    await initB2();
    const toDeleteRes = await pool.query(`SELECT * FROM files_to_delete ORDER BY created_at ASC LIMIT 50`);
    for (const file of toDeleteRes.rows) {
      try {
        // Delete file from B2
        await b2Client.deleteFileVersion({ fileName: file.file_name, fileId: file.b2_file_id });
        // Remove DB record
        await pool.query(`DELETE FROM files_to_delete WHERE id = $1`, [file.id]);
        fastify.log.info(`Deleted file ${file.file_name} for user ${file.user_id}`);
      } catch (delErr) {
        fastify.log.error(`Error deleting file ${file.file_name}: ${delErr.message}`);
      }
    }
  } catch (err) {
    fastify.log.error(`Cleanup error: ${err.message}`);
  }
}

// Schedule cleanup every hour
setInterval(cleanupExpiredFiles, CLEANUP_INTERVAL_MS);

(async () => {
  await ensureTables();
  await initB2();

  fastify.listen({ port: PORT }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    fastify.log.info(`Server listening at ${address}`);
  });
})();