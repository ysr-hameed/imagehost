require('dotenv').config();
const Fastify = require('fastify');
const multipart = require('@fastify/multipart');
const { uploadStream } = require('./upload');

const fastify = Fastify({ logger: true });

fastify.register(multipart);

// Upload route (no temp file)
fastify.post('/upload', async (req, reply) => {
  const data = await req.file();
  const fileName = `${Date.now()}-${data.filename}`;
  const fileSize = parseInt(data.fields?.fileSize?.value || data.file.truncated ? 0 : data.file.bytesRead, 10);

  try {
    const result = await uploadStream(data.file, fileName, fileSize);

    reply.send({
      message: '✅ Uploaded to Backblaze!',
      fileId: result.fileId,
      fileName: result.fileName,
      downloadUrl: result.downloadUrl
    });
  } catch (err) {
    req.log.error('❌ Upload error:', err);
    reply.code(500).send({ error: 'Upload failed', detail: err.message });
  }
});

fastify.get('/', async () => {
  return { message: '🚀 Upload server running' };
});

fastify.listen({ port: 8000 }, (err, address) => {
  if (err) throw err;
  console.log(`🚀 Server ready at ${address}`);
});