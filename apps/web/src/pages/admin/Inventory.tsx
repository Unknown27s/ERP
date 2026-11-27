import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, PackagePlus, Plus, RefreshCw, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/auth';
import { formatInr } from '../../lib/utils';
import { ModulePage, Panel, Field, Register, useOperation } from '../../components/OperationalUi';
import Modal from '../../components/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

type Item = { id: string; name: string; sku: string; category_name: string | null; stock_on_hand: number; stock_reserved: number; available_quantity: number; selling_price_inr: number | null; tax_rate_pct: number };
type Lookup = { id: string; name: string };
type Purchase = { id: string; purchased_at: string; supplier_name: string | null; supplier_invoice_no: string | null; subtotal_inr: number; payment_status: string };
const EMPTY_ITEM = { name: '', sku: '', category_id: '', selling_price_inr: '', acquisition_cost_inr: '', tax_rate_pct: '0', opening_quantity: '0' };
const EMPTY_INTAKE = { product_id: '', supplier_id: '', quantity: '1', unit_cost_inr: '', supplier_invoice_no: '' };

export default function Inventory() {
  const { can } = useAuth();
  const manage = can('inventory.manage');
  const qc = useQueryClient();
  const op = useOperation();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [item, setItem] = useState(EMPTY_ITEM);
  const [initialItem, setInitialItem] = useState(EMPTY_ITEM);
  const [editId, setEditId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [intake, setIntake] = useState(EMPTY_INTAKE);
  const products = useQuery<{ data: Item[]; total: number }>({ queryKey: ['inventory', search, page], queryFn: () => api.get(`/products?status=all&limit=50&page=${page}&q=${encodeURIComponent(search)}`) });
  const categories = useQuery<{ data: Lookup[] }>({ queryKey: ['categories'], queryFn: () => api.get('/categories') });
  const suppliers = useQuery<{ data: Lookup[] }>({ queryKey: ['suppliers'], queryFn: () => api.get('/suppliers') });
  const purchases = useQuery<{ data: Purchase[] }>({ queryKey: ['purchases'], queryFn: () => api.get('/purchases') });
  const rows = products.data?.data || [];
  const total = products.data?.total || 0;
  const refresh = async () => { await Promise.all(['inventory', 'purchases', 'sale-products', 'report-inventory'].map((key) => qc.invalidateQueries({ queryKey: [key] }))); };

  const openItem = (row?: Item) => {
    op.clear();
    const values = row ? { ...EMPTY_ITEM, name: row.name, sku: row.sku, selling_price_inr: row.selling_price_inr == null ? '' : String(row.selling_price_inr), tax_rate_pct: String(row.tax_rate_pct) } : EMPTY_ITEM;
    setEditId(row?.id || ''); setItem(values); setInitialItem(values); setFormOpen(true);
  };
  const closeItem = () => {
    if (op.busy) return;
    if (JSON.stringify(item) !== JSON.stringify(initialItem) && !window.confirm('Discard your unsaved item changes?')) return;
    setFormOpen(false);
  };
  const closeReceive = () => {
    if (op.busy) return;
    if (JSON.stringify(intake) !== JSON.stringify(EMPTY_INTAKE) && !window.confirm('Discard your unsaved stock receipt?')) return;
    setReceiveOpen(false);
  };
  const saveItem = async (event: React.FormEvent) => {
    event.preventDefault();
    if (op.busy) return;
    const result = await op.run(() => editId ? api.patch(`/products/${editId}`, { name: item.name, selling_price_inr: item.selling_price_inr, tax_rate_pct: item.tax_rate_pct }) : api.post('/products', item), editId ? 'Item price updated.' : 'Item created. Receive further stock when needed.');
    if (result) { setFormOpen(false); setItem(EMPTY_ITEM); setEditId(''); await refresh(); }
  };
  const receiveStock = async (event: React.FormEvent) => {
    event.preventDefault();
    if (op.busy) return;
    const result = await op.run(() => api.post('/purchases', { supplier_id: intake.supplier_id, supplier_invoice_no: intake.supplier_invoice_no, items: [{ product_id: intake.product_id, quantity: intake.quantity, unit_cost_inr: intake.unit_cost_inr }] }), 'Stock received.');
    if (result) { setReceiveOpen(false); setIntake(EMPTY_INTAKE); await refresh(); }
  };

  return <ModulePage title="Inventory & purchasing" description="Review item availability, maintain pricing and receive stock." actions={manage && <><Button variant="outline" disabled={!rows.length || products.isError || products.isLoading} onClick={() => { op.clear(); setIntake(EMPTY_INTAKE); setReceiveOpen(true); }}><PackagePlus size={16} aria-hidden="true" />Receive stock</Button><Button onClick={() => openItem()}><Plus size={16} aria-hidden="true" />Add item</Button></>}>
    {!formOpen && !receiveOpen && op.notice}
    <Panel title="Item register">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="w-full sm:max-w-sm"><Field label="Search items"><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by name or SKU" /></Field></div>
        <Button variant="outline" disabled={products.isFetching} onClick={() => refresh()}><RefreshCw size={15} className={products.isFetching ? 'animate-spin' : ''} aria-hidden="true" />Refresh</Button>
      </div>
      <Register label="Inventory items" query={products} headers={['Item', 'Category', 'On hand', 'Reserved', 'Available', 'Unit price', 'Tax', 'Actions']} numericColumns={[2, 3, 4, 5, 6]} empty={!rows.length} emptyTitle={search ? 'No matching items' : 'No items yet'} emptyDescription={search ? 'Try another item name or SKU.' : 'Create your first item to begin tracking stock.'} emptyAction={search ? <Button variant="outline" onClick={() => { setSearch(''); setPage(1); }}>Clear search</Button> : manage ? <Button onClick={() => openItem()}>Add item</Button> : undefined}>
        {rows.map((row) => <tr key={row.id}>
          <td><span className="block font-semibold text-ink">{row.name}</span><span className="mt-1 block text-xs text-ink-muted">{row.sku}</span></td>
          <td>{row.category_name || 'Uncategorised'}</td><td>{row.stock_on_hand}</td><td>{row.stock_reserved}</td><td><span className="font-semibold">{row.available_quantity}</span></td>
          <td className="whitespace-nowrap">{row.selling_price_inr == null ? <Badge variant="warning">Price required</Badge> : formatInr(row.selling_price_inr)}</td><td>{row.tax_rate_pct}%</td>
          <td>{manage ? <Button variant="ghost" size="sm" aria-label={`Edit price: ${row.sku}`} onClick={() => openItem(row)}>Edit price</Button> : <span className="text-xs text-ink-muted">View only</span>}</td>
        </tr>)}
      </Register>
      {products.data && !products.isLoading && <nav aria-label="Item pagination" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm text-ink-muted">
        <span>{total > 0 ? `${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} of ${total} items` : '0 items'}</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 1 || products.isFetching} onClick={() => setPage(page - 1)}>Previous items</Button><span className="px-1 text-xs">Page {page}</span><Button variant="outline" size="sm" disabled={page * 50 >= total || products.isFetching} onClick={() => setPage(page + 1)}>Next items</Button></div>
      </nav>}
    </Panel>

    <Panel title="Recent stock receipts"><Register query={purchases} label="Stock receipts" headers={['Date', 'Supplier', 'Reference', 'Total', 'Payment status']} numericColumns={[3]} empty={!purchases.data?.data?.length} emptyTitle="No stock receipts yet" emptyDescription="Received stock will appear here. Supplier payment is recorded separately in Finance.">
      {purchases.data?.data?.map((row) => <tr key={row.id}><td className="whitespace-nowrap">{String(row.purchased_at).slice(0, 10)}</td><td>{row.supplier_name || '—'}</td><td>{row.supplier_invoice_no || '—'}</td><td className="whitespace-nowrap">{formatInr(row.subtotal_inr)}</td><td><Badge variant={row.payment_status === 'paid' ? 'success' : 'secondary'}>{row.payment_status}</Badge></td></tr>)}
    </Register></Panel>

    {manage && <details className="erp-panel"><summary className="flex list-none items-center justify-between gap-3 text-sm font-semibold text-ink">Categories & suppliers<span className="flex items-center gap-2 text-xs font-normal text-ink-muted">Manage setup<ChevronDown size={16} aria-hidden="true" /></span></summary><div className="mt-5 grid gap-6 md:grid-cols-2">
      <form className="flex items-end gap-2" onSubmit={async (event) => { event.preventDefault(); const result = await op.run(() => api.post('/categories', { name: category }), 'Category created.'); if (result) { setCategory(''); await categories.refetch(); } }}><Field label="New category"><input required value={category} onChange={(event) => setCategory(event.target.value)} /></Field><Button disabled={op.busy} variant="outline">Add category</Button></form>
      <form className="flex items-end gap-2" onSubmit={async (event) => { event.preventDefault(); const result = await op.run(() => api.post('/suppliers', { name: supplier }), 'Supplier created.'); if (result) { setSupplier(''); await suppliers.refetch(); } }}><Field label="New supplier"><input required value={supplier} onChange={(event) => setSupplier(event.target.value)} /></Field><Button disabled={op.busy} variant="outline">Add supplier</Button></form>
    </div></details>}

    {formOpen && <Modal title={editId ? 'Edit item pricing' : 'Add item'} subtitle={editId ? `Update pricing for ${item.sku}.` : 'Create an item with its opening stock and selling price.'} onClose={closeItem} size="md" pending={op.busy}>
      <form onSubmit={saveItem} className="space-y-5">{op.notice}<fieldset disabled={op.busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field label="Item name"><input required value={item.name} onChange={(event) => setItem({ ...item, name: event.target.value })} /></Field>
        <Field label="SKU"><input required disabled={!!editId} value={item.sku} onChange={(event) => setItem({ ...item, sku: event.target.value })} /></Field>
        {!editId && <Field label="Category" hint={categories.isError ? 'Categories could not load. Close and retry if a category is required.' : undefined}><select disabled={categories.isLoading || categories.isError} value={item.category_id} onChange={(event) => setItem({ ...item, category_id: event.target.value })}><option value="">Uncategorised</option>{categories.data?.data?.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>}
        <Field label="Selling price (INR)"><input type="number" min="0" step="0.01" required value={item.selling_price_inr} onChange={(event) => setItem({ ...item, selling_price_inr: event.target.value })} /></Field>
        <Field label="Tax rate (%)"><input type="number" min="0" max="100" step="0.01" required value={item.tax_rate_pct} onChange={(event) => setItem({ ...item, tax_rate_pct: event.target.value })} /></Field>
        {!editId && <><Field label="Unit cost (INR)"><input type="number" min="0" step="0.01" required value={item.acquisition_cost_inr} onChange={(event) => setItem({ ...item, acquisition_cost_inr: event.target.value })} /></Field><Field label="Opening quantity"><input type="number" min="0" step="1" required value={item.opening_quantity} onChange={(event) => setItem({ ...item, opening_quantity: event.target.value })} /></Field></>}
      </fieldset><div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="outline" disabled={op.busy} onClick={closeItem}>Cancel</Button><Button disabled={op.busy}>{op.busy ? 'Saving…' : editId ? 'Save item price' : 'Create item'}</Button></div></form>
    </Modal>}

    {receiveOpen && <Modal title="Receive stock" subtitle="Record quantities received. This does not record a supplier payment." onClose={closeReceive} size="md" pending={op.busy}>
      <form onSubmit={receiveStock} className="space-y-5">{op.notice}<fieldset disabled={op.busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Receive item" hint="Items from the current register page. Filter the register first if needed."><select required value={intake.product_id} onChange={(event) => setIntake({ ...intake, product_id: event.target.value })}><option value="">Choose item from this page</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.sku} · {row.name}</option>)}</select></Field></div>
        <Field label="Supplier" hint={suppliers.isError ? 'Suppliers could not load. Close and retry before choosing a supplier.' : undefined}><select disabled={suppliers.isLoading || suppliers.isError} value={intake.supplier_id} onChange={(event) => setIntake({ ...intake, supplier_id: event.target.value })}><option value="">No supplier</option>{suppliers.data?.data?.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
        <Field label="Received quantity"><input type="number" min="1" step="1" required value={intake.quantity} onChange={(event) => setIntake({ ...intake, quantity: event.target.value })} /></Field>
        <Field label="Purchase unit cost (INR)"><input type="number" min="0" step="0.01" required value={intake.unit_cost_inr} onChange={(event) => setIntake({ ...intake, unit_cost_inr: event.target.value })} /></Field>
        <Field label="Supplier invoice reference"><input value={intake.supplier_invoice_no} onChange={(event) => setIntake({ ...intake, supplier_invoice_no: event.target.value })} /></Field>
      </fieldset><div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="outline" disabled={op.busy} onClick={closeReceive}>Cancel</Button><Button disabled={op.busy}>{op.busy ? 'Receiving…' : 'Receive stock'}</Button></div></form>
    </Modal>}
  </ModulePage>;
}
