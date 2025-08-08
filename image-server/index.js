const fastify = require('fastify')({ logger: true })
const multipart = require('@fastify/multipart')
const pg = require('pg')
const axios = require('axios')
const dotenv = require('dotenv')
const crypto = require('crypto')
dotenv.config()

const { Pool } = pg
const db = new Pool({ connectionString: process.env.DATABASE_URL })

fastify.register(multipart)

// 🔐 API Key Auth Middleware
fastify.addHook('onRequest', async (request, reply) => {
  const apiKey = request.headers['x-api-key']
  if (!apiKey) return reply.code(401).send({ error: 'Missing API key' })

  const { rows } = await db.query('SELECT user_id FROM api_keys WHERE key = $1', [apiKey])
  if (!rows.length) return reply.code(401).send({ error: 'Invalid API key' })

  request.user_id = rows[0].user_id
})

// 🔼 Upload Image
fastify.post('/upload', async (req, reply) => {
  const data = await req.file()
  const buffer = await data.toBuffer()
  const fileName = `${crypto.randomBytes(4).toString('hex')}_${data.filename}`

  // Auth with B2
  const authRes = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    auth: {
      username: process.env.B2_KEY_ID,
      password: process.env.B2_KEY_SECRET,
    }
  })
  const { apiUrl, authorizationToken } = authRes.data

  // Get upload URL
  const { data: uploadData } = await axios.post(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
    bucketId: process.env.B2_BUCKET_ID
  }, {
    headers: { Authorization: authorizationToken }
  })

  // Upload to B2
  await axios.post(uploadData.uploadUrl, buffer, {
    headers: {
      Authorization: uploadData.authorizationToken,
      'X-Bz-File-Name': `${request.user_id}/${fileName}`,
      'Content-Type': data.mimetype,
      'Content-Length': buffer.length,
      'X-Bz-Content-Sha1': crypto.createHash('sha1').update(buffer).digest('hex'),
    }
  })

  // Save to DB
  const imageId = crypto.randomBytes(4).toString('hex')
  await db.query(`
    INSERT INTO user_images(id, user_id, file_name, mime_type, original_name)
    VALUES ($1, $2, $3, $4, $5)
  `, [imageId, request.user_id, fileName, data.mimetype, data.filename])

  return {
    id: imageId,
    file_name: fileName,
    url: `${process.env.CDN_URL}/file/${process.env.B2_BUCKET_NAME}/${request.user_id}/${fileName}`
  }
})

// 📄 List User Images
fastify.get('/images', async (req, reply) => {
  const { rows } = await db.query('SELECT id, file_name, original_name FROM user_images WHERE user_id = $1', [req.user_id])
  return rows
})

// 🔍 Get Metadata of a Single Image
fastify.get('/images/:id', async (req, reply) => {
  const { rows } = await db.query('SELECT * FROM user_images WHERE id = $1 AND user_id = $2', [req.params.id, req.user_id])
  if (!rows.length) return reply.code(404).send({ error: 'Not found' })
  return rows[0]
})

// 🖼 Get Direct Image URL (Public)
fastify.get('/image-url/:id', async (req, reply) => {
  const { rows } = await db.query('SELECT file_name, user_id FROM user_images WHERE id = $1', [req.params.id])
  if (!rows.length) return reply.code(404).send({ error: 'Image not found' })

  const { file_name, user_id } = rows[0]
  return {
    url: `${process.env.CDN_URL}/file/${process.env.B2_BUCKET_NAME}/${user_id}/${file_name}`
  }
})

// ✏️ Rename Image
fastify.patch('/images/:id', async (req, reply) => {
  const { new_name } = req.body
  if (!new_name) return reply.code(400).send({ error: 'New name is required' })

  const { rows } = await db.query('SELECT * FROM user_images WHERE id = $1 AND user_id = $2', [req.params.id, req.user_id])
  if (!rows.length) return reply.code(404).send({ error: 'Image not found' })

  await db.query('UPDATE user_images SET file_name = $1 WHERE id = $2', [new_name, req.params.id])
  return { success: true }
})

// 🗑 Delete Image
fastify.delete('/images/:id', async (req, reply) => {
  const { rows } = await db.query('SELECT * FROM user_images WHERE id = $1 AND user_id = $2', [req.params.id, req.user_id])
  if (!rows.length) return reply.code(404).send({ error: 'Not found' })

  const fileName = `${req.user_id}/${rows[0].file_name}`

  const authRes = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    auth: {
      username: process.env.B2_KEY_ID,
      password: process.env.B2_KEY_SECRET,
    }
  })
  const { apiUrl, authorizationToken } = authRes.data

  const { data: fileList } = await axios.post(`${apiUrl}/b2api/v2/b2_list_file_names`, {
    bucketId: process.env.B2_BUCKET_ID,
    prefix: fileName,
    maxFileCount: 1
  }, {
    headers: { Authorization: authorizationToken }
  })

  if (!fileList.files.length) return reply.code(404).send({ error: 'File not found in B2' })

  const fileId = fileList.files[0].fileId

  await axios.post(`${apiUrl}/b2api/v2/b2_delete_file_version`, {
    fileName,
    fileId
  }, {
    headers: { Authorization: authorizationToken }
  })

  await db.query('DELETE FROM user_images WHERE id = $1', [req.params.id])
  return { success: true }
})

// 🚀 Start Server
fastify.listen({ port: 8080 }, (err) => {
  if (err) throw err
  console.log('🚀 Server running at http://localhost:8080')
})