import { useState } from 'react';
import { api } from '../api/client';
import { useFetch } from '../utils/useFetch';
import { Async, DateRange, Empty, Field, KpiCard, Modal, PageHeader, Pagination, StatusBadge } from '../components/ui';
import { useToast } from '../components/Toast';
import { dateTime, money, number } from '../utils/format';

function AdjustModal({ product, onClose, onDone }) {
  const toast = useToast();
  const [type, setType] = useState('RESTOCK');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState(type === 'RESTOCK' ? 'Supplier delivery' : '');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function save() {
    const e = {};
    const n = Number(qty);
    if (qty === '' || !Number.isInteger(n) || n === 0) e.qty = 'Enter a whole number other than 0.';
    else if (type === 'RESTOCK' && n < 0) e.qty = 'A restock must be a positive number.';
    else if (product.stock_qty + n < 0) e.qty = `Only ${product.stock_qty} in stock - you cannot remove more.`;
    if (reason.trim().length < 3) e.reason = 'Give a short reason (at least 3 characters).';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api.post('/inventory/adjust', { product_id: product.id, movement_type: type, quantity_change: n, reason: reason.trim() });
      toast.success(`Stock updated: ${product.stock_qty} → ${product.stock_qty + n}.`);
      onDone();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  }
  return (
    <Modal title={`Update stock: ${product.name}`} onClose={onClose} footer={<>
      <button className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save change'}</button></>}>
      <p className="text-secondary">Current stock: <strong className="text-body">{product.stock_qty}</strong></p>
      <Field id="ad-type" label="What happened?">
        <select id="ad-type" className="form-select" value={type} onChange={(e) => { setType(e.target.value); setReason(e.target.value === 'RESTOCK' ? 'Supplier delivery' : ''); }}>
          <option value="RESTOCK">Received new stock (add)</option><option value="ADJUSTMENT">Correction, damage or loss (add or remove)</option></select></Field>
      <Field id="ad-qty" label={type === 'RESTOCK' ? 'Units received' : 'Change in units'} error={errors.qty} hint={type === 'ADJUSTMENT' ? 'Use a minus sign to remove, e.g. -3.' : undefined}>
        <input id="ad-qty" className={`form-control ${errors.qty ? 'is-invalid' : ''}`} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></Field>
      <Field id="ad-reason" label="Reason" error={errors.reason}>
        <input id="ad-reason" className={`form-control ${errors.reason ? 'is-invalid' : ''}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength="255" /></Field>
    </Modal>
  );
}

function Alerts({ onAdjust, refreshKey }) {
  const state = useFetch('/inventory/alerts', { k: refreshKey });
  return (
    <Async state={state} isEmpty={(d) => d.low_stock.length + d.out_of_stock.length === 0} empty={<Empty title="All stocked up">No product is at or below its low-stock threshold.</Empty>}>
      {(d) => (
        <div className="table-wrap"><table className="table align-middle">
          <thead><tr><th>Product</th><th>Category</th><th>Status</th><th className="num">Stock</th><th className="num">Threshold</th><th className="num">Suggested restock</th><th /></tr></thead>
          <tbody>{[...d.out_of_stock, ...d.low_stock].map((p) => (
            <tr key={p.id}><td>{p.name}<div className="small text-secondary">{p.sku}</div></td><td>{p.category}</td><td><StatusBadge status={p.stock_status} /></td>
              <td className="num">{p.stock_qty}</td><td className="num">{p.low_stock_threshold}</td><td className="num">{p.suggested_restock_qty}</td>
              <td className="text-end"><button className="btn btn-sm btn-primary" onClick={() => onAdjust(p)}>Restock</button></td></tr>))}</tbody></table></div>)}
    </Async>
  );
}

function Movements({ refreshKey }) {
  const [f, setF] = useState({ product_id: '', type: '', from: '', to: '', page: 1 });
  const products = useFetch('/products', { limit: 100, active: 'all' });
  const state = useFetch('/inventory/movements', { ...f, k: refreshKey });
  const upd = (patch) => setF((x) => ({ ...x, ...patch, page: patch.page || 1 }));
  return (
    <>
      <div className="panel-body border-bottom d-flex flex-wrap gap-2 align-items-end">
        <div><label className="form-label small mb-0" htmlFor="m-prod">Product</label>
          <select id="m-prod" className="form-select form-select-sm" value={f.product_id} onChange={(e) => upd({ product_id: e.target.value })}><option value="">All products</option>{products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label className="form-label small mb-0" htmlFor="m-type">Type</label>
          <select id="m-type" className="form-select form-select-sm" value={f.type} onChange={(e) => upd({ type: e.target.value })}><option value="">All types</option>
            {['INITIAL', 'RESTOCK', 'ADJUSTMENT', 'SALE', 'SALE_REVERSAL'].map((t) => <option key={t} value={t}>{t.replace('_', ' ').toLowerCase()}</option>)}</select></div>
        <DateRange from={f.from} to={f.to} onChange={(r) => upd(r)} presets={false} />
        {(f.product_id || f.type || f.from || f.to) && <button className="btn btn-sm btn-link" onClick={() => upd({ product_id: '', type: '', from: '', to: '' })}>Clear filters</button>}
      </div>
      <Async state={state} isEmpty={(d) => d.length === 0} empty={<Empty title="No stock movements found">Try a wider date range or fewer filters.</Empty>}>
        {(rows) => (
          <div className="table-wrap"><table className="table align-middle">
            <thead><tr><th>When</th><th>Product</th><th>Type</th><th className="num">Before</th><th className="num">Change</th><th className="num">After</th><th>Reason</th><th>By</th></tr></thead>
            <tbody>{rows.map((m) => (
              <tr key={m.id}><td className="text-nowrap">{dateTime(m.created_at)}</td><td>{m.product_name}<div className="small text-secondary">{m.sku}</div></td><td><StatusBadge status={m.movement_type} /></td>
                <td className="num">{m.quantity_before}</td><td className="num" style={{ color: m.quantity_change < 0 ? 'var(--bad)' : 'var(--ok)', fontWeight: 500 }}>{m.quantity_change > 0 ? '+' : ''}{m.quantity_change}</td>
                <td className="num">{m.quantity_after}</td><td>{m.reason}</td><td>{m.user_name || '-'}</td></tr>))}</tbody></table></div>)}
      </Async>
      <Pagination meta={state.meta} onPage={(page) => upd({ page })} />
    </>
  );
}

export default function Inventory() {
  const [tab, setTab] = useState('alerts');
  const [adjusting, setAdjusting] = useState(null);
  const [picked, setPicked] = useState('');
  const [key, setKey] = useState(0);                       // bump to refresh child lists after a change
  const products = useFetch('/products', { limit: 100, k: key });
  const valuation = useFetch('/analytics/inventory', { k: key });
  const done = () => { setAdjusting(null); setKey((k) => k + 1); };
  const snap = valuation.data?.snapshot;

  return (
    <>
      <PageHeader title="Inventory" subtitle="Every stock change is recorded with a reason.">
        <div><label className="form-label small mb-0" htmlFor="inv-pick">Update stock for</label>
          <select id="inv-pick" className="form-select form-select-sm" value={picked} onChange={(e) => { setPicked(''); const p = products.data?.find((x) => String(x.id) === e.target.value); if (p) setAdjusting(p); }}>
            <option value="">Choose a product…</option>{products.data?.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.stock_qty})</option>)}</select></div>
      </PageHeader>
      {snap && <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3"><KpiCard label="Units in stock" value={number(snap.total_units)} /></div>
        <div className="col-6 col-lg-3"><KpiCard accent label="Stock value (at cost)" value={money(snap.stock_value)} /></div>
        <div className="col-6 col-lg-3"><KpiCard label="Low stock" value={snap.low_stock_count} /></div>
        <div className="col-6 col-lg-3"><KpiCard label="Out of stock" value={snap.out_of_stock_count} /></div></div>}
      <div className="panel">
        <ul className="nav nav-tabs px-3 pt-2" role="tablist">
          {[['alerts', 'Restock alerts'], ['movements', 'Movement history']].map(([k, l]) => (
            <li className="nav-item" key={k}><button role="tab" aria-selected={tab === k} className={`nav-link ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button></li>))}
        </ul>
        {tab === 'alerts' ? <Alerts onAdjust={setAdjusting} refreshKey={key} /> : <Movements refreshKey={key} />}
      </div>
      {adjusting && <AdjustModal product={adjusting} onClose={() => setAdjusting(null)} onDone={done} />}
    </>
  );
}
