// Chart.js setup + thin wrappers so pages stay short.
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { ArcElement, BarElement, CategoryScale, Chart, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { money, moneyShort } from '../utils/format';

Chart.register(ArcElement, BarElement, CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);
Chart.defaults.font.family = "'IBM Plex Sans', system-ui, sans-serif";
Chart.defaults.color = '#5d7076';

export const COLORS = { teal: '#0f6b73', turmeric: '#d99a00', slate: '#2f4b57' };
export const PALETTE = ['#0f6b73', '#d99a00', '#5b3f99', '#2b7a4b', '#c0562b', '#4a86a8', '#8a8f2a'];

const tooltipMoney = { callbacks: { label: (c) => ` ${c.dataset.label ? `${c.dataset.label}: ` : ''}${money(c.parsed.y ?? c.parsed.x ?? c.parsed)}` } };
const moneyAxis = { beginAtZero: true, grid: { color: '#e6ecec' }, ticks: { callback: (v) => moneyShort(v), maxTicksLimit: 6, maxRotation: 0 } };

// Revenue (bars) with gross profit (line) over time.
export function RevenueProfitChart({ labels, revenue, profit }) {
  return (
    <div className="chart-box">
      <Bar
        data={{ labels, datasets: [
          { type: 'bar', label: 'Revenue', data: revenue, backgroundColor: COLORS.teal, borderRadius: 3, order: 2 },
          { type: 'line', label: 'Gross profit', data: profit, borderColor: COLORS.turmeric, backgroundColor: COLORS.turmeric, tension: 0.25, pointRadius: 3, order: 1 },
        ] }}
        options={{ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'bottom' }, tooltip: tooltipMoney }, scales: { y: moneyAxis, x: { grid: { display: false } } } }}
      />
    </div>
  );
}

export function HorizontalBars({ labels, values, label = 'Revenue', color = COLORS.teal, money: isMoney = true }) {
  return (
    <div className="chart-box sm">
      <Bar data={{ labels, datasets: [{ label, data: values, backgroundColor: color, borderRadius: 3 }] }}
        options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: isMoney ? { callbacks: { label: (c) => ` ${money(c.parsed.x)}` } } : {} },
          scales: { x: isMoney ? moneyAxis : { beginAtZero: true, grid: { color: '#e6ecec' } }, y: { grid: { display: false } } } }} />
    </div>
  );
}

export function CategoryDoughnut({ labels, values }) {
  return (
    <div className="chart-box sm">
      <Doughnut data={{ labels, datasets: [{ data: values, backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff' }] }}
        options={{ responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${money(c.parsed)}` } } } }} />
    </div>
  );
}

export function TrendLine({ labels, values, label = 'Revenue' }) {
  return (
    <div className="chart-box">
      <Line data={{ labels, datasets: [{ label, data: values, borderColor: COLORS.teal, backgroundColor: '#0f6b7322', fill: true, tension: 0.25, pointRadius: labels.length > 45 ? 0 : 3 }] }}
        options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tooltipMoney }, scales: { y: moneyAxis, x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } } } }} />
    </div>
  );
}
