/**
 * Phase 2 — Leads & pipeline.
 *
 * Board and table views over `GET /api/leads`, with a lead detail panel that
 * manages follow-up activities (`/api/activities`) and the atomic lead → customer
 * conversion (`POST /api/leads/:id/convert`).
 *
 * Write controls render only for `crm.manage` holders; the API enforces the
 * same permission on every request.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useToast } from '../../../components/ui/Toast';
import {
  AlertCircle,
  Archive,
  CalendarClock,
  CheckCircle2,
  LifeBuoy,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  UsersRound,
  X,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { formatInr } from '../../../lib/utils';
import { useAuth } from '../../../hooks/auth';
import Modal from '../../../components/Modal';
import { Badge } from '../../../components/ui/Badge';
import {
  ACTIVITY_KINDS,
  ACTIVITY_LABELS,
  CrmNav,
  Field,
  Kpi,
  LEAD_SOURCES,
  LEAD_STAGES,
  Pagination,
  STAGE_META,
  StageBadge,
  isOverdue,
  prettyDate,
  todayIso,
  useOwners,
  type Activity,
  type ActivityKind,
  type Lead,
  type LeadStage,
} from './crmUi';

type Filters = { q: string; stage: string; due: string; owner: string; includeInactive: boolean };
const EMPTY_FILTERS: Filters = { q: '', stage: '', due: '', owner: '', includeInactive: false };

type ActivityDraft = { subject: string; kind: ActivityKind; due_on: string; notes: string };
const EMPTY_ACTIVITY: ActivityDraft = { subject: '', kind: 'call', due_on: '', notes: '' };

/* ── Lead create / edit ────────────────────────────────────────────────────── */

function LeadFormModal({ lead, onClose, onSaved }: { lead?: Lead | null; onClose: () => void; onSaved: () => void }) {
  const editing = !!lead;
  const converted = !!lead?.customer_id;
  const { owners, available } = useOwners(true);
  const [form, setForm] = useState({
    name: lead?.name ?? '',
    company: lead?.company ?? '',
    phone: lead?.phone ?? '',
    email: lead?.email ?? '',
    source: lead?.source ?? 'manual',
    stage: (lead?.stage ?? 'new') as LeadStage,
    estimated_value_inr: String(lead?.estimated_value_inr ?? 0),
    owner_user_id: lead?.owner_user_id ?? '',
    next_follow_up_on: lead?.next_follow_up_on ?? '',
    notes: lead?.notes ?? '',
    lost_reason: lead?.lost_reason ?? '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));
  const stageOptions = LEAD_STAGES.filter((stage) => stage !== 'won' || converted);

  const save = async () => {
    if (!form.name.trim()) {
      setError('Lead name is required.');
      return;
    }
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      company: form.company || null,
      phone: form.phone || null,
      email: form.email || null,
      source: form.source,
      stage: form.stage,
      estimated_value_inr: Number(form.estimated_value_inr) || 0,
      owner_user_id: form.owner_user_id || null,
      next_follow_up_on: form.next_follow_up_on || null,
      notes: form.notes || null,
    };
    if (form.stage === 'lost') payload.lost_reason = form.lost_reason || null;
    else if (editing) payload.lost_reason = null;

    try {
      setSaving(true);
      setError('');
      if (editing && lead) await api.patch(`/leads/${lead.id}`, payload);
      else await api.post('/leads', payload);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `Edit ${lead?.lead_code}` : 'New lead'}
      subtitle={
        editing
          ? 'Update the enquiry. Stage “Won” is only granted by converting the lead to a customer.'
          : 'Capture an enquiry. The owner defaults to you, and follow-ups are tracked separately.'
      }
      icon={<Target className="w-5 h-5" />}
      onClose={onClose}
      size="lg"
      zIndex={editing ? 1200 : 1000}
      footer={
        <>
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create lead'}
          </button>
        </>
      }
    >
      {error && <div className="err-box" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="modal-grid">
        <Field label="Lead name" required>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Ananya Rao" />
        </Field>
        <Field label="Company">
          <input value={form.company} onChange={(e) => set('company', e.target.value)} placeholder="Optional" />
        </Field>
        <Field label="Phone">
          <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="10-digit mobile" />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label="Source">
          <select value={form.source} onChange={(e) => set('source', e.target.value)}>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {source.charAt(0).toUpperCase() + source.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stage">
          <select value={form.stage} onChange={(e) => set('stage', e.target.value)}>
            {stageOptions.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_META[stage].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Estimated value (₹)">
          <input
            type="number"
            min={0}
            step={1000}
            value={form.estimated_value_inr}
            onChange={(e) => set('estimated_value_inr', e.target.value)}
          />
        </Field>
        <Field label="Next follow-up">
          <input type="date" value={form.next_follow_up_on || ''} onChange={(e) => set('next_follow_up_on', e.target.value)} />
        </Field>
        {available && (
          <Field label="Owner" hint="Only active users in this company can own a lead.">
            <select value={form.owner_user_id} onChange={(e) => set('owner_user_id', e.target.value)}>
              <option value="">Me (default)</option>
              {owners.map((owner) => (
                <option key={owner.user_id} value={owner.user_id}>
                  {owner.display_name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label="Notes">
          <textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Requirement, budget, preferred visit…" />
        </Field>
      </div>

      {form.stage === 'lost' && (
        <div style={{ marginTop: 12 }}>
          <Field label="Reason lost">
            <textarea rows={2} value={form.lost_reason} onChange={(e) => set('lost_reason', e.target.value)} placeholder="Why the enquiry did not proceed" />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/* ── Convert lead → customer ───────────────────────────────────────────────── */

function ConvertLeadModal({
  lead,
  onClose,
  onConverted,
}: {
  lead: Lead;
  onClose: () => void;
  onConverted: (result: { customer: any; lead: any }) => void;
}) {
  const [form, setForm] = useState({
    name: lead.name ?? '',
    phone: lead.phone ?? '',
    email: lead.email ?? '',
    address_line1: '',
    city: '',
    state: '',
    postal_code: '',
    notes: '',
    marketing_consent: true,
  });
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const set = (key: string, value: unknown) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    const missing = ['name', 'phone', 'address_line1', 'city', 'state', 'postal_code'].filter(
      (key) => !String((form as any)[key] ?? '').trim(),
    );
    if (missing.length) {
      setError(`A customer needs a name, phone and full address. Missing: ${missing.join(', ')}.`);
      return;
    }
    try {
      setSaving(true);
      setError('');
      setDuplicates([]);
      const res = await api.post(`/leads/${lead.id}/convert`, form);
      onConverted(res.data);
      onClose();
    } catch (e: any) {
      setError(e.message);
      // 409 duplicate responses carry the existing customer rows.
      setDuplicates(Array.isArray(e.body?.data) ? e.body.data : []);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`Convert ${lead.lead_code} to a customer`}
      subtitle="Creates the customer record and marks the lead as won in one transaction."
      icon={<UsersRound className="w-5 h-5" />}
      onClose={onClose}
      size="lg"
      zIndex={1300}
      footer={
        <>
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={save} disabled={saving}>
            {saving ? 'Converting…' : 'Convert to customer'}
          </button>
        </>
      }
    >
      {error && <div className="err-box" style={{ marginBottom: 12 }}>{error}</div>}
      {duplicates.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="font-semibold">That phone already belongs to an existing customer:</div>
          <ul className="mt-1 list-disc pl-5">
            {duplicates.map((customer) => (
              <li key={customer.id}>
                {customer.customer_code ? `${customer.customer_code} — ` : ''}
                {customer.name} ({customer.phone || 'no phone'})
              </li>
            ))}
          </ul>
          <div className="mt-1.5">
            Records are never merged automatically. Review the existing profile in the customer directory before creating another.
          </div>
        </div>
      )}
      <div className="modal-note" style={{ marginBottom: 12 }}>
        The customer record requires a complete postal address. A phone number that already exists is rejected — it is never merged silently.
      </div>

      <div className="modal-grid">
        <Field label="Customer name" required>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Phone" required>
          <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Street address" required>
            <input value={form.address_line1} onChange={(e) => set('address_line1', e.target.value)} placeholder="House / street / locality" />
          </Field>
        </div>
        <Field label="City" required>
          <input value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field label="State" required>
          <input value={form.state} onChange={(e) => set('state', e.target.value)} />
        </Field>
        <Field label="PIN code" required>
          <input value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
        </Field>
      </div>

      <div style={{ marginTop: 12 }}>
        <Field label="Notes">
          <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional customer note" />
        </Field>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13 }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={form.marketing_consent}
          onChange={(e) => set('marketing_consent', e.target.checked)}
        />
        <span>Marketing consent (WhatsApp &amp; SMS campaigns)</span>
      </label>
    </Modal>
  );
}

/* ── Lead detail + follow-up activities ────────────────────────────────────── */

function LeadDetailModal({
  leadId,
  onClose,
  onChanged,
}: {
  leadId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const manage = can('crm.manage');
  const detail = useQuery({
    queryKey: ['crm-lead', leadId],
    queryFn: () => api.get(`/leads/${leadId}`),
    retry: false,
  });
  const lead: (Lead & { activities: Activity[] }) | undefined = detail.data?.data;

  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState<{ code: string; name: string } | null>(null);
  const [stageSaving, setStageSaving] = useState(false);
  const [activity, setActivity] = useState<ActivityDraft>(EMPTY_ACTIVITY);
  const [activityError, setActivityError] = useState('');
  const [activitySaving, setActivitySaving] = useState(false);

  const refresh = () => {
    detail.refetch();
    onChanged();
  };

  const changeStage = async (stage: LeadStage) => {
    if (!lead || stage === lead.stage) return;
    if (stage === 'won' && !lead.customer_id) {
      setConverting(true);
      return;
    }
    try {
      setStageSaving(true);
      setError('');
      await api.patch(`/leads/${lead.id}`, { stage });
      refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setStageSaving(false);
    }
  };

  const addActivity = async () => {
    if (!lead) return;
    if (!activity.subject.trim()) {
      setActivityError('Follow-up subject is required.');
      return;
    }
    try {
      setActivitySaving(true);
      setActivityError('');
      await api.post('/activities', {
        lead_id: lead.id,
        kind: activity.kind,
        subject: activity.subject.trim(),
        due_on: activity.due_on || null,
        notes: activity.notes || null,
      });
      setActivity(EMPTY_ACTIVITY);
      refresh();
    } catch (e: any) {
      setActivityError(e.message);
    } finally {
      setActivitySaving(false);
    }
  };

  const toggleActivity = async (item: Activity) => {
    try {
      setError('');
      await api.patch(`/activities/${item.id}`, { done: !item.done_at });
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const archiveActivity = async (item: Activity) => {
    if (!window.confirm(`Archive follow-up “${item.subject}”? It stays in the audit trail.`)) return;
    try {
      setError('');
      await api.del(`/activities/${item.id}`);
      refresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const archiveLead = async () => {
    if (!lead) return;
    if (!window.confirm(`Archive lead ${lead.lead_code} (${lead.name})? It disappears from the pipeline but is kept for audit.`)) return;
    try {
      await api.del(`/leads/${lead.id}`);
      onChanged();
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const activities = lead?.activities || [];
  const openActivities = activities.filter((item) => !item.done_at);

  return (
    <>
      <Modal
        title={lead ? lead.name : 'Lead'}
        subtitle={lead ? `${lead.lead_code}${lead.company ? ` · ${lead.company}` : ''}${lead.phone ? ` · ${lead.phone}` : ''}` : 'Loading lead…'}
        icon={<Target className="w-5 h-5" />}
        onClose={onClose}
        size="xl"
        footer={
          <>
            {lead && (
              <button type="button" className="btn ghost" onClick={archiveLead} disabled={!manage || !lead.active}>
                <span className="inline-flex items-center gap-1.5">
                  <Archive className="w-3.5 h-3.5" /> Archive
                </span>
              </button>
            )}
            <span className="grow" />
            <button type="button" className="btn ghost" onClick={onClose}>
              Close
            </button>
            {lead && manage && (
              <>
                <button type="button" className="btn ghost" onClick={() => setEditing(true)}>
                  <span className="inline-flex items-center gap-1.5">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </span>
                </button>
                {!lead.customer_id && lead.active && (
                  <button type="button" className="btn" onClick={() => setConverting(true)}>
                    Convert to customer
                  </button>
                )}
              </>
            )}
          </>
        }
      >
        {!lead ? (
          <div className="empty" style={{ padding: 40 }}>Loading lead…</div>
        ) : (
          <>
            {error && <div className="err-box" style={{ marginBottom: 12 }}>{error}</div>}

            {converted && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <strong>{converted.code}</strong> created for {converted.name}. The lead is now won.{' '}
                <Link to="/admin/customers" className="font-semibold underline">
                  Open customer directory
                </Link>
              </div>
            )}

            {lead.customer_id && !converted && (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Converted to customer <strong>{lead.customer_name || lead.customer_id}</strong>.{' '}
                <Link to="/admin/customers" className="font-semibold underline">
                  Open customer directory
                </Link>
              </div>
            )}

            {!lead.active && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                This lead is archived. It is hidden from the pipeline but retained for reporting and audit.
              </div>
            )}

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Estimated value</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{formatInr(lead.estimated_value_inr)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Stage</div>
                <div className="mt-1.5"><StageBadge stage={lead.stage} /></div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Next follow-up</div>
                <div className={`mt-1 text-sm font-semibold ${isOverdue(lead.next_follow_up_on) ? 'text-rose-600' : 'text-slate-900'}`}>
                  {prettyDate(lead.next_follow_up_on)}
                  {isOverdue(lead.next_follow_up_on) && <span className="ml-1 text-[11px]">overdue</span>}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Owner</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{lead.owner_name || 'Unassigned'}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="space-y-3 lg:col-span-1">
                <div>
                  <p className="modal-section-title">Contact</p>
                  <div className="pd-field"><span>Phone</span><strong>{lead.phone || '—'}</strong></div>
                  <div className="pd-field"><span>Email</span><strong>{lead.email || '—'}</strong></div>
                  <div className="pd-field"><span>Source</span><strong className="capitalize">{lead.source || '—'}</strong></div>
                  <div className="pd-field"><span>Created</span><strong>{prettyDate(lead.created_at)}</strong></div>
                  {lead.stage === 'lost' && (
                    <div className="pd-field" style={{ alignItems: 'flex-start' }}>
                      <span>Lost reason</span>
                      <strong style={{ textAlign: 'right' }}>{lead.lost_reason || 'Not recorded'}</strong>
                    </div>
                  )}
                </div>

                {manage && lead.active && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <label className="lbl" style={{ marginTop: 0 }}>Move stage</label>
                    <select
                      value={lead.stage}
                      disabled={stageSaving}
                      onChange={(e) => changeStage(e.target.value as LeadStage)}
                    >
                      {LEAD_STAGES.map((stage) => (
                        <option key={stage} value={stage} disabled={stage === 'won' && !lead.customer_id}>
                          {STAGE_META[stage].label}
                          {stage === 'won' && !lead.customer_id ? ' — use Convert' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Won is granted only by converting the lead, which creates the customer in the same transaction.
                    </p>
                  </div>
                )}

                {lead.notes && (
                  <div>
                    <p className="modal-section-title">Notes</p>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{lead.notes}</p>
                  </div>
                )}
              </div>

              <div className="space-y-3 lg:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="modal-section-title" style={{ margin: 0 }}>
                    Follow-ups ({openActivities.length} open / {activities.length} total)
                  </p>
                  {openActivities.some((item) => isOverdue(item.due_on)) && (
                    <Badge variant="destructive" className="bg-rose-50 text-rose-700 border-rose-200">
                      <AlertCircle className="w-3 h-3" /> Overdue
                    </Badge>
                  )}
                </div>

                {manage && lead.active && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {activityError && <div className="mb-2 text-xs text-rose-600">{activityError}</div>}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
                      <div className="sm:col-span-3">
                        <input
                          value={activity.subject}
                          onChange={(e) => setActivity({ ...activity, subject: e.target.value })}
                          placeholder="Follow-up subject"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addActivity();
                            }
                          }}
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <select
                          value={activity.kind}
                          onChange={(e) => setActivity({ ...activity, kind: e.target.value as ActivityKind })}
                        >
                          {ACTIVITY_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {ACTIVITY_LABELS[kind]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-1">
                        <input
                          type="date"
                          value={activity.due_on}
                          onChange={(e) => setActivity({ ...activity, due_on: e.target.value })}
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <button type="button" className="btn w-full" onClick={addActivity} disabled={activitySaving}>
                          {activitySaving ? '…' : 'Add'}
                        </button>
                      </div>
                    </div>
                    <input
                      value={activity.notes}
                      onChange={(e) => setActivity({ ...activity, notes: e.target.value })}
                      placeholder="Optional note (what to discuss, outcome expected…)"
                      style={{ marginTop: 8 }}
                    />
                  </div>
                )}

                {activities.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-xs text-slate-500">
                    No follow-ups yet. Add a call or visit so this lead does not go cold.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {activities.map((item) => {
                      const overdue = !item.done_at && isOverdue(item.due_on);
                      return (
                        <div key={item.id} className="flex flex-wrap items-start gap-3 px-3 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                {ACTIVITY_LABELS[item.kind] || item.kind}
                              </span>
                              <span className="text-sm font-semibold text-slate-900">{item.subject}</span>
                              {item.done_at ? (
                                <Badge variant="success"><CheckCircle2 className="w-3 h-3" /> Done</Badge>
                              ) : overdue ? (
                                <Badge variant="destructive">Overdue</Badge>
                              ) : (
                                <Badge variant="info">Open</Badge>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <CalendarClock className="w-3 h-3" />
                                {prettyDate(item.due_on)}
                              </span>
                              {item.created_by_name && <span>· {item.created_by_name}</span>}
                            </div>
                            {item.notes && <p className="mt-1 text-[12px] text-slate-600">{item.notes}</p>}
                            {item.outcome && <p className="mt-1 text-[12px] text-slate-600"><strong>Outcome:</strong> {item.outcome}</p>}
                          </div>
                          {manage && (
                            <div className="flex items-center gap-1.5">
                              <button type="button" className="btn ghost xs" onClick={() => toggleActivity(item)}>
                                {item.done_at ? 'Reopen' : 'Done'}
                              </button>
                              <button
                                type="button"
                                className="btn ghost xs"
                                onClick={() => archiveActivity(item)}
                                title="Archive follow-up"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </Modal>

      {editing && lead && (
        <LeadFormModal
          lead={lead}
          onClose={() => setEditing(false)}
          onSaved={refresh}
        />
      )}

      {converting && lead && (
        <ConvertLeadModal
          lead={lead}
          onClose={() => setConverting(false)}
          onConverted={(result) => {
            setConverted({
              code: result.customer?.customer_code || 'Customer',
              name: result.customer?.name || lead.name,
            });
            refresh();
          }}
        />
      )}
    </>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function Leads() {
  const { can } = useAuth();
  const manage = can('crm.manage');
  const { owners, available: ownersAvailable } = useOwners(true);

  const [view, setView] = useState<'board' | 'table'>('board');
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [newOpen, setNewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [converting, setConverting] = useState<Lead | null>(null);
  const toast = useToast();

  const pipeline = useQuery({
    queryKey: ['crm-pipeline'],
    queryFn: () => api.get('/crm/pipeline'),
    retry: false,
  });
  const stats = pipeline.data?.data;

  const params = useMemo(() => {
    const search = new URLSearchParams();
    if (applied.q) search.set('q', applied.q);
    if (applied.stage) search.set('stage', applied.stage);
    if (applied.due) search.set('due', applied.due);
    if (applied.owner) search.set('owner', applied.owner);
    if (applied.includeInactive) search.set('include_inactive', '1');
    search.set('limit', view === 'board' ? '100' : String(limit));
    search.set('page', view === 'board' ? '1' : String(page));
    return search.toString();
  }, [applied, view, page, limit]);

  const leadsQuery = useQuery({
    queryKey: ['crm-leads', params],
    queryFn: () => api.get(`/leads?${params}`),
    retry: false,
  });

  const rows: Lead[] = leadsQuery.data?.data || [];
  const total = leadsQuery.data?.total || 0;

  const grouped = useMemo(() => {
    const out: Record<LeadStage, Lead[]> = {
      new: [], contacted: [], qualified: [], proposal: [], won: [], lost: [],
    };
    for (const lead of rows) {
      if (out[lead.stage]) out[lead.stage].push(lead);
    }
    return out;
  }, [rows]);

  const applyFilters = () => {
    setApplied({ ...draft });
    setPage(1);
  };

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const refresh = () => {
    leadsQuery.refetch();
    pipeline.refetch();
  };

  const archiveLead = async (lead: Lead) => {
    if (!window.confirm(`Archive lead ${lead.lead_code} (${lead.name})? It is hidden from the pipeline but kept for audit.`)) return;
    try {
      await api.del(`/leads/${lead.id}`);
      toast.success('Lead archived', `${lead.lead_code} (${lead.name}) is hidden from the pipeline but kept for audit.`);
      refresh();
    } catch (e: any) {
      toast.error('Could not archive lead', e.message);
    }
  };

  const hasFilters = !!(applied.q || applied.stage || applied.due || applied.owner || applied.includeInactive);
  const pipelineValue = (stats?.leads?.by_stage || [])
    .filter((row: any) => row.stage !== 'won' && row.stage !== 'lost')
    .reduce((sum: number, row: any) => sum + Number(row.value_inr || 0), 0);
  const activeLeads = (stats?.leads?.by_stage || [])
    .filter((row: any) => row.stage !== 'won' && row.stage !== 'lost')
    .reduce((sum: number, row: any) => sum + Number(row.count || 0), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">CRM &amp; Sales</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500">Pipeline as of {prettyDate(todayIso())}</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Leads &amp; Pipeline</h1>
          <p className="mt-1 text-xs text-slate-500 lg:text-sm">
            Enquiries move from new to proposal, then become customers through a single atomic conversion.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn ghost" onClick={refresh} disabled={leadsQuery.isFetching}>
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${leadsQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
            </span>
          </button>
          {manage && (
            <button type="button" className="btn" onClick={() => setNewOpen(true)}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> New lead
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Active leads" value={pipeline.isLoading ? '…' : activeLeads} hint="Excludes won and lost" icon={Target} tone="brand" />
        <Kpi label="Open pipeline value" value={pipeline.isLoading ? '…' : formatInr(pipelineValue)} hint="Estimated, not invoiced" icon={TrendingUp} tone="violet" />
        <Kpi
          label="Overdue follow-ups"
          value={pipeline.isLoading ? '…' : stats?.leads?.overdue_follow_ups ?? 0}
          hint="Leads past their next follow-up date"
          icon={CalendarClock}
          tone={stats?.leads?.overdue_follow_ups ? 'rose' : 'emerald'}
        />
        <Kpi
          label="Open support cases"
          value={pipeline.isLoading ? '…' : stats?.support_cases?.open ?? 0}
          hint="Open or pending"
          icon={LifeBuoy}
          tone="amber"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <CrmNav />
        <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            className={view === 'board' ? 'btn' : 'btn ghost'}
            style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={() => { setView('board'); setPage(1); }}
          >
            Board
          </button>
          <button
            type="button"
            className={view === 'table' ? 'btn' : 'btn ghost'}
            style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={() => { setView('table'); setPage(1); }}
          >
            Table
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="filters" style={{ marginBottom: 4 }}>
          <input
            placeholder="Name / phone / email / company / lead code"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyFilters();
              }
            }}
            style={{ minWidth: 240 }}
          />
          {view === 'table' && (
            <select value={draft.stage} onChange={(e) => setDraft({ ...draft, stage: e.target.value })}>
              <option value="">All stages</option>
              {LEAD_STAGES.map((stage) => (
                <option key={stage} value={stage}>{STAGE_META[stage].label}</option>
              ))}
            </select>
          )}
          <select value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })}>
            <option value="">Any follow-up date</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due today</option>
            <option value="week">Due in the next 7 days</option>
          </select>
          {ownersAvailable && (
            <select value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })}>
              <option value="">Any owner</option>
              <option value="me">Owned by me</option>
              {owners.map((owner) => (
                <option key={owner.user_id} value={owner.user_id}>{owner.display_name}</option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-600" style={{ minWidth: 160 }}>
            <input
              type="checkbox"
              checked={draft.includeInactive}
              onChange={(e) => setDraft({ ...draft, includeInactive: e.target.checked })}
              style={{ width: 'auto' }}
            />
            Include archived
          </label>
          <button type="button" className="btn" onClick={applyFilters}>
            <span className="inline-flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5" /> Search
            </span>
          </button>
          {hasFilters && (
            <button type="button" className="btn ghost" style={{ minWidth: 80, fontSize: 12 }} onClick={resetFilters}>
              Clear
            </button>
          )}
        </div>
      </div>

      {leadsQuery.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> Could not load leads. {(leadsQuery.error as Error)?.message}
        </div>
      )}

      {leadsQuery.isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading leads…</div>
      ) : view === 'board' ? (
        <div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {LEAD_STAGES.map((stage) => {
              const meta = STAGE_META[stage];
              const items = grouped[stage];
              const value = items.reduce((sum, lead) => sum + Number(lead.estimated_value_inr || 0), 0);
              return (
                <div key={stage} className="flex w-[248px] shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50/70">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">{meta.label}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-slate-500">{items.length}</span>
                  </div>
                  <div className="px-3 pt-2 text-[11px] font-medium text-slate-500">{formatInr(value)}</div>
                  <div className="flex flex-1 flex-col gap-2 p-2.5">
                    {items.length === 0 && <div className="px-1 py-6 text-center text-[11px] text-slate-400">No leads</div>}
                    {items.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => setSelectedId(lead.id)}
                        className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-300 hover:shadow"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{lead.name}</span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-400">{lead.lead_code}</span>
                        </div>
                        {lead.company && <div className="mt-0.5 truncate text-[11px] text-slate-500">{lead.company}</div>}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-700">{formatInr(lead.estimated_value_inr)}</span>
                          {lead.next_follow_up_on && (
                            <span className={`text-[10.5px] font-semibold ${isOverdue(lead.next_follow_up_on) ? 'text-rose-600' : 'text-slate-500'}`}>
                              {isOverdue(lead.next_follow_up_on) ? 'Overdue ' : ''}{prettyDate(lead.next_follow_up_on)}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="truncate text-[10.5px] text-slate-400">{lead.owner_name || 'Unassigned'}</span>
                          {!lead.active && <Badge variant="secondary">Archived</Badge>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {total > rows.length && (
            <p className="mt-2 text-[11px] text-slate-500">
              Showing the first {rows.length} of {total} leads. Narrow the filters or use the table view to page through everything.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="tbl" style={{ width: '100%', margin: 0 }}>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Contact</th>
                  <th>Stage</th>
                  <th style={{ textAlign: 'right' }}>Value</th>
                  <th>Owner</th>
                  <th>Next follow-up</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: 32 }}>
                      No leads match these filters.
                    </td>
                  </tr>
                )}
                {rows.map((lead) => (
                  <tr key={lead.id} className="row-clickable" onClick={() => setSelectedId(lead.id)}>
                    <td>
                      <div className="font-semibold text-slate-900">{lead.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {lead.lead_code}
                        {lead.company ? ` · ${lead.company}` : ''}
                        {!lead.active ? ' · archived' : ''}
                      </div>
                    </td>
                    <td>
                      <div>{lead.phone || '—'}</div>
                      <div className="text-[11px] text-slate-500">{lead.email || ''}</div>
                    </td>
                    <td><StageBadge stage={lead.stage} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatInr(lead.estimated_value_inr)}</td>
                    <td>{lead.owner_name || '—'}</td>
                    <td>
                      <span className={isOverdue(lead.next_follow_up_on) ? 'font-semibold text-rose-600' : ''}>
                        {prettyDate(lead.next_follow_up_on)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn ghost xs"
                          onClick={(e) => { e.stopPropagation(); setSelectedId(lead.id); }}
                        >
                          View
                        </button>
                        {manage && lead.active && !lead.customer_id && (
                          <button
                            type="button"
                            className="btn ghost xs"
                            onClick={(e) => { e.stopPropagation(); setConverting(lead); }}
                          >
                            Convert
                          </button>
                        )}
                        {manage && lead.active && (
                          <button
                            type="button"
                            className="btn ghost xs"
                            onClick={(e) => { e.stopPropagation(); archiveLead(lead); }}
                            title="Archive lead"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 pb-4">
            <Pagination
              page={page}
              limit={limit}
              total={total}
              noun="leads"
              onPage={setPage}
              onLimit={(next) => { setLimit(next); setPage(1); }}
            />
          </div>
        </div>
      )}

      {newOpen && <LeadFormModal onClose={() => setNewOpen(false)} onSaved={refresh} />}

      {selectedId && (
        <LeadDetailModal leadId={selectedId} onClose={() => setSelectedId(null)} onChanged={refresh} />
      )}

      {converting && (
        <ConvertLeadModal
          lead={converting}
          onClose={() => setConverting(null)}
          onConverted={() => { setConverting(null); refresh(); }}
        />
      )}
    </div>
  );
}
