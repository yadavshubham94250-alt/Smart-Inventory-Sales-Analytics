import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFetch } from '../utils/useFetch';
import { Async, DateRange, Empty, KpiCard, PageHeader, StatusBadge } from '../components/ui';
import { CategoryDoughnut, HorizontalBars, RevenueProfitChart } from '../components/charts';
import { dateTime, isoDate, money, monthLabel, number, percent } from '../utils/format';

export default function Dashboard() {
  const [range, setRange] = useState({ from: isoDate(29), to: isoDate(0) });   // state drives the data below
  const state = useFetch('/analytics/dashboard', range);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Sales figures follow the selected dates. Stock figures are live.">
        <DateRange {...range} onChange={setRange} />
      </PageHeader>
      <Async state={state}>
        {({ kpis, monthly_trend, top_products, category_sales, recent_sales, low_stock }) => (
          <>
            <div className="row g-3 mb-3">
              <div className="col-6 col-lg-3"><KpiCard accent label="Revenue" value={money(kpis.revenue)} hint={`${number(kpis.orders)} completed sales`} /></div>
              <div className="col-6 col-lg-3"><KpiCard label="Gross profit" value={money(kpis.gross_profit)} hint={`Margin ${percent(kpis.gross_margin_pct)} · before expenses & tax`} /></div>
              <div className="col-6 col-lg-3"><KpiCard label="Average order value" value={money(kpis.avg_order_value)} hint={`${number(kpis.units)} units sold`} /></div>
              <div className="col-6 col-lg-3"><KpiCard label="Stock value (at cost)" value={money(kpis.stock_value)} hint="Current stock × purchase cost" /></div>
              <div className="col-6 col-lg-3"><KpiCard label="Products" value={number(kpis.total_products)} hint="Active products" /></div>
              <div className="col-6 col-lg-3"><KpiCard label="Units in stock" value={number(kpis.total_units)} /></div>
              <div className="col-6 col-lg-3"><KpiCard label="Low stock" value={number(kpis.low_stock_count)} hint="At or below threshold" /></div>
              <div className="col-6 col-lg-3"><KpiCard label="Out of stock" value={number(kpis.out_of_stock_count)} /></div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-lg-8">
                <div className="panel h-100"><div className="panel-head">Monthly sales trend <span className="fw-normal text-secondary small">last 6 months</span></div>
                  <div className="panel-body"><RevenueProfitChart labels={monthly_trend.map((m) => monthLabel(m.period))} revenue={monthly_trend.map((m) => m.revenue)} profit={monthly_trend.map((m) => m.gross_profit)} /></div></div>
              </div>
              <div className="col-lg-4">
                <div className="panel h-100"><div className="panel-head">Sales by category</div>
                  <div className="panel-body">{category_sales.length ? <CategoryDoughnut labels={category_sales.map((c) => c.category)} values={category_sales.map((c) => c.revenue)} /> : <Empty title="No sales in this period" />}</div></div>
              </div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-lg-6">
                <div className="panel h-100"><div className="panel-head">Top 5 products by revenue</div>
                  <div className="panel-body">{top_products.length ? <HorizontalBars labels={top_products.map((p) => p.name)} values={top_products.map((p) => p.revenue)} /> : <Empty title="No sales in this period" />}</div></div>
              </div>
              <div className="col-lg-6">
                <div className="panel h-100"><div className="panel-head">Low-stock alerts <Link to="/inventory" className="small fw-normal">Manage stock</Link></div>
                  {low_stock.length === 0 ? <Empty title="Nothing to restock">Every product is above its threshold.</Empty> : (
                    <div className="table-wrap"><table className="table align-middle"><thead><tr><th>Product</th><th>Status</th><th className="num">Stock</th><th className="num">Threshold</th></tr></thead>
                      <tbody>{low_stock.map((p) => (<tr key={p.product_id}><td>{p.name}<div className="small text-secondary">{p.sku}</div></td>
                        <td><StatusBadge status={p.status === 'Out of stock' ? 'out_of_stock' : 'low_stock'} /></td><td className="num">{p.stock_qty}</td><td className="num">{p.low_stock_threshold}</td></tr>))}</tbody></table></div>)}
                </div>
              </div>
            </div>

            <div className="panel"><div className="panel-head">Recent sales <Link to="/sales" className="small fw-normal">All sales</Link></div>
              {recent_sales.length === 0 ? <Empty title="No sales yet">Record your first sale from the Sales page.</Empty> : (
                <div className="table-wrap"><table className="table align-middle"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th className="num">Units</th><th className="num">Total</th><th>Status</th></tr></thead>
                  <tbody>{recent_sales.map((s) => (<tr key={s.id}><td>{s.invoice_no}</td><td className="text-nowrap">{dateTime(s.sold_at)}</td><td>{s.customer_name || <span className="text-secondary">Walk-in</span>}</td>
                    <td className="num">{s.units}</td><td className="num">{money(s.total_amount)}</td><td><StatusBadge status={s.status} /></td></tr>))}</tbody></table></div>)}
            </div>
          </>
        )}
      </Async>
    </>
  );
}
