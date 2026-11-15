/**
 * Shared building blocks for the Phase 2 CRM screens (leads, activities and
 * support cases). Kept in one place so the three screens agree on stage names,
 * badge colours and search behaviour.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { LifeBuoy, Search, Target, UsersRound, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../../../lib/api';
import { cn } from '../../../lib/utils';
import { Badge } from '../../../components/ui/Badge';

export type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline';

/* ── Pipeline vocabulary (mirrors server/src/routes/crm-pipeline.js) ───────── */

export const LEAD_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const STAGE_META: Record<LeadStage, { label: string; variant: BadgeVariant; dot: string }> = {
  new: { label: 'New', variant: 'secondary', dot: 'bg-slate-400' },
  contacted: { label: 'Contacted', variant: 'info', dot: 'bg-sky-500' },
  qualified: { label: 'Qualified', variant: 'default', dot: 'bg-brand-500' },
  proposal: { label: 'Proposal', variant: 'warning', dot: 'bg-amber-500' },
  won: { label: 'Won', variant: 'success', dot: 'bg-emerald-500' },
  lost: { label: 'Lost', variant: 'destructive', dot: 'bg-rose-500' },
};

export const ACTIVITY_KINDS = ['call', 'meeting', 'email', 'note', 'task', 'whatsapp'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  call: 'Call',
  meeting: 'Meeting',
  email: 'Email',
  note: 'Note',
  task: 'Task',
  whatsapp: 'WhatsApp',
};

export const CASE_STATUSES = ['open', 'pending', 'resolved', 'closed'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_META: Record<CaseStatus, { label: string; variant: BadgeVariant }> = {
  open: { label: 'Open', variant: 'info' },
  pending: { label: 'Pending', variant: 'warning' },
  resolved: { label: 'Resolved', variant: 'success' },
  closed: { label: 'Closed', variant: 'secondary' },
};

export const CASE_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type CasePriority = (typeof CASE_PRIORITIES)[number];

export const CASE_PRIORITY_META: Record<CasePriority, { label: string; variant: BadgeVariant }> = {
  low: { label: 'Low', variant: 'secondary' },
  normal: { label: 'Normal', variant: 'info' },
  high: { label: 'High', variant: 'warning' },
  urgent: { label: 'Urgent', variant: 'destructive' },
};

export const LEAD_SOURCES = ['manual', 'walk-in', 'referral', 'website', 'phone', 'social', 'campaign', 'other'];

/* ── Records ───────────────────────────────────────────────────────────────── */

export type Lead = {
  id: string;
  lead_code: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source: string;
  stage: LeadStage;
  estimated_value_inr: number;
  owner_user_id?: string | null;
  owner_name?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  next_follow_up_on?: string | null;
  lost_reason?: string | null;
  active: number;
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: string;
  lead_id?: string | null;
  customer_id?: string | null;
  kind: ActivityKind;
  subject: string;
  notes?: string | null;
  due_on?: string | null;
  done_at?: string | null;
  outcome?: string | null;
  created_by_name?: string | null;
  created_at: string;
};

export type SupportCase = {
  id: string;
  case_code: string;
  customer_id?: string | null;
  customer_name?: string | null;
  subject: string;
  description?: string | null;
  status: CaseStatus;
  priority: CasePriority;
  assigned_to?: string | null;
  assigned_name?: string | null;
  resolved_at?: string | null;
  active: number;
  created_at: string;
  updated_at: string;
};

export type CustomerOption = { id: string; name: string; phone?: string | null; customer_code?: string };
export type OwnerOption = { user_id: string; display_name: string; email?: string };

/* ── Dates ─────────────────────────────────────────────────────────────────── */

/** Date-only "today" in the company time zone (Asia/Kolkata), matching the API. */
export function todayIso() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function prettyDate(value?: string | null) {
  if (!value) return '—';
  const day = String(value).slice(0, 10);
  const parsed = new Date(`${day}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function isOverdue(dateOnly?: string | null) {
  return !!dateOnly && String(dateOnly).slice(0, 10) < todayIso();
}

/* ── Small presentational helpers ──────────────────────────────────────────── */

export function StageBadge({ stage }: { stage: LeadStage }) {
  const meta = STAGE_META[stage] || STAGE_META.new;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const meta = CASE_STATUS_META[status] || CASE_STATUS_META.open;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function CasePriorityBadge({ priority }: { priority: CasePriority }) {
  const meta = CASE_PRIORITY_META[priority] || CASE_PRIORITY_META.normal;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

const KPI_TONES: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600',
  sky: 'bg-sky-50 text-sky-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  violet: 'bg-violet-50 text-violet-600',
};

export function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: keyof typeof KPI_TONES;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <div className={cn('p-2 rounded-lg', KPI_TONES[tone] || KPI_TONES.brand)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</div>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function CrmNav() {
  const tabs: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
    { to: '/admin/crm/leads', label: 'Leads & Pipeline', icon: Target },
    { to: '/admin/customers', label: 'Customers', icon: UsersRound },
    { to: '/admin/crm/support-cases', label: 'Support Cases', icon: LifeBuoy },
  ];

  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                isActive
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            <Icon className="w-3.5 h-3.5" />
            {tab.label}
          </NavLink>
        );
      })}
    </div>
  );
}

/** Page / page-size control shared by the CRM tables. */
export function Pagination({
  page,
  limit,
  total,
  noun,
  onPage,
  onLimit,
}: {
  page: number;
  limit: number;
  total: number;
  noun: string;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const numbers: Array<number | '...'> = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out: Array<number | '...'> = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    if (start > 2) out.push('...');
    for (let i = start; i <= end; i++) out.push(i);
    if (end < totalPages - 1) out.push('...');
    out.push(totalPages);
    return out;
  })();

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2 text-slate-500">
        <span>Show</span>
        <select
          value={limit}
          onChange={(e) => onLimit(Number(e.target.value))}
          style={{ width: 'auto', padding: '6px 10px' }}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span>per page</span>
        {total > 0 && (
          <span className="ml-1">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} {noun}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className="btn ghost"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          style={{ padding: '6px 12px', fontSize: 13 }}
        >
          ‹ Prev
        </button>
        {numbers.map((n, idx) =>
          n === '...' ? (
            <span key={`gap-${idx}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              type="button"
              key={n}
              onClick={() => onPage(n)}
              className={n === page ? 'btn' : 'btn ghost'}
              style={{ padding: '6px 11px', fontSize: 13, minWidth: 34 }}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className="btn ghost"
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          style={{ padding: '6px 12px', fontSize: 13 }}
        >
          Next ›
        </button>
      </div>
    </div>
  );
}

/** Labelled form row used by the CRM modals. */
export function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="lbl">
        {label}
        {required ? ' *' : ''}
      </label>
      {children}
      {hint && !error && <div className="mt-1 text-[11px] text-slate-500">{hint}</div>}
      {error && <div className="modal-error">{error}</div>}
    </div>
  );
}

/** Active users for owner/assignee pickers. Hidden when the user cannot list staff. */
export function useOwners(enabled = true) {
  const query = useQuery({
    queryKey: ['crm-owners'],
    queryFn: () => api.get('/staff/users'),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const owners: OwnerOption[] = (query.data?.data || [])
    .filter((u: any) => u.active)
    .map((u: any) => ({ user_id: u.user_id, display_name: u.display_name, email: u.email }));

  return { owners, available: !query.isError, loading: query.isLoading };
}

/**
 * Customer lookup for support cases. Uses the existing phone-first customer
 * search so a case is always linked to a real customer record.
 */
export function CustomerPicker({
  value,
  onChange,
  disabled,
}: {
  value: CustomerOption | null;
  onChange: (value: CustomerOption | null) => void;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['crm-customer-picker', submitted],
    queryFn: () =>
      api.get(`/customers?limit=8${submitted ? `&q=${encodeURIComponent(submitted)}` : ''}`),
    enabled: !disabled && submitted !== null,
    retry: false,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{value.name}</div>
          <div className="text-[11px] text-slate-500">
            {value.customer_code ? `${value.customer_code} · ` : ''}
            {value.phone || 'No phone'}
          </div>
        </div>
        {!disabled && (
          <button type="button" className="btn ghost xs" onClick={() => onChange(null)} title="Clear customer">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  const rows: CustomerOption[] = query.data?.data || [];

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setSubmitted(term.trim());
            }
          }}
          placeholder="Search customer by name, phone or code"
          disabled={disabled}
        />
        <button
          type="button"
          className="btn ghost"
          onClick={() => setSubmitted(term.trim())}
          disabled={disabled || query.isFetching}
        >
          <span className="inline-flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5" />
            {query.isFetching ? 'Searching…' : 'Search'}
          </span>
        </button>
      </div>

      {query.isError && (
        <div className="mt-2 text-xs text-rose-600">Could not search customers. You can still save the case unlinked.</div>
      )}

      {submitted !== null && !query.isLoading && !query.isError && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
          {rows.length === 0 && <div className="px-3 py-3 text-xs text-slate-500">No matching customers.</div>}
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-brand-50/60"
              onClick={() => {
                onChange(c);
                setTerm('');
                setSubmitted(null);
              }}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                <span className="block text-[11px] text-slate-500">
                  {c.customer_code ? `${c.customer_code} · ` : ''}
                  {c.phone || 'No phone'}
                </span>
              </span>
              <span className="text-[11px] font-semibold text-brand-600">Select</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
