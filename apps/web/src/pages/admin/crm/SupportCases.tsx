/**
 * Phase 2 — Support cases.
 *
 * List, filter and work `GET /api/support-cases`. Status changes are explicit
 * (open → pending → resolved → closed) and reopening clears `resolved_at`
 * server-side. Cases are archived, never hard-deleted.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../../../components/ui/Toast';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Inbox,
  LifeBuoy,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../hooks/auth';
import Modal from '../../../components/Modal';
import { Badge } from '../../../components/ui/Badge';
import {
  CASE_PRIORITIES,
  CASE_PRIORITY_META,
  CASE_STATUSES,
  CASE_STATUS_META,
  CasePriorityBadge,
  CaseStatusBadge,
  CrmNav,
  CustomerPicker,
  Field,
  Kpi,
  Pagination,
  prettyDate,
  useOwners,
  type CasePriority,
  type CaseStatus,
  type CustomerOption,
  type SupportCase,
} from './crmUi';

type Filters = { q: string; status: string; priority: string; assigned: string; includeInactive: boolean };
const EMPTY_FILTERS: Filters = { q: '', status: '', priority: '', assigned: '', includeInactive: false };

/* ── Create / edit a case ──────────────────────────────────────────────────── */

function CaseFormModal({
  supportCase,
  onClose,
  onSaved,
}: {
  supportCase?: SupportCase | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = !!supportCase;
  const { owners, available } = useOwners(true);
  const [form, setForm] = useState({
    subject: supportCase?.subject ?? '',
    description: supportCase?.description ?? '',
    priority: (supportCase?.priority ?? 'normal') as CasePriority,
    status: (supportCase?.status ?? 'open') as CaseStatus,
    assigned_to: supportCase?.assigned_to ?? '',
  });
  const [customer, setCustomer] = useState<CustomerOption | null>(
    supportCase?.customer_id
      ? { id: supportCase.customer_id, name: supportCase.customer_name || 'Linked customer' }
      : null,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.subject.trim()) {
      setError('Subject is required.');
      return;
    }
    const payload: Record<string, unknown> = {
      subject: form.subject.trim(),
      description: form.description || null,
      priority: form.priority,
      status: form.status,
      assigned_to: form.assigned_to || null,
    };
    // The API keeps the customer link fixed after creation; only send it on create.
    if (!editing) payload.customer_id = customer?.id || null;
    try {
      setSaving(true);
      setError('');
      if (editing && supportCase) await api.patch(`/support-cases/${supportCase.id}`, payload);
      else await api.post('/support-cases', payload);
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
      title={editing ? `Edit ${supportCase?.case_code}` : 'New support case'}
      subtitle={
        editing
          ? 'Update the case details. Status and priority can also be changed from the case panel.'
          : 'Log a customer issue. Assign an owner and a priority so it is not lost.'
      }
      icon={<LifeBuoy className="w-5 h-5" />}
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
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create case'}
          </button>
        </>
      }
    >
      {error && <div className="err-box" style={{ marginBottom: 12 }}>{error}</div>}

      <Field label="Subject" required>
        <input
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          placeholder="e.g. Ring resizing delay"
        />
      </Field>

      <div style={{ marginTop: 12 }}>
        <Field label="Description">
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What happened, what the customer expects, any reference numbers…"
          />
        </Field>
      </div>

      <div className="modal-grid" style={{ marginTop: 12 }}>
        <Field label="Priority">
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as CasePriority })}>
            {CASE_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{CASE_PRIORITY_META[priority].label}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as CaseStatus })}>
            {CASE_STATUSES.map((status) => (
              <option key={status} value={status}>{CASE_STATUS_META[status].label}</option>
            ))}
          </select>
        </Field>
        {available && (
          <Field label="Assigned to">
            <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">Unassigned</option>
              {owners.map((owner) => (
                <option key={owner.user_id} value={owner.user_id}>{owner.display_name}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <Field
          label="Customer"
          hint={
            editing
              ? 'The linked customer cannot be changed after a case is created.'
              : 'Search by name, phone or customer code. A case can be saved unlinked.'
          }
        >
          <CustomerPicker value={customer} onChange={setCustomer} disabled={editing} />
        </Field>
      </div>
    </Modal>
  );
}

/* ── Case detail ───────────────────────────────────────────────────────────── */

function CaseDetailModal({
  caseId,
  onClose,
  onChanged,
}: {
  caseId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const manage = can('crm.manage');
  const { owners, available: ownersAvailable } = useOwners(manage);
  const detail = useQuery({
    queryKey: ['crm-case', caseId],
    queryFn: () => api.get(`/support-cases/${caseId}`),
    retry: false,
  });
  const supportCase: SupportCase | undefined = detail.data?.data;

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const patch = async (payload: Record<string, unknown>) => {
    if (!supportCase) return;
    try {
      setBusy(true);
      setError('');
      await api.patch(`/support-cases/${supportCase.id}`, payload);
      detail.refetch();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!supportCase) return;
    if (!window.confirm(`Archive case ${supportCase.case_code}? It is hidden from the list but kept for audit.`)) return;
    try {
      await api.del(`/support-cases/${supportCase.id}`);
      onChanged();
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <>
      <Modal
        title={supportCase ? supportCase.subject : 'Support case'}
        subtitle={
          supportCase
            ? `${supportCase.case_code}${supportCase.customer_name ? ` · ${supportCase.customer_name}` : ''}`
            : 'Loading case…'
        }
        icon={<LifeBuoy className="w-5 h-5" />}
        onClose={onClose}
        size="xl"
        footer={
          <>
            {supportCase && (
              <button type="button" className="btn ghost" onClick={archive} disabled={!manage || !supportCase.active}>
                <span className="inline-flex items-center gap-1.5">
                  <Archive className="w-3.5 h-3.5" /> Archive
                </span>
              </button>
            )}
            <span className="grow" />
            <button type="button" className="btn ghost" onClick={onClose}>Close</button>
            {supportCase && manage && (
              <button type="button" className="btn ghost" onClick={() => setEditing(true)}>
                <span className="inline-flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /> Edit details
                </span>
              </button>
            )}
          </>
        }
      >
        {!supportCase ? (
          <div className="empty" style={{ padding: 40 }}>Loading case…</div>
        ) : (
          <>
            {error && <div className="err-box" style={{ marginBottom: 12 }}>{error}</div>}

            {!supportCase.active && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                This case is archived. It is hidden from the working list but retained for reporting and audit.
              </div>
            )}

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Status</div>
                <div className="mt-1.5"><CaseStatusBadge status={supportCase.status} /></div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Priority</div>
                <div className="mt-1.5"><CasePriorityBadge priority={supportCase.priority} /></div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Assigned to</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{supportCase.assigned_name || 'Unassigned'}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {supportCase.resolved_at ? 'Resolved' : 'Opened'}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {prettyDate(supportCase.resolved_at || supportCase.created_at)}
                </div>
              </div>
            </div>

            {manage && supportCase.active && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
                <label className="lbl" style={{ marginTop: 0 }}>Move status</label>
                <div className="flex flex-wrap gap-2">
                  {CASE_STATUSES.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={status === supportCase.status ? 'btn' : 'btn ghost'}
                      style={{ padding: '7px 14px', fontSize: 12.5 }}
                      disabled={busy || status === supportCase.status}
                      onClick={() => patch({ status })}
                    >
                      {CASE_STATUS_META[status].label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Resolving or closing records the resolution time; moving back to open or pending clears it.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <p className="modal-section-title">Description</p>
                {supportCase.description ? (
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{supportCase.description}</p>
                ) : (
                  <p className="text-[13px] text-slate-500">No description recorded.</p>
                )}

                <p className="modal-section-title" style={{ marginTop: 16 }}>Case</p>
                <div className="pd-field"><span>Case code</span><strong>{supportCase.case_code}</strong></div>
                <div className="pd-field"><span>Customer</span><strong>{supportCase.customer_name || 'Not linked'}</strong></div>
                <div className="pd-field"><span>Created</span><strong>{prettyDate(supportCase.created_at)}</strong></div>
                <div className="pd-field"><span>Last updated</span><strong>{prettyDate(supportCase.updated_at)}</strong></div>
                {supportCase.resolved_at && (
                  <div className="pd-field"><span>Resolved at</span><strong>{prettyDate(supportCase.resolved_at)}</strong></div>
                )}
              </div>

              {manage && supportCase.active && (
                <div className="space-y-3">
                  <div>
                    <label className="lbl">Priority</label>
                    <select
                      value={supportCase.priority}
                      disabled={busy}
                      onChange={(e) => patch({ priority: e.target.value })}
                    >
                      {CASE_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>{CASE_PRIORITY_META[priority].label}</option>
                      ))}
                    </select>
                  </div>

                  {ownersAvailable && (
                    <div>
                      <label className="lbl">Assigned to</label>
                      <select
                        value={supportCase.assigned_to || ''}
                        disabled={busy}
                        onChange={(e) => patch({ assigned_to: e.target.value || null })}
                      >
                        <option value="">Unassigned</option>
                        {owners.map((owner) => (
                          <option key={owner.user_id} value={owner.user_id}>{owner.display_name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
                    <strong className="block text-slate-700">Audit trail</strong>
                    Every status, priority and assignee change is recorded against your user account.
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      {editing && supportCase && (
        <CaseFormModal supportCase={supportCase} onClose={() => setEditing(false)} onSaved={() => { detail.refetch(); onChanged(); }} />
      )}
    </>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function SupportCases() {
  const { can } = useAuth();
  const manage = can('crm.manage');

  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [newOpen, setNewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const toast = useToast();

  const { owners, available: ownersAvailable } = useOwners(true);

  const pipeline = useQuery({
    queryKey: ['crm-pipeline'],
    queryFn: () => api.get('/crm/pipeline'),
    retry: false,
  });

  const params = useMemo(() => {
    const search = new URLSearchParams();
    if (applied.q) search.set('q', applied.q);
    if (applied.status) search.set('status', applied.status);
    if (applied.priority) search.set('priority', applied.priority);
    if (applied.assigned) search.set('assigned_to', applied.assigned);
    if (applied.includeInactive) search.set('include_inactive', '1');
    search.set('page', String(page));
    search.set('limit', String(limit));
    return search.toString();
  }, [applied, page, limit]);

  const casesQuery = useQuery({
    queryKey: ['crm-cases', params],
    queryFn: () => api.get(`/support-cases?${params}`),
    retry: false,
  });

  const rows: SupportCase[] = casesQuery.data?.data || [];
  const total = casesQuery.data?.total || 0;
  const byStatus = pipeline.data?.data?.support_cases?.by_status || {};

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
    casesQuery.refetch();
    pipeline.refetch();
  };

  const archiveCase = async (supportCase: SupportCase) => {
    if (!window.confirm(`Archive case ${supportCase.case_code} (${supportCase.subject})? It is kept for audit.`)) return;
    try {
      await api.del(`/support-cases/${supportCase.id}`);
      toast.success('Case archived', `${supportCase.case_code} (${supportCase.subject}) is kept for audit.`);
      refresh();
    } catch (e: any) {
      toast.error('Could not archive case', e.message);
    }
  };

  const hasFilters = !!(applied.q || applied.status || applied.priority || applied.assigned || applied.includeInactive);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">CRM &amp; Sales</span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500">Customer service desk</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Support Cases</h1>
          <p className="mt-1 text-xs text-slate-500 lg:text-sm">
            Track customer issues by status and priority. Records are archived, never deleted.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn ghost" onClick={refresh} disabled={casesQuery.isFetching}>
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${casesQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
            </span>
          </button>
          {manage && (
            <button type="button" className="btn" onClick={() => setNewOpen(true)}>
              <span className="inline-flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> New case
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Open" value={pipeline.isLoading ? '…' : byStatus.open ?? 0} hint="Needs first response" icon={Inbox} tone="sky" />
        <Kpi label="Pending" value={pipeline.isLoading ? '…' : byStatus.pending ?? 0} hint="Waiting on customer or team" icon={UserCheck} tone="amber" />
        <Kpi label="Resolved" value={pipeline.isLoading ? '…' : byStatus.resolved ?? 0} hint="Fix confirmed" icon={CheckCircle2} tone="emerald" />
        <Kpi label="Closed" value={pipeline.isLoading ? '…' : byStatus.closed ?? 0} hint="No further action" icon={Archive} tone="brand" />
      </div>

      <CrmNav />

      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="filters" style={{ marginBottom: 4 }}>
          <input
            placeholder="Subject / description / case code"
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
          <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
            <option value="">All statuses</option>
            {CASE_STATUSES.map((status) => (
              <option key={status} value={status}>{CASE_STATUS_META[status].label}</option>
            ))}
          </select>
          <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
            <option value="">All priorities</option>
            {CASE_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>{CASE_PRIORITY_META[priority].label}</option>
            ))}
          </select>
          {ownersAvailable && (
            <select value={draft.assigned} onChange={(e) => setDraft({ ...draft, assigned: e.target.value })}>
              <option value="">Any assignee</option>
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

      {casesQuery.isError && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 shrink-0" /> Could not load cases. {(casesQuery.error as Error)?.message}
        </div>
      )}

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="tbl" style={{ width: '100%', margin: 0 }}>
            <thead>
              <tr>
                <th>Case</th>
                <th>Customer</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Assigned</th>
                <th>Opened</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {casesQuery.isLoading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: 32 }}>
                    Loading cases…
                  </td>
                </tr>
              )}
              {!casesQuery.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-muted)', padding: 32 }}>
                    No support cases match these filters.
                  </td>
                </tr>
              )}
              {rows.map((item) => (
                <tr key={item.id} className="row-clickable" onClick={() => setSelectedId(item.id)}>
                    <td>
                      <div className="font-semibold text-slate-900">{item.subject}</div>
                      <div className="text-[11px] text-slate-500">
                        {item.case_code}
                        {!item.active ? ' · archived' : ''}
                      </div>
                    </td>
                    <td>{item.customer_name || '—'}</td>
                    <td><CasePriorityBadge priority={item.priority} /></td>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CaseStatusBadge status={item.status} />
                        {item.priority === 'urgent' && item.status === 'open' && (
                          <Badge variant="destructive" className="bg-rose-50 text-rose-700 border-rose-200">
                            <AlertCircle className="w-3 h-3" /> Attention
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td>{item.assigned_name || '—'}</td>
                    <td>{prettyDate(item.created_at)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn ghost xs"
                          onClick={(e) => { e.stopPropagation(); setSelectedId(item.id); }}
                        >
                          View
                        </button>
                        {manage && item.active && (
                          <button
                            type="button"
                            className="btn ghost xs"
                            onClick={(e) => { e.stopPropagation(); archiveCase(item); }}
                            title="Archive case"
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
            noun="cases"
            onPage={setPage}
            onLimit={(next) => { setLimit(next); setPage(1); }}
          />
        </div>
      </div>

      {newOpen && <CaseFormModal onClose={() => setNewOpen(false)} onSaved={refresh} />}

      {selectedId && (
        <CaseDetailModal caseId={selectedId} onClose={() => setSelectedId(null)} onChanged={refresh} />
      )}
    </div>
  );
}
