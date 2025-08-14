// plugins/pg.js
import fp from 'fastify-plugin'
import pkg from 'pg'
import dotenv from 'dotenv'


const { Pool } = pkg

dotenv.config()
export default fp(async function (fastify, opts) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  })

  // Test DB connection
  try {
    fastify.log.info('Connecting to PostgreSQL...')
    await pool.query('SELECT 1')
    fastify.log.info('✅ Connected to PostgreSQL')
  } catch (err) {
    fastify.log.error('❌ Database connection failed:', err.message)
    throw err
  }

  // Make pool available in Fastify
  fastify.decorate('pg', pool)

  // Helper: run query safely
  async function safeQuery(label, sql) {
    try {
      await pool.query(sql)
      fastify.log.info(`✅ ${label}`)
    } catch (err) {
      fastify.log.warn(`⚠️ Skipped ${label}: ${err.message}`)
    }
  }

  // Extensions (skip if no superuser rights)
  await safeQuery('Enable uuid-ossp', `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`)
  await safeQuery('Enable pgcrypto', `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`)

  // Tables
  await safeQuery('Create users table', `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      first_name TEXT NOT NULL,
      last_name TEXT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      provider TEXT NOT NULL DEFAULT 'form',
      is_admin BOOLEAN DEFAULT false,
      is_verified BOOLEAN DEFAULT false,
      is_blocked BOOLEAN DEFAULT false,
      verification_token TEXT,
      reset_token TEXT,
      reset_token_expires TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      plan text NOT NULL DEFAULT 'free',
      plan_custom_data jsonb DEFAULT NULL,
      storage_used bigint DEFAULT 0,
      created_at TIMESTAMP DEFAULT now(),
      domain TEXT DEFAULT 'https://f000.backblazeb2.com'
    );
  `)

  await safeQuery('Create api_keys table', `
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `)

  await safeQuery('Create app_settings table', `
    CREATE TABLE IF NOT EXISTS app_settings (
      id SERIAL PRIMARY KEY,
      app_name VARCHAR(100) DEFAULT 'Servoro',
      tagline TEXT,
      description TEXT,
      favicon_url TEXT,
      logo_url TEXT,
      light_primary_color VARCHAR(10),
      dark_primary_color VARCHAR(10),
      support_email TEXT,
      contact_phone TEXT,
      default_language VARCHAR(10) DEFAULT 'en',
      maintenance_mode BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Insert default settings only if missing
  try {
    const res = await pool.query('SELECT COUNT(*) FROM app_settings')
    if (res.rows[0].count === '0') {
      await pool.query(`
        INSERT INTO app_settings (
          app_name, tagline, description,
          light_primary_color, dark_primary_color
        ) VALUES (
          'StartNet',
          'Your Hyperlocal Service Hub',
          'Find and offer services locally with ease.',
          '#4f46e5',
          '#0e8aa3'
        );
      `)
      fastify.log.info('✅ Default app_settings inserted')
    }
  } catch (err) {
    fastify.log.warn(`⚠️ Skipped default app_settings insert: ${err.message}`)
  }

  await safeQuery('Create notifications table', `
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID,
      title TEXT,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await safeQuery('Create notification_reads table', `
    CREATE TABLE IF NOT EXISTS notification_reads (
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, notification_id)
    );
  `)

  fastify.log.info('✅ Database migrations complete')
})