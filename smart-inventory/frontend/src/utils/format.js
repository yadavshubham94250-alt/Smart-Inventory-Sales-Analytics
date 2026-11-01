// Display formatting. All money is INR with Indian digit grouping (1,23,456.00).
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-IN');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const money = (n) => inr.format(Number(n) || 0);
export const moneyShort = (n) => inr0.format(Number(n) || 0);
export const number = (n) => num.format(Number(n) || 0);
export const percent = (n) => (n === null || n === undefined ? '-' : `${Number(n).toFixed(2)}%`);

// 'YYYY-MM-DD HH:mm:ss' (IST, from the API) -> '21 Oct 2026, 02:15 PM'. No Date() parsing, so no timezone shift.
export function dateTime(s) {
  if (!s) return '-';
  const [d, t = '00:00:00'] = s.split(' ');
  const [y, m, day] = d.split('-');
  let h = Number(t.slice(0, 2));
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}, ${String(h).padStart(2, '0')}:${t.slice(3, 5)} ${ampm}`;
}
export const dateOnly = (s) => (s ? dateTime(`${s.slice(0, 10)} 00:00:00`).split(',')[0] : '-');
// '2026-03' -> 'Mar 26'
export const monthLabel = (p) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(2, 4)}`;

// Today / N days ago in the browser's local date, as YYYY-MM-DD (used for default filters).
export function isoDate(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
