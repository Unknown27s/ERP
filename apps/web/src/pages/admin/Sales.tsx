import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatInr } from '../../lib/utils';
import { useAuth } from '../../hooks/auth';
import InvoiceModal from '../../components/InvoiceModal';
import { ModulePage, Panel, Field, Register, QueryState, useOperation } from '../../components/OperationalUi';
type Line = { product_id: string; quantity: string; discount_inr: string };
export default function Sales() {
  const { can } = useAuth();
  const manage = can('crm.manage') || can('finance.manage');
  const qc = useQueryClient();
  const op = useOperation();
  const [customer, setCustomer] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [lines, setLines] = useState<Line[]>([{ product_id: '', quantity: '1', discount_inr: '0' }]);
  const [draft, setDraft] = useState<any>(null);
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const sales = useQuery({ queryKey: ['sales', page], queryFn: () => api.get(`/sales?page=${page}&limit=20`) });
  const products = useQuery({ queryKey: ['sale-products', search], queryFn: () => api.get(`/products?status=all&limit=200&q=${encodeURIComponent(search)}`), enabled: manage });
  const customers = useQuery({ queryKey: ['sale-customers'], queryFn: () => api.get('/customers?limit=200'), enabled: manage && can('crm.view') });
  const choices = (products.data?.data || []).filter((row: any) => row.selling_price_inr != null && Number(row.available_quantity) > 0);
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['sales'] }), qc.invalidateQueries({ queryKey: ['inventory'] }), qc.invalidateQueries({ queryKey: ['sale-products'] }), qc.invalidateQueries({ queryKey: ['report-sales'] }), qc.invalidateQueries({ queryKey: ['finance-summary'] })]); };
  const updateLine = (index: number, key: keyof Line, value: string) => setLines(lines.map((line, i) => i === index ? { ...line, [key]: value } : line));
  return <ModulePage title="Sales & invoices" description="Choose items and quantities, reserve stock, then capture payment. Prices and taxes are frozen in the draft; gold rates are not used.">
    {op.notice}
    {manage && <Panel title={draft ? `Payment for ${draft.invoice_no}` : 'New sale'}>
      {draft ? <div className="space-y-4"><p className="text-2xl font-bold">Amount due: {formatInr(draft.total_inr)}</p><p className="text-sm text-slate-500">Stock remains reserved until payment or cancellation. You can resume this draft from the register.</p><form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => { e.preventDefault(); const result = await op.run(() => api.post(`/sales/${draft.id}/finalize`, { payments: [{ method, amount_inr: draft.total_inr, reference }] }), 'Sale finalized and payment recorded.'); if (result) { setInvoiceId(result.data.id); setDraft(null); setLines([{ product_id: '', quantity: '1', discount_inr: '0' }]); await refresh(); } }}>
        <Field label="Payment method"><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option></select></Field><Field label="Payment reference"><input required={method !== 'cash'} value={reference} onChange={(e) => setReference(e.target.value)} /></Field><button disabled={op.busy} className="btn">Confirm payment</button><button disabled={op.busy} type="button" className="btn ghost" onClick={async () => { const r = await op.run(() => api.post(`/sales/${draft.id}/cancel`), 'Draft cancelled; stock released.'); if (r) { setDraft(null); await refresh(); } }}>Cancel draft</button>
      </form></div> : <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); const result = await op.run(() => api.post('/sales/draft', { customer_id: customer || null, lines }), 'Draft created. Review the amount and capture payment.'); if (result) { setDraft(result.data); await refresh(); } }}>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Customer"><select value={customer} onChange={(e) => setCustomer(e.target.value)}><option value="">Walk-in customer</option>{customers.data?.data?.map((row: any) => <option key={row.id} value={row.id}>{row.name} · {row.phone}</option>)}</select></Field><Field label="Search sellable items"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or SKU" /></Field></div>
        {can('crm.manage') && <Link to="/admin/customers/new" className="inline-block text-xs font-semibold text-blue-600">Create customer before billing →</Link>}
        <QueryState query={products} />
        {lines.map((line, index) => <div key={index} className="grid items-end gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"><Field label={`Item ${index + 1}`}><select required value={line.product_id} onChange={(e) => updateLine(index, 'product_id', e.target.value)}><option value="">Choose item</option>{choices.map((row: any) => <option key={row.id} value={row.id}>{row.sku} · {row.name} · {formatInr(row.selling_price_inr)} + {row.tax_rate_pct}% tax · {row.available_quantity} available</option>)}</select></Field><Field label={`Quantity ${index + 1}`}><input required type="number" min="1" step="1" value={line.quantity} onChange={(e) => updateLine(index, 'quantity', e.target.value)} /></Field><Field label={`Line discount ${index + 1} (INR)`}><input required type="number" min="0" step="0.01" value={line.discount_inr} onChange={(e) => updateLine(index, 'discount_inr', e.target.value)} /></Field><button type="button" className="btn ghost" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))}>Remove line {index + 1}</button></div>)}
        <div className="flex gap-3"><button type="button" className="btn ghost" onClick={() => setLines([...lines, { product_id: '', quantity: '1', discount_inr: '0' }])}>Add line</button><button disabled={op.busy || products.isLoading} className="btn">Reserve & review payment</button></div>
      </form>}
    </Panel>}
    <Panel title="Sales register"><QueryState query={sales} /><Register headers={['Invoice', 'Customer', 'Date', 'Total', 'Status', 'Actions']} empty={!sales.data?.data?.length}>{sales.data?.data?.map((row: any) => <tr key={row.id}><td className="font-semibold">{row.invoice_no}</td><td>{row.customer_name || 'Walk-in'}</td><td>{String(row.sold_at).slice(0, 10)}</td><td>{formatInr(row.total_inr)}</td><td>{row.status}{row.pricing_model === 'legacy' ? ' · historical' : ''}</td><td><div className="flex flex-wrap gap-2">{row.status === 'draft' && row.pricing_model === 'generic' && manage && <button className="btn ghost" onClick={() => { setDraft(row); setReference(''); }}>Resume payment</button>}{row.status !== 'draft' && <button className="btn ghost" onClick={() => setInvoiceId(row.id)}>View invoice</button>}{row.status === 'finalized' && row.pricing_model === 'generic' && can('finance.manage') && <button disabled={op.busy} className="btn ghost" onClick={async () => { const reason = window.prompt('Void/refund reason (records a refund; no automatic bank transfer):'); if (!reason?.trim()) return; const r = await op.run(() => api.post(`/sales/${row.id}/void`, { reason }), 'Invoice voided and stock restored. Complete any external refund separately.'); if (r) await refresh(); }}>Void & record refund</button>}</div></td></tr>)}</Register><div className="mt-4 flex items-center gap-3 text-xs"><button className="btn ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous sales</button><span>Page {page}</span><button className="btn ghost" disabled={page * 20 >= (sales.data?.total || 0)} onClick={() => setPage(page + 1)}>Next sales</button></div></Panel>
    {invoiceId && <InvoiceModal saleId={invoiceId} onClose={() => setInvoiceId('')} />}
  </ModulePage>;
}
