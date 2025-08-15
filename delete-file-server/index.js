require('dotenv').config();
const Fastify = require('fastify');
const { Pool } = require('pg');
const B2 = require('backblaze-b2');

const fastify = Fastify({ logger: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APP_KEY,
});

const SECRET_KEY = process.env.DELETE_SECRET || 'ysr';
const PUBLIC_BUCKET_ID = process.env.B2_PUBLIC_BUCKET_ID;
const PRIVATE_BUCKET_ID = process.env.B2_PRIVATE_BUCKET_ID;

// Join path safely
function joinPath(path, filename) {
  if (!path) return filename;
  if (filename.startsWith(path)) return filename;
  return `${path.replace(/\/+$/, '')}/${filename}`;
}

// List matching file versions from B2
async function listMatchingVersions(bucketId, targetFileName) {
  const matches = [];
  let startFileName = '';
  let startFileId = null;

  do {
    const res = await b2.listFileVersions({
      bucketId,
      startFileName,
      startFileId,
      maxFileCount: 1000,
    });

    for (const fv of res.data.files) {
      if (
        fv.fileName === targetFileName ||
        fv.fileName.endsWith('/' + targetFileName) ||
        fv.fileName.endsWith(targetFileName)
      ) {
        matches.push(fv);
      }
    }

    startFileName = res.data.nextFileName;
    startFileId = res.data.nextFileId;
  } while (startFileName);

  return matches;
}

fastify.get('/delete-expired', async (req, reply) => {
  const { secret } = req.query;
  if (secret !== SECRET_KEY) {
    return reply.code(403).send({ error: 'Forbidden' });
  }

  fastify.log.info('Received /delete-expired request');

  await b2.authorize();
  fastify.log.info('Authorized successfully.');

  const { rows: files } = await pool.query(`
    SELECT id, file_name, path, is_private, b2_file_id
    FROM files_to_delete
  `);

  if (!files.length) {
    fastify.log.info('No expired files found.');
    return reply.send({ deleted: 0 });
  }

  fastify.log.info(`Found ${files.length} expired file(s) to delete.`);

  let deletedCount = 0;

  for (const file of files) {
    const bucketId = file.is_private ? PRIVATE_BUCKET_ID : PUBLIC_BUCKET_ID;
    const fullFileName = joinPath(file.path, file.file_name);

    fastify.log.info(
      `Processing file: ${fullFileName} (bucket ${bucketId})`
    );

    try {
      // Delete from Backblaze
      const versions = await listMatchingVersions(bucketId, fullFileName);

      if (!versions.length) {
        fastify.log.warn(
          `No versions found for ${fullFileName} in bucket ${bucketId}`
        );
      } else {
        for (const v of versions) {
          await b2.deleteFileVersion({
            fileId: v.fileId,
            fileName: v.fileName,
          });
          fastify.log.info(`Deleted from B2: ${v.fileName}`);
        }
      }

      // Remove from files_to_delete
      await pool.query('DELETE FROM files_to_delete WHERE id = $1', [file.id]);

      // Remove from images table
      let imgDeleteRes;
      if (file.b2_file_id) {
        imgDeleteRes = await pool.query(
          'DELETE FROM images WHERE b2_file_id = $1',
          [file.b2_file_id]
        );
      } else {
        imgDeleteRes = await pool.query(
          'DELETE FROM images WHERE path = $1 AND file_name = $2',
          [file.path, file.file_name]
        );
      }

      if (imgDeleteRes.rowCount > 0) {
        fastify.log.info(
          `Deleted ${imgDeleteRes.rowCount} row(s) from images table.`
        );
      } else {
        fastify.log.warn(
          `No matching row in images table for ${fullFileName}`
        );
      }

      deletedCount++;
    } catch (err) {
      fastify.log.error(
        `Error deleting file ${fullFileName}: ${err.message}`
      );
    }
  }

  fastify.log.info(`Total files deleted: ${deletedCount}`);
  return reply.send({ deleted: deletedCount });
});

fastify.listen({ port: process.env.PORT || 8080, host: '0.0.0.0' });