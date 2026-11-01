// Seeds an admin user, categories, products and ~6 months of realistic sales history.
//   npm run db:seed            -> only seeds an empty database
//   node src/utils/seed.js --reset   -> wipes data first (tables are dropped and recreated)
// The data is generated with a FIXED random seed, so every run produces the same dataset
// (dates are relative to today). All sales/stock rows obey the same rules as the live app.
const bcrypt = require('bcrypt');
const env = require('../config/env');
const pool = require('../config/db');
const { initDb } = require('./initDb');

const DAYS = 180;
function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(20240601);
const pick = (n) => Math.floor(rand() * n);

const CATEGORIES = ['Groceries & Staples', 'Beverages', 'Snacks', 'Personal Care', 'Household', 'Stationery'];
// [sku, name, category, cost, price, startStock, threshold, popularity, flags]
const PRODUCTS = [
  ['GRO-001', 'Aashirvaad Atta 5kg', 0, 218, 245, 120, 20, 10], ['GRO-002', 'Tata Salt 1kg', 0, 20, 25, 200, 30, 9],
  ['GRO-003', 'Fortune Sunflower Oil 1L', 0, 128, 148, 90, 20, 8], ['GRO-004', 'Toor Dal 1kg', 0, 135, 160, 80, 15, 6],
  ['GRO-005', 'Basmati Rice 5kg', 0, 440, 520, 50, 10, 4, { slowAfter: 50 }],
  ['BEV-001', 'Tata Tea Gold 500g', 1, 255, 290, 70, 15, 6], ['BEV-002', 'Nescafe Classic 100g', 1, 285, 335, 45, 10, 4],
  ['BEV-003', 'Coca-Cola 750ml', 1, 32, 40, 180, 30, 9], ['BEV-004', 'Real Fruit Juice 1L', 1, 82, 105, 60, 12, 3, { noRestock: true }],
  ['SNK-001', 'Parle-G Biscuits 800g', 2, 52, 65, 150, 25, 10], ['SNK-002', 'Lays Classic 52g', 2, 16, 20, 220, 40, 9],
  ['SNK-003', 'Haldiram Bhujia 400g', 2, 95, 120, 60, 12, 5], ['SNK-004', 'Dairy Milk Silk 150g', 2, 135, 175, 40, 8, 3],
  ['SNK-005', 'Maggi Noodles 12-pack', 2, 138, 168, 80, 15, 8],
  ['PER-001', 'Dettol Soap 125g (3-pack)', 3, 118, 145, 70, 15, 5], ['PER-002', 'Colgate Strong Teeth 200g', 3, 92, 115, 85, 15, 6],
  ['PER-003', 'Head & Shoulders 340ml', 3, 285, 345, 35, 8, 3], ['PER-004', 'Nivea Body Lotion 400ml', 3, 330, 399, 30, 6, 2, { slowAfter: 60 }],
  ['HOU-001', 'Surf Excel Matic 2kg', 4, 395, 465, 40, 8, 4], ['HOU-002', 'Vim Dishwash Gel 750ml', 4, 138, 170, 60, 10, 5],
  ['HOU-003', 'Harpic Toilet Cleaner 1L', 4, 150, 185, 45, 10, 3, { noRestock: true }], ['HOU-004', 'Good Knight Refill (3-pack)', 4, 120, 150, 50, 10, 2, { slowAfter: 40 }],
  ['STA-001', 'Classmate Notebook 172pg', 5, 38, 55, 140, 25, 6], ['STA-002', 'Reynolds Trimax Pen (10-pack)', 5, 70, 99, 60, 12, 4],
  ['STA-003', 'Fevicol MR 200g', 5, 52, 75, 40, 8, 2, { slowAfter: 70 }],
];

const pad = (n) => String(n).padStart(2, '0');
// Date `offsetDays` before today in IST, as 'YYYY-MM-DD'.
function istDate(offsetDays) {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000 - offsetDays * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const dow = (offsetDays) => new Date(Date.now() + 5.5 * 3600 * 1000 - offsetDays * 86400000).getUTCDay();
// Random trading time 09:00-20:59. For today (off = 0) the time is capped to "now" (IST) so no sale is future-dated.
const nowIstSecs = () => { const d = new Date(Date.now() + 5.5 * 3600 * 1000); return d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds(); };
function timeOfDay(off) {
  const lo = 9 * 3600;
  const hi = off === 0 ? Math.max(lo, nowIstSecs() - 60) : 21 * 3600 - 1;
  const t = lo + Math.floor(rand() * (hi - lo + 1));
  return `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
}
const CUSTOMERS = [null, null, null, 'Ramesh Kumar', 'Sunita Devi', 'Gurpreet Singh', 'Anita Sharma', 'Mohan Lal', 'Pooja Verma', 'Harjinder Kaur', 'Vikas Gupta'];

async function seed({ reset = false } = {}) {
  if (reset) await initDb({ reset: true }); else await initDb();
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM products');
  if (n > 0) throw new Error('Database already has products. Run with --reset to wipe and re-seed.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const hash = await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123', 10);
    await conn.query('INSERT INTO users (name, email, password_hash) VALUES (?,?,?) ON DUPLICATE KEY UPDATE name = VALUES(name)',
      [process.env.SEED_ADMIN_NAME || 'Store Admin', (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase(), hash]);
    const [[admin]] = await conn.query('SELECT id FROM users ORDER BY id LIMIT 1');

    const catIds = [];
    for (const c of CATEGORIES) { const [r] = await conn.query('INSERT INTO categories (name) VALUES (?)', [c]); catIds.push(r.insertId); }

    // Products start with their opening stock, dated at the beginning of the period.
    const startDay = istDate(DAYS + 1);
    const prods = [];
    for (const [sku, name, cat, cost, price, stock, thr, pop, flags = {}] of PRODUCTS) {
      const [r] = await conn.query(
        `INSERT INTO products (sku,name,category_id,cost_price,selling_price,stock_qty,low_stock_threshold,created_at) VALUES (?,?,?,?,?,?,?,?)`,
        [sku, name, catIds[cat], cost, price, stock, thr, `${startDay} 09:00:00`]);
      await conn.query(
        `INSERT INTO inventory_movements (product_id,movement_type,quantity_before,quantity_change,quantity_after,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)`,
        [r.insertId, 'INITIAL', 0, stock, stock, 'Opening stock', admin.id, `${startDay} 09:00:00`]);
      prods.push({ id: r.insertId, sku, name, cost, price, stock, thr, pop, flags, initial: stock });
    }

    let salesCount = 0, cancelled = 0;
    for (let off = DAYS; off >= 0; off--) {
      const date = istDate(off);
      const weekend = [0, 6].includes(dow(off));
      const trend = 1 + (DAYS - off) / DAYS * 0.5;            // gradual business growth
      const nSales = (off === 0 && nowIstSecs() < 9 * 3600 + 120) ? 0 : Math.round((1 + rand() * 3 + (weekend ? 1.5 : 0)) * trend * (rand() < 0.08 ? 0 : 1));

      // Weekly restock sweep for products that are running low (except noRestock items).
      if (off % 7 === 3 && off > 0) {
        for (const p of prods) {
          if (p.stock <= p.thr && !p.flags.noRestock) {
            const qty = p.thr * 4 + pick(p.thr * 2);
            await conn.query('UPDATE products SET stock_qty = ? WHERE id = ?', [p.stock + qty, p.id]);
            await conn.query(`INSERT INTO inventory_movements (product_id,movement_type,quantity_before,quantity_change,quantity_after,reason,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)`,
              [p.id, 'RESTOCK', p.stock, qty, p.stock + qty, 'Supplier delivery', admin.id, `${date} 08:30:00`]);
            p.stock += qty;
          }
        }
      }
      // Cost price rise on one product mid-period: older sales keep the old captured cost.
      if (off === 60) {
        const p = prods.find((x) => x.sku === 'GRO-003');
        p.cost = 138; await conn.query('UPDATE products SET cost_price = 138 WHERE id = ?', [p.id]);
      }

      for (let s = 0; s < nSales; s++) {
        const lines = new Map();
        const lineCount = 1 + pick(4);
        for (let k = 0; k < lineCount; k++) {
          const pool_ = prods.filter((p) => p.stock > 0 && !(p.flags.slowAfter && off < p.flags.slowAfter));
          const total = pool_.reduce((a, p) => a + p.pop, 0);
          let roll = rand() * total, chosen = pool_[0];
          for (const p of pool_) { roll -= p.pop; if (roll <= 0) { chosen = p; break; } }
          const qty = Math.min(chosen.stock - (lines.get(chosen)?.qty || 0), 1 + pick(chosen.pop > 6 ? 5 : 3));
          if (qty > 0) lines.set(chosen, { qty: (lines.get(chosen)?.qty || 0) + qty });
        }
        if (!lines.size) continue;
        const soldAt = `${date} ${timeOfDay(off)}`;
        let totalPaise = 0;
        for (const [p, l] of lines) totalPaise += Math.round(p.price * 100) * l.qty;
        const [sr] = await conn.query(`INSERT INTO sales (invoice_no,customer_name,total_amount,status,created_by,sold_at) VALUES (?,?,?,?,?,?)`,
          [`TMP-${++salesCount}`, CUSTOMERS[pick(CUSTOMERS.length)], totalPaise / 100, 'COMPLETED', admin.id, soldAt]);
        const invoice = `INV-${date.replace(/-/g, '')}-${String(sr.insertId).padStart(5, '0')}`;
        await conn.query('UPDATE sales SET invoice_no = ? WHERE id = ?', [invoice, sr.insertId]);
        for (const [p, l] of lines) {
          await conn.query(`INSERT INTO sale_items (sale_id,product_id,product_name,sku,quantity,unit_price,unit_cost,line_total) VALUES (?,?,?,?,?,?,?,?)`,
            [sr.insertId, p.id, p.name, p.sku, l.qty, p.price, p.cost, (Math.round(p.price * 100) * l.qty) / 100]);
          await conn.query(`INSERT INTO inventory_movements (product_id,movement_type,quantity_before,quantity_change,quantity_after,reason,sale_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
            [p.id, 'SALE', p.stock, -l.qty, p.stock - l.qty, `Sale ${invoice}`, sr.insertId, admin.id, soldAt]);
          p.stock -= l.qty;
        }
        // ~3% of sales are cancelled (stock returned) to demonstrate the reversal workflow.
        if (off > 2 && rand() < 0.03) {
          cancelled++;
          const when = `${date} ${pad(21 + 0)}:${pad(pick(60))}:00`;
          for (const [p, l] of lines) {
            await conn.query(`INSERT INTO inventory_movements (product_id,movement_type,quantity_before,quantity_change,quantity_after,reason,sale_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
              [p.id, 'SALE_REVERSAL', p.stock, l.qty, p.stock + l.qty, `Cancelled ${invoice}: customer returned goods`, sr.insertId, admin.id, when]);
            p.stock += l.qty;
          }
          await conn.query(`UPDATE sales SET status='CANCELLED', cancelled_at=?, cancelled_by=?, cancel_reason=? WHERE id=?`, [when, admin.id, 'Customer returned goods', sr.insertId]);
        }
      }
    }
    // Write final simulated stock levels to the products table.
    for (const p of prods) await conn.query('UPDATE products SET stock_qty = ? WHERE id = ?', [p.stock, p.id]);
    await conn.commit();
    const [[t]] = await pool.query(`SELECT COUNT(*) AS sales, (SELECT COUNT(*) FROM inventory_movements) AS movements FROM sales`);
    console.log(`Seeded: ${PRODUCTS.length} products, ${t.sales} sales (${cancelled} cancelled), ${t.movements} stock movements.`);
    console.log(`Admin login: ${process.env.SEED_ADMIN_EMAIL || 'admin@example.com'}  (password from SEED_ADMIN_PASSWORD)`);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
module.exports = { seed };

if (require.main === module) {
  seed({ reset: process.argv.includes('--reset') }).then(() => pool.end()).catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });
}
