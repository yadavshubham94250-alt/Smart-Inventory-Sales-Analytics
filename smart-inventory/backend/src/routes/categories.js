const router = require('express').Router();
const pool = require('../config/db');
const v = require('../utils/validate');
const { AppError } = require('../utils/errors');
const { ok } = require('../utils/respond');

router.get('/', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT c.id, c.name, COUNT(p.id) AS product_count
       FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
      GROUP BY c.id ORDER BY c.name`);
  ok(res, rows);
});

router.post('/', async (req, res) => {
  const name = v.str(req.body.name, 'name', { max: 80 });
  const [r] = await pool.query('INSERT INTO categories (name) VALUES (?)', [name]);
  ok(res, { id: r.insertId, name }, 201);
});

router.put('/:id', async (req, res) => {
  const id = v.id(req.params.id);
  const name = v.str(req.body.name, 'name', { max: 80 });
  const [r] = await pool.query('UPDATE categories SET name = ? WHERE id = ?', [name, id]);
  if (!r.affectedRows) throw new AppError(404, 'Category not found');
  ok(res, { id, name });
});

router.delete('/:id', async (req, res) => {
  const id = v.id(req.params.id);
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM products WHERE category_id = ?', [id]);
  if (n > 0) throw new AppError(409, 'This category still has products. Move or archive them first.');
  const [r] = await pool.query('DELETE FROM categories WHERE id = ?', [id]);
  if (!r.affectedRows) throw new AppError(404, 'Category not found');
  ok(res, { id });
});

module.exports = router;
