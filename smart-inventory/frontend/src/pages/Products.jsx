import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useFetch } from '../utils/useFetch';
import { Async, ConfirmDialog, Empty, Field, Modal, PageHeader, Pagination, StatusBadge } from '../components/ui';
import { useToast } from '../components/Toast';
import { money } from '../utils/format';

const EMPTY = { sku: '', name: '', category_id: '', description: '', cost_price: '', selling_price: '', stock_qty: '0', low_stock_threshold: '10' };

// Same rules as the backend (frontend gives quick feedback; backend is the real gatekeeper).
function validate(f, isNew) {
  const e = {};
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(f.sku.trim())) e.sku = 'Use letters, numbers, - and _ only (e.g. GRO-001).';
  if (f.name.trim().length < 2) e.name = 'Enter a product name (at least 2 characters).';
  if (!f.category_id) e.category_id = 'Choose a category.';
  const money2 = (v) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0 && Math.round(Number(v) * 100) / 100 === Number(v);
  if (!money2(f.cost_price)) e.cost_price = 'Enter a price of 0 or more, with at most 2 decimals.';
  if (!money2(f.selling_price)) e.selling_price = 'Enter a price of 0 or more, with at most 2 decimals.';
  if (money2(f.cost_price) && money2(f.selling_price) && Number(f.selling_price) < Number(f.cost_price)) e.selling_price = 'Selling price is below cost - you would lose money on each sale.';
  const whole = (v) => v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0;
  if (isNew && !whole(f.stock_qty)) e.stock_qty = 'Enter a whole number, 0 or more.';
  if (!whole(f.low_stock_threshold)) e.low_stock_threshold = 'Enter a whole number, 0 or more.';
  return e;
}

function ProductForm({ product, categories, onClose, onSaved }) {
  const isNew = !product;
  const toast = useToast();
  const [f, setF] = useState(product ? { ...EMPTY, ...product, description: product.description || '' } : EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const input = (k, props = {}) => <input id={`pf-${k}`} className={`form-control ${errors[k] ? 'is-invalid' : ''}`} value={f[k]} onChange={set(k)} aria-describedby={errors[k] ? `pf-${k}-err` : undefined} {...props} />;

  async function save() {
    const e = validate(f, isNew); setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const body = { sku: f.sku.trim(), name: f.name.trim(), category_id: Number(f.category_id), description: f.description.trim() || null,
      cost_price: Number(f.cost_price), selling_price: Number(f.selling_price), low_stock_threshold: Number(f.low_stock_threshold), ...(isNew ? { stock_qty: Number(f.stock_qty) } : {}) };
    try {
      if (isNew) await api.post('/products', body); else await api.put(`/products/${product.id}`, body);
      toast.success(isNew ? 'Product added.' : 'Product updated.');
      onSaved();
    } catch (err) {
      setErrors(err.details && !err.details.debug ? err.details : {});
      toast.error(err.message);
    } finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'Add product' : `Edit ${product.name}`} onClose={onClose} footer={<>
      <button className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancel</button>
      <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save product'}</button></>}>
      <div className="row">
        <div className="col-sm-5"><Field id="pf-sku" label="SKU" error={errors.sku}>{input('sku', { autoFocus: true, placeholder: 'GRO-001' })}</Field></div>
        <div className="col-sm-7"><Field id="pf-name" label="Product name" error={errors.name}>{input('name')}</Field></div>
      </div>
      <Field id="pf-category_id" label="Category" error={errors.category_id}>
        <select id="pf-category_id" className={`form-select ${errors.category_id ? 'is-invalid' : ''}`} value={f.category_id} onChange={set('category_id')}>
          <option value="">Select…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </Field>
      <div className="row">
        <div className="col-6"><Field id="pf-cost_price" label="Purchase cost (₹)" error={errors.cost_price}>{input('cost_price', { inputMode: 'decimal' })}</Field></div>
        <div className="col-6"><Field id="pf-selling_price" label="Selling price (₹)" error={errors.selling_price}>{input('selling_price', { inputMode: 'decimal' })}</Field></div>
        <div className="col-6"><Field id="pf-stock_qty" label="Opening stock" error={errors.stock_qty} hint={isNew ? undefined : 'Change stock from the Inventory page so it is recorded.'}>{input('stock_qty', { inputMode: 'numeric', disabled: !isNew })}</Field></div>
        <div className="col-6"><Field id="pf-low_stock_threshold" label="Low-stock threshold" error={errors.low_stock_threshold} hint="Alert when stock is at or below this.">{input('low_stock_threshold', { inputMode: 'numeric' })}</Field></div>
      </div>
      <Field id="pf-description" label="Description (optional)" error={errors.description}>
        <textarea id="pf-description" rows="2" maxLength="500" className="form-control" value={f.description} onChange={set('description')} /></Field>
    </Modal>
  );
}

export default function Products() {
  const toast = useToast();
  const [filters, setFilters] = useState({ search: '', category_id: '', status: '', active: '1', sort: 'name', order: 'asc', page: 1 });
  const [searchText, setSearchText] = useState('');
  const [editing, setEditing] = useState(null);       // null | 'new' | product
  const [archiving, setArchiving] = useState(null);
  const [busy, setBusy] = useState(false);
  const cats = useFetch('/categories');
  const state = useFetch('/products', { ...filters, limit: 10 });

  // Debounce the search box so we don't call the API on every keystroke.
  useEffect(() => { const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchText.trim(), page: 1 })), 350); return () => clearTimeout(t); }, [searchText]);
  const setF = (patch) => setFilters((f) => ({ ...f, ...patch, page: patch.page || 1 }));

  async function archive() {
    setBusy(true);
    try { await api.del(`/products/${archiving.id}`); toast.success(`${archiving.name} archived.`); setArchiving(null); state.reload(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function restore(p) {
    try { await api.patch(`/products/${p.id}/restore`); toast.success(`${p.name} restored.`); state.reload(); } catch (e) { toast.error(e.message); }
  }

  return (
    <>
      <PageHeader title="Products" subtitle="Add, edit and archive the items you sell.">
        <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={!cats.data}>Add product</button>
      </PageHeader>
      <div className="panel">
        <div className="panel-body border-bottom">
          <div className="row g-2">
            <div className="col-md-4"><label className="form-label small mb-0" htmlFor="f-search">Search name or SKU</label>
              <input id="f-search" className="form-control form-control-sm" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="e.g. tea or BEV-001" /></div>
            <div className="col-6 col-md-2"><label className="form-label small mb-0" htmlFor="f-cat">Category</label>
              <select id="f-cat" className="form-select form-select-sm" value={filters.category_id} onChange={(e) => setF({ category_id: e.target.value })}><option value="">All</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div className="col-6 col-md-2"><label className="form-label small mb-0" htmlFor="f-status">Stock status</label>
              <select id="f-status" className="form-select form-select-sm" value={filters.status} onChange={(e) => setF({ status: e.target.value })}>
                <option value="">All</option><option value="in_stock">In stock</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option></select></div>
            <div className="col-6 col-md-2"><label className="form-label small mb-0" htmlFor="f-sort">Sort by</label>
              <select id="f-sort" className="form-select form-select-sm" value={`${filters.sort}:${filters.order}`} onChange={(e) => { const [sort, order] = e.target.value.split(':'); setF({ sort, order }); }}>
                <option value="name:asc">Name A–Z</option><option value="name:desc">Name Z–A</option><option value="price:asc">Price low–high</option><option value="price:desc">Price high–low</option><option value="stock:asc">Stock low–high</option><option value="stock:desc">Stock high–low</option></select></div>
            <div className="col-6 col-md-2"><label className="form-label small mb-0" htmlFor="f-active">Show</label>
              <select id="f-active" className="form-select form-select-sm" value={filters.active} onChange={(e) => setF({ active: e.target.value })}><option value="1">Active</option><option value="0">Archived</option><option value="all">All</option></select></div>
          </div>
        </div>
        <Async state={state} isEmpty={(d) => d.length === 0}
          empty={<Empty title="No products match">{filters.search || filters.category_id || filters.status ? 'Try clearing a filter.' : 'Add your first product to get started.'}</Empty>}>
          {(rows) => (
            <div className="table-wrap"><table className="table align-middle">
              <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th className="num">Cost</th><th className="num">Price</th><th className="num">Stock</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
              <tbody>{rows.map((p) => (
                <tr key={p.id} className={p.is_active ? '' : 'text-secondary'}>
                  <td>{p.sku}</td><td>{p.name}</td><td>{p.category}</td><td className="num">{money(p.cost_price)}</td><td className="num">{money(p.selling_price)}</td>
                  <td className="num">{p.stock_qty}</td><td>{p.is_active ? <StatusBadge status={p.stock_status} /> : <StatusBadge status="archived" />}</td>
                  <td className="text-end text-nowrap">
                    {p.is_active ? <>
                      <button className="btn btn-sm btn-outline-primary me-1" onClick={() => setEditing(p)}>Edit</button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => setArchiving(p)}>Archive</button></>
                      : <button className="btn btn-sm btn-outline-primary" onClick={() => restore(p)}>Restore</button>}
                  </td></tr>))}</tbody></table></div>)}
        </Async>
        <Pagination meta={state.meta} onPage={(page) => setF({ page })} />
      </div>
      {editing && cats.data && <ProductForm product={editing === 'new' ? null : editing} categories={cats.data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); state.reload(); }} />}
      {archiving && <ConfirmDialog title="Archive product?" danger confirmText="Archive" busy={busy} onClose={() => setArchiving(null)} onConfirm={archive}
        message={`${archiving.name} will be hidden from sales and lists. Past sales keep their details, and you can restore it later.`} />}
    </>
  );
}
