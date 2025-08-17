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

async function buildPrivateDownloadUrl(bucketId, bucketName, domain, fileName, expireSeconds) {
  const ttl = expireSeconds && expireSeconds > 0 ? expireSeconds : 3600;
  const max = 7 * 24 * 3600;
  const valid = Math.min(ttl, max);

  const auth = await b2Client.getDownloadAuthorization({
    bucketId,
    fileNamePrefix: fileName,
    validDurationInSeconds: valid,
  });
  const token = (auth?.data?.authorizationToken || auth?.data?.authorization) || '';
  const base = domain
    ? `https://${domain}/${bucketName}/${encodeURIComponent(fileName)}`
    : `${b2Client.downloadUrl}/${bucketName}/${encodeURIComponent(fileName)}`;
  return `${base}?Authorization=${encodeURIComponent(token)}`;
}

async function getUserByApiKey(apiKey) {
  if (!apiKey) return null;
  const res = await pool.query(
    `SELECT u.* FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key = $1 AND k.active = true LIMIT 1`,
    [apiKey]
  );
  return res.rows[0] || null;
}

// --- Request counting ---
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
      `INSERT INTO user_requests (user_id, request_count, last_reset) VALUES ($1, 1, now())
       ON CONFLICT (user_id) DO UPDATE SET request_count = 1, last_reset = now()`,
      [userId]
    );
  } else {
    await pool.query(`UPDATE user_requests SET request_count = request_count + 1 WHERE user_id = $1`, [userId]);
  }
}

// --- Middleware ---
fastify.addHook('preHandler', async (req, reply) => {
  if (req.routerPath === '/health') return;
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return reply.code(401).send({ error: 'Missing API key' });

  const user = await getUserByApiKey(apiKey);
  if (!user) return reply.code(401).send({ error: 'Invalid API key' });
  req.user = user;

  const skipCount = req.headers['x-internal'] === '1' || req.headers['x-internal'] === 1;
  try { await incrementUserRequestCountIfNeeded(user.id, skipCount); } catch (e) { fastify.log.warn(e.message); }
});

// --- Routes ---

// Health
fastify.get('/health', async () => ({ ok: true, status: 'alive' }));

// List images (with search, sort, pagination)
fastify.get('/images', async (req, reply) => {
  const user = req.user;
  const { q = '', sort = 'created_at_desc', page = 1, limit = 20 } = req.query;
  const MAX_LIMIT = 50;

  const l = Math.min(Number(limit) || 20, MAX_LIMIT);
  const p = Math.max(Number(page) || 1, 1);
  const offset = (p - 1) * l;

  const conditions = ['user_id = $1'];
  const values = [user.id];
  let idx = 2;

  if (q) { conditions.push(`filename ILIKE $${idx++}`); values.push(`%${q}%`); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const countRes = await pool.query(`SELECT COUNT(*) AS total FROM images ${where}`, values);
  const totalCount = parseInt(countRes.rows[0].total, 10);
  const totalPages = Math.ceil(totalCount / l);

  // Sort
  let orderBy = 'created_at DESC';
  if (sort === 'created_at_asc') orderBy = 'created_at ASC';
  if (sort === 'size_asc') orderBy = 'size ASC';
  if (sort === 'size_desc') orderBy = 'size DESC';

  values.push(l, offset);
  const res = await pool.query(
    `SELECT id, filename, is_private, size, description, created_at FROM images ${where} ORDER BY ${orderBy} LIMIT $${idx++} OFFSET $${idx++}`,
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
    pagination: { totalCount, totalPages, page: p, limit: l, hasNext: p < totalPages, hasPrev: p > 1 },
  });
});

// Delete image (corrected to use `images` table)
fastify.delete('/images/:id', async (req, reply) => {
  const user = req.user;
  const imageId = req.params.id;

  try {
    const { rows } = await pool.query(`SELECT * FROM images WHERE id = $1 AND user_id = $2`, [imageId, user.id]);
    if (!rows.length) return reply.code(404).send({ error: 'Image not found' });
    const img = rows[0];

    // Delete from images table
    await pool.query(`DELETE FROM images WHERE id = $1 AND user_id = $2`, [imageId, user.id]);

    // Optionally mark for deletion table
    const expire_at = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    await pool.query(
      `INSERT INTO files_to_delete (user_id, bucket_id, file_name, url, path, is_private, b2_file_id, expire_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [user.id, img.bucket_id, img.filename, img.url, `${user.id}/${img.filename}`, img.is_private, img.b2_file_id, expire_at]
    );

    return reply.send({ ok: true, message: 'Image deleted successfully' });
  } catch (err) {
    console.error(err);
    return reply.code(500).send({ error: 'Internal server error' });
  }
});

// Get private token URL
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