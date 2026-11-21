import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/auth';
import { formatInr } from '../../lib/utils';
import { ModulePage, Panel, Field, Register, QueryState, useOperation } from '../../components/OperationalUi';

const emptyItem = { name: '', sku: '', category_id: '', selling_price_inr: '', acquisition_cost_inr: '', tax_rate_pct: '0', opening_quantity: '0' };
export default function Inventory() {
  const { can } = useAuth();
  const manage = can('inventory.manage');
  const qc = useQueryClient();
  const op = useOperation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [item, setItem] = useState(emptyItem);
  const [editId, setEditId] = useState('');
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [intake, setIntake] = useState({ product_id: '', supplier_id: '', quantity: '1', unit_cost_inr: '', supplier_invoice_no: '' });
  const products = useQuery({ queryKey: ['inventory', search, page], queryFn: () => api.get(`/products?status=all&limit=50&page=${page}&q=${encodeURIComponent(search)}`) });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api.get('/categories') });
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => api.get('/suppliers') });
  const purchases = useQuery({ queryKey: ['purchases'], queryFn: () => api.get('/purchases') });
  const rows = products.data?.data || [];
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['inventory'] }), qc.invalidateQueries({ queryKey: ['purchases'] }), qc.invalidateQueries({ queryKey: ['sale-products'] }), qc.invalidateQueries({ queryKey: ['report-inventory'] })]); };
  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await op.run(() => editId ? api.patch(`/products/${editId}`, { name: item.name, selling_price_inr: item.selling_price_inr, tax_rate_pct: item.tax_rate_pct }) : api.post('/products', item), editId ? 'Item price updated.' : 'Item created. Receive further stock below.');
    if (result) { setItem(emptyItem); setEditId(''); await refresh(); }
  };
  return <ModulePage title="Inventory & purchasing" description="Set selling prices, receive quantities and track available stock. Historical items require explicit pricing before sale.">
    {op.notice}
    <Panel title="Item register">
      <Field label="Search items"><input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Name or SKU" /></Field>
      <QueryState query={products} />
      <Register headers={['Item', 'SKU', 'Category', 'On hand', 'Reserved', 'Available', 'Unit price', 'Tax', 'Actions']} empty={!rows.length}>
        {rows.map((row: any) => <tr key={row.id}><td className="font-semibold">{row.name}</td><td>{row.sku}</td><td>{row.category_name || '—'}</td><td>{row.stock_on_hand}</td><td>{row.stock_reserved}</td><td>{row.available_quantity}</td><td>{row.selling_price_inr == null ? 'Price required' : formatInr(row.selling_price_inr)}</td><td>{row.tax_rate_pct}%</td><td>{manage && <button className="btn ghost" onClick={() => { setEditId(row.id); setItem({ ...emptyItem, name: row.name, sku: row.sku, selling_price_inr: row.selling_price_inr == null ? '' : String(row.selling_price_inr), tax_rate_pct: String(row.tax_rate_pct) }); }}>Edit price: {row.sku}</button>}</td></tr>)}
      </Register>
      <div className="mt-4 flex items-center gap-3 text-xs"><button className="btn ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous items</button><span>Page {page} · {products.data?.total || 0} items</span><button className="btn ghost" disabled={page * 50 >= (products.data?.total || 0)} onClick={() => setPage(page + 1)}>Next items</button></div>
    </Panel>
    {manage && <div className="grid gap-6 xl:grid-cols-2">
      <Panel title={editId ? 'Edit item pricing' : 'Create item'}><form onSubmit={saveItem} className="grid gap-4 sm:grid-cols-2">
        <Field label="Item name"><input required value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} /></Field>
        <Field label="SKU"><input required disabled={!!editId} value={item.sku} onChange={(e) => setItem({ ...item, sku: e.target.value })} /></Field>
        {!editId && <Field label="Category"><select value={item.category_id} onChange={(e) => setItem({ ...item, category_id: e.target.value })}><option value="">Uncategorised</option>{categories.data?.data?.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>}
        <Field label="Selling price (INR)"><input type="number" min="0" step="0.01" required value={item.selling_price_inr} onChange={(e) => setItem({ ...item, selling_price_inr: e.target.value })} /></Field>
        <Field label="Tax rate (%)"><input type="number" min="0" max="100" step="0.01" required value={item.tax_rate_pct} onChange={(e) => setItem({ ...item, tax_rate_pct: e.target.value })} /></Field>
        {!editId && <><Field label="Unit cost (INR)"><input type="number" min="0" step="0.01" required value={item.acquisition_cost_inr} onChange={(e) => setItem({ ...item, acquisition_cost_inr: e.target.value })} /></Field><Field label="Opening quantity"><input type="number" min="0" step="1" required value={item.opening_quantity} onChange={(e) => setItem({ ...item, opening_quantity: e.target.value })} /></Field></>}
        <button disabled={op.busy} className="btn">{editId ? 'Save item price' : 'Create item'}</button>{editId && <button type="button" className="btn ghost" onClick={() => { setEditId(''); setItem(emptyItem); }}>Cancel edit</button>}
      </form></Panel>
      <Panel title="Receive stock"><form className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); const result = await op.run(() => api.post('/purchases', { supplier_id: intake.supplier_id, supplier_invoice_no: intake.supplier_invoice_no, items: [{ product_id: intake.product_id, quantity: intake.quantity, unit_cost_inr: intake.unit_cost_inr }] }), 'Stock received.'); if (result) await refresh(); }}>
        <Field label="Receive item"><select required value={intake.product_id} onChange={(e) => setIntake({ ...intake, product_id: e.target.value })}><option value="">Choose item from this page</option>{rows.map((row: any) => <option key={row.id} value={row.id}>{row.sku} · {row.name}</option>)}</select></Field>
        <Field label="Supplier"><select value={intake.supplier_id} onChange={(e) => setIntake({ ...intake, supplier_id: e.target.value })}><option value="">No supplier</option>{suppliers.data?.data?.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
        <Field label="Received quantity"><input type="number" min="1" step="1" required value={intake.quantity} onChange={(e) => setIntake({ ...intake, quantity: e.target.value })} /></Field>
        <Field label="Purchase unit cost (INR)"><input type="number" min="0" step="0.01" required value={intake.unit_cost_inr} onChange={(e) => setIntake({ ...intake, unit_cost_inr: e.target.value })} /></Field>
        <Field label="Supplier invoice reference"><input value={intake.supplier_invoice_no} onChange={(e) => setIntake({ ...intake, supplier_invoice_no: e.target.value })} /></Field><button disabled={op.busy} className="btn">Receive stock</button>
      </form></Panel>
      <Panel title="Categories & suppliers"><div className="space-y-4"><form className="flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await op.run(() => api.post('/categories', { name: category }), 'Category created.'); if (r) { setCategory(''); await categories.refetch(); } }}><Field label="New category"><input required value={category} onChange={(e) => setCategory(e.target.value)} /></Field><button disabled={op.busy} className="btn ghost">Add category</button></form><form className="flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); const r = await op.run(() => api.post('/suppliers', { name: supplier }), 'Supplier created.'); if (r) { setSupplier(''); await suppliers.refetch(); } }}><Field label="New supplier"><input required value={supplier} onChange={(e) => setSupplier(e.target.value)} /></Field><button disabled={op.busy} className="btn ghost">Add supplier</button></form></div></Panel>
    </div>}
    <Panel title="Recent stock receipts"><QueryState query={purchases} /><Register headers={['Date', 'Supplier', 'Reference', 'Total', 'Payment status']} empty={!purchases.data?.data?.length}>{purchases.data?.data?.map((row: any) => <tr key={row.id}><td>{String(row.purchased_at).slice(0, 10)}</td><td>{row.supplier_name || '—'}</td><td>{row.supplier_invoice_no || '—'}</td><td>{formatInr(row.subtotal_inr)}</td><td>{row.payment_status}</td></tr>)}</Register></Panel>
  </ModulePage>;
}
