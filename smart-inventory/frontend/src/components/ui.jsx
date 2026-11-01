// Small reusable pieces. Each one takes props and renders markup - the React "components & props" pattern.
import { useEffect } from 'react';
import { number } from '../utils/format';

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="d-flex align-items-center justify-content-center gap-2 p-4 text-secondary" role="status">
      <div className="spinner-border spinner-border-sm" aria-hidden="true" /> <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="alert alert-danger d-flex justify-content-between align-items-center m-3" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn btn-sm btn-outline-danger" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, children }) {
  return <div className="empty"><strong>{title}</strong>{children}</div>;
}

// Renders loading / error / empty / content for a useFetch() result - the 4 states every screen must handle.
export function Async({ state, isEmpty, empty, children }) {
  if (state.loading && !state.data) return <Spinner />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (isEmpty?.(state.data)) return empty;
  return children(state.data);
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3">
      <div><h1 className="page-title">{title}</h1>{subtitle && <p className="page-sub">{subtitle}</p>}</div>
      <div className="d-flex flex-wrap gap-2 align-items-end">{children}</div>
    </div>
  );
}

export function KpiCard({ label, value, hint, accent }) {
  return (
    <div className={`panel kpi ${accent ? 'accent' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

const STATUS_TEXT = { in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
  INITIAL: 'Opening stock', RESTOCK: 'Restock', ADJUSTMENT: 'Adjustment', SALE: 'Sale', SALE_REVERSAL: 'Sale reversal', archived: 'Archived' };
export const StatusBadge = ({ status }) => <span className={`badge-status st-${status}`}>{STATUS_TEXT[status] || status}</span>;

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-x-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal-x ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-x-head"><h2 className="h5 m-0">{title}</h2><button className="btn-close" aria-label="Close" onClick={onClose} /></div>
        <div className="modal-x-body">{children}</div>
        {footer && <div className="modal-x-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmText = 'Confirm', danger, busy, onConfirm, onClose, children }) {
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>Cancel</button>
      <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmText}</button>
    </>}>
      <p className="mb-2">{message}</p>{children}
    </Modal>
  );
}

// Labelled form field with accessible error text.
export function Field({ id, label, error, hint, children }) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label mb-1">{label}</label>
      {children}
      {hint && !error && <div className="form-text">{hint}</div>}
      {error && <div className="invalid-feedback d-block" id={`${id}-err`}>{error}</div>}
    </div>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return meta ? <div className="px-3 py-2 text-secondary small">{number(meta.total)} result{meta.total === 1 ? '' : 's'}</div> : null;
  const { page, totalPages, total } = meta;
  return (
    <div className="d-flex justify-content-between align-items-center px-3 py-2 border-top flex-wrap gap-2">
      <span className="text-secondary small">{number(total)} results · page {page} of {totalPages}</span>
      <div className="btn-group btn-group-sm">
        <button className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button className="btn btn-outline-secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

// From/To date inputs + quick presets. Controlled component: parent owns the state.
export function DateRange({ from, to, onChange, presets = true }) {
  const iso = (off) => { const d = new Date(); d.setDate(d.getDate() - off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  return (
    <div className="d-flex flex-wrap gap-2 align-items-end">
      <div><label className="form-label small mb-0" htmlFor="dr-from">From</label><input id="dr-from" type="date" className="form-control form-control-sm" value={from} max={to || undefined} onChange={(e) => onChange({ from: e.target.value, to })} /></div>
      <div><label className="form-label small mb-0" htmlFor="dr-to">To</label><input id="dr-to" type="date" className="form-control form-control-sm" value={to} min={from || undefined} onChange={(e) => onChange({ from, to: e.target.value })} /></div>
      {presets && <div className="btn-group btn-group-sm" role="group" aria-label="Quick ranges">
        {[[7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']].map(([d, l]) => (
          <button key={d} className="btn btn-outline-secondary" onClick={() => onChange({ from: iso(d - 1), to: iso(0) })}>{l}</button>))}
      </div>}
    </div>
  );
}
