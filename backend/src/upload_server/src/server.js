const fastify = require('fastify')({ logger: true })
const cors = require('@fastify/cors')
const multipart = require('@fastify/multipart')
const postgres = require('fastify-postgres')
const B2 = require('backblaze-b2');

const crypto = require('crypto')
const path = require('path')
const mime = require('mime-types')
const dotenv = require('dotenv')
dotenv.config()

// CORS
fastify.register(cors, {
  origin: true, // allow all origins
})

// PostgreSQL
fastify.register(postgres, {
  connectionString: process.env.DATABASE_URL,
})

// Multipart
fastify.register(multipart)

// Backblaze B2 setup
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APP_KEY,
})

const B2_BUCKET_ID = process.env.B2_BUCKET_ID
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME

// 📦 Auth B2 once at startup
let uploadUrlInfo = null

async function authorizeB2() {
  await b2.authorize()
  const { data } = await b2.getUploadUrl({ bucketId: B2_BUCKET_ID })
  uploadUrlInfo = data
}
authorizeB2()

// 🗄️ Auto create table
fastify.ready().then(async () => {
  await fastify.pg.query(`
    CREATE TABLE IF NOT EXISTS images (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL,
      filename TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      url TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `)
})

// 🔐 API Key Middleware
fastify.addHook('onRequest', async (req, reply) => {
  const apiKey = req.headers['x-api-key']
  if (!apiKey) return reply.status(401).send({ error: 'API key missing' })

  const { rows } = await fastify.pg.query(
    'SELECT user_id FROM api_keys WHERE key = $1',
    [apiKey]
  )

  if (!rows.length) return reply.status(403).send({ error: 'Invalid API key' })

  req.user = { id: rows[0].user_id }
})

// 📤 Upload Route
fastify.post('/upload', async (req, reply) => {
  const data = await req.file()
  const allowed = ['image/jpeg', 'image/png', 'image/webp']

  if (!allowed.includes(data.mimetype)) {
    return reply.status(400).send({ error: 'Unsupported file type' })
  }

  const buffer = await data.toBuffer()
  const userId = req.user.id
  const ext = mime.extension(data.mimetype) || 'jpg'
  const filename = `${crypto.randomUUID()}.${ext}`
  const b2Path = `user-${userId}/${filename}`

  try {
    await b2.authorize() // Refresh token
    const { data: uploadData } = await b2.getUploadUrl({ bucketId: B2_BUCKET_ID })

    await b2.uploadFile({
      uploadUrl: uploadData.uploadUrl,
      uploadAuthToken: uploadData.authorizationToken,
      fileName: b2Path,
      data: buffer,
      contentType: data.mimetype,
    })

    const signedURL = `https://f000.backblazeb2.com/file/${B2_BUCKET_NAME}/${b2Path}`

    await fastify.pg.query(
      `INSERT INTO images (user_id, filename, mime, size, url)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, filename, data.mimetype, buffer.length, signedURL]
    )

    return reply.send({ success: true, url: signedURL })
  } catch (err) {
    console.error(err)
    return reply.status(500).send({ error: 'Upload failed' })
  }
})

// 🚀 Start
fastify.listen({ port: 5002 }, (err) => {
  if (err) throw err
  console.log('Upload server running on http://localhost:5002')
})