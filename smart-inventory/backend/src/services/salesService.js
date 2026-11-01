// Sales business logic. Everything that changes money or stock happens here, inside ONE MySQL transaction.
//
// Why this is safe:
//  1. SELECT ... FOR UPDATE locks the product rows, so two simultaneous sales of the same product
//     run one after the other; the second sees the already-reduced stock and is rejected if short.
//  2. Rows are always locked in ascending product-id order, which prevents deadlocks.
//  3. Prices, costs and totals come from the database, never from the request body.
//  4. Any error -> ROLLBACK, so a failed sale leaves no half-written data.
//  5. idempotency_key (UNIQUE) makes a double-click / retry return the original sale instead of a duplicate.
const crypto = require('crypto');
const pool = require('../config/db');
const v = require('../utils/validate');
const { AppError } = require('../utils/errors');

const toPaise = (rupees) => Math.round(rupees * 100);   // avoid floating-point drift: do maths in paise
const toRupees = (paise) => paise / 100;

function parseItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new AppError(400, 'Add at least one product to the sale.', { items: 'Add at least one product' });
  if (raw.length > 50) throw new AppError(400, 'A sale can have at most 50 lines.', { items: 'Too many lines' });
  const merged = new Map();
  raw.forEach((it, i) => {
    const pid = v.id(it?.product_id, `items[${i}].product_id`);
    const qty = v.int(it?.quantity, `items[${i}].quantity`, { min: 1, max: 100000 });
    merged.set(pid, (merged.get(pid) || 0) + qty);   // same product twice -> one line
  });
  return [...merged.entries()].map(([product_id, quantity]) => ({ product_id, quantity })).sort((a, b) => a.product_id - b.product_id);
}

async function getSaleById(db, id) {
  const [sales] = await db.query(
    `SELECT s.id, s.invoice_no, s.customer_name, s.total_amount, s.status, s.sold_at,
            s.cancelled_at, s.cancel_reason, u.name AS created_by_name, cu.name AS cancelled_by_name
       FROM sales s JOIN users u ON u.id = s.created_by LEFT JOIN users cu ON cu.id = s.cancelled_by
      WHERE s.id = ?`, [id]);
  if (!sales[0]) return null;
  const [items] = await db.query(
    `SELECT id, product_id, sku, product_name, quantity, unit_price, unit_cost, line_total,
            ROUND(line_total - quantity * unit_cost, 2) AS line_profit
       FROM sale_items WHERE sale_id = ? ORDER BY id`, [id]);
  return { ...sales[0], items };
}

async function createSale(userId, body) {
  const items = parseItems(body.items);
  const customer = v.str(body.customer_name, 'customer_name', { max: 100, required: false });
  const idemKey = v.str(body.idempotency_key, 'idempotency_key', { max: 64, required: false });

  // Fast path for retries: same key -> same sale.
  if (idemKey) {
    const [ex] = await pool.query('SELECT id FROM sales WHERE idempotency_key = ?', [idemKey]);
    if (ex[0]) return { sale: await getSaleById(pool, ex[0].id), duplicate: true };
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1+2. Lock and read the products (ordered by id).
    const ids = items.map((i) => i.product_id);
    const [products] = await conn.query(
      `SELECT id, sku, name, cost_price, selling_price, stock_qty, is_active
         FROM products WHERE id IN (?) ORDER BY id FOR UPDATE`, [ids]);
    const byId = new Map(products.map((p) => [p.id, p]));

    // 3. Validate every line before changing anything.
    const problems = [];
    let totalPaise = 0;
    const lines = items.map((it) => {
      const p = byId.get(it.product_id);
      if (!p) { problems.push(`Product #${it.product_id} does not exist`); return null; }
      if (!p.is_active) { problems.push(`${p.name} is archived and cannot be sold`); return null; }
      if (p.stock_qty < it.quantity) { problems.push(`Insufficient stock for ${p.name}: requested ${it.quantity}, available ${p.stock_qty}`); return null; }
      const linePaise = toPaise(p.selling_price) * it.quantity;     // server-side price and maths
      totalPaise += linePaise;
      return { p, qty: it.quantity, linePaise, before: p.stock_qty };
    });
    if (problems.length) throw new AppError(409, problems[0], { items: problems });

    // 4. Insert the sale header (temporary unique invoice number, replaced once we know the id).
    const [s] = await conn.query(
      `INSERT INTO sales (invoice_no, customer_name, total_amount, status, idempotency_key, created_by)
       VALUES (?,?,?,?,?,?)`, [`TMP-${crypto.randomUUID()}`.slice(0, 30), customer, toRupees(totalPaise), 'COMPLETED', idemKey, userId]);
    const saleId = s.insertId;
    const invoice = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(saleId).padStart(5, '0')}`;
    await conn.query('UPDATE sales SET invoice_no = ? WHERE id = ?', [invoice, saleId]);

    // 5+6. Line items (price AND cost captured), stock reduction, movement log.
    for (const l of lines) {
      await conn.query(
        `INSERT INTO sale_items (sale_id, product_id, product_name, sku, quantity, unit_price, unit_cost, line_total)
         VALUES (?,?,?,?,?,?,?,?)`,
        [saleId, l.p.id, l.p.name, l.p.sku, l.qty, l.p.selling_price, l.p.cost_price, toRupees(l.linePaise)]);
      await conn.query('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?', [l.qty, l.p.id]);
      await conn.query(
        `INSERT INTO inventory_movements (product_id, movement_type, quantity_before, quantity_change, quantity_after, reason, sale_id, created_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [l.p.id, 'SALE', l.before, -l.qty, l.before - l.qty, `Sale ${invoice}`, saleId, userId]);
    }

    // 7. Commit - all or nothing.
    await conn.commit();
    return { sale: await getSaleById(pool, saleId), duplicate: false };
  } catch (e) {
    await conn.rollback();
    // Two identical idempotency keys raced: the loser returns the winner's sale.
    if (e.code === 'ER_DUP_ENTRY' && idemKey && /uq_sales_idem/.test(e.message)) {
      const [ex] = await pool.query('SELECT id FROM sales WHERE idempotency_key = ?', [idemKey]);
      if (ex[0]) return { sale: await getSaleById(pool, ex[0].id), duplicate: true };
    }
    throw e;
  } finally {
    conn.release();
  }
}

// Cancel = reverse: mark CANCELLED, return stock, log SALE_REVERSAL movements. Nothing is deleted.
async function cancelSale(userId, saleId, reasonRaw) {
  const reason = v.str(reasonRaw, 'reason', { min: 3, max: 255 });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, invoice_no, status FROM sales WHERE id = ? FOR UPDATE', [saleId]);
    if (!rows[0]) throw new AppError(404, 'Sale not found');
    if (rows[0].status === 'CANCELLED') throw new AppError(409, 'This sale is already cancelled.');

    const [items] = await conn.query('SELECT product_id, quantity FROM sale_items WHERE sale_id = ? ORDER BY product_id', [saleId]);
    const [products] = await conn.query('SELECT id, stock_qty FROM products WHERE id IN (?) ORDER BY id FOR UPDATE', [items.map((i) => i.product_id)]);
    const stock = new Map(products.map((p) => [p.id, p.stock_qty]));

    for (const it of items) {
      const before = stock.get(it.product_id);
      await conn.query('UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?', [it.quantity, it.product_id]);
      await conn.query(
        `INSERT INTO inventory_movements (product_id, movement_type, quantity_before, quantity_change, quantity_after, reason, sale_id, created_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [it.product_id, 'SALE_REVERSAL', before, it.quantity, before + it.quantity, `Cancelled ${rows[0].invoice_no}: ${reason}`, saleId, userId]);
    }
    await conn.query(`UPDATE sales SET status='CANCELLED', cancelled_at=NOW(), cancelled_by=?, cancel_reason=? WHERE id=?`, [userId, reason, saleId]);
    await conn.commit();
    return getSaleById(pool, saleId);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { createSale, cancelSale, getSaleById };
