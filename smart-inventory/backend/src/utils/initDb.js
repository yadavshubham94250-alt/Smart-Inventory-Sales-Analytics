// Creates all tables from sql/schema.sql.   Usage:  npm run db:init           (safe, keeps data)
//                                                   node src/utils/initDb.js --reset   (DROPS all tables first)
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function initDb({ reset = false } = {}) {
  const conn = await mysql.createConnection({ ...env.db, multipleStatements: true });
  try {
    if (reset) {
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const t of ['inventory_movements', 'sale_items', 'sales', 'products', 'categories', 'users']) await conn.query(`DROP TABLE IF EXISTS ${t}`);
      await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    }
    await conn.query(fs.readFileSync(path.join(__dirname, '../../sql/schema.sql'), 'utf8'));
  } finally {
    await conn.end();
  }
}
module.exports = { initDb };

if (require.main === module) {
  const reset = process.argv.includes('--reset');
  initDb({ reset }).then(() => { console.log(reset ? 'Tables dropped and recreated.' : 'Tables are ready.'); }).catch((e) => { console.error('db:init failed:', e.message); process.exit(1); });
}
