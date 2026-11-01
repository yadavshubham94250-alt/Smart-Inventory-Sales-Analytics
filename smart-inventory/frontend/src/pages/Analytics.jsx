import { useState } from 'react';
import { useFetch } from '../utils/useFetch';
import { Async, DateRange, Empty, KpiCard, PageHeader } from '../components/ui';
import { HorizontalBars, TrendLine } from '../components/charts';
import { dateOnly, isoDate, money, monthLabel, number, percent } from '../utils/format';

const Panel = ({ title, note, children, right }) => (
  <div className="panel mb-3"><div className="panel-head"><span>{title} {note && <span className="fw-normal text-secondary small ms-1">{note}</span>}</span>{right}</div>{children}</div>
);
const Change = ({ v }) => v === null || v === undefined ? <span className="text-secondary" title="No sales in the earlier period, so a % change is undefined">n/a</span>
  : <span style={{ color: v > 0 ? 'var(--ok)' : v < 0 ? 'var(--bad)' : 'inherit', fontWeight: 500 }}>{v > 0 ? '+' : ''}{v.toFixed(2)}%</span>;

function TrendSection({ range }) {
  const [g, setG] = useState('daily');
  const state = useFetch('/analytics/sales-trend', { ...range, granularity: g });
  const label = (p) => (g === 'monthly' ? monthLabel(p) : dateOnly(p));
  return (
    <Panel title="Revenue trend" right={
      <div className="btn-group btn-group-sm" role="group" aria-label="Group by">{['daily', 'weekly', 'monthly'].map((x) => <button key={x} className={`btn ${g === x ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => setG(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}</div>}>
      <Async state={state} isEmpty={(d) => d.length === 0} empty={<Empty title="No sales in this period" />}>
        {(rows) => (<>
          <div className="panel-body"><TrendLine labels={rows.map((r) => label(r.period))} values={rows.map((r) => r.revenue)} /></div>
          <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}><table className="table table-sm align-middle"><thead><tr><th>{g === 'weekly' ? 'Week starting' : 'Period'}</th><th className="num">Orders</th><th className="num">Units</th><th className="num">Revenue</th><th className="num">Gross profit</th><th className="num">Margin</th></tr></thead>
            <tbody>{[...rows].reverse().map((r) => <tr key={r.period}><td>{label(r.period)}</td><td className="num">{r.orders}</td><td className="num">{r.units}</td><td className="num">{money(r.revenue)}</td><td className="num">{money(r.gross_profit)}</td><td className="num">{percent(r.gross_margin_pct)}</td></tr>)}</tbody></table></div></>)}
      </Async>
    </Panel>
  );
}

function CompareSection() {
  const [a, setA] = useState({ from: isoDate(29), to: isoDate(0) });
  const [b, setB] = useState({ from: isoDate(59), to: isoDate(30) });
  const ready = a.from && a.to && b.from && b.to && a.from <= a.to && b.from <= b.to;
  const state = useFetch(ready ? '/analytics/compare' : null, { from_a: a.from, to_a: a.to, from_b: b.from, to_b: b.to });
  const rows = state.data && [['Revenue', 'revenue', money], ['Gross profit', 'gross_profit', money], ['Completed sales', 'orders', number], ['Units sold', 'units', number], ['Average order value', 'avg_order_value', money]];
  return (
    <Panel title="Compare two periods" note="Period A is measured against period B">
      <div className="panel-body border-bottom d-flex flex-wrap gap-4">
        <div><div className="small fw-medium mb-1">Period A</div><DateRange {...a} onChange={setA} presets={false} /></div>
        <div><div className="small fw-medium mb-1">Period B</div><DateRange {...b} onChange={setB} presets={false} /></div>
      </div>
      {!ready ? <Empty title="Choose both periods">Each period needs a start date on or before its end date.</Empty> : (
        <Async state={state}>{() => (
          <div className="table-wrap"><table className="table align-middle"><thead><tr><th>Measure</th><th className="num">Period A</th><th className="num">Period B</th><th className="num">Change</th></tr></thead>
            <tbody>{rows.map(([l, k, fmt]) => <tr key={k}><td>{l}</td><td className="num">{fmt(state.data.period_a[k])}</td><td className="num">{fmt(state.data.period_b[k])}</td><td className="num"><Change v={state.data.change_pct_a_vs_b[k]} /></td></tr>)}
              <tr><td>Gross margin</td><td className="num">{percent(state.data.period_a.gross_margin_pct)}</td><td className="num">{percent(state.data.period_b.gross_margin_pct)}</td>
                <td className="num">{state.data.change_pct_a_vs_b.gross_margin_pct_points > 0 ? '+' : ''}{state.data.change_pct_a_vs_b.gross_margin_pct_points.toFixed(2)} pts</td></tr></tbody></table></div>)}</Async>)}
    </Panel>
  );
}

function ProductSection({ range }) {
  const [sort, setSort] = useState('revenue');
  const state = useFetch('/analytics/products', { ...range, sort, limit: 10, only_sold: 1 });
  return (
    <Panel title="Top products" right={<select aria-label="Rank products by" className="form-select form-select-sm w-auto" value={sort} onChange={(e) => setSort(e.target.value)}><option value="revenue">By revenue</option><option value="units">By units sold</option><option value="profit">By gross profit</option></select>}>
      <Async state={state} isEmpty={(d) => d.length === 0} empty={<Empty title="No sales in this period" />}>
        {(rows) => (<>
          <div className="panel-body"><HorizontalBars labels={rows.map((r) => r.name)} values={rows.map((r) => (sort === 'units' ? r.units_sold : sort === 'profit' ? r.gross_profit : r.revenue))}
            label={sort} money={sort !== 'units'} color={sort === 'profit' ? '#d99a00' : '#0f6b73'} /></div>
          <div className="table-wrap"><table className="table table-sm align-middle"><thead><tr><th>Product</th><th>Category</th><th className="num">Units</th><th className="num">Revenue</th><th className="num">Gross profit</th><th className="num">Margin</th><th className="num">Revenue share</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.product_id}><td>{r.name}</td><td>{r.category}</td><td className="num">{r.units_sold}</td><td className="num">{money(r.revenue)}</td><td className="num">{money(r.gross_profit)}</td><td className="num">{percent(r.gross_margin_pct)}</td><td className="num">{percent(r.revenue_share_pct)}</td></tr>)}</tbody></table></div></>)}
      </Async>
    </Panel>
  );
}

function CategorySection({ range }) {
  const state = useFetch('/analytics/categories', range);
  return (
    <Panel title="Category comparison">
      <Async state={state} isEmpty={(d) => d.every((c) => c.revenue === 0)} empty={<Empty title="No sales in this period" />}>
        {(rows) => (<div className="table-wrap"><table className="table table-sm align-middle"><thead><tr><th>Category</th><th className="num">Units</th><th className="num">Revenue</th><th className="num">Cost of goods</th><th className="num">Gross profit</th><th className="num">Margin</th></tr></thead>
          <tbody>{rows.map((c) => <tr key={c.category_id}><td>{c.category}</td><td className="num">{c.units_sold}</td><td className="num">{money(c.revenue)}</td><td className="num">{money(c.cogs)}</td><td className="num">{money(c.gross_profit)}</td><td className="num">{percent(c.gross_margin_pct)}</td></tr>)}</tbody></table></div>)}
      </Async>
    </Panel>
  );
}

function SlowSection() {
  const [days, setDays] = useState(30);
  const state = useFetch('/analytics/slow-moving', { days });
  return (
    <Panel title="Slow-moving stock" note={`In stock, but nothing sold in the last ${days} days`}
      right={<select aria-label="Look-back period" className="form-select form-select-sm w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[15, 30, 60, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}</select>}>
      <Async state={state} isEmpty={(d) => d.length === 0} empty={<Empty title="No slow-moving products">Everything in stock has sold recently.</Empty>}>
        {(rows) => (<div className="table-wrap"><table className="table table-sm align-middle"><thead><tr><th>Product</th><th>Category</th><th className="num">Stock</th><th className="num">Money tied up (at cost)</th><th>Last sold</th><th className="num">Days since</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.product_id}><td>{r.name}<div className="small text-secondary">{r.sku}</div></td><td>{r.category}</td><td className="num">{r.stock_qty}</td><td className="num">{money(r.stock_value)}</td><td>{r.last_sold_at ? dateOnly(r.last_sold_at) : 'Never'}</td><td className="num">{r.days_since_last_sale ?? '-'}</td></tr>)}</tbody></table></div>)}
      </Async>
    </Panel>
  );
}

export default function Analytics() {
  const [range, setRange] = useState({ from: isoDate(89), to: isoDate(0) });
  const summary = useFetch('/analytics/summary', range);
  return (
    <>
      <PageHeader title="Analytics" subtitle="Revenue, gross profit and stock insights for the selected dates."><DateRange {...range} onChange={setRange} /></PageHeader>
      <Async state={summary}>{({ kpis, best_months, best_weekdays, best_days }) => (
        <>
          <div className="row g-3 mb-3">
            <div className="col-6 col-lg-3"><KpiCard accent label="Revenue" value={money(kpis.revenue)} hint="Quantity × selling price" /></div>
            <div className="col-6 col-lg-3"><KpiCard label="Gross profit" value={money(kpis.gross_profit)} hint="Revenue − cost of goods sold" /></div>
            <div className="col-6 col-lg-3"><KpiCard label="Gross margin" value={percent(kpis.gross_margin_pct)} hint="Gross profit ÷ revenue" /></div>
            <div className="col-6 col-lg-3"><KpiCard label="Average order value" value={money(kpis.avg_order_value)} hint={`${number(kpis.orders)} sales · ${number(kpis.units)} units`} /></div>
          </div>
          <TrendSection range={range} />
          <div className="row g-3">
            {[['Best months', best_months, 'month'], ['Best weekdays', best_weekdays, 'weekday'], ['Best days', best_days, 'day']].map(([t, rows, k]) => (
              <div className="col-lg-4" key={t}><Panel title={t}>{rows.length === 0 ? <Empty title="No sales" /> : <table className="table table-sm align-middle"><tbody>{rows.map((r) => <tr key={r[k]}><td>{k === 'month' ? monthLabel(r[k]) : k === 'day' ? dateOnly(r[k]) : r[k]}</td><td className="num">{money(r.revenue)}</td></tr>)}</tbody></table>}</Panel></div>))}
          </div>
        </>)}</Async>
      <CompareSection />
      <ProductSection range={range} />
      <CategorySection range={range} />
      <SlowSection />
      <p className="text-secondary small">Gross profit is revenue minus the purchase cost of the goods sold. It is not net profit: rent, wages, other expenses and tax are not included. Cancelled sales are excluded from every figure.</p>
    </>
  );
}
