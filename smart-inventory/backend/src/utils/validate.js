// Small, dependency-free validators. Each returns a clean value or throws AppError(400).
const { AppError } = require('./errors');

const bad = (msg, field) => new AppError(400, msg, field ? { [field]: msg } : undefined);

function str(v, field, { min = 1, max = 255, required = true } = {}) {
  if (v === undefined || v === null || String(v).trim() === '') {
    if (required) throw bad(`${field} is required`, field);
    return null;
  }
  if (typeof v !== 'string') throw bad(`${field} must be text`, field);
  const s = v.trim();
  if (s.length < min) throw bad(`${field} must be at least ${min} characters`, field);
  if (s.length > max) throw bad(`${field} must be at most ${max} characters`, field);
  return s;
}

// Money: non-negative number with at most 2 decimals. Returned as a Number.
function money(v, field, { max = 99999999 } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw bad(`${field} must be a number`, field);
  if (n < 0) throw bad(`${field} cannot be negative`, field);
  if (n > max) throw bad(`${field} is too large`, field);
  if (Math.round(n * 100) / 100 !== n) throw bad(`${field} can have at most 2 decimal places`, field);
  return n;
}

// Whole number within [min, max].
function int(v, field, { min = 0, max = 2147483647 } = {}) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) throw bad(`${field} must be a whole number`, field);
  if (n < min) throw bad(`${field} must be at least ${min}`, field);
  if (n > max) throw bad(`${field} must be at most ${max}`, field);
  return n;
}

const id = (v, field = 'id') => int(v, field, { min: 1 });

// 'YYYY-MM-DD' that is a real calendar date.
function date(v, field, { required = false } = {}) {
  if (v === undefined || v === '') {
    if (required) throw bad(`${field} is required`, field);
    return null;
  }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(`${field} must be YYYY-MM-DD`, field);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw bad(`${field} is not a valid date`, field);
  return v;
}

function oneOf(v, field, allowed, { required = false } = {}) {
  if (v === undefined || v === '') {
    if (required) throw bad(`${field} is required`, field);
    return null;
  }
  if (!allowed.includes(v)) throw bad(`${field} must be one of: ${allowed.join(', ')}`, field);
  return v;
}

function email(v) {
  const s = str(v, 'email', { max: 150 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw bad('email is not valid', 'email');
  return s;
}

function password(v) {
  if (typeof v !== 'string' || v.length < 8) throw bad('password must be at least 8 characters', 'password');
  if (v.length > 72) throw bad('password must be at most 72 characters', 'password'); // bcrypt limit
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) throw bad('password must contain a letter and a number', 'password');
  return v;
}

// Optional from/to pair. Returns SQL-ready bounds: from 00:00:00 (inclusive), to next-day 00:00:00 (exclusive).
function dateRange(q, fromKey = 'from', toKey = 'to') {
  const from = date(q[fromKey], fromKey);
  const to = date(q[toKey], toKey);
  if (from && to && from > to) throw bad(`${fromKey} must not be after ${toKey}`, fromKey);
  const next = to ? new Date(`${to}T00:00:00Z`) : null;
  if (next) next.setUTCDate(next.getUTCDate() + 1);
  return {
    from,
    to,
    start: from ? `${from} 00:00:00` : '1970-01-01 00:00:00',
    end: next ? `${next.toISOString().slice(0, 10)} 00:00:00` : '9999-12-31 00:00:00',
  };
}

function pagination(q, { defaultLimit = 10, maxLimit = 100 } = {}) {
  const page = q.page === undefined ? 1 : int(q.page, 'page', { min: 1, max: 100000 });
  const limit = q.limit === undefined ? defaultLimit : int(q.limit, 'limit', { min: 1, max: maxLimit });
  return { page, limit, offset: (page - 1) * limit };
}

module.exports = { str, money, int, id, date, oneOf, email, password, dateRange, pagination };
