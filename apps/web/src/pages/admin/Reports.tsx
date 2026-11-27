/**
 * ==============================================================================
 * INSIGHTS · REPORTS (Reports.tsx)
 * ==============================================================================
 * Read-only reporting over the endpoints that already exist:
 *   GET /api/reports/sales             revenue, bills, by-day, by-category, by-payment
 *   GET /api/reports/category-products line-level product sales
 *   GET /api/reports/inventory         stock by category and low-stock groups
 *   GET /api/reports/customers         new / repeat / total and repeat rate
 *
 * Rules this screen follows:
 * - Every number comes from the API. Nothing is estimated in the browser.
 * - Cost, margin and acquisition value are only present when the signed-in role
 *   holds finance.view. When the API withholds them the tiles are hidden rather
 *   than rendered as zero.
 * - The jewellery-era gold-weight columns are deliberately not surfaced: this
 *   is a generic ERP now, and those fields are legacy.
 * ==============================================================================
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CalendarRange,
  Download,
  Loader2,
  PackageSearch,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import { api } from '../../lib/api';
import { cn, formatInr } from '../../lib/utils';
import PageHeader from '../../components/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { downloadCsv, fileStamp, type CsvColumn } from '../../lib/export';
import { Kpi } from './crm/crmUi';
import { DataRegion, EmptyState } from '../../components/feedback/DataState';
import { useBranding } from '../../hooks/branding';

/* ── Range control ─────────────────────────────────────────────────────────── */

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: '3m', label: 'Last 90 days' },
  { value: '6m', label: 'Last 180 days' },
  { value: '1y', label: 'Last 365 days' },
  { value: 'custom', label: 'Custom range…' },
] as const;

type Preset = (typeof PRESETS)[number]['value'];

const CHART_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#e11d48', '#0284c7', '#64748b', '#0d9488'];

const inrCompact = (value: number) => {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (Math.abs(n) >= 1_000) return `₹${(n / 1_000).toFixed(0)}k`;
  return `₹${n.toFixed(0)}`;
};

const shortDay = (iso: string) => {
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const longDay = (iso: string) => {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/* ── Small presentational helpers ──────────────────────────────────────────── */

function ChartCard({
  title,
  description,
  action,
  children,
  empty,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  empty?: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 p-5">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
        </div>
        {action}
      </header>
      <div className="p-5">
        {empty ? (
          <EmptyState title="No data for this period" description="Try another date range. No sample or estimated figures are included." />
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function DataTable({
  headers,
  children,
  empty,
  label = 'Report data',
}: {
  headers: React.ReactNode;
  children: React.ReactNode;
  empty: boolean;
  label?: string;
}) {
  if (empty) {
    return (
      <div className="py-12 text-center">
        <PackageSearch className="mx-auto h-7 w-7 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-600">No rows for this range.</p>
      </div>
    );
  }
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="erp-register">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs text-slate-600">
            {headers}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

type Tab = 'sales' | 'products' | 'inventory' | 'customers';

const TABS: Array<{ key: Tab; label: string; description: string; icon: typeof TrendingUp }> = [
  { key: 'sales', label: 'Sales', description: 'Revenue and payments', icon: TrendingUp },
  { key: 'products', label: 'Products', description: 'Item-level sales detail', icon: ReceiptText },
  { key: 'inventory', label: 'Inventory', description: 'Current stock position', icon: Boxes },
  { key: 'customers', label: 'Customers', description: 'New and repeat buyers', icon: UsersRound },
];

export default function Reports() {
  const { brand } = useBranding();
  const [tab, setTab] = useState<Tab>('sales');
  const [preset, setPreset] = useState<Preset>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [appliedProductQuery, setAppliedProductQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  // `preset=custom` is a UI concept; the API takes explicit from/to instead.
  const rangeParams = useMemo(() => {
    if (preset === 'custom') {
      if (!from || !to) return '';
      return `from=${from}&to=${to}`;
    }
    return `preset=${preset}`;
  }, [preset, from, to]);

  const rangeReady = preset !== 'custom' || (!!from && !!to && from <= to);
  const reportReady = tab === 'inventory' || rangeReady;

  const sales = useQuery({
    queryKey: ['report-sales', rangeParams],
    queryFn: () => api.get(`/reports/sales?${rangeParams}`),
    enabled: rangeReady && tab === 'sales',
  });

  const products = useQuery({
    queryKey: ['report-products', rangeParams, appliedProductQuery],
    queryFn: () =>
      api.get(
        `/reports/category-products?${rangeParams}${appliedProductQuery ? `&q=${encodeURIComponent(appliedProductQuery)}` : ''}`,
      ),
    enabled: rangeReady && tab === 'products',
  });

  const inventory = useQuery({
    queryKey: ['report-inventory'],
    queryFn: () => api.get('/reports/inventory'),
    enabled: tab === 'inventory',
  });

  const customers = useQuery({
    queryKey: ['report-customers', rangeParams],
    queryFn: () => api.get(`/reports/customers?${rangeParams}`),
    enabled: rangeReady && tab === 'customers',
  });

  const activeQuery = tab === 'sales' ? sales : tab === 'products' ? products : tab === 'inventory' ? inventory : customers;

  const s = sales.data?.data;
  const p = products.data;
  const inv = inventory.data?.data;
  const c = customers.data?.data;

  // Acquisition value is stripped for roles without finance.view. Decide once
  // so the header and every row agree on whether the column exists.
  const showAcquisition = (inv?.byCat || []).some((row: any) => row.acq_inr != null);

  const salesByDay = useMemo(
    () =>
      (s?.byDay || []).map((row: any) => ({
        day: shortDay(row.d),
        bills: Number(row.bills || 0),
        revenue: Number(row.revenue || 0),
      })),
    [s],
  );

  const salesByCategory = useMemo(
    () =>
      (s?.byCat || [])
        .map((row: any) => ({
          category: row.category || 'Uncategorised',
          pieces: Number(row.pieces || 0),
          revenue: Number(row.revenue || 0),
        }))
        .sort((a: any, b: any) => b.revenue - a.revenue),
    [s],
  );

  const salesByPayment = useMemo(
    () =>
      (s?.byPay || []).map((row: any) => ({
        method: row.method || 'unknown',
        total: Number(row.total || 0),
      })),
    [s],
  );

  const refresh = () => { if (reportReady) void activeQuery.refetch(); };

  /* ── Export: always the visible tab's primary table ─────────────────────── */

  const exportCsv = async () => {
    if (!reportReady || !activeQuery.data || activeQuery.isFetching || activeQuery.isError) return;
    setExportError('');
    setExporting(true);
    try {
      if (tab === 'sales') {
        const columns: CsvColumn<any>[] = [
          { header: 'Date', value: (r) => r.d },
          { header: 'Bills', value: (r) => r.bills },
          { header: 'Revenue (INR)', value: (r) => Number(r.revenue || 0).toFixed(2) },
        ];
        downloadCsv(`sales-by-day-${fileStamp()}`, columns, s?.byDay || []);
      } else if (tab === 'products') {
        const columns: CsvColumn<any>[] = [
          { header: 'Invoice', value: (r) => r.invoice_no },
          { header: 'Sold at', value: (r) => String(r.sold_at || '').slice(0, 10) },
          { header: 'Product', value: (r) => r.name },
          { header: 'SKU', value: (r) => r.sku || '' },
          { header: 'Category', value: (r) => r.category_name || '' },
          { header: 'Line total (INR)', value: (r) => Number(r.line_total_inr || 0).toFixed(2) },
          { header: 'Customer', value: (r) => r.customer_name || '' },
          { header: 'Phone', value: (r) => r.customer_phone || '' },
          { header: 'Payment methods', value: (r) => r.payment_methods || '' },
        ];
        downloadCsv(`product-sales-${fileStamp()}`, columns, p?.data || []);
      } else if (tab === 'inventory') {
        const columns: CsvColumn<any>[] = [
          { header: 'Category', value: (r) => r.category || 'Uncategorised' },
          { header: 'Pieces available', value: (r) => r.pieces },
        ];
        downloadCsv(`inventory-by-category-${fileStamp()}`, columns, inv?.byCat || []);
      } else {
        downloadCsv(
          `customer-report-${fileStamp()}`,
          [
            { header: 'Metric', value: (r: any) => r.metric },
            { header: 'Value', value: (r: any) => r.value },
          ],
          [
            { metric: 'Total customers', value: c?.total ?? 0 },
            { metric: 'New in range', value: c?.new_customers ?? 0 },
            { metric: 'Repeat customers', value: c?.repeat_customers ?? 0 },
            { metric: 'Repeat rate (%)', value: ((Number(c?.repeat_rate) || 0) * 100).toFixed(1) },
          ],
        );
      }
    } catch (e: any) {
      setExportError(`Export failed: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const rangeLabel =
    preset === 'custom'
      ? from && to
        ? `${longDay(from)} – ${longDay(to)}`
        : 'Pick both dates'
      : PRESETS.find((entry) => entry.value === preset)?.label || '';

  return (
    <div className="erp-page">
      <PageHeader
        eyebrow="Insights"
        meta={tab === 'inventory' ? 'Current snapshot' : rangeLabel}
        title="Reports"
        description="Understand sales performance, stock availability and customer activity with reports from your business records."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={refresh} disabled={!reportReady || activeQuery.isFetching}>
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${activeQuery.isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </span>
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={exportCsv}
              title={tab === 'sales' ? 'Daily sales totals for the selected period' : tab === 'products' ? 'The returned product sales lines, capped at 300' : tab === 'inventory' ? 'Current category stock quantities' : 'Customer summary metrics'}
              disabled={exporting || !reportReady || !activeQuery.data || activeQuery.isFetching || activeQuery.isError}
            >
              <span className="inline-flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />
                {exporting ? 'Exporting…' : 'Export report CSV'}
              </span>
            </button>
          </>
        }
      />

      {exportError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{exportError}</p>}

      <nav aria-label="Report categories" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.key;
          return <button key={entry.key} type="button" aria-pressed={active} onClick={() => { setTab(entry.key); setExportError(''); }} className={cn('flex min-w-0 items-start gap-3 rounded-xl border p-4 text-left transition-colors', active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-surface text-ink-secondary hover:border-slate-400')}><Icon size={20} aria-hidden="true" className="mt-0.5 shrink-0" /><span className="min-w-0"><span className="block text-sm font-semibold">{entry.label}</span><span className="mt-1 hidden text-xs text-ink-muted sm:block">{entry.description}</span></span></button>;
        })}
      </nav>

      <section aria-label="Report filters" className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 lg:flex-row lg:items-end lg:justify-between">
        {tab === 'inventory' ? <div><h2 className="text-sm font-semibold text-ink">Current inventory snapshot</h2><p className="mt-1 text-sm text-ink-muted">Stock quantities reflect the last refresh, not a historical date range.</p></div> :
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[190px]">
            <label className="lbl" htmlFor="report-period">Reporting period</label>
            <select id="report-period" value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
              {PRESETS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
          {preset === 'custom' && (
            <>
              <div>
                <label className="lbl" htmlFor="report-from">From</label>
                <input id="report-from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="lbl" htmlFor="report-to">To</label>
                <input id="report-to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          {preset === 'custom' && !rangeReady && (
            <span role="status" className="pb-2 text-sm font-medium text-amber-800">{from && to && from > to ? 'The end date must be on or after the start date.' : 'Pick both dates to run the report.'}</span>
          )}
        </div>}
        <div className="text-xs leading-5 text-ink-muted"><p>{activeQuery.dataUpdatedAt ? `Updated ${new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: brand.timezone || 'Asia/Kolkata' }).format(activeQuery.dataUpdatedAt)}` : 'Not yet generated'}</p><p>{tab === 'products' ? 'Export includes up to 300 returned lines.' : tab === 'sales' ? 'Export includes daily totals for this period.' : tab === 'inventory' ? 'Export includes current category quantities.' : 'Export includes customer summary metrics.'}</p></div>
      </section>

      {!reportReady && (
        <section aria-label="Report waiting for dates" className="rounded-xl border border-line bg-surface">
          <EmptyState title="Choose a start and end date" description="Reports only run for a complete date range. Nothing is estimated while the dates are missing or reversed." />
        </section>
      )}

      {reportReady && <DataRegion className="space-y-6" query={activeQuery} empty={!activeQuery.data} emptyTitle="No report available" emptyDescription="Try refreshing this report.">

      {/* ── Sales ─────────────────────────────────────────────────────────── */}
      {tab === 'sales' && s && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Revenue" value={formatInr(s.revenue)} hint={`${s.bill_count} finalized bills`} icon={TrendingUp} tone="brand" />
            <Kpi
              label="Average bill"
              value={formatInr(s.avg_bill)}
              hint={s.bill_count ? 'Revenue ÷ bills' : 'No bills in range'}
              icon={ReceiptText}
              tone="violet"
            />
            <Kpi
              label="Unique customers"
              value={s.unique_customers}
              hint="Distinct buyers who appear on a bill"
              icon={UsersRound}
              tone="sky"
            />
            <Kpi
              label="Items sold"
              value={s.items_sold}
               hint="Quantities across finalized bills"
              icon={Boxes}
              tone="amber"
            />
          </div>

          <ChartCard
            title="Revenue by day"
            description="Finalized bills only. Drafts and voids are excluded."
            empty={!salesByDay.length}
            action={
              s.gross_profit_estimate != null ? (
                <Badge variant="success">Gross profit est. {formatInr(s.gross_profit_estimate)}</Badge>
              ) : (
                 <Badge variant="secondary">Cost details restricted</Badge>
              )
            }
          >
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesByDay} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={(value) => inrCompact(Number(value))}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickLine={false}
                    axisLine={false}
                    width={62}
                  />
                  <Tooltip
                    formatter={(value: any, name: any) =>
                      name === 'revenue' ? [formatInr(Number(value)), 'Revenue'] : [value, 'Bills']
                    }
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} fill="url(#revenueFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <details className="mt-4 border-t border-line pt-4"><summary className="text-sm font-medium text-brand-700">View daily sales data</summary><div className="mt-4"><DataTable label="Daily sales totals" empty={!s.byDay?.length} headers={<><th scope="col">Date</th><th scope="col" className="text-right">Bills</th><th scope="col" className="text-right">Revenue</th></>}>{(s.byDay || []).map((row: any) => <tr key={row.d}><td>{shortDay(row.d)}</td><td className="text-right tabular-nums">{row.bills}</td><td className="text-right tabular-nums">{formatInr(row.revenue)}</td></tr>)}</DataTable></div></details>
          </ChartCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Revenue by category" description="Where the money came from." empty={!salesByCategory.length}>
              <div className="h-[260px] w-full" role="img" aria-label="Revenue by category chart. Exact figures are in the Category detail table below.">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesByCategory} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="category" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={(value) => inrCompact(Number(value))}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={false}
                      width={62}
                    />
                    <Tooltip
                      formatter={(value: any) => [formatInr(Number(value)), 'Revenue']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Bar dataKey="revenue" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Payment mix" description="How bills were settled." empty={!salesByPayment.length}>
              <div className="h-[260px] w-full" role="img" aria-label="Payment mix chart. Exact totals are in the payment data below.">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={salesByPayment}
                      dataKey="total"
                      nameKey="method"
                      innerRadius={54}
                      outerRadius={88}
                      paddingAngle={2}
                    >
                      {salesByPayment.map((entry: any, index: number) => (
                        <Cell key={entry.method} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any) => formatInr(Number(value))}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <details className="mt-4 border-t border-line pt-4"><summary className="text-sm font-medium text-brand-700">View payment data</summary><div className="mt-4"><DataTable label="Payment totals" empty={!salesByPayment.length} headers={<><th scope="col">Method</th><th scope="col" className="text-right">Total</th></>}>{salesByPayment.map((row: any) => <tr key={row.method}><td>{row.method}</td><td className="text-right tabular-nums">{formatInr(row.total)}</td></tr>)}</DataTable></div></details>
            </ChartCard>
          </div>

          <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <header className="border-b border-slate-100 p-5">
              <h2 className="text-sm font-bold text-slate-900">Category detail</h2>
              <p className="mt-0.5 text-xs text-slate-500">Pieces and revenue per category for the selected period.</p>
            </header>
            <div className="p-5">
              <DataTable
                label="Sales by category"
                empty={!salesByCategory.length}
                headers={
                  <>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2 text-right">Pieces</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">Share</th>
                  </>
                }
              >
                {salesByCategory.map((row: any) => {
                  const share = s.revenue ? (row.revenue / s.revenue) * 100 : 0;
                  return (
                    <tr key={row.category} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-medium text-slate-900">{row.category}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{row.pieces}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                        {formatInr(row.revenue)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{share.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </DataTable>
            </div>
          </section>
        </>
      )}

      {/* ── Products ──────────────────────────────────────────────────────── */}
      {tab === 'products' && p && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Sale lines" value={p.summary?.pieces ?? 0} hint="Capped at the 300 most recent lines" icon={ReceiptText} tone="brand" />
            <Kpi label="Line revenue" value={formatInr(p.summary?.revenue)} hint="Sum of the visible lines" icon={TrendingUp} tone="violet" />
            <Kpi label="Customers" value={p.summary?.customers ?? 0} hint="Distinct buyers in these lines" icon={UsersRound} tone="sky" />
            <Kpi
              label="Last sold"
              value={p.summary?.last_sold_at ? String(p.summary.last_sold_at).slice(0, 10) : '—'}
              hint="Most recent line in this range"
              icon={CalendarRange}
              tone="emerald"
            />
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 basis-64 flex-1">
                <label className="lbl" htmlFor="report-product-search">Search lines</label>
                <input
                  id="report-product-search"
                  placeholder="Product name, SKU, design code or invoice number"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setAppliedProductQuery(productQuery.trim());
                    }
                  }}
                />
              </div>
              <button type="button" className="btn primary" onClick={() => setAppliedProductQuery(productQuery.trim())}>
                Search
              </button>
              {appliedProductQuery && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setProductQuery('');
                    setAppliedProductQuery('');
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <header className="border-b border-slate-100 p-5">
              <h2 className="text-sm font-bold text-slate-900">Product sales lines</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Finalized bills in the selected period. The API returns the 300 most recent lines.
              </p>
            </header>
            <div className="p-5">
              <DataTable
                label="Product sales lines"
                empty={!(p.data || []).length}
                headers={
                  <>
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Payment</th>
                    <th className="px-3 py-2 text-right">Line total</th>
                  </>
                }
              >
                {(p.data || []).map((row: any) => (
                  <tr key={row.sale_item_id} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">{row.invoice_no}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{String(row.sold_at || '').slice(0, 10)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{row.name}</div>
                      <div className="text-[11px] text-slate-500">{row.sku || row.design_code || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{row.category_name || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="text-slate-800">{row.customer_name || 'Walk-in'}</div>
                      <div className="text-[11px] text-slate-500">{row.customer_phone || '—'}</div>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-600">{row.payment_methods || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                      {formatInr(Number(row.line_total_inr || 0))}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </section>
        </>
      )}

      {/* ── Inventory ─────────────────────────────────────────────────────── */}
      {tab === 'inventory' && inv && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Kpi label="Categories" value={(inv.byCat || []).length} hint="Groups holding available stock" icon={Boxes} tone="brand" />
            <Kpi
              label="Pieces available"
              value={(inv.byCat || []).reduce((sum: number, row: any) => sum + Number(row.pieces || 0), 0)}
              hint="Status = available only"
              icon={PackageSearch}
              tone="emerald"
            />
            <Kpi
              label="Low-stock groups"
              value={(inv.low_stock || []).length}
              hint="Fewer than 5 pieces available"
              icon={AlertTriangle}
              tone={(inv.low_stock || []).length ? 'amber' : 'emerald'}
            />
          </div>

          {(inv.low_stock || []).length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-900">Low stock:</span>
              {(inv.low_stock || []).map((row: any) => (
                <Badge key={row.category || '—'} variant="warning">
                  {row.category || 'Uncategorised'} · {row.n}
                </Badge>
              ))}
            </div>
          )}

          <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <header className="flex items-start justify-between gap-2 border-b border-slate-100 p-5">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Stock by category</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Snapshot of what is available now. This report is not affected by the date range.
                </p>
              </div>
              {!showAcquisition && <Badge variant="secondary">Acquisition value hidden</Badge>}
            </header>
            <div className="p-5">
              <DataTable
                label="Stock by category"
                empty={!(inv.byCat || []).length}
                headers={
                  <>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2 text-right">Pieces</th>
                    {showAcquisition && <th className="px-3 py-2 text-right">Acquisition value</th>}
                  </>
                }
              >
                {(inv.byCat || []).map((row: any) => (
                  <tr key={row.category || '—'} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-900">{row.category || 'Uncategorised'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{row.pieces}</td>
                    {showAcquisition && (
                      <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                        {formatInr(Number(row.acq_inr || 0))}
                      </td>
                    )}
                  </tr>
                ))}
              </DataTable>
            </div>
          </section>
        </>
      )}

      {/* ── Customers ─────────────────────────────────────────────────────── */}
      {tab === 'customers' && c && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Total customers" value={c.total} hint="All profiles on this company" icon={UsersRound} tone="brand" />
            <Kpi label="New in range" value={c.new_customers} hint="Created inside the selected dates" icon={TrendingUp} tone="emerald" />
            <Kpi label="Repeat buyers" value={c.repeat_customers} hint="Two or more finalized bills" icon={RefreshCw} tone="violet" />
            <Kpi
              label="Repeat rate"
              value={`${((Number(c.repeat_rate) || 0) * 100).toFixed(1)}%`}
              hint="Repeat ÷ total customers"
              icon={BarChart3}
              tone="amber"
            />
          </div>

          <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <header className="border-b border-slate-100 p-5">
              <h2 className="text-base font-semibold text-ink">Customer overview</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                New profiles in the period against the whole base. Repeat buyers are counted across all time, not just
                the selected range.
              </p>
            </header>
            <div className="p-5">
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { label: 'Total', value: Number(c.total || 0) },
                      { label: 'Repeat buyers', value: Number(c.repeat_customers || 0) },
                      { label: 'New in range', value: Number(c.new_customers || 0) },
                    ]}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {[0, 1, 2].map((index) => (
                        <Cell key={index} fill={CHART_COLORS[index]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </>
      )}
      </DataRegion>}
    </div>
  );
}
