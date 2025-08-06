// routes/plugins/api-auth.js
export default async function apiAuthPlugin(fastify) {
  fastify.decorate('apiAuth', async (req, reply) => {
    const apiKey = req.headers['x-api-key']
    if (!apiKey) return reply.code(401).send({ error: 'API key required' })

    const { rows } = await fastify.pg.query(
      `SELECT user_id FROM user_api_keys WHERE key = $1`,
      [apiKey]
    )

    if (rows.length === 0) {
      return reply.code(403).send({ error: 'Invalid API key' })
    }

    req.user = { id: rows[0].user_id }
  })
}