// api_server.js
require('dotenv').config();
const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const cors = require('@fastify/cors');
const { Pool } = require('pg');
const B2 = require('backblaze-b2');
const crypto = require('crypto');
const path = require('path');

const PORT = process.env.USER_API_PORT || 4000;

// --- Backblaze config ---
const B2_PRIVATE_BUCKET_ID = process.env.B2_PRIVATE_BUCKET_ID;
const B2_PUBLIC_BUCKET_ID = process.env.B2_PUBLIC_BUCKET_ID;
const B2_PRIVATE_BUCKET_NAME = process.env.B2_PRIVATE_BUCKET_NAME;
const B2_PUBLIC_BUCKET_NAME = process.env.B2_PUBLIC_BUCKET_NAME;

// --- Fastify setup ---
const fastify = Fastify({ logger: true });
fastify.register(multipart);
fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*'],
});

// --- Postgres setup ---
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// --- Backblaze client ---
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

// --- Helper functions ---
function sanitizeFileName(filename) {
  const base = path.basename(filename || 'file');
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
  const listRes = await b2Client.listFileVersions({ bucketId, startFileName: fileName, maxFileCount: 100 });
  if (!listRes || !listRes.data.files) return;
  const deletions = listRes.data.files
    .filter(f => f.fileName === fileName)
    .map(f => b2Client.deleteFileVersion({ fileName: f.fileName, fileId: f.fileId }));
  await Promise.all(deletions);
}

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

async function updateUserStorageUsed(userId, bytes) {
  await pool.query('UPDATE users SET storage_used = storage_used + $1 WHERE id = $2', [bytes, userId]);
}

async function updateUserBandwidthUsed(userId, bytes) {
  await pool.query('UPDATE users SET bandwidth_used = bandwidth_used + $1 WHERE id = $2', [bytes, userId]);
}

// --- Middleware: auth & request counting ---
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

// Health
fastify.get('/health', async () => ({ ok: true, status: 'alive' }));

// List images
fastify.get('/images', async (req, reply) => {
  const user = req.user;
  const { is_private, page = 1, limit = 20 } = req.query;
  const MAX_LIMIT = 50;

  const l = Math.min(Number(limit) || 20, MAX_LIMIT);
  const p = Math.max(Number(page) || 1, 1);
  const offset = (p - 1) * l;

  const conditions = ['user_id = $1'];
  const values = [user.id];
  let idx = 2;

  if (typeof is_private !== 'undefined') {
    conditions.push(`is_private = $${idx++}`);
    values.push(is_private === 'true' || is_private === true);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const countRes = await pool.query(`SELECT COUNT(*) AS total FROM images ${where}`, values);
  const totalCount = parseInt(countRes.rows[0].total, 10);
  const totalPages = Math.ceil(totalCount / l);

  values.push(l, offset);
  const res = await pool.query(
    `SELECT id, filename, is_private, size, description, created_at FROM images ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    values
  );

  const images = res.rows.map(img => {
    const bucketName = img.is_private ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME;
    const filePath = `${user.id}/${img.filename}`;
    const url = `https://${user.domain || b2Client.downloadUrl}/${bucketName}/${encodeURIComponent(filePath)}`;
    return { ...img, url };
  });

  return reply.send({
    ok: true,
    images,
    pagination: {
      totalCount,
      totalPages,
      page: p,
      limit: l,
      hasNext: p < totalPages,
      hasPrev: p > 1,
    },
  });
});

// Get single image metadata
fastify.get('/images/:id', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;
  const res = await pool.query('SELECT * FROM images WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!res.rows.length) return reply.code(404).send({ error: 'Image not found' });

  const img = res.rows[0];
  const bucketName = img.is_private ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME;
  const filePath = `${user.id}/${img.filename}`;
  const url = `https://${user.domain || b2Client.downloadUrl}/${bucketName}/${encodeURIComponent(filePath)}`;
  return reply.send({ ok: true, image: { ...img, url } });
});

// Upload image(s)
fastify.post('/images', async (req, reply) => {
  const user = req.user;
  await initB2();
  const parts = req.parts();
  const results = [];
  let totalUploadSize = 0;

  for await (const part of parts) {
    if (!part.file) continue;

    const imageId = crypto.randomUUID();
    const originalFilename = sanitizeFileName(part.filename || 'file.bin');
    const isPrivate = req.query.is_private === 'true' || req.query.is_private === true;
    const bucketId = isPrivate ? B2_PRIVATE_BUCKET_ID : B2_PUBLIC_BUCKET_ID;
    const bucketName = isPrivate ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME;

    const b2FileName = `${user.id}/${originalFilename}`;
    const buffer = await part.toBuffer();

    await b2UploadFile(bucketId, b2FileName, buffer, part.mimetype);

    const fileUrl = isPrivate
      ? await buildPrivateDownloadUrl(bucketId, bucketName, user.domain, b2FileName, 3600)
      : `https://${user.domain || b2Client.downloadUrl}/${bucketName}/${encodeURIComponent(b2FileName)}`;

    await pool.query(
      `INSERT INTO images (id, user_id, filename, original_filename, content_type, size, url, is_private, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [imageId, user.id, originalFilename, originalFilename, part.mimetype, buffer.length, fileUrl, isPrivate]
    );

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

  await updateUserBandwidthUsed(user.id, totalUploadSize);

  if (!results.length) return reply.code(400).send({ error: 'No files uploaded' });
  return reply.send({ ok: true, uploaded: results });
});

// Delete image
fastify.delete('/images/:id', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;

  const res = await pool.query('SELECT * FROM images WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!res.rows.length) return reply.code(404).send({ error: 'Image not found' });

  const img = res.rows[0];
  const bucketId = img.is_private ? B2_PRIVATE_BUCKET_ID : B2_PUBLIC_BUCKET_ID;
  const b2FileName = `${user.id}/${img.filename}`;

  await b2DeleteFileVersions(bucketId, b2FileName);
  await pool.query('DELETE FROM images WHERE id = $1', [id]);
  await pool.query('UPDATE users SET storage_used = GREATEST(storage_used - $1, 0) WHERE id = $2', [
    img.size || 0,
    user.id,
  ]);

  return reply.send({ ok: true, message: 'File deleted successfully' });
});

// Get private token URL for image
fastify.get('/images/:id/token', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;
  let expireSeconds = parseInt(req.query.expire_seconds || '3600', 10);
  if (isNaN(expireSeconds) || expireSeconds <= 0) expireSeconds = 3600;
  if (expireSeconds > 7 * 24 * 3600) expireSeconds = 7 * 24 * 3600;

  const res = await pool.query('SELECT filename, is_private FROM images WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!res.rows.length) return reply.code(404).send({ error: 'Image not found' });

  const img = res.rows[0];
  if (!img.is_private) {
    const url = `https://${user.domain || b2Client.downloadUrl}/${B2_PUBLIC_BUCKET_NAME}/${encodeURIComponent(user.id + '/' + img.filename)}`;
    return reply.send({ ok: true, url, is_private: false });
  }

  await initB2();
  const url = await buildPrivateDownloadUrl(B2_PRIVATE_BUCKET_ID, B2_PRIVATE_BUCKET_NAME, user.domain, `${user.id}/${img.filename}`, expireSeconds);
  return reply.send({ ok: true, url, is_private: true, expire_seconds: expireSeconds });
});

// --- /me endpoints ---
fastify.get('/me/plan', async (req, reply) => {
  const user = req.user;
  const res = await pool.query('SELECT * FROM plans WHERE plan = $1', [user.plan]);
  if (!res.rows.length) return reply.code(404).send({ error: 'Plan not found' });
  return reply.send({ ok: true, plan: res.rows[0] });
});

fastify.get('/me/stats', async (req, reply) => {
  const user = req.user;
  const requestCount = await getUserRequestCount(user.id);
  return reply.send({
    ok: true,
    stats: { storage_used: user.storage_used || 0, api_requests_today: requestCount },
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

// --- Start server ---
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