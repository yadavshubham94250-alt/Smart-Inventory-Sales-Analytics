import { useState } from 'react';
import { api } from '../api/client';
import { DateRange, PageHeader } from '../components/ui';
import { useToast } from '../components/Toast';
import { isoDate } from '../utils/format';

// Each report card: description, whether it uses dates, and the API path. CSV uses the same filters as on screen.
const REPORTS = [
  { key: 'sales', title: 'Sales report', path: '/reports/sales', dates: true, status: true, text: 'Every sale with units, revenue, cost of goods and gross profit.' },
  { key: 'products', title: 'Product performance', path: '/reports/products', dates: true, text: 'Units, revenue, profit, margin and revenue share for every product.' },
  { key: 'categories', title: 'Category performance', path: '/reports/categories', dates: true, text: 'Revenue and gross profit compared across categories.' },
  { key: 'valuation', title: 'Inventory valuation', path: '/reports/inventory-valuation', text: 'Current stock valued at purchase cost and at selling price.' },
  { key: 'low', title: 'Low-stock report', path: '/reports/low-stock', text: 'Products at or below their threshold, with a suggested restock quantity.' },
];

export default function Reports() {
  const toast = useToast();
  const [range, setRange] = useState({ from: isoDate(29), to: isoDate(0) });
  const [status, setStatus] = useState('COMPLETED');
  const [busy, setBusy] = useState('');

  async function download(r) {
    setBusy(r.key);
    try {
      const params = { ...(r.dates ? range : {}), ...(r.status ? { status } : {}) };
      const name = await api.download(r.path, params);
      toast.success(`Downloaded ${name}`);
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  }
  return (
    <>
      <PageHeader title="Reports" subtitle="Download CSV files that open in Excel or Google Sheets. Amounts are in INR; times are IST.">
        <DateRange {...range} onChange={setRange} />
      </PageHeader>
      <div className="row g-3">
        {REPORTS.map((r) => (
          <div className="col-md-6 col-xl-4" key={r.key}>
            <div className="panel h-100"><div className="panel-body d-flex flex-column h-100">
              <h2 className="h6">{r.title}</h2><p className="text-secondary flex-grow-1">{r.text}</p>
              <p className="small mb-2">{r.dates ? `Dates: ${range.from || 'start'} to ${range.to || 'today'}` : 'Uses current stock - no dates needed.'}</p>
              {r.status && <div className="mb-2"><label className="form-label small mb-0" htmlFor={`st-${r.key}`}>Sales to include</label>
                <select id={`st-${r.key}`} className="form-select form-select-sm" value={status} onChange={(e) => setStatus(e.target.value)}><option value="COMPLETED">Completed only</option><option value="CANCELLED">Cancelled only</option></select></div>}
              <button className="btn btn-primary align-self-start" disabled={busy === r.key} onClick={() => download(r)}>{busy === r.key ? 'Preparing…' : 'Download CSV'}</button>
            </div></div>
          </div>))}
      </div>
    </>
  );
}
