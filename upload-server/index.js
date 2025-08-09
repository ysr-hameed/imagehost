require('dotenv').config();
const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const { Pool } = require('pg');
const B2 = require('backblaze-b2');
const crypto = require('crypto');
const path = require('path');
const { request } = require('undici');

const PORT = process.env.PORT || 3000;
const BUCKET_ID = process.env.BUCKET_ID;
const BUCKET_NAME = process.env.BUCKET_NAME;
const DEFAULT_PUBLIC_HOST = process.env.B2_PUBLIC_HOST || 'f005.backblazeb2.com';

const fastify = Fastify({ logger: true });
fastify.register(multipart, { limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB max

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Helper to generate a random string
function randomString(len = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.randomBytes(len), b => chars[b % chars.length]).join('');
}

// Convert stream to buffer (for file upload)
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Clean filename: allow only a-z0-9 . - _
function sanitizeFileName(name) {
  return path.basename(name).toLowerCase().replace(/[^a-z0-9.\-_]/g, '_');
}

// Check if mimetype is image
function isImageMimeType(mime) {
  return /^image\/(png|jpeg|jpg|gif|webp|bmp|svg|tiff)$/.test(mime.toLowerCase());
}

// Ensure DB table exists
async function ensureTables() {
  await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS images (
      id varchar(10) PRIMARY KEY,
      user_id uuid NOT NULL,
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

// Initialize Backblaze B2 client
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

// Upload a file buffer to B2
async function b2UploadFile(fileName, buffer, mimeType) {
  const uploadUrlRes = await b2Client.getUploadUrl({ bucketId: BUCKET_ID });
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

// Build URL (signed if private)
async function buildUrl(fileName, isPrivate, expireSeconds) {
  const parts = fileName.split('/').map(encodeURIComponent);
  const urlPath = parts.join('/');

  const baseUrl = `https://${DEFAULT_PUBLIC_HOST}/file/${BUCKET_NAME}/${urlPath}`;

  if (!isPrivate) {
    return baseUrl;
  }

  const ttl = expireSeconds && expireSeconds > 0 ? expireSeconds : 3600;

  const auth = await b2Client.getDownloadAuthorization({
    bucketId: BUCKET_ID,
    fileNamePrefix: fileName,
    validDurationInSeconds: ttl,
  });

  const token = auth.data.authorizationToken || auth.data.authorization;

  return `${baseUrl}?Authorization=${encodeURIComponent(token)}`;
}

// Check if a file with this exact name exists in B2 bucket
async function b2FileExists(fileName) {
  let nextFileName = null;
  let found = false;
  do {
    const res = await b2Client.listFileNames({
      bucketId: BUCKET_ID,
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

// Get API key row and user_id from DB
async function getApiKeyRow(apiKey) {
  if (!apiKey) return null;
  const r = await pool.query(`SELECT * FROM api_keys WHERE "key" = $1 AND active = true LIMIT 1`, [apiKey]);
  return r.rows[0] || null;
}

// Upload route
fastify.post('/upload', async (req, reply) => {
  const start = Date.now();

  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return reply.code(401).send({ error: 'x-api-key required' });

    const keyRow = await getApiKeyRow(apiKey);
    if (!keyRow) return reply.code(403).send({ error: 'Invalid or inactive API key' });

    const userId = keyRow.user_id;

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
        files.push({
          buffer,
          originalFilename: part.filename,
          mimetype: part.mimetype,
        });
      } else {
        fields[part.fieldname] = part.value;
      }
    }

    if (!files.length) return reply.code(400).send({ error: 'No files provided' });

    const rawPath = (fields.path || '').trim();
    const cleanedPath = rawPath.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');

    let isPrivateReq = String(fields.is_private || '').toLowerCase() === 'true';
    const isPrivate = typeof fields.is_private === 'undefined' ? false : isPrivateReq;

    let expireSeconds = parseInt(fields.expire_seconds, 10);
    if (isNaN(expireSeconds) || expireSeconds < 0) expireSeconds = 3600;

    let customFilename = fields.filename ? sanitizeFileName(fields.filename) : null;

    await initB2();

    const results = [];

    for (const file of files) {
      const ext = path.extname(customFilename || file.originalFilename).toLowerCase() || '.jpg';
      const baseName = (customFilename ? path.basename(customFilename, ext) : path.basename(file.originalFilename, ext))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');

      // Compose initial filename without unique suffix
      let finalFileName = `${baseName}${ext}`;

      // Compose B2 file path with userId + path + filename
      let b2FileName = userId;
      if (cleanedPath) b2FileName += `/${cleanedPath}`;
      b2FileName += `/${finalFileName}`;

      // Check if file exists and add suffix if it does
      const exists = await b2FileExists(b2FileName);
      if (exists) {
        const uniqueSuffix = randomString(6);
        finalFileName = `${baseName}-${uniqueSuffix}${ext}`;
        b2FileName = userId;
        if (cleanedPath) b2FileName += `/${cleanedPath}`;
        b2FileName += `/${finalFileName}`;
      }

      try {
        await b2UploadFile(b2FileName, file.buffer, file.mimetype);

        const imageId = randomString(10);

        const fullUrl = await buildUrl(b2FileName, isPrivate, expireSeconds);

        // Strip protocol and domain to keep only path + query string
        const urlObj = new URL(fullUrl);
        const urlPathOnly = urlObj.pathname + urlObj.search;

        let expireAt = null;
        if (isPrivate && expireSeconds > 0) {
          expireAt = new Date(Date.now() + expireSeconds * 1000);
        }

        const insert = await pool.query(
          `INSERT INTO images (id, user_id, path, filename, original_filename, content_type, size, url, is_private, expire_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            imageId,
            userId,
            cleanedPath || null,
            finalFileName,
            file.originalFilename,
            file.mimetype,
            file.buffer.length,
            urlPathOnly, // Store path + query only (no domain)
            isPrivate,
            expireAt,
          ]
        );

        results.push({ original: file.originalFilename, filename: finalFileName, success: true, url: urlPathOnly, db: insert.rows[0] });
      } catch (err) {
        fastify.log.error('Upload error: ' + err.message);
        results.push({ original: file.originalFilename, success: false, error: err.message });
      }
    }

    const took = Date.now() - start;
    fastify.log.info(`/upload completed in ${took}ms`);
    return reply.send({ ok: true, files: results });
  } catch (err) {
    fastify.log.error('Unexpected error: ' + err.message);
    return reply.code(500).send({ error: err.message });
  }
});

// Start server
(async () => {
  try {
    await ensureTables();
    await initB2();
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info('Server listening on port ' + PORT);
  } catch (err) {
    console.error('Startup fatal error:', err);
    process.exit(1);
  }
})();