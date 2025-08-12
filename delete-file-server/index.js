// delete-server.js
import 'dotenv/config';
import Fastify from 'fastify';
import pg from 'pg';
import B2 from 'backblaze-b2';

const { Pool } = pg;

// === CONFIG ===
const PORT = 8080;
const CRON_SECRET = process.env.DELETE_CRON_SECRET || 'mysecret'; // for security
const EXPIRE_MINUTES = process.env.DELETE_EXPIRE_MINUTES || 10; // check this much older files

// === DB POOL ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// === BACKBLAZE CLIENT ===
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APP_KEY
});

// === FASTIFY INSTANCE ===
const app = Fastify({ logger: true });

// === DELETE HANDLER ===
app.get('/delete-expired', async (req, reply) => {
  const { secret } = req.query;
  if (secret !== CRON_SECRET) {
    return reply.status(403).send({ error: 'Forbidden' });
  }

  try {
    // Authenticate with B2
    await b2.authorize();

    // Fetch expired files
    const { rows } = await pool.query(
      `SELECT * FROM files_to_delete 
       WHERE created_at <= NOW() - INTERVAL '${EXPIRE_MINUTES} minutes'`
    );

    if (rows.length === 0) {
      return { success: true, deleted: 0, message: 'No expired files found' };
    }

    app.log.info(`Found ${rows.length} expired files to delete`);

    let deletedCount = 0;

    for (const file of rows) {
      try {
        await b2.deleteFileVersion({
          fileId: file.b2_file_id,
          fileName: file.file_name
        });

        await pool.query('DELETE FROM files_to_delete WHERE id = $1', [file.id]);

        deletedCount++;
        app.log.info(`Deleted file: ${file.file_name}`);
      } catch (err) {
        app.log.error(`Failed to delete ${file.file_name}: ${err.message}`);
      }
    }

    return { success: true, deleted: deletedCount };
  } catch (err) {
    app.log.error(err);
    return reply.status(500).send({ error: err.message });
  }
});

// === START SERVER ===
app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`Delete server running on port ${PORT}`))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });