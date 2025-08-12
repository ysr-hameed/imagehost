// delete-server.js
require('dotenv').config();
const Fastify = require('fastify');
const { Pool } = require('pg');
const B2 = require('backblaze-b2');

// === CONFIG ===
const PORT = process.env.DELETE_SERVER_PORT || 8080;
const CRON_SECRET = process.env.DELETE_CRON_SECRET || 'mysecret';

// === DB POOL ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// === BACKBLAZE CLIENT ===
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APP_KEY
});

// Helper to get bucket host by bucket ID
function getBucketHost(bucketId) {
  if (bucketId === process.env.B2_PRIVATE_BUCKET_ID) {
    return process.env.B2_PRIVATE_HOST;
  } else if (bucketId === process.env.B2_PUBLIC_BUCKET_ID) {
    return process.env.B2_PUBLIC_HOST;
  } else {
    return null;
  }
}

// === FASTIFY INSTANCE ===
const app = Fastify({ logger: true });

// Helper to list all versions of a given file name in a bucket
async function listAllFileVersions(bucketId, targetFileName) {
  const versions = [];
  let nextFileName = targetFileName;
  let nextFileId = null;

  do {
    const res = await b2.listFileVersions({
      bucketId,
      startFileName: nextFileName,
      startFileId: nextFileId,
      maxFileCount: 100,
    });

    for (const fileVersion of res.data.files) {
      if (fileVersion.fileName === targetFileName) {
        versions.push(fileVersion);
      }
    }

    nextFileName = res.data.nextFileName;
    nextFileId = res.data.nextFileId;
  } while (nextFileName && nextFileId);

  return versions;
}

// === DELETE HANDLER ===
app.get('/delete-expired', async (req, reply) => {
  app.log.info('Received /delete-expired request');

  const { secret } = req.query;
  if (secret !== CRON_SECRET) {
    app.log.warn('Unauthorized request to /delete-expired');
    return reply.status(403).send({ error: 'Forbidden' });
  }

  try {
    app.log.info('Authorizing with Backblaze B2...');
    await b2.authorize();
    app.log.info('Authorized successfully.');

    // Query expired files based on expire_at column
    const { rows: expiredFiles } = await pool.query(
      `SELECT * FROM files_to_delete WHERE expire_at IS NOT NULL AND expire_at <= NOW()`
    );

    if (expiredFiles.length === 0) {
      app.log.info('No expired files found to delete.');
      return { success: true, deleted: 0, message: 'No expired files found' };
    }

    app.log.info(`Found ${expiredFiles.length} expired file(s) to delete.`);

    let deletedCount = 0;

    for (const file of expiredFiles) {
      try {
        const bucketHost = getBucketHost(file.bucket_id);
        if (!bucketHost) {
          app.log.error(`Unknown bucket_id: ${file.bucket_id} for file ${file.file_name}`);
          continue;
        }

        // Combine path and filename into full fileName for B2 API
        const prefix = file.path ? file.path.replace(/\/+$/, '') : '';
        const fullFileName = prefix ? `${prefix}/${file.file_name}` : file.file_name;

        app.log.info(`Listing versions for file: ${fullFileName} in bucket ${file.bucket_id}`);

        // List all versions of this file in the bucket
        const versions = await listAllFileVersions(file.bucket_id, fullFileName);

        if (versions.length === 0) {
          app.log.warn(`No versions found for file ${fullFileName} in bucket ${file.bucket_id}`);
          // Optionally delete the DB record anyway?
          await pool.query('DELETE FROM files_to_delete WHERE id = $1', [file.id]);
          continue;
        }

        app.log.info(`Found ${versions.length} versions to delete for file ${fullFileName}`);

        // Delete each version
        for (const version of versions) {
          try {
            await b2.deleteFileVersion({
              fileId: version.fileId,
              fileName: version.fileName,
            });
            app.log.info(`Deleted version ${version.fileId} of ${version.fileName}`);
          } catch (err) {
            app.log.error(`Failed to delete version ${version.fileId} of ${version.fileName}: ${err.message}`);
          }
        }

        // After deleting all versions, delete record from DB
        await pool.query('DELETE FROM files_to_delete WHERE id = $1', [file.id]);
        deletedCount++;
        app.log.info(`Deleted DB record for file ${fullFileName}`);

      } catch (err) {
        app.log.error(`Error processing file ${file.file_name || file.id}: ${err.message}`, err);
      }
    }

    app.log.info(`Total files deleted: ${deletedCount}`);

    return { success: true, deleted: deletedCount };
  } catch (err) {
    app.log.error('Fatal error in /delete-expired handler:', err);
    return reply.status(500).send({ error: err.message });
  }
});

// === START SERVER ===
app.listen({ port: PORT, host: '0.0.0.0' })
  .then(() => console.log(`Delete server running on port ${PORT}`))
  .catch(err => {
    console.error('Failed to start delete server:', err);
    process.exit(1);
  });