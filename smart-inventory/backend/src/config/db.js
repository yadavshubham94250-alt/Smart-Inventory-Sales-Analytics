// MySQL connection pool (mysql2/promise).
//  - timezone '+05:30'  : JS <-> MySQL conversions use IST
//  - dateStrings        : DATETIME columns come back as plain 'YYYY-MM-DD HH:mm:ss' strings
//  - decimalNumbers     : DECIMAL columns come back as JS numbers (2 dp), not strings
const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+05:30',
  dateStrings: true,
  decimalNumbers: true,
});

// Make NOW()/CURRENT_TIMESTAMP return IST for every new connection.
pool.on('connection', (conn) => conn.query("SET time_zone = '+05:30'"));

module.exports = pool;
