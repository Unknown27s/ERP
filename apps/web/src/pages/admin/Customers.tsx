/**
 * ==============================================================================
 * CRM · CUSTOMER MASTER (Customers.tsx)
 * ==============================================================================
 * The single source of truth for every registered customer profile.
 *
 * Layout:
 * 1. Header with an export action and the amber "new profile" entry point.
 * 2. KPI strip: portfolio totals from /reports/customers when the signed-in
 *    role may read reports, otherwise filter-scoped counts only. Nothing here
 *    is derived from a partial page of rows.
 * 3. CRM tab bar, so Customers sits beside Leads and Support Cases.
 * 4. Filter bar: free text, spend band, purchase recency and custom dates.
 * 5. Sortable, paginated table (sorting is server-side; see CUSTOMER_SORTS).
 * 6. Customer detail popup with Overview / Purchases / Support cases /
 *    Activity / Consent. Editing opens above the detail popup.
 *
 * Every figure shown is returned by the API. Where a permission hides data
 * (for example cost), the field is simply absent rather than estimated.
 * ==============================================================================
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  AlertTriangle,
  Cake,
  CalendarHeart,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  LifeBuoy,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  ReceiptText,
  RefreshCw,
  Repeat,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { api, inr } from '../../lib/api';
import { cn, formatInr } from '../../lib/utils';
import Modal from '../../components/Modal';
import InvoiceModal from '../../components/InvoiceModal';
import PageHeader from '../../components/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { downloadCsv, fileStamp, type CsvColumn } from '../../lib/export';
import { downloadInvoicePdf } from '../../lib/invoicePdf';
import { useAuth } from '../../hooks/auth';
import { CrmNav, Kpi, Pagination, prettyDate } from './crm/crmUi';

/* ── Records & validation ──────────────────────────────────────────────────── */

type Customer = {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  email?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  birthday?: string | null;
  anniversary?: string | null;
  notes?: string | null;
  marketing_consent: number;
  total_spent_inr: number;
  purchase_count: number;
  last_purchase_at?: string | null;
  created_at: string;
};

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  address_line1: '',
  city: '',
  state: '',
  postal_code: '',
  birthday: '',
  anniversary: '',
  marketing_consent: true,
};

/** Mirrors CUSTOMER_REQUIRED in server/src/routes/crm.js. */
const REQUIRED = ['name', 'phone', 'address_line1', 'city', 'state', 'postal_code'] as const;

const FIELD_LABELS: Record<string, string> = {
  name: 'Full name',
  phone: 'Phone',
  email: 'Email',
  address_line1: 'Street address',
  city: 'City',
  state: 'State',
  postal_code: 'PIN code',
  birthday: 'Birthday',
  anniversary: 'Anniversary',
};

const missingFields = (f: Record<string, any>) => REQUIRED.filter((k) => !String(f[k] ?? '').trim());

const missingMessage = (f: Record<string, any>) =>
  `Please fill the required fields: ${missingFields(f)
    .map((k) => FIELD_LABELS[k] || k)
    .join(', ')}.`;

const addressOf = (c: Customer) =>
  [c.address_line1, c.city, c.state, c.postal_code].filter(Boolean).join(', ') || 'No address on record';

const EXPORT_COLUMNS: CsvColumn<Customer>[] = [
  { header: 'Customer code', value: (r) => r.customer_code },
  { header: 'Name', value: (r) => r.name },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Email', value: (r) => r.email || '' },
  { header: 'Address', value: (r) => r.address_line1 || '' },
  { header: 'City', value: (r) => r.city || '' },
  { header: 'State', value: (r) => r.state || '' },
  { header: 'PIN code', value: (r) => r.postal_code || '' },
  { header: 'Purchases', value: (r) => r.purchase_count ?? 0 },
  { header: 'Total spent (INR)', value: (r) => Number(r.total_spent_inr || 0).toFixed(2) },
  { header: 'Last purchase', value: (r) => (r.last_purchase_at ? String(r.last_purchase_at).slice(0, 10) : '') },
  { header: 'Marketing consent', value: (r) => (r.marketing_consent ? 'yes' : 'no') },
  { header: 'Birthday', value: (r) => r.birthday || '' },
  { header: 'Anniversary', value: (r) => r.anniversary || '' },
  { header: 'Created', value: (r) => String(r.created_at || '').slice(0, 10) },
];

/* ── Shared field grid ─────────────────────────────────────────────────────── */

function CustomerFields({
  value,
  onChange,
  errors,
}: {
  value: Record<string, any>;
  onChange: (next: Record<string, any>) => void;
  errors?: Record<string, string>;
}) {
  const set = (key: string, next: any) => onChange({ ...value, [key]: next });

  const field = (
    key: string,
    opts: { type?: string; placeholder?: string; span?: boolean; hint?: string } = {},
  ) => {
    const required = (REQUIRED as readonly string[]).includes(key);
    return (
      <div key={key} className={opts.span ? 'sm:col-span-2' : undefined}>
        <label className="lbl">
          {FIELD_LABELS[key]}
          {required ? ' *' : ''}
        </label>
        <input
          type={opts.type || 'text'}
          value={value[key] ?? ''}
          onChange={(e) => set(key, e.target.value)}
          placeholder={opts.placeholder}
          aria-invalid={!!errors?.[key]}
        />
        {opts.hint && !errors?.[key] && <div className="mt-1 text-[11px] text-slate-500">{opts.hint}</div>}
        {errors?.[key] && <div className="modal-error">{errors[key]}</div>}
      </div>
    );
  };

  return (
    <div className="modal-grid">
      {field('name', { placeholder: 'e.g. Radhika Sethi' })}
      {field('phone', { type: 'tel', placeholder: '10-digit mobile' })}
      {field('email', { type: 'email', placeholder: 'name@example.com' })}
      {field('birthday', { type: 'date' })}
      {field('anniversary', { type: 'date' })}
      {field('address_line1', { placeholder: 'House / street / locality', span: true })}
      {field('city', { placeholder: 'e.g. Bengaluru' })}
      {field('state', { placeholder: 'e.g. Karnataka' })}
      {field('postal_code', { placeholder: 'e.g. 560001' })}
    </div>
  );
}

/* ── New customer popup ────────────────────────────────────────────────────── */

function NewCustomerModal({
  onClose,
  onSaved,
  onOpenExisting,
}: {
  onClose: () => void;
  onSaved: () => void;
  onOpenExisting: (id: string) => void;
}) {
  const [form, setForm] = useState<Record<string, any>>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [duplicates, setDuplicates] = useState<Customer[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const missing = missingFields(form);
    if (missing.length) {
      setErrors(Object.fromEntries(missing.map((k) => [k, 'Required'])));
      setMessage(missingMessage(form));
      return;
    }
    setErrors({});
    setMessage('');
    setDuplicates([]);
    try {
      setSaving(true);
      await api.post('/customers', form);
      onSaved();
      onClose();
    } catch (e: any) {
      // 409 carries the conflicting profiles. Records are never auto-merged,
      // so surface them and let the user open the right one.
      if (e.body?.error === 'duplicate' && Array.isArray(e.body?.data)) {
        setDuplicates(e.body.data);
        setMessage('This phone number already belongs to an existing customer.');
      } else {
        setMessage(e.message || 'Could not save the customer.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New customer"
      subtitle="Register a customer profile. Name, phone and a full postal address are mandatory."
      icon={<UsersRound className="h-5 w-5" />}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <span className="modal-hint">Marketing consent defaults to opted in.</span>
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save customer'}
          </button>
        </>
      }
    >
      {message && (
        <div className="err-box" style={{ marginBottom: 12 }}>
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
          </div>
          {duplicates.length > 0 && (
            <ul className="mt-2 space-y-1">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="text-left text-xs font-semibold underline underline-offset-2"
                    onClick={() => {
                      onClose();
                      onOpenExisting(d.id);
                    }}
                  >
                    {d.customer_code} · {d.name} · {d.phone}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <CustomerFields value={form} onChange={setForm} errors={errors} />

      <label className="mt-4 flex items-center gap-2 text-[13px] text-slate-700">
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={form.marketing_consent}
          onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })}
        />
        <span>Marketing consent (WhatsApp &amp; SMS campaigns)</span>
      </label>
    </Modal>
  );
}

/* ── Edit customer popup ───────────────────────────────────────────────────── */

function EditCustomerModal({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, any>>({
    name: customer.name ?? '',
    phone: customer.phone ?? '',
    email: customer.email ?? '',
    address_line1: customer.address_line1 ?? '',
    city: customer.city ?? '',
    state: customer.state ?? '',
    postal_code: customer.postal_code ?? '',
    birthday: customer.birthday ?? '',
    anniversary: customer.anniversary ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const missing = missingFields(form);
    if (missing.length) {
      setErrors(Object.fromEntries(missing.map((k) => [k, 'Required'])));
      setMessage(missingMessage(form));
      return;
    }
    setErrors({});
    setMessage('');
    try {
      setSaving(true);
      await api.patch(`/customers/${customer.id}`, form);
      onSaved();
      onClose();
    } catch (e: any) {
      setMessage(e.body?.message || e.message || 'Could not save the changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Edit ${customer.customer_code}`}
      subtitle={`${customer.name} · the mandatory fields must stay complete.`}
      icon={<UserRound className="h-5 w-5" />}
      onClose={onClose}
      size="lg"
      zIndex={1100}
      footer={
        <>
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      {message && (
        <div className="err-box" style={{ marginBottom: 12 }}>
          {message}
        </div>
      )}
      <CustomerFields value={form} onChange={setForm} errors={errors} />
    </Modal>
  );
}

/* ── Customer detail popup ─────────────────────────────────────────────────── */

const DETAIL_TABS = [
  { key: 'overview', label: 'Overview', icon: UserRound },
  { key: 'purchases', label: 'Purchases', icon: ReceiptText },
  { key: 'cases', label: 'Support cases', icon: LifeBuoy },
  { key: 'activity', label: 'Activity', icon: ActivityIcon },
  { key: 'consent', label: 'Consent', icon: ShieldCheck },
] as const;

type DetailTab = (typeof DETAIL_TABS)[number]['key'];

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-right text-[13px] font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function CustomerDetailModal({
  customerId,
  onClose,
  onChanged,
}: {
  customerId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [editing, setEditing] = useState(false);
  const [previewSaleId, setPreviewSaleId] = useState<string | null>(null);
  const [downloadingSaleId, setDownloadingSaleId] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['customer-detail', customerId],
    queryFn: () => api.get(`/customers/${customerId}`),
  });

  const cases = useQuery({
    queryKey: ['customer-cases', customerId],
    queryFn: () => api.get(`/support-cases?customer_id=${customerId}&limit=20&include_inactive=1`),
    enabled: tab === 'cases',
  });

  const activity = useQuery({
    queryKey: ['customer-activity', customerId],
    queryFn: () => api.get(`/activities?customer_id=${customerId}&limit=25`),
    enabled: tab === 'activity',
  });

  const customer: (Customer & {
    purchases?: any[];
    consent?: any[];
    occasions?: any[];
    addresses?: any[];
    preferred_channel?: string;
  }) | undefined = detail.data?.data;

  const purchases = customer?.purchases || [];
  const consent = customer?.consent || [];

  const download = async (saleId: string) => {
    try {
      setDownloadingSaleId(saleId);
      const res = await api.get(`/sales/${saleId}`);
      downloadInvoicePdf(res.data);
    } catch (e: any) {
      alert(`Download failed: ${e.message}`);
    } finally {
      setDownloadingSaleId(null);
    }
  };

  return (
    <>
      <Modal
        title={customer ? customer.name : 'Customer'}
        subtitle={
          customer
            ? [customer.customer_code, customer.phone, customer.email].filter(Boolean).join(' · ')
            : 'Loading customer record…'
        }
        icon={<UsersRound className="h-5 w-5" />}
        onClose={onClose}
        size="xl"
        footer={
          <>
            <span className="modal-hint">Purchases are finalized bills only. Drafts and voids are excluded.</span>
            <span className="grow" />
            <button type="button" className="btn ghost" onClick={onClose}>
              Close
            </button>
            {customer && can('crm.manage') && (
              <button type="button" className="btn" onClick={() => setEditing(true)}>
                Edit customer
              </button>
            )}
          </>
        }
      >
        {detail.isLoading && <div className="py-10 text-center text-sm text-slate-500">Loading…</div>}

        {detail.isError && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Could not load this customer record.
          </div>
        )}

        {customer && (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total spent</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{inr(customer.total_spent_inr)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Purchases</div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {customer.purchase_count ?? purchases.length}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Last purchase</div>
                <div className="mt-1 text-sm font-bold text-slate-900">
                  {customer.last_purchase_at ? prettyDate(customer.last_purchase_at) : 'None yet'}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Consent</div>
                <div className="mt-1">
                  {customer.marketing_consent ? (
                    <Badge variant="success">Opted in</Badge>
                  ) : (
                    <Badge variant="secondary">Not opted in</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
              {DETAIL_TABS.map((entry) => {
                const Icon = entry.icon;
                const active = tab === entry.key;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => setTab(entry.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                      active ? 'bg-brand-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {entry.label}
                  </button>
                );
              })}
            </div>

            {tab === 'overview' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Contact
                  </p>
                  <DetailRow
                    label="Phone"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        {customer.phone || '—'}
                      </span>
                    }
                  />
                  <DetailRow
                    label="Email"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        {customer.email || '—'}
                      </span>
                    }
                  />
                  <DetailRow
                    label="Birthday"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <Cake className="h-3.5 w-3.5 text-slate-400" />
                        {customer.birthday ? prettyDate(customer.birthday) : '—'}
                      </span>
                    }
                  />
                  <DetailRow
                    label="Anniversary"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarHeart className="h-3.5 w-3.5 text-slate-400" />
                        {customer.anniversary ? prettyDate(customer.anniversary) : '—'}
                      </span>
                    }
                  />
                  <DetailRow label="Customer since" value={prettyDate(customer.created_at)} />
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Address
                  </p>
                  <div className="flex items-start gap-2 py-2 text-[13px] text-slate-800">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>{addressOf(customer)}</span>
                  </div>
                  {customer.notes && (
                    <>
                      <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Notes
                      </p>
                      <p className="whitespace-pre-line text-[13px] text-slate-700">{customer.notes}</p>
                    </>
                  )}
                </div>
              </div>
            )}

            {tab === 'purchases' && (
              <div>
                {!purchases.length ? (
                  <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                    No finalized purchases yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                          <th className="px-3 py-2">Invoice</th>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchases.map((sale) => (
                          <tr key={sale.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-2 font-semibold text-slate-900">{sale.invoice_no}</td>
                            <td className="px-3 py-2 text-slate-600">{prettyDate(sale.sold_at)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-900">
                              {inr(sale.total_inr)}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  className="btn ghost xs"
                                  onClick={() => setPreviewSaleId(sale.id)}
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  className="btn ghost xs"
                                  onClick={() => download(sale.id)}
                                  disabled={downloadingSaleId === sale.id}
                                >
                                  {downloadingSaleId === sale.id ? '…' : 'PDF'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === 'cases' && (
              <div>
                {cases.isLoading && <div className="py-8 text-center text-sm text-slate-500">Loading cases…</div>}
                {cases.isError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    Could not load support cases.
                  </div>
                )}
                {cases.data && !(cases.data.data || []).length && (
                  <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                    No support cases recorded for this customer.
                  </div>
                )}
                {!!(cases.data?.data || []).length && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                          <th className="px-3 py-2">Case</th>
                          <th className="px-3 py-2">Subject</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Priority</th>
                          <th className="px-3 py-2">Opened</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(cases.data?.data || []).map((row: any) => (
                          <tr key={row.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-2 font-semibold text-slate-900">{row.case_code}</td>
                            <td className="px-3 py-2 text-slate-700">{row.subject}</td>
                            <td className="px-3 py-2">
                              <Badge variant={row.status === 'open' ? 'info' : row.status === 'pending' ? 'warning' : row.status === 'resolved' ? 'success' : 'secondary'}>
                                {row.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant={row.priority === 'urgent' ? 'destructive' : row.priority === 'high' ? 'warning' : 'secondary'}>
                                {row.priority}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-slate-600">{prettyDate(row.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tab === 'activity' && (
              <div>
                {activity.isLoading && <div className="py-8 text-center text-sm text-slate-500">Loading activity…</div>}
                {activity.isError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    Could not load the activity trail.
                  </div>
                )}
                {!!(activity.data?.data || []).length && (
                  <ol className="space-y-2">
                    {(activity.data?.data || []).map((row: any) => (
                      <li key={row.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">{row.subject}</span>
                          <Badge variant={row.done_at ? 'success' : 'warning'}>
                            {row.done_at ? 'Done' : 'Open'}
                          </Badge>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500">
                          {row.kind} · {row.created_by_name || 'system'} · due {prettyDate(row.due_on)}
                        </div>
                        {row.notes && <p className="mt-2 text-[13px] text-slate-700">{row.notes}</p>}
                      </li>
                    ))}
                  </ol>
                )}
                {activity.data && !(activity.data.data || []).length && (
                  <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                    No follow-ups logged for this customer.
                  </div>
                )}
              </div>
            )}

            {tab === 'consent' && (
              <div>
                {!consent.length ? (
                  <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">
                    No consent changes recorded.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {consent.map((event: any) => (
                      <li key={event.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="inline-flex items-center gap-2 text-slate-700">
                          <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                          {event.status}
                          <span className="text-[11px] text-slate-500">({event.source})</span>
                        </span>
                        <span className="text-[11px] text-slate-500">{prettyDate(event.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      {editing && customer && (
        <EditCustomerModal
          customer={{ ...customer, id: customerId }}
          onClose={() => setEditing(false)}
          onSaved={() => {
            detail.refetch();
            onChanged();
          }}
        />
      )}

      {previewSaleId && <InvoiceModal saleId={previewSaleId} onClose={() => setPreviewSaleId(null)} />}
    </>
  );
}

/* ── Sortable table head ───────────────────────────────────────────────────── */

function SortHead({
  label,
  column,
  sort,
  dir,
  onSort,
  align = 'left',
}: {
  label: string;
  column: string;
  sort: string;
  dir: 'asc' | 'desc';
  onSort: (column: string) => void;
  align?: 'left' | 'right';
}) {
  const active = sort === column;
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th className="whitespace-nowrap px-3 py-2.5">
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors',
          align === 'right' && 'justify-end',
          active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800',
        )}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

/* ── Customer list ─────────────────────────────────────────────────────────── */

const EMPTY_FILTERS = {
  q: '',
  minSpent: '',
  maxSpent: '',
  recency: '',
  lastFrom: '',
  lastTo: '',
};

type Filters = typeof EMPTY_FILTERS;

function CustomerList({ startNew, onNewClosed }: { startNew: boolean; onNewClosed: () => void }) {
  const { can } = useAuth();
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [newOpen, setNewOpen] = useState(startNew);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [sort, setSort] = useState('created_at');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const extra = useMemo(() => {
    const parts: string[] = [];
    if (applied.minSpent) parts.push(`&min_spent=${encodeURIComponent(applied.minSpent)}`);
    if (applied.maxSpent) parts.push(`&max_spent=${encodeURIComponent(applied.maxSpent)}`);
    if (applied.recency === 'repeat') parts.push('&repeat=1');
    if (applied.recency.startsWith('last:')) parts.push(`&last_days=${applied.recency.slice(5)}`);
    if (applied.recency.startsWith('lapsed:')) parts.push(`&lapsed_days=${applied.recency.slice(7)}`);
    if (applied.recency === 'custom') {
      if (applied.lastFrom) parts.push(`&last_from=${applied.lastFrom}`);
      if (applied.lastTo) parts.push(`&last_to=${applied.lastTo}`);
    }
    return parts.join('');
  }, [applied]);

  const query = useQuery({
    queryKey: ['customers', applied, page, limit, sort, dir],
    queryFn: () =>
      api.get(
        `/customers?q=${encodeURIComponent(applied.q)}&sort=${sort}&dir=${dir}&page=${page}&limit=${limit}${extra}`,
      ),
  });

  // Portfolio totals are a report, not a count over the visible page.
  const report = useQuery({
    queryKey: ['customer-report', 'month'],
    queryFn: () => api.get('/reports/customers?preset=month'),
    enabled: can('reports.view'),
    retry: false,
  });

  const rows: Customer[] = query.data?.data || [];
  const total = Number(query.data?.total ?? 0);
  const hasFilters = !!(applied.q || applied.minSpent || applied.maxSpent || applied.recency);

  const closeNew = () => {
    setNewOpen(false);
    if (startNew) onNewClosed();
  };

  const search = () => {
    setApplied({ ...draft });
    setPage(1);
  };

  const clearAll = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const toggleSort = (column: string) => {
    if (sort === column) {
      setDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(column);
      // Money and counts are most useful highest-first; names A-Z.
      setDir(column === 'name' || column === 'customer_code' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const exportCsv = async () => {
    try {
      setExporting(true);
      // Exports every match, not just the visible page. 5000 is a guard rail,
      // not a paging limit: a single company will not exceed it.
      const res = await api.get(
        `/customers?q=${encodeURIComponent(applied.q)}&sort=${sort}&dir=${dir}&page=1&limit=5000${extra}`,
      );
      downloadCsv(`customers-${fileStamp()}`, EXPORT_COLUMNS, res.data || []);
    } catch (e: any) {
      alert(`Export failed: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  const stats = report.data?.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="CRM &amp; Sales"
        meta={total > 0 ? `${total} matching ${total === 1 ? 'profile' : 'profiles'}` : 'Customer master'}
        title="Customers"
        description="Every registered customer, with spend, purchase recency and marketing consent. Records are never merged automatically — a shared phone resolves to an explicit choice."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => query.refetch()} disabled={query.isFetching}>
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </span>
            </button>
            <button type="button" className="btn ghost" onClick={exportCsv} disabled={exporting || !rows.length}>
              <span className="inline-flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />
                {exporting ? 'Exporting…' : 'Export CSV'}
              </span>
            </button>
            {can('crm.manage') && (
              <button type="button" className="btn" onClick={() => setNewOpen(true)}>
                <span className="inline-flex items-center gap-1.5">
                  <Plus className="h-4 w-4" />
                  New customer
                </span>
              </button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Total customers"
          value={stats ? stats.total : total}
          hint={stats ? 'All profiles on this company record' : 'Matching the current filters'}
          icon={UsersRound}
          tone="brand"
        />
        <Kpi
          label="Repeat buyers"
          value={stats ? stats.repeat_customers : '—'}
          hint={stats ? `${(Number(stats.repeat_rate) * 100).toFixed(0)}% of the base bought twice or more` : 'Needs reports.view'}
          icon={Repeat}
          tone="violet"
        />
        <Kpi
          label="New this month"
          value={stats ? stats.new_customers : '—'}
          hint={stats ? 'Profiles created in the last 30 days' : 'Needs reports.view'}
          icon={Plus}
          tone="emerald"
        />
        <Kpi
          label="Opted in"
          value={rows.filter((r) => r.marketing_consent).length}
          hint={rows.length ? `Of ${rows.length} on this page` : 'No rows on this page'}
          icon={ShieldCheck}
          tone="amber"
        />
      </div>

      <CrmNav />

      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[240px] flex-1">
            <label className="lbl">Search</label>
            <input
              placeholder="Name / phone / code / email"
              value={draft.q}
              onChange={(e) => setDraft({ ...draft, q: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  search();
                }
              }}
            />
          </div>
          <div className="w-[130px]">
            <label className="lbl">Min spend ₹</label>
            <input
              inputMode="numeric"
              value={draft.minSpent}
              onChange={(e) => setDraft({ ...draft, minSpent: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  search();
                }
              }}
            />
          </div>
          <div className="w-[130px]">
            <label className="lbl">Max spend ₹</label>
            <input
              inputMode="numeric"
              value={draft.maxSpent}
              onChange={(e) => setDraft({ ...draft, maxSpent: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  search();
                }
              }}
            />
          </div>
          <div className="w-[240px]">
            <label className="lbl">Last purchase</label>
            <select value={draft.recency} onChange={(e) => setDraft({ ...draft, recency: e.target.value })}>
              <option value="">Any time</option>
              <option value="last:30">Bought within 30 days</option>
              <option value="last:60">Bought within 60 days</option>
              <option value="last:90">Bought within 90 days</option>
              <option value="last:180">Bought within 180 days</option>
              <option value="lapsed:90">Lapsed 90+ days</option>
              <option value="lapsed:180">Lapsed 180+ days</option>
              <option value="repeat">Repeat buyers (2+ bills)</option>
              <option value="custom">Custom range…</option>
            </select>
          </div>
          {draft.recency === 'custom' && (
            <>
              <div>
                <label className="lbl">From</label>
                <input
                  type="date"
                  value={draft.lastFrom}
                  onChange={(e) => setDraft({ ...draft, lastFrom: e.target.value })}
                />
              </div>
              <div>
                <label className="lbl">To</label>
                <input
                  type="date"
                  value={draft.lastTo}
                  onChange={(e) => setDraft({ ...draft, lastTo: e.target.value })}
                />
              </div>
            </>
          )}
          <button type="button" className="btn primary" onClick={search}>
            <span className="inline-flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Search
            </span>
          </button>
          {hasFilters && (
            <button type="button" className="btn ghost" onClick={clearAll}>
              <span className="inline-flex items-center gap-1.5">
                <X className="h-3.5 w-3.5" />
                Clear
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading customers…
          </div>
        ) : query.isError ? (
          <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Could not load customers. {(query.error as any)?.message || 'Check the API connection.'}
          </div>
        ) : !rows.length ? (
          <div className="py-16 text-center">
            <UsersRound className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              {hasFilters ? 'No customers match these filters.' : 'No customers yet.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {hasFilters
                ? 'Widen the spend band or clear the recency filter.'
                : 'Register the first customer to start tracking purchases and consent.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left">
                    <th className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      #
                    </th>
                    <SortHead label="Code" column="customer_code" sort={sort} dir={dir} onSort={toggleSort} />
                    <SortHead label="Name" column="name" sort={sort} dir={dir} onSort={toggleSort} />
                    <th className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Contact
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      City
                    </th>
                    <SortHead
                      label="Purchases"
                      column="purchase_count"
                      sort={sort}
                      dir={dir}
                      onSort={toggleSort}
                      align="right"
                    />
                    <SortHead
                      label="Total spent"
                      column="total_spent_inr"
                      sort={sort}
                      dir={dir}
                      onSort={toggleSort}
                      align="right"
                    />
                    <SortHead
                      label="Last purchase"
                      column="last_purchase_at"
                      sort={sort}
                      dir={dir}
                      onSort={toggleSort}
                    />
                    <th className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Consent
                    </th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((customer, index) => (
                    <tr
                      key={customer.id}
                      className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-brand-50/40"
                      onClick={() => setSelectedId(customer.id)}
                    >
                      <td className="px-3 py-2.5 text-xs text-slate-400">{(page - 1) * limit + index + 1}</td>
                      <td className="px-3 py-2.5 text-xs font-medium text-slate-500">{customer.customer_code}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{customer.name}</div>
                        <div className="text-[11px] text-slate-500">{addressOf(customer)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="inline-flex items-center gap-1.5 text-slate-700">
                          <Phone className="h-3 w-3 text-slate-400" />
                          {customer.phone}
                        </div>
                        <div className="text-[11px] text-slate-500">{customer.email || '—'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{customer.city || '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        {customer.purchase_count ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                        {inr(customer.total_spent_inr)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                        {customer.last_purchase_at ? prettyDate(customer.last_purchase_at) : 'Never'}
                      </td>
                      <td className="px-3 py-2.5">
                        {customer.marketing_consent ? (
                          <Badge variant="success">Opted in</Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          className="btn ghost xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(customer.id);
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 px-4 pb-4">
              <Pagination
                page={page}
                limit={limit}
                total={total}
                noun="customers"
                onPage={setPage}
                onLimit={(next) => {
                  setLimit(next);
                  setPage(1);
                }}
              />
            </div>
          </>
        )}
      </div>

      {newOpen && (
        <NewCustomerModal
          onClose={closeNew}
          onSaved={() => query.refetch()}
          onOpenExisting={(id) => {
            query.refetch();
            setSelectedId(id);
          }}
        />
      )}

      {selectedId && (
        <CustomerDetailModal
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            query.refetch();
            report.refetch();
          }}
        />
      )}
    </div>
  );
}

export default function Customers({ mode = 'view' }: { mode?: 'new' | 'view' }) {
  const navigate = useNavigate();
  return <CustomerList startNew={mode === 'new'} onNewClosed={() => navigate('/admin/customers')} />;
}
