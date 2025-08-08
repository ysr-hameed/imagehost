const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const db = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = { db };