// db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function setupDatabase() {

  // Create user_images table with ON DELETE CASCADE
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_images (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Ensure foreign key constraint exists (idempotent using constraint name)
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'user_images_user_id_fkey'
      ) THEN
        ALTER TABLE user_images
        ADD CONSTRAINT user_images_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
      END IF;
    END;
    $$;
  `);

  console.log("✅ Database setup complete.");
}

module.exports = {
  db: pool,
  setupDatabase
};