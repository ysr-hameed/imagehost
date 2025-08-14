// api_server.js
require('dotenv').config();
const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const { Pool } = require('pg');
const B2 = require('backblaze-b2');
const crypto = require('crypto');
const path = require('path');
const cors = require('@fastify/cors');

const PORT = process.env.USER_API_PORT || 4000;

const B2_PRIVATE_BUCKET_ID = process.env.B2_PRIVATE_BUCKET_ID;
const B2_PUBLIC_BUCKET_ID = process.env.B2_PUBLIC_BUCKET_ID;
const B2_PRIVATE_BUCKET_NAME = process.env.B2_PRIVATE_BUCKET_NAME;
const B2_PUBLIC_BUCKET_NAME = process.env.B2_PUBLIC_BUCKET_NAME;

const fastify = Fastify({ logger: true });
fastify.register(multipart);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

// --- Auth helpers ---
async function getUserByApiKey(apiKey) {
  if (!apiKey) return null;
  const res = await pool.query(
    `SELECT u.* FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key = $1 AND k.active = true LIMIT 1`,
    [apiKey]
  );
  return res.rows[0] || null;
}

async function getUserRequestCount(userId) {
  const res = await pool.query(`SELECT request_count, last_reset FROM user_requests WHERE user_id = $1`, [userId]);
  if (res.rows.length === 0) return 0;
  const row = res.rows[0];
  const now = new Date();
  const lastReset = new Date(row.last_reset);
  if (now - lastReset > 24 * 3600 * 1000) {
    await pool.query(`UPDATE user_requests SET request_count = 0, last_reset = now() WHERE user_id = $1`, [userId]);
    return 0;
  }
  return row.request_count || 0;
}

async function incrementUserRequestCountIfNeeded(userId, skip) {
  if (skip) return;
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

// --- Helpers ---
function sanitizeFileName(filename) {
  // Remove any path parts, keep only basename
  const base = path.basename(filename || 'file');
  // Remove unwanted chars, keep alphanumeric, dash, underscore, dot
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function randomFileName(originalName) {
  const ext = originalName && originalName.includes('.') ? '.' + originalName.split('.').pop() : '';
  return crypto.randomBytes(12).toString('hex') + ext;
}

async function buildPrivateDownloadUrl(bucketId, bucketName, domain, fileName, expireSeconds) {
  const ttl = expireSeconds && expireSeconds > 0 ? expireSeconds : 3600;
  const max = 7 * 24 * 3600;
  const valid = Math.min(ttl, max);

  const auth = await b2Client.getDownloadAuthorization({
    bucketId,
    fileNamePrefix: fileName,
    validDurationInSeconds: valid,
  });
  const token = (auth && auth.data && (auth.data.authorizationToken || auth.data.authorization)) || '';

  const base = domain
    ? `https://${domain}/${bucketName}/${encodeURIComponent(fileName)}`
    : `${b2Client.downloadUrl}/${bucketName}/${encodeURIComponent(fileName)}`;

  return `${base}?Authorization=${encodeURIComponent(token)}`;
}

async function b2UploadFile(bucketId, fileName, buffer, contentType) {
  const uploadUrlRes = await b2Client.getUploadUrl({ bucketId });
  return b2Client.uploadFile({
    uploadUrl: uploadUrlRes.data.uploadUrl,
    uploadAuthToken: uploadUrlRes.data.authorizationToken,
    fileName,
    data: buffer,
    contentType,
  });
}

async function b2DeleteFileVersions(bucketId, fileName) {
  // Get file versions to delete all
  const listRes = await b2Client.listFileVersions({ bucketId, startFileName: fileName, maxFileCount: 100 });
  if (!listRes || !listRes.data.files) return;
  const deletions = listRes.data.files
    .filter(f => f.fileName === fileName)
    .map(f => b2Client.deleteFileVersion({ fileName: f.fileName, fileId: f.fileId }));
  await Promise.all(deletions);
}

async function updateUserStorageUsed(userId, bytes) {
  await pool.query('UPDATE users SET storage_used = storage_used + $1 WHERE id = $2', [bytes, userId]);
}

async function updateUserBandwidthUsed(userId, bytes) {
  await pool.query('UPDATE users SET bandwidth_used = bandwidth_used + $1 WHERE id = $2', [bytes, userId]);
}

// --- Middleware: authentication + optional request count increment ---
fastify.addHook('preHandler', async (req, reply) => {
  if (req.routerPath === '/health') return;

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return reply.code(401).send({ error: 'Missing API key' });

  const user = await getUserByApiKey(apiKey);
  if (!user) return reply.code(401).send({ error: 'Invalid API key' });

  req.user = user;

  const skipCount = req.headers['x-internal'] === '1' || req.headers['x-internal'] === 1;
  try {
    await incrementUserRequestCountIfNeeded(user.id, skipCount);
  } catch (e) {
    fastify.log.warn(`Failed to increment API request count: ${e.message}`);
  }
});

// --- Routes ---

// GET images list for user
fastify.get('/images', async (req, reply) => {
  const user = req.user;
  const { is_private, limit = 50, offset = 0 } = req.query;

  const conditions = ['user_id = $1'];
  const values = [user.id];
  let idx = 2;

  if (typeof is_private !== 'undefined') {
    conditions.push(`is_private = $${idx++}`);
    values.push(is_private === 'true' || is_private === true);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const q = `
    SELECT id, filename, is_private, size, description, created_at
    FROM images
    ${where}
    ORDER BY created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `;
  values.push(Number(limit));
  values.push(Number(offset));

  const res = await pool.query(q, values);

  const images = res.rows.map((img) => {
    const bucketName = img.is_private ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME;
    const filePath = `${user.id}/${img.filename}`;
    const url = `https://${user.domain || b2Client.downloadUrl}/${bucketName}/${encodeURIComponent(filePath)}`;
    return { ...img, url };
  });

  return reply.send({ ok: true, images });
});

// GET single image metadata
fastify.get('/images/:id', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;

  const res = await pool.query(
    'SELECT id, filename, is_private, size, description, created_at FROM images WHERE id = $1 AND user_id = $2',
    [id, user.id]
  );
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Image not found' });

  const img = res.rows[0];
  const bucketName = img.is_private ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME;
  const filePath = `${user.id}/${img.filename}`;
  const url = `https://${user.domain || b2Client.downloadUrl}/${bucketName}/${encodeURIComponent(filePath)}`;

  return reply.send({ ok: true, image: { ...img, url } });
});

// POST upload image (multipart, supports multiple files)
fastify.post('/images', async (req, reply) => {
  const user = req.user;
  await initB2();

  const parts = req.parts();
  const results = [];
  let totalUploadSize = 0;

  for await (const part of parts) {
    if (part.file) {
      // Generate UUID for image
      const imageId = crypto.randomUUID();

      const originalFilename = sanitizeFileName(part.filename || 'file.bin');
      const isPrivate = req.query.is_private === 'true' || req.query.is_private === true;
      const bucketId = isPrivate ? B2_PRIVATE_BUCKET_ID : B2_PUBLIC_BUCKET_ID;
      const bucketName = isPrivate ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME;

      // Compose filename in bucket: user_id/originalFilename
      const b2FileName = `${user.id}/${originalFilename}`;

      // Read buffer fully (not recommended for huge files; consider streaming)
      const buffer = await part.toBuffer();

      await b2UploadFile(bucketId, b2FileName, buffer, part.mimetype);

      const fileUrl = isPrivate
        ? await buildPrivateDownloadUrl(bucketId, bucketName, user.domain, b2FileName, 3600)
        : `https://${user.domain || b2Client.downloadUrl}/${bucketName}/${encodeURIComponent(b2FileName)}`;

      // Insert DB record with UUID id
      await pool.query(
        `INSERT INTO images (id, user_id, filename, original_filename, content_type, size, url, is_private, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [imageId, user.id, originalFilename, originalFilename, part.mimetype, buffer.length, fileUrl, isPrivate]
      );

      // Update user storage used
      await updateUserStorageUsed(user.id, buffer.length);
      totalUploadSize += buffer.length;

      results.push({
        id: imageId,
        url: fileUrl,
        filename: originalFilename,
        originalFilename,
        size: buffer.length,
        contentType: part.mimetype,
        isPrivate,
      });
    }
  }

  await updateUserBandwidthUsed(user.id, totalUploadSize);

  if (results.length === 0) {
    return reply.code(400).send({ error: 'No files uploaded' });
  }

  return reply.send({ ok: true, uploaded: results });
});

// DELETE image — enqueue deletion
fastify.delete('/images/:id', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;

  const res = await pool.query('SELECT * FROM images WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Image not found' });
  const image = res.rows[0];

  const b2BucketId = image.is_private ? B2_PRIVATE_BUCKET_ID : B2_PUBLIC_BUCKET_ID;
  const b2BucketName = image.is_private ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME;
  const b2FileName = `${user.id}/${image.filename}`;

  await pool.query(
    `INSERT INTO delete_queue (image_id, user_id, b2_bucket_id, b2_bucket_name, b2_file_name, size, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [image.id, user.id, b2BucketId, b2BucketName, b2FileName, image.size || 0]
  );

  await pool.query('DELETE FROM images WHERE id = $1', [id]);
  await pool.query('UPDATE users SET storage_used = GREATEST(storage_used - $1, 0) WHERE id = $2', [image.size || 0, user.id]);

  return reply.send({ ok: true, message: 'Queued for deletion' });
});

// GET private token URL for image (max 7 days)
fastify.get('/images/:id/token', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;
  let expireSeconds = parseInt(req.query.expire_seconds || '3600', 10);
  if (isNaN(expireSeconds) || expireSeconds <= 0) expireSeconds = 3600;
  if (expireSeconds > 7 * 24 * 3600) expireSeconds = 7 * 24 * 3600;

  const res = await pool.query('SELECT filename, is_private FROM images WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Image not found' });

  const img = res.rows[0];
  if (!img.is_private) {
    const url = `https://${user.domain || b2Client.downloadUrl}/${B2_PUBLIC_BUCKET_NAME}/${encodeURIComponent(user.id + '/' + img.filename)}`;
    return reply.send({ ok: true, url, is_private: false });
  }

  await initB2();
  try {
    const url = await buildPrivateDownloadUrl(B2_PRIVATE_BUCKET_ID, B2_PRIVATE_BUCKET_NAME, user.domain, `${user.id}/${img.filename}`, expireSeconds);
    return reply.send({ ok: true, url, is_private: true, expire_seconds: expireSeconds });
  } catch (e) {
    fastify.log.error('token generation error: ' + e.message);
    return reply.code(500).send({ error: 'Failed to generate token' });
  }
});

// Basic user info endpoints
fastify.get('/me/plan', async (req, reply) => {
  const user = req.user;
  const res = await pool.query('SELECT * FROM plans WHERE plan = $1', [user.plan]);
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Plan not found' });
  return reply.send({ ok: true, plan: res.rows[0] });
});

fastify.get('/me/stats', async (req, reply) => {
  const user = req.user;
  const requestCount = await getUserRequestCount(user.id);
  return reply.send({
    ok: true,
    stats: {
      storage_used: user.storage_used || 0,
      api_requests_today: requestCount,
    },
  });
});

fastify.get('/me/api-keys', async (req, reply) => {
  const user = req.user;
  const res = await pool.query(
    'SELECT id, key_name, active, created_at, last_used_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
    [user.id]
  );
  return reply.send({ ok: true, api_keys: res.rows });
});

fastify.get('/health', async () => ({ ok: true, status: 'alive' }));
fastify.register(cors, { origin: true });
// Start server
(async () => {
  try {
    await initB2();
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`User API server listening on port ${PORT}`);
  } catch (err) {
    console.error('Startup error:', err.stack || err.message || err);
    process.exit(1);
  }
})();