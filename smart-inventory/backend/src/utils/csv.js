// Builds CSV text. Excel-friendly: UTF-8 BOM, CRLF line endings.
// Text cells starting with = + - @ are prefixed with ' to prevent CSV/formula injection.
function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// columns: [{ header: 'Revenue (INR)', key: 'revenue' }, ...]
function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(r[c.key])).join(','));
  return '\uFEFF' + [head, ...body].join('\r\n') + '\r\n';
}

function sendCsv(res, filename, columns, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(columns, rows));
}

module.exports = { toCsv, sendCsv };
