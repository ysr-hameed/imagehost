require('dotenv').config();
const Fastify = require('fastify');
const { Pool } = require('pg');
const B2 = require('backblaze-b2');
const crypto = require('crypto');

const PORT = process.env.USER_API_PORT || 4000;

const B2_PRIVATE_BUCKET_ID = process.env.B2_PRIVATE_BUCKET_ID;
const B2_PUBLIC_BUCKET_ID = process.env.B2_PUBLIC_BUCKET_ID;
const B2_PRIVATE_BUCKET_NAME = process.env.B2_PRIVATE_BUCKET_NAME;
const B2_PUBLIC_BUCKET_NAME = process.env.B2_PUBLIC_BUCKET_NAME;

const fastify = Fastify({ logger: true });
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

async function getUserByApiKey(apiKey) {
  if (!apiKey) return null;
  // Also select domain here
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

function randomString(len = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.randomBytes(len), (b) => chars[b % chars.length]).join('');
}

async function buildDownloadUrl(bucketId, bucketName, domain, fileName, isPrivate, expireSeconds) {
  // Use user's domain in URL instead of backblaze host
  const parts = fileName.split('/').map(encodeURIComponent);
  const urlPath = parts.join('/');
  const baseUrl = `https://${domain}/${bucketName}/${urlPath}`;
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

// Middleware: Authenticate and count requests (except /health)
fastify.addHook('preHandler', async (req, reply) => {
  if (req.routerPath === '/health') return;

  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return reply.code(401).send({ error: 'Missing API key' });
  const user = await getUserByApiKey(apiKey);
  if (!user) return reply.code(401).send({ error: 'Invalid API key' });
  req.user = user;

  try {
    await incrementUserRequestCount(user.id);
  } catch (e) {
    fastify.log.warn(`Failed to increment API request count: ${e.message}`);
  }
});

// GET all images
fastify.get('/images', async (req, reply) => {
  const user = req.user;
  const { path, is_private, limit = 50, offset = 0 } = req.query;

  const conditions = ['user_id = $1'];
  const values = [user.id];
  let idx = 2;

  if (path) {
    conditions.push(`path = $${idx++}`);
    values.push(path);
  }
  if (is_private !== undefined) {
    conditions.push(`is_private = $${idx++}`);
    values.push(is_private === 'true' || is_private === true);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const query = `
    SELECT * FROM images
    ${where}
    ORDER BY created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `;
  values.push(Number(limit));
  values.push(Number(offset));

  const res = await pool.query(query, values);

  // Build URLs using user domain
  const images = res.rows.map((img) => {
    const urlBase = `https://${user.domain}/${img.is_private ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME}`;
    const filePath = `${user.id}${img.path ? `/${img.path}` : ''}/${img.filename}`;
    return {
      ...img,
      url: `${urlBase}/${encodeURI(filePath)}`,
    };
  });

  return reply.send({ ok: true, images });
});

// GET single image by id
fastify.get('/images/:id', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;

  const res = await pool.query('SELECT * FROM images WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Image not found' });

  const img = res.rows[0];
  const urlBase = `https://${user.domain}/${img.is_private ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME}`;
  const filePath = `${user.id}${img.path ? `/${img.path}` : ''}/${img.filename}`;
  const url = `${urlBase}/${encodeURI(filePath)}`;

  return reply.send({ ok: true, image: { ...img, url } });
});

// DELETE image by id
fastify.delete('/images/:id', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;

  const res = await pool.query('SELECT * FROM images WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Image not found' });

  const image = res.rows[0];
  await initB2();

  const bucketId = image.is_private ? B2_PRIVATE_BUCKET_ID : B2_PUBLIC_BUCKET_ID;
  const b2FileName = `${user.id}${image.path ? `/${image.path}` : ''}/${image.filename}`;

  try {
    const listRes = await b2Client.listFileNames({ bucketId, startFileName: b2FileName, maxFileCount: 100 });
    for (const file of listRes.data.files) {
      if (file.fileName === b2FileName) {
        await b2Client.deleteFileVersion({ fileId: file.fileId, fileName: b2FileName });
      }
    }
  } catch (e) {
    fastify.log.warn(`Failed to delete B2 file: ${e.message}`);
  }

  await pool.query('DELETE FROM images WHERE id = $1', [id]);
  await pool.query('UPDATE users SET storage_used = storage_used - $1 WHERE id = $2', [image.size, user.id]);

  return reply.send({ ok: true, message: 'Image deleted' });
});

// PATCH image metadata
fastify.patch('/images/:id', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;
  const { path, is_private, description } = req.body;

  const res = await pool.query('SELECT * FROM images WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Image not found' });

  const image = res.rows[0];

  const updatedPath = path !== undefined ? path.trim().replace(/^\/+|\/+$/g, '') || null : image.path;
  const updatedIsPrivate = is_private !== undefined ? Boolean(is_private) : image.is_private;
  const updatedDescription = description !== undefined ? description : image.description;

  await pool.query(
    'UPDATE images SET path = $1, is_private = $2, description = $3 WHERE id = $4',
    [updatedPath, updatedIsPrivate, updatedDescription, id]
  );

  return reply.send({ ok: true, message: 'Image metadata updated' });
});

// GET image download URL with user's domain and auth token for private files
fastify.get('/images/:id/download', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;
  let expireSeconds = parseInt(req.query.expire_seconds || '3600', 10);
  if (isNaN(expireSeconds) || expireSeconds <= 0 || expireSeconds > 7 * 24 * 3600) {
    expireSeconds = 3600;
  }

  const res = await pool.query('SELECT * FROM images WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Image not found' });

  const image = res.rows[0];
  await initB2();

  const bucketId = image.is_private ? B2_PRIVATE_BUCKET_ID : B2_PUBLIC_BUCKET_ID;
  const bucketName = image.is_private ? B2_PRIVATE_BUCKET_NAME : B2_PUBLIC_BUCKET_NAME;

  try {
    const url = await buildDownloadUrl(
      bucketId,
      bucketName,
      user.domain,
      `${user.id}${image.path ? `/${image.path}` : ''}/${image.filename}`,
      image.is_private,
      expireSeconds
    );
    return reply.send({ ok: true, url });
  } catch (e) {
    return reply.code(500).send({ error: 'Failed to build download URL' });
  }
});

// GET current user's plan info
fastify.get('/me/plan', async (req, reply) => {
  const user = req.user;
  const res = await pool.query('SELECT * FROM plans WHERE plan = $1', [user.plan]);
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Plan not found' });
  return reply.send({ ok: true, plan: res.rows[0] });
});

// GET user stats
fastify.get('/me/stats', async (req, reply) => {
  const user = req.user;
  const bandwidthRes = await pool.query('SELECT bandwidth_used FROM user_bandwidth WHERE user_id = $1', [user.id]);
  const bandwidthUsed = bandwidthRes.rows.length ? Number(bandwidthRes.rows[0].bandwidth_used) : 0;

  const requestCount = await getUserRequestCount(user.id);

  return reply.send({
    ok: true,
    stats: {
      storage_used: user.storage_used,
      bandwidth_used: bandwidthUsed,
      api_requests_today: requestCount,
    },
  });
});

// GET current user's API keys (metadata only)
fastify.get('/me/api-keys', async (req, reply) => {
  const user = req.user;
  const res = await pool.query(
    'SELECT id, key_name, active, created_at, last_used_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
    [user.id]
  );
  return reply.send({ ok: true, api_keys: res.rows });
});

// Health check
fastify.get('/health', async () => {
  return { ok: true, status: 'alive' };
});

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