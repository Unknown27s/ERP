import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatInr } from '../../lib/utils';
import { useAuth } from '../../hooks/auth';
import { ModulePage, Panel, Field, Register, QueryState, useOperation } from '../../components/OperationalUi';
export default function Finance() {
  const { can } = useAuth();
  const op = useOperation();
  const [form, setForm] = useState({ category: '', amount_inr: '', note: '' });
  const summary = useQuery({ queryKey: ['finance-summary'], queryFn: () => api.get('/finance/summary') });
  const expenses = useQuery({ queryKey: ['finance-expenses'], queryFn: () => api.get('/finance/expenses') });
  const purchases = useQuery({ queryKey: ['finance-purchases'], queryFn: () => api.get('/purchases') });
  return <ModulePage title="Finance register" description="Operational receipts and expenses, including paid payroll. This is not a double-entry ledger or statutory financial statement.">
    {op.notice}<QueryState query={summary} />
    <div className="grid gap-4 sm:grid-cols-3">{[['Finalized sales receipts', summary.data?.data?.receipts], ['Recorded expenses', summary.data?.data?.expenses], ['Receipts less expenses', summary.data?.data?.net_cash]].map(([label, value]) => <Panel key={label} title={label}><p className="text-2xl font-bold">{summary.data ? formatInr(value) : '—'}</p></Panel>)}</div>
    <p className="text-xs text-slate-500">Purchase receipts remain unpaid until a supplier payment is recorded below. Figures above are not profit or bank reconciliation. Recording a payment does not transfer money through a bank.</p>
    <Link className="inline-block text-sm font-semibold text-blue-600" to="/admin/sales">Review sales receipts & invoices →</Link>
    {can('finance.manage') && <Panel title="Record expense"><form className="grid items-end gap-4 sm:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); const result = await op.run(() => api.post('/finance/expenses', form), 'Expense recorded.'); if (result) { setForm({ category: '', amount_inr: '', note: '' }); await Promise.all([expenses.refetch(), summary.refetch()]); } }}><Field label="Expense category"><input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field><Field label="Expense amount (INR)"><input required type="number" min="0.01" step="0.01" value={form.amount_inr} onChange={(e) => setForm({ ...form, amount_inr: e.target.value })} /></Field><Field label="Expense note"><input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field><button disabled={op.busy} className="btn">Record expense</button></form></Panel>}
    <Panel title="Recent expenses (up to 200)"><QueryState query={expenses} /><Register headers={['Date', 'Category', 'Amount', 'Note']} empty={!expenses.data?.data?.length}>{expenses.data?.data?.map((row: any) => <tr key={row.id}><td>{String(row.spent_at).slice(0, 10)}</td><td>{row.category}</td><td>{formatInr(row.amount_inr)}</td><td>{row.note || '—'}</td></tr>)}</Register></Panel>
    <Panel title="Supplier payments"><QueryState query={purchases} /><Register headers={['Reference', 'Total', 'Status', 'Action']} empty={!purchases.data?.data?.length}>{purchases.data?.data?.map((row: any) => <tr key={row.id}><td>{row.supplier_invoice_no || row.id}</td><td>{formatInr(row.subtotal_inr)}</td><td>{row.payment_status}</td><td>{row.payment_status !== 'paid' && can('finance.manage') && <button disabled={op.busy} className="btn ghost" onClick={async () => { if (!window.confirm('Confirm the supplier has actually been paid. Record this payment as an expense?')) return; const r = await op.run(() => api.post(`/purchases/${row.id}/pay`), 'Supplier payment recorded.'); if (r) await Promise.all([purchases.refetch(), expenses.refetch(), summary.refetch()]); }}>Record supplier payment</button>}</td></tr>)}</Register></Panel>
  </ModulePage>;
}
