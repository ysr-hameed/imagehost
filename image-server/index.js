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
const B2_PRIVATE_HOST = process.env.B2_PRIVATE_HOST || 'f006.backblazeb2.com';
const B2_PUBLIC_HOST = process.env.B2_PUBLIC_HOST || 'f005.backblazeb2.com';

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

async function buildDownloadUrl(bucketId, bucketName, bucketHost, fileName, isPrivate, expireSeconds) {
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

// Middleware to authenticate user and increment request count
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

// GET all images (with optional filters: path & privacy, pagination)
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
  return reply.send({ ok: true, images: res.rows });
});

// GET single image by id
fastify.get('/images/:id', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;

  const res = await pool.query('SELECT * FROM images WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Image not found' });

  return reply.send({ ok: true, image: res.rows[0] });
});

// DELETE image by id and update user storage used
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

// PATCH image metadata (path, is_private, description)
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

  // Note: Changing privacy or path ideally requires file moving in B2 (not implemented here)

  await pool.query(
    'UPDATE images SET path = $1, is_private = $2, description = $3 WHERE id = $4',
    [updatedPath, updatedIsPrivate, updatedDescription, id]
  );

  return reply.send({ ok: true, message: 'Image metadata updated' });
});

// GET image download URL (with optional expiry seconds)
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
  const bucketHost = image.is_private ? B2_PRIVATE_HOST : B2_PUBLIC_HOST;

  try {
    const url = await buildDownloadUrl(
      bucketId,
      bucketName,
      bucketHost,
      `${user.id}${image.path ? `/${image.path}` : ''}/${image.filename}`,
      image.is_private,
      expireSeconds
    );
    return reply.send({ ok: true, url });
  } catch (e) {
    return reply.code(500).send({ error: 'Failed to build download URL' });
  }
});

// POST move image to new path (fixed)
fastify.post('/images/:id/move', async (req, reply) => {
  const user = req.user;
  const { id } = req.params;
  let { new_path } = req.body;

  if (!new_path || typeof new_path !== 'string') {
    return reply.code(400).send({ error: 'new_path is required' });
  }
  new_path = new_path.trim().replace(/^\/+|\/+$/g, '') || null;

  const res = await pool.query('SELECT * FROM images WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Image not found' });

  const image = res.rows[0];
  await initB2();

  const bucketId = image.is_private ? B2_PRIVATE_BUCKET_ID : B2_PUBLIC_BUCKET_ID;

  const oldFileName = `${user.id}${image.path ? `/${image.path}` : ''}/${image.filename}`;
  const newFileName = `${user.id}${new_path ? `/${new_path}` : ''}/${image.filename}`;

  // Check if target path + filename already exists
  const exists = await pool.query(
    `SELECT 1 FROM images WHERE user_id = $1 AND path IS NOT DISTINCT FROM $2 AND filename = $3 AND is_private = $4 LIMIT 1`,
    [user.id, new_path, image.filename, image.is_private]
  );
  if (exists.rowCount > 0) {
    return reply.code(409).send({ error: 'File already exists in the target path' });
  }

  try {
    // Copy file to new path
    await b2Client.copyFile({
      sourceFileName: oldFileName,
      sourceBucketId: bucketId,
      destinationBucketId: bucketId,
      destinationFileName: newFileName,
    });

    // Delete old file versions
    let listRes;
    do {
      listRes = await b2Client.listFileNames({ bucketId, startFileName: oldFileName, maxFileCount: 100 });
      for (const file of listRes.data.files) {
        if (file.fileName === oldFileName) {
          await b2Client.deleteFileVersion({ fileId: file.fileId, fileName: oldFileName });
        }
      }
    } while (listRes.data.nextFileName && listRes.data.nextFileName === oldFileName);

    // Update DB path
    await pool.query('UPDATE images SET path = $1 WHERE id = $2', [new_path, id]);

    return reply.send({ ok: true, message: 'File moved successfully', new_path });
  } catch (e) {
    fastify.log.error(`Move file failed: ${e.message}`);
    return reply.code(500).send({ error: 'Failed to move file' });
  }
});

// GET current user's plan info
fastify.get('/me/plan', async (req, reply) => {
  const user = req.user;
  const res = await pool.query('SELECT * FROM plans WHERE plan = $1', [user.plan]);
  if (res.rows.length === 0) return reply.code(404).send({ error: 'Plan not found' });
  return reply.send({ ok: true, plan: res.rows[0] });
});

// GET user stats: storage used, bandwidth used, API requests count today
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

// GET current user's API keys (excluding key value, only metadata for security)
fastify.get('/me/api-keys', async (req, reply) => {
  const user = req.user;
  const res = await pool.query(
    'SELECT id, key_name, active, created_at, last_used_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
    [user.id]
  );
  return reply.send({ ok: true, api_keys: res.rows });
});

// Optional: GET all plans
fastify.get('/plans', async (req, reply) => {
  const res = await pool.query(`SELECT * FROM plans`);
  return reply.send({ ok: true, plans: res.rows });
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