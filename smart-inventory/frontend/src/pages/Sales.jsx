import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useFetch } from '../utils/useFetch';
import { Async, DateRange, Empty, Field, Modal, PageHeader, Pagination, Spinner, StatusBadge } from '../components/ui';
import { useToast } from '../components/Toast';
import { dateTime, money } from '../utils/format';

// ---------- New sale ----------
function NewSale({ onCreated }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState([]);                 // [{ product, qty }]
  const [customer, setCustomer] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());   // one key per sale attempt -> no duplicates on double-click/retry
  const products = useFetch('/products', { search: q, limit: 8, sort: 'name' });

  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const inCart = (p) => cart.find((l) => l.product.id === p.id);
  function add(p) {
    setCart((c) => inCart(p) ? c.map((l) => l.product.id === p.id ? { ...l, qty: Math.min(l.qty + 1, p.stock_qty) } : l) : [...c, { product: p, qty: 1 }]);
  }
  const setQty = (id, v) => setCart((c) => c.map((l) => l.product.id === id ? { ...l, qty: v } : l));
  const remove = (id) => setCart((c) => c.filter((l) => l.product.id !== id));

  const lineProblem = (l) => (!Number.isInteger(l.qty) || l.qty < 1) ? 'Enter a whole number of 1 or more' : l.qty > l.product.stock_qty ? `Only ${l.product.stock_qty} in stock` : '';
  const problems = cart.map(lineProblem).filter(Boolean);
  // DISPLAY ONLY: the server recalculates the real total from database prices.
  const estimate = cart.reduce((a, l) => a + Math.round(l.product.selling_price * 100) * (Number(l.qty) || 0), 0) / 100;

  async function confirm() {
    setBusy(true); setError('');
    try {
      const res = await api.post('/sales', { customer_name: customer.trim() || null, idempotency_key: idemKey, items: cart.map((l) => ({ product_id: l.product.id, quantity: l.qty })) });
      toast.success(`Sale ${res.data.invoice_no} recorded: ${money(res.data.total_amount)}.`);
      setCart([]); setCustomer(''); setConfirming(false); setIdemKey(crypto.randomUUID()); products.reload(); onCreated(res.data);
    } catch (e) { setError(e.message); products.reload(); } finally { setBusy(false); }
  }

  return (
    <div className="row g-3">
      <div className="col-lg-5">
        <div className="panel">
          <div className="panel-head">1. Choose products</div>
          <div className="panel-body border-bottom"><label className="visually-hidden" htmlFor="ns-search">Search products</label>
            <input id="ns-search" className="form-control" placeholder="Search name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div className="picker-list">
            <Async state={products} isEmpty={(d) => d.length === 0} empty={<Empty title="No products found">Try a different search.</Empty>}>
              {(rows) => rows.map((p) => (
                <button key={p.id} className="picker-item" disabled={p.stock_qty === 0} onClick={() => add(p)}>
                  <span>{p.name}<br /><small className="text-secondary">{p.sku} · {p.stock_qty === 0 ? 'Out of stock' : `${p.stock_qty} in stock`}</small></span>
                  <span className="num fw-medium">{money(p.selling_price)}</span></button>))}
            </Async>
          </div>
        </div>
      </div>
      <div className="col-lg-7">
        <div className="panel">
          <div className="panel-head">2. Review the sale</div>
          {cart.length === 0 ? <Empty title="No products added yet">Pick products from the list to start a sale.</Empty> : (
            <div className="table-wrap"><table className="table align-middle">
              <thead><tr><th>Product</th><th className="num">Price</th><th style={{ width: 130 }}>Quantity</th><th className="num">Line total</th><th /></tr></thead>
              <tbody>{cart.map((l) => { const prob = lineProblem(l); return (
                <tr key={l.product.id} className="cart-row">
                  <td>{l.product.name}<div className="small text-secondary">{l.product.sku}</div></td><td className="num">{money(l.product.selling_price)}</td>
                  <td><input aria-label={`Quantity for ${l.product.name}`} className={`form-control form-control-sm ${prob ? 'is-invalid' : ''}`} type="number" min="1" max={l.product.stock_qty} value={l.qty}
                    onChange={(e) => setQty(l.product.id, e.target.value === '' ? '' : Number(e.target.value))} />{prob && <div className="invalid-feedback d-block">{prob}</div>}</td>
                  <td className="num">{money(l.product.selling_price * (Number(l.qty) || 0))}</td>
                  <td className="text-end"><button className="btn btn-sm btn-outline-danger" aria-label={`Remove ${l.product.name}`} onClick={() => remove(l.product.id)}>Remove</button></td></tr>); })}</tbody>
              <tfoot><tr><th colSpan="3" className="text-end">Total</th><th className="num fs-5">{money(estimate)}</th><th /></tr></tfoot></table></div>)}
          <div className="panel-body border-top">
            <Field id="ns-cust" label="Customer name (optional)"><input id="ns-cust" className="form-control" maxLength="100" value={customer} onChange={(e) => setCustomer(e.target.value)} /></Field>
            <button className="btn btn-primary" disabled={!cart.length || problems.length > 0} onClick={() => { setError(''); setConfirming(true); }}>Review and confirm sale</button>
            <div className="form-text">The final total is calculated by the server using current prices.</div>
          </div>
        </div>
      </div>
      {confirming && (
        <Modal title="Confirm sale" onClose={() => !busy && setConfirming(false)} footer={<>
          <button className="btn btn-outline-secondary" disabled={busy} onClick={() => setConfirming(false)}>Back</button>
          <button className="btn btn-primary" disabled={busy} onClick={confirm}>{busy ? 'Recording…' : `Confirm ${money(estimate)}`}</button></>}>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <ul className="list-unstyled mb-2">{cart.map((l) => <li key={l.product.id} className="d-flex justify-content-between"><span>{l.qty} × {l.product.name}</span><span className="num">{money(l.product.selling_price * l.qty)}</span></li>)}</ul>
          <div className="d-flex justify-content-between fw-semibold border-top pt-2"><span>Total</span><span className="num">{money(estimate)}</span></div>
          {customer && <div className="text-secondary mt-2">Customer: {customer}</div>}
        </Modal>)}
    </div>
  );
}

// ---------- Sale details + cancel ----------
function SaleDetails({ id, onClose, onChanged }) {
  const toast = useToast();
  const state = useFetch(`/sales/${id}`);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const s = state.data;

  async function cancel() {
    if (reason.trim().length < 3) { setErr('Give a reason (at least 3 characters).'); return; }
    setBusy(true);
    try { await api.post(`/sales/${id}/cancel`, { reason: reason.trim() }); toast.success('Sale cancelled and stock returned.'); setCancelling(false); state.reload(); onChanged(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <Modal wide title={s ? `Sale ${s.invoice_no}` : 'Sale details'} onClose={onClose} footer={s && s.status === 'COMPLETED' && !cancelling ? <button className="btn btn-outline-danger" onClick={() => setCancelling(true)}>Cancel this sale</button> : undefined}>
      {state.loading && !s ? <Spinner /> : state.error ? <div className="alert alert-danger">{state.error}</div> : s && (<>
        <div className="d-flex flex-wrap gap-4 mb-3">
          <div><div className="text-secondary small">Date</div>{dateTime(s.sold_at)}</div><div><div className="text-secondary small">Customer</div>{s.customer_name || 'Walk-in'}</div>
          <div><div className="text-secondary small">Recorded by</div>{s.created_by_name}</div><div><div className="text-secondary small">Status</div><StatusBadge status={s.status} /></div></div>
        {s.status === 'CANCELLED' && <div className="alert alert-secondary">Cancelled {dateTime(s.cancelled_at)} by {s.cancelled_by_name}. Reason: {s.cancel_reason}. Stock was returned and this sale is excluded from revenue and profit.</div>}
        <div className="table-wrap"><table className="table align-middle"><thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Unit cost</th><th className="num">Line total</th><th className="num">Gross profit</th></tr></thead>
          <tbody>{s.items.map((i) => <tr key={i.id}><td>{i.product_name}<div className="small text-secondary">{i.sku}</div></td><td className="num">{i.quantity}</td><td className="num">{money(i.unit_price)}</td><td className="num">{money(i.unit_cost)}</td><td className="num">{money(i.line_total)}</td><td className="num">{money(i.line_profit)}</td></tr>)}</tbody>
          <tfoot><tr><th colSpan="4" className="text-end">Total</th><th className="num">{money(s.total_amount)}</th><th className="num">{money(s.items.reduce((a, i) => a + i.line_profit, 0))}</th></tr></tfoot></table></div>
        {cancelling && (<div className="border rounded p-3 mt-3"><Field id="cx-reason" label="Why is this sale being cancelled?" error={err}>
          <input id="cx-reason" className={`form-control ${err ? 'is-invalid' : ''}`} value={reason} onChange={(e) => { setReason(e.target.value); setErr(''); }} autoFocus maxLength="255" /></Field>
          <p className="small text-secondary">Stock will be returned and the sale kept in history as cancelled.</p>
          <button className="btn btn-danger me-2" onClick={cancel} disabled={busy}>{busy ? 'Cancelling…' : 'Cancel sale'}</button>
          <button className="btn btn-outline-secondary" onClick={() => setCancelling(false)} disabled={busy}>Keep sale</button></div>)}
      </>)}
    </Modal>
  );
}

// ---------- History ----------
function History({ refreshKey, onChanged }) {
  const [f, setF] = useState({ search: '', status: '', from: '', to: '', page: 1 });
  const [text, setText] = useState('');
  const [open, setOpen] = useState(null);
  const state = useFetch('/sales', { ...f, limit: 10, k: refreshKey });
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, search: text.trim(), page: 1 })), 350); return () => clearTimeout(t); }, [text]);
  const upd = (patch) => setF((x) => ({ ...x, ...patch, page: patch.page || 1 }));
  return (
    <div className="panel">
      <div className="panel-body border-bottom d-flex flex-wrap gap-2 align-items-end">
        <div><label className="form-label small mb-0" htmlFor="h-search">Invoice, sale ID or customer</label><input id="h-search" className="form-control form-control-sm" value={text} onChange={(e) => setText(e.target.value)} /></div>
        <div><label className="form-label small mb-0" htmlFor="h-status">Status</label><select id="h-status" className="form-select form-select-sm" value={f.status} onChange={(e) => upd({ status: e.target.value })}><option value="">All</option><option value="COMPLETED">Completed</option><option value="CANCELLED">Cancelled</option></select></div>
        <DateRange from={f.from} to={f.to} onChange={upd} />
      </div>
      <Async state={state} isEmpty={(d) => d.length === 0} empty={<Empty title="No sales found">Change the filters, or record a sale on the New sale tab.</Empty>}>
        {(rows) => (<div className="table-wrap"><table className="table align-middle table-hover">
          <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th className="num">Items</th><th className="num">Total</th><th>Status</th><th /></tr></thead>
          <tbody>{rows.map((s) => (<tr key={s.id}><td>{s.invoice_no}</td><td className="text-nowrap">{dateTime(s.sold_at)}</td><td>{s.customer_name || <span className="text-secondary">Walk-in</span>}</td>
            <td className="num">{s.units}</td><td className="num">{money(s.total_amount)}</td><td><StatusBadge status={s.status} /></td>
            <td className="text-end"><button className="btn btn-sm btn-outline-primary" onClick={() => setOpen(s.id)}>Details</button></td></tr>))}</tbody></table></div>)}
      </Async>
      <Pagination meta={state.meta} onPage={(page) => upd({ page })} />
      {open && <SaleDetails id={open} onClose={() => setOpen(null)} onChanged={() => { state.reload(); onChanged(); }} />}
    </div>
  );
}

export default function Sales() {
  const [tab, setTab] = useState('new');
  const [key, setKey] = useState(0);
  return (
    <>
      <PageHeader title="Sales" subtitle="Record a sale, or look up and cancel an earlier one." />
      <ul className="nav nav-tabs mb-3" role="tablist">
        {[['new', 'New sale'], ['history', 'Sales history']].map(([k, l]) => <li className="nav-item" key={k}><button role="tab" aria-selected={tab === k} className={`nav-link ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button></li>)}
      </ul>
      {tab === 'new' ? <NewSale onCreated={() => setKey((k) => k + 1)} /> : <History refreshKey={key} onChanged={() => setKey((k) => k + 1)} />}
    </>
  );
}
