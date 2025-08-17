// token_renew_server.js
require('dotenv').config();
const { Pool } = require('pg');
const B2 = require('backblaze-b2');

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
  console.log(`Backblaze authorized (apiUrl=${b2Client.apiUrl})`);
}

// --- Build private download URL ---
async function buildPrivateDownloadUrl(bucketId, bucketName, domain, fileName, expireSeconds) {
  const ttl = expireSeconds && expireSeconds > 0 ? expireSeconds : 3600;
  const max = 7 * 24 * 3600;
  const valid = Math.min(ttl, max);

  const auth = await b2Client.getDownloadAuthorization({
    bucketId,
    fileNamePrefix: fileName,
    validDurationInSeconds: valid,
  });

  const token = auth?.data?.authorizationToken || '';
  const base = domain
    ? `https://${domain}/${bucketName}/${encodeURIComponent(fileName)}`
    : `${b2Client.downloadUrl}/${bucketName}/${encodeURIComponent(fileName)}`;

  return `${base}?Authorization=${encodeURIComponent(token)}`;
}

// --- Auto-renew job ---
const TOKEN_RENEW_THRESHOLD = 60 * 60 * 1000; // 1 hour before expiry
const JOB_INTERVAL = 10 * 60 * 1000; // every 10 minutes

async function autoRenewTokens() {
  try {
    await initB2();
    const now = new Date();
    const threshold = new Date(now.getTime() + TOKEN_RENEW_THRESHOLD);

    const res = await pool.query(`
      SELECT pu.id, pu.user_id, pu.file_id, i.filename
      FROM private_urls pu
      JOIN images i ON i.id = pu.file_id
      WHERE pu.b2_token_expires_at <= $1
    `, [threshold]);

    for (const row of res.rows) {
      const userRes = await pool.query(`SELECT domain FROM users WHERE id=$1`, [row.user_id]);
      const domain = userRes.rows[0]?.domain || null;

      const tokenUrl = await buildPrivateDownloadUrl(
        process.env.B2_PRIVATE_BUCKET_ID,
        process.env.B2_PRIVATE_BUCKET_NAME,
        domain,
        `${row.user_id}/${row.filename}`,
        7 * 24 * 3600
      );

      const newToken = tokenUrl.split('?')[1];
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

      await pool.query(`
        UPDATE private_urls
        SET b2_token=$1, b2_token_expires_at=$2
        WHERE id=$3
      `, [newToken, newExpiresAt, row.id]);

      console.log(`Auto-renewed token for file_id=${row.file_id}`);
    }
  } catch (err) {
    console.error(`Auto-renew job error: ${err.message}`);
  }
}

// --- Start job ---
setInterval(autoRenewTokens, JOB_INTERVAL);
console.log('Token renewal server started...');