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
  return path.basename(name || '').toLowerCase().replace(/[^a-z0-9.\-_]/g, '_');
}

function sanitizePath(p) {
  if (!p) return '';
  return String(p).trim().replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}

function isImageMimeType(mime) {
  return /^image\/(png|jpeg|jpg|gif|webp|bmp|svg|tiff)$/.test(String(mime).toLowerCase());
}

/** DB Initialization (kept as you had it) */
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
      description text,
      tags jsonb,
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
    CREATE TABLE IF NOT EXISTS user_bandwidth (
      user_id uuid PRIMARY KEY,
      bandwidth_used bigint DEFAULT 0
    );
  `);

  // Insert default plans if missing
  const res = await pool.query(`SELECT plan FROM plans`);
  const existingPlans = res.rows.map(r => r.plan);

  const insertPlans = [];
  if (!existingPlans.includes('free')) {
    insertPlans.push(`('free', 'Free', ${5*1024*1024*1024}, ${15*1024*1024*1024}, ${10*1024*1024}, 500, ${7*24*3600}, false)`);
  }
  if (!existingPlans.includes('paid')) {
    insertPlans.push(`('paid', '₹499/month', ${100*1024*1024*1024}, ${500*1024*1024*1024}, ${50*1024*1024}, 100000, ${7*24*3600}, false)`);
  }
  if (!existingPlans.includes('payg')) {
    insertPlans.push(`('payg', 'Usage-based', NULL, NULL, ${50*1024*1024}, NULL, ${7*24*3600}, false)`);
  }

  if (insertPlans.length) {
    await pool.query(`
      INSERT INTO plans (plan, price_text, storage_limit, bandwidth_limit, max_file_size, max_api_requests, max_signed_url_expiry_seconds, custom)
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

async function b2DeleteFileVersions(bucketId, fileName) {
  let nextFileName = null;
  do {
    const res = await b2Client.listFileNames({
      bucketId,
      startFileName: nextFileName,
      maxFileCount: 100,
    });
    for (const file of res.data.files) {
      if (file.fileName === fileName) {
        try {
          await b2Client.deleteFileVersion({ fileName: file.fileName, fileId: file.fileId });
        } catch (e) {
          fastify.log.warn(`Failed to delete file version ${file.fileId} for ${fileName}: ${e.message}`);
        }
      }
    }
    nextFileName = res.data.nextFileName;
  } while (nextFileName);
}

async function buildDownloadUrl(bucketId, bucketName, bucketHost, fileName, isPrivate, expireSeconds) {
  if (typeof fileName !== 'string') {
    throw new Error(`Invalid fileName: expected string but got ${typeof fileName}`);
  }
  const parts = fileName.split('/').map(encodeURIComponent);
  const urlPath = parts.join('/');
  const baseUrl = `/file/${bucketName}/${urlPath}`;
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
    `
    SELECT u.*
    FROM api_keys k
    JOIN users u ON u.id = k.user_id
    WHERE k.key = $1 AND k.active = true
    LIMIT 1
  `,
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
    await pool.query(`INSERT INTO user_requests (user_id, request_count, last_reset) VALUES ($1, 1, now()) ON CONFLICT (user_id) DO UPDATE SET request_count = 1, last_reset = now()`, [userId]);
  } else {
    await pool.query(`UPDATE user_requests SET request_count = request_count + 1 WHERE user_id = $1`, [userId]);
  }
}

async function getUserBandwidthUsed(userId) {
  const res = await pool.query(`SELECT bandwidth_used FROM user_bandwidth WHERE user_id = $1`, [userId]);
  return res.rows.length ? Number(res.rows[0].bandwidth_used) : 0;
}

async function updateUserBandwidthUsed(userId, bytes) {
  await pool.query(
    `
    INSERT INTO user_bandwidth (user_id, bandwidth_used)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET bandwidth_used = user_bandwidth.bandwidth_used + $2
  `,
    [userId, bytes]
  );
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
  // Check API request count
  const requestCount = await getUserRequestCount(user.id);
  if (plan.max_api_requests !== null && plan.max_api_requests !== undefined && requestCount >= plan.max_api_requests) {
    throw new Error(`API request limit exceeded (${requestCount}/${plan.max_api_requests})`);
  }

  // Check bandwidth
  const bandwidthUsed = await getUserBandwidthUsed(user.id);
  if (plan.bandwidth_limit !== null && plan.bandwidth_limit !== undefined && bandwidthUsed + uploadSize > plan.bandwidth_limit) {
    throw new Error(`Bandwidth limit exceeded (${bandwidthUsed + uploadSize} / ${plan.bandwidth_limit})`);
  }

  // Check storage
  const storageUsed = await getUserStorageUsed(user.id);
  if (plan.storage_limit !== null && plan.storage_limit !== undefined && storageUsed + uploadSize > plan.storage_limit) {
    throw new Error(`Storage limit exceeded (${storageUsed + uploadSize} / ${plan.storage_limit})`);
  }
}




fastify.post('/upload', async (req, reply) => {
  const start = Date.now();

  // Get API key from header
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return reply.code(401).send({ error: 'Missing API key' });
  }

  // Get user by API key
  const user = await getUserByApiKey(apiKey);
  if (!user) {
    return reply.code(401).send({ error: 'Invalid API key' });
  }

  // Get plans cache
  const plans = await getPlans();
  // Get user's plan object
  const plan = plans[user.plan] || plans['free']; // fallback to free plan if unknown
  if (!plan) {
    return reply.code(500).send({ error: 'User plan not found' });
  }

  // Parse parts
  const parts = req.parts();
  const fields = {};
  const files = [];

  try {
    for await (const part of parts) {
      if (!part) continue;
      if (part.file) {
        // part.file is a stream, but part.filename/mimetype are available
        if (!isImageMimeType(part.mimetype)) {
          return reply.code(400).send({ error: `Invalid file type: ${part.mimetype}` });
        }
        // buffer the file for size check & upload
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
        // regular field
        fields[part.fieldname] = part.value;
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

  await incrementUserRequestCount(user.id);

  const rawPath = (fields.path || '').trim();
  const cleanedPath = sanitizePath(rawPath);

  const isPrivate = String(fields.private || '').toLowerCase() === 'true';

  if (isPrivate && (!B2_PRIVATE_BUCKET_ID || !B2_PRIVATE_BUCKET_NAME)) {
    return reply.code(500).send({ error: 'Private bucket configuration missing' });
  }

  let expireDeleteSeconds = parseInt(fields.expire_delete || '0', 10);
  if (isNaN(expireDeleteSeconds) || expireDeleteSeconds < 0) expireDeleteSeconds = 0;
  if (expireDeleteSeconds > 7 * 24 * 3600) expireDeleteSeconds = 7 * 24 * 3600;

  let expireTokenSeconds = 0;
  if (isPrivate) {
    expireTokenSeconds = parseInt(fields.expire_token_seconds || '3600', 10);
    if (isNaN(expireTokenSeconds) || expireTokenSeconds <= 0) expireTokenSeconds = 3600;
    if (expireTokenSeconds > 7 * 24 * 3600) expireTokenSeconds = 7 * 24 * 3600;
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

  // Parse overwrite/override parameter: accept ?override=true or form field overwrite=true
  const queryOverride = String(req.query && req.query.override ? req.query.override : '').toLowerCase() === 'true';
  const fieldOverwrite = String(fields.overwrite || fields.override || '').toLowerCase() === 'true';
  const overwrite = queryOverride || fieldOverwrite;

  // support single filename param (applied to first file) or custom_filename field
  const providedFilenameRaw = (fields.filename || fields.custom_filename || fields.customFileName || '').trim();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let ext = path.extname(file.originalFilename).toLowerCase() || '.jpg';

    // decide per-file custom name:
    // if user provided a filename and multiple files uploaded, we'll append an index if needed
    let customFilenameRaw = providedFilenameRaw;

    // If there are multiple files and the user provided filename but it doesn't contain a placeholder,
    // we will append an index to avoid using the same provided name for multiple files.
    if (customFilenameRaw && files.length > 1) {
      // If user provided something like "name.jpg" we will convert to "name-1.jpg", "name-2.jpg", ...
      const baseProvided = sanitizeFileName(customFilenameRaw);
      const extProvided = path.extname(baseProvided) || ext;
      const baseOnly = path.basename(baseProvided, extProvided);
      customFilenameRaw = `${baseOnly}-${i + 1}${extProvided}`;
    }

    let finalFileName;

    if (customFilenameRaw) {
      // If custom filename provided by user, sanitize and keep extension (or add if missing)
      let sanitized = sanitizeFileName(customFilenameRaw);
      if (!path.extname(sanitized)) sanitized += ext;

      // check existence
      const existingRes = await pool.query(
        `SELECT 1 FROM images WHERE user_id = $1 AND path IS NOT DISTINCT FROM $2 AND filename = $3 AND is_private = $4 LIMIT 1`,
        [user.id, cleanedPath || null, sanitized, isPrivate]
      );

      if (existingRes.rowCount > 0) {
        if (overwrite) {
          // remove old B2 versions and DB rows (we'll continue and insert new)
          try {
            await b2DeleteFileVersions(bucketId, `${user.id}${cleanedPath ? `/${cleanedPath}` : ''}/${sanitized}`);
          } catch (e) {
            fastify.log.warn(`Could not delete old file versions for overwrite: ${e.message}`);
          }
          try {
            await pool.query(
              `DELETE FROM images WHERE user_id = $1 AND path IS NOT DISTINCT FROM $2 AND filename = $3 AND is_private = $4`,
              [user.id, cleanedPath || null, sanitized, isPrivate]
            );
          } catch (e) {
            fastify.log.warn(`Could not delete old DB image rows for overwrite: ${e.message}`);
          }
          finalFileName = sanitized;
        } else {
          // add suffix to avoid collision
          const baseName = path.basename(sanitized, path.extname(sanitized) || ext);
          finalFileName = `${baseName}-${randomString(6)}${path.extname(sanitized) || ext}`;
        }
      } else {
        finalFileName = sanitized;
      }
    } else {
      // No custom filename provided -> try to keep original filename
      let sanitizedOrig = sanitizeFileName(file.originalFilename);
      if (!path.extname(sanitizedOrig)) sanitizedOrig += ext;

      const existingRes = await pool.query(
        `SELECT 1 FROM images WHERE user_id = $1 AND path IS NOT DISTINCT FROM $2 AND filename = $3 AND is_private = $4 LIMIT 1`,
        [user.id, cleanedPath || null, sanitizedOrig, isPrivate]
      );

      if (existingRes.rowCount > 0) {
        if (overwrite) {
          try {
            await b2DeleteFileVersions(bucketId, `${user.id}${cleanedPath ? `/${cleanedPath}` : ''}/${sanitizedOrig}`);
          } catch (e) {
            fastify.log.warn(`Could not delete old file versions for overwrite: ${e.message}`);
          }
          try {
            await pool.query(
              `DELETE FROM images WHERE user_id = $1 AND path IS NOT DISTINCT FROM $2 AND filename = $3 AND is_private = $4`,
              [user.id, cleanedPath || null, sanitizedOrig, isPrivate]
            );
          } catch (e) {
            fastify.log.warn(`Could not delete old DB image rows for overwrite: ${e.message}`);
          }
          finalFileName = sanitizedOrig;
        } else {
          const baseName = path.basename(sanitizedOrig, path.extname(sanitizedOrig) || ext);
          finalFileName = `${baseName}-${randomString(6)}${path.extname(sanitizedOrig) || ext}`;
        }
      } else {
        finalFileName = sanitizedOrig;
      }
    }

    // Build B2 path and upload
    const b2FileName = `${user.id}${cleanedPath ? `/${cleanedPath}` : ''}/${finalFileName}`;

    try {
      await b2UploadFile(bucketId, b2FileName, file.buffer, file.mimetype);

      const imageId = randomString(12);
      const fullUrl = await buildDownloadUrl(bucketId, bucketName, bucketHost, b2FileName, isPrivate, expireTokenSeconds);

      let expireAt = null;
      if (expireDeleteSeconds > 0) expireAt = new Date(Date.now() + expireDeleteSeconds * 1000);
      const insertRes = await pool.query(
        `INSERT INTO images (id, user_id, path, filename, original_filename, content_type, size, url, is_private, expire_at, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          imageId,
          user.id,
          cleanedPath || null,
          finalFileName,
          file.originalFilename,
          file.mimetype,
          file.size,
          fullUrl,
          isPrivate,
          expireAt,
          fields.description || null,
        ]
      );

      await updateUserStorageUsed(user.id, file.size);
      await updateUserBandwidthUsed(user.id, file.size);

      results.push({
        originalFilename: file.originalFilename,
        finalFileName,
        url: fullUrl,
        success: true,
        dbRecord: insertRes.rows[0],
      });
    } catch (e) {
      fastify.log.error(`Upload failed for ${file.originalFilename}: ${e.message}`);
      results.push({
        originalFilename: file.originalFilename,
        success: false,
        error: e.message,
      });
    }
  }

  fastify.log.info(`/upload finished in ${Date.now() - start}ms`);
  return reply.send({ ok: true, files: results });
});

// Startup
(async () => {
  try {
    await ensureTables();
    await initB2();
    await getPlans(true);
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Server listening on port ${PORT}`);
  } catch (err) {
    console.error('Startup error:', err.stack || err.message || err);
    process.exit(1);
  }
})();