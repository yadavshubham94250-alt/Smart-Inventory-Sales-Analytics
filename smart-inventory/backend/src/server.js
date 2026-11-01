const env = require('./config/env');
const app = require('./app');
const pool = require('./config/db');

pool.query('SELECT 1').then(() => {
  app.listen(env.port, () => console.log(`API running on http://localhost:${env.port}/api/v1 (${env.isProd ? 'production' : 'development'})`));
}).catch((e) => { console.error('Cannot connect to MySQL:', e.message); process.exit(1); });
