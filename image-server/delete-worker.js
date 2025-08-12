require('dotenv').config();
const { Pool } = require('pg');
const B2 = require('backblaze-b2');
const cron = require('node-cron');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APP_KEY,
});

async function deleteImagesFromQueue() {
  try {
    await b2.authorize();
    console.log('B2 authorized');

    const { rows } = await pool.query('SELECT * FROM delete ORDER BY id ASC');
    console.log(`Found ${rows.length} files to delete`);

    for (const row of rows) {
      try {
        console.log(`Deleting ${row.filename}...`);

        await b2.deleteFileVersion({
          fileName: row.filename,
          fileId: row.fileid,
        });

        await pool.query('DELETE FROM delete WHERE id = $1', [row.id]);
        console.log(`✅ Deleted ${row.filename} from Backblaze and DB`);
      } catch (err) {
        console.error(`❌ Error deleting ${row.filename}:`, err.message);
      }
    }

    console.log('Batch complete — all files processed');

  } catch (err) {
    console.error('Error in delete worker:', err.message);
  }
}

// Run every 10 minutes
cron.schedule('*/10 * * * *', () => {
  console.log(`\n🕒 Running delete worker at ${new Date().toISOString()}`);
  deleteImagesFromQueue();
});