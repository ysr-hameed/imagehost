import { randomBytes } from 'crypto'
import { z } from 'zod'

export default async function apiKeyRoutes(fastify) {
  // ✅ Protect all routes using JWT auth
  fastify.addHook('onRequest', fastify.auth)

  // 📦 Get all API keys for logged-in user
  fastify.get('/me/api-keys', async (req, reply) => {
    const { rows } = await fastify.pg.query(
      'SELECT id, name, key, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    )
    return rows
  })

  // ➕ Create new API key
  fastify.post('/me/api-keys', async (req, reply) => {
    const schema = z.object({ name: z.string().min(3).max(50) })
    const body = schema.parse(req.body)

    const newKey = randomBytes(24).toString('hex')

    const { rows } = await fastify.pg.query(`
      INSERT INTO api_keys (user_id, name, key)
      VALUES ($1, $2, $3)
      RETURNING id, name, key, created_at
    `, [req.user.id, body.name, newKey])

    return rows[0]
  })

  // ♻️ Regenerate API key
  fastify.post('/me/api-keys/:id/regenerate', async (req, reply) => {
    const userId = req.user.id
    const { id } = req.params

    const { rows } = await fastify.pg.query(
      'SELECT * FROM api_keys WHERE id = $1 AND user_id = $2',
      [id, userId]
    )

    if (!rows[0]) return reply.code(404).send({ error: 'Key not found' })

    const newKey = randomBytes(24).toString('hex')

    const { rows: updated } = await fastify.pg.query(`
      UPDATE api_keys
      SET key = $1, created_at = NOW()
      WHERE id = $2
      RETURNING id, name, key, created_at
    `, [newKey, id])

    return updated[0]
  })

  // ❌ Delete API key
  fastify.delete('/me/api-keys/:id', async (req, reply) => {
    const { id } = req.params
    const { rowCount } = await fastify.pg.query(
      'DELETE FROM api_keys WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    )
    if (rowCount === 0) return reply.code(404).send({ error: 'Key not found' })
    return { success: true }
  })
  
  
  
// ✅ Toggle API key (enable/disable)
fastify.post('/me/api-keys/:id/toggle', async (req, reply) => {
  const { id } = req.params
  const userId = req.user.id

  // Check ownership
  const { rows } = await fastify.pg.query(
    'SELECT active FROM api_keys WHERE id = $1 AND user_id = $2',
    [id, userId]
  )
  if (!rows[0]) return reply.code(404).send({ error: 'Key not found' })

  const newState = !rows[0].active

  const { rows: updated } = await fastify.pg.query(
    'UPDATE api_keys SET active = $1 WHERE id = $2 RETURNING id, name, key, active, created_at',
    [newState, id]
  )

  return updated[0]
})


}