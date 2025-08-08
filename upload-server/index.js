const fastify = require('fastify')();
const multipart = require('@fastify/multipart');
const dotenv = require('dotenv');
const { uploadFile } = require('./upload');
const { db, setupDatabase } = require('./db');

dotenv.config();
fastify.register(multipart);

fastify.post('/upload', async (req, reply) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return reply.status(401).send({ error: 'Missing API key' });

  const { rows } = await db.query(
    'SELECT user_id FROM api_keys WHERE key = $1 LIMIT 1',
    [apiKey]
  );
  if (rows.length === 0) return reply.status(403).send({ error: 'Invalid API key' });

  const userId = rows[0].user_id;
  const data = await req.file();
  const fileBuffer = await data.toBuffer();

  try {
    const {
      fileId,
      fileName,
      filePath,
      downloadUrl
    } = await uploadFile(fileBuffer, data.filename, userId);

    await db.query(
      `INSERT INTO user_images (user_id, file_name, file_url, file_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, fileName, downloadUrl, fileId]
    );

    reply.send({
      message: '✅ Uploaded to Backblaze!',
      fileId,
      fileName,
      url: downloadUrl
    });
  } catch (err) {
    console.error(err);
    reply.status(500).send({ error: 'Upload failed' });
  }
});

setupDatabase().then(() => {
  fastify.listen({ port: 8000 }, (err) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log('🚀 Upload Server running at http://localhost:8000');
  });
});