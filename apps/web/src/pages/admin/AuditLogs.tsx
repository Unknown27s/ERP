/**
 * ==============================================================================
 * SYSTEM · AUDIT TRAIL (AuditLogs.tsx)
 * ==============================================================================
 * Append-only record of everything the company's users did.
 *
 * The API is the filter engine: search, action, date range and paging are all
 * applied server-side (`GET /api/audit-logs`) so the screen never claims to
 * show "all events" while only holding one page in memory.
 *
 * - `actions` comes from GET /api/audit-logs/actions, scoped to the shop, so
 *   the dropdown only offers actions that actually exist here.
 * - Export walks the pages and writes a real CSV; it is capped at 2000 rows and
 *   says so instead of silently truncating.
 * ==============================================================================
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  Copy,
  Download,
  History,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { cn, relativeTime } from '../../lib/utils';
import Modal from '../../components/Modal';
import PageHeader from '../../components/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { downloadCsv, fileStamp, type CsvColumn } from '../../lib/export';
import { Kpi, Pagination } from './crm/crmUi';

/* ── Types ─────────────────────────────────────────────────────────────────── */

type AuditRow = {
  id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  summary?: string | null;
  reason?: string | null;
  created_at: string;
};

type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>['variant']>;

const EMPTY_FILTERS = { q: '', action: '', from: '', to: '' };
type Filters = typeof EMPTY_FILTERS;

const EXPORT_COLUMNS: CsvColumn<AuditRow>[] = [
  { header: 'When (UTC)', value: (r) => r.created_at },
  { header: 'Actor', value: (r) => r.actor_name || 'system' },
  { header: 'Actor email', value: (r) => r.actor_email || '' },
  { header: 'Action', value: (r) => r.action },
  { header: 'Entity type', value: (r) => r.entity_type || '' },
  { header: 'Entity id', value: (r) => r.entity_id || '' },
  { header: 'Summary', value: (r) => r.summary || '' },
  { header: 'Reason', value: (r) => r.reason || '' },
];

const EXPORT_CAP = 2000;

/* ── Presentation helpers ──────────────────────────────────────────────────── */

function actionVariant(action: string): BadgeVariant {
  if (/\.(create|convert|approve|finalize)$/.test(action)) return 'success';
  if (/\.(update|patch)$/.test(action)) return 'info';
  if (/\.(delete|void|reject|deactivate|suspend)$/.test(action)) return 'destructive';
  if (action.startsWith('auth.') || action.startsWith('login')) return 'secondary';
  return 'default';
}

function whenParts(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { day: String(iso), time: '' };
  return {
    day: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}

function DetailLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-[13px] text-slate-800">{children}</span>
    </div>
  );
}

/* ── Audit entry popup ─────────────────────────────────────────────────────── */

function AuditDetail({ entry, onClose }: { entry: AuditRow; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const when = whenParts(entry.created_at);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(entry.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the id is still visible on screen */
    }
  };

  return (
    <Modal
      title="Audit entry"
      subtitle={`${when.day} at ${when.time}`}
      icon={<History className="h-5 w-5" />}
      onClose={onClose}
      size="md"
      footer={
        <>
          <span className="modal-hint">Audit rows are append-only and cannot be edited.</span>
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={actionVariant(entry.action)}>{entry.action}</Badge>
          {entry.entity_type && <Badge variant="outline">{entry.entity_type}</Badge>}
        </div>

        <div>
          <DetailLine label="Actor">
            {entry.actor_name || 'system'}
            {entry.actor_email && <span className="ml-2 text-slate-500">{entry.actor_email}</span>}
          </DetailLine>
          <DetailLine label="Actor id">
            <code className="text-[11px]">{entry.actor_id || '—'}</code>
          </DetailLine>
          <DetailLine label="Entity id">
            <code className="text-[11px]">{entry.entity_id || '—'}</code>
          </DetailLine>
          <DetailLine label="Summary">{entry.summary || '—'}</DetailLine>
          {entry.reason && <DetailLine label="Reason">{entry.reason}</DetailLine>}
          <DetailLine label="Recorded at">
            {new Date(entry.created_at).toLocaleString('en-IN')}
            <span className="ml-2 text-slate-500">({relativeTime(entry.created_at)})</span>
          </DetailLine>
        </div>

        <button
          type="button"
          className={cn('btn ghost xs inline-flex items-center gap-1.5', copied && 'text-emerald-700')}
          onClick={copyId}
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'Copied entry id' : 'Copy entry id'}
        </button>
      </div>
    </Modal>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function AuditLogs() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState('');

  const queryString = (targetPage: number, targetLimit: number) => {
    const params = new URLSearchParams();
    if (applied.q) params.set('q', applied.q);
    if (applied.action) params.set('action', applied.action);
    if (applied.from) params.set('from', applied.from);
    if (applied.to) params.set('to', applied.to);
    params.set('page', String(targetPage));
    params.set('limit', String(targetLimit));
    return params.toString();
  };

  const query = useQuery({
    queryKey: ['audit', applied, page, limit],
    queryFn: () => api.get(`/audit-logs?${queryString(page, limit)}`),
  });

  const actions = useQuery({
    queryKey: ['audit-actions'],
    queryFn: () => api.get('/audit-logs/actions'),
    staleTime: 60_000,
  });

  const rows: AuditRow[] = query.data?.data || [];
  const total = Number(query.data?.total ?? 0);
  const actionOptions: Array<{ action: string; n: number }> = actions.data?.data || [];
  const hasFilters = !!(applied.q || applied.action || applied.from || applied.to);

  const summary = useMemo(() => {
    const actors = new Set(rows.map((row) => row.actor_id || 'system'));
    return { actors: actors.size, actions: actionOptions.length };
  }, [rows, actionOptions.length]);

  const search = () => {
    setApplied({ ...draft });
    setPage(1);
    setExportNote('');
  };

  const clear = () => {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
    setExportNote('');
  };

  const exportCsv = async () => {
    setExporting(true);
    setExportNote('');
    try {
      const collected: AuditRow[] = [];
      let pageNo = 1;
      let expected = Infinity;

      // The API caps `limit` at 200, so a full export walks the pages.
      do {
        const res = await api.get(`/audit-logs?${queryString(pageNo, 200)}`);
        expected = Number(res.total ?? 0);
        const batch: AuditRow[] = res.data || [];
        if (!batch.length) break;
        collected.push(...batch);
        pageNo += 1;
      } while (collected.length < expected && collected.length < EXPORT_CAP);

      const capped = collected.length < expected;
      downloadCsv(`audit-trail-${fileStamp()}`, EXPORT_COLUMNS, collected.slice(0, EXPORT_CAP));
      setExportNote(
        capped
          ? `Exported ${EXPORT_CAP} of ${expected} matching events (cap). Narrow the date range for the rest.`
          : `Exported ${collected.length} event${collected.length === 1 ? '' : 's'}.`,
      );
    } catch (e: any) {
      setExportNote(`Export failed: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="System"
        meta={total > 0 ? `${total} matching ${total === 1 ? 'event' : 'events'}` : 'Compliance record'}
        title="Audit trail"
        description="Every recorded action, who performed it and when. Rows are append-only: nothing here can be edited or deleted from the application."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => query.refetch()} disabled={query.isFetching}>
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </span>
            </button>
            <button type="button" className="btn ghost" onClick={exportCsv} disabled={exporting || !total}>
              <span className="inline-flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />
                {exporting ? 'Exporting…' : 'Export CSV'}
              </span>
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi
          label="Matching events"
          value={query.isLoading ? '…' : total}
          hint={hasFilters ? 'Filtered selection' : 'All recorded activity'}
          icon={ClipboardList}
          tone="brand"
        />
        <Kpi
          label="Action types"
          value={actions.isLoading ? '…' : summary.actions}
          hint="Distinct actions seen on this company"
          icon={ShieldCheck}
          tone="violet"
        />
        <Kpi
          label="Actors on page"
          value={query.isLoading ? '…' : summary.actors}
          hint="Distinct people in the visible rows"
          icon={History}
          tone="sky"
        />
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <label className="lbl">Search</label>
            <input
              placeholder="Action, entity, summary, record id or actor id"
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
          <div className="w-[240px]">
            <label className="lbl">Action</label>
            <select value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
              <option value="">All actions</option>
              {actionOptions.map((option) => (
                <option key={option.action} value={option.action}>
                  {option.action} ({option.n})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl">From</label>
            <input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            />
          </div>
          <div>
            <label className="lbl">To</label>
            <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </div>
          <button type="button" className="btn primary" onClick={search}>
            <span className="inline-flex items-center gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Apply
            </span>
          </button>
          {hasFilters && (
            <button type="button" className="btn ghost" onClick={clear}>
              <span className="inline-flex items-center gap-1.5">
                <X className="h-3.5 w-3.5" />
                Clear
              </span>
            </button>
          )}
        </div>
        {exportNote && <div className="mt-3 text-[11px] font-medium text-slate-600">{exportNote}</div>}
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading audit trail…
          </div>
        ) : query.isError ? (
          <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Could not load the audit trail. Check the API connection.
          </div>
        ) : !rows.length ? (
          <div className="py-16 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-700">
              {hasFilters ? 'No events match these filters.' : 'No audit events recorded yet.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {hasFilters ? 'Widen the date range or clear the action filter.' : 'Activity appears here as soon as a user changes something.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left">
                    <th className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      When
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Who
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Action
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Record
                    </th>
                    <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Summary
                    </th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => {
                    const when = whenParts(entry.created_at);
                    return (
                      <tr
                        key={entry.id}
                        className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-brand-50/40"
                        onClick={() => setSelected(entry)}
                      >
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <div className="text-[13px] font-medium text-slate-800">{when.day}</div>
                          <div className="text-[11px] text-slate-500">
                            {when.time} · {relativeTime(entry.created_at)}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-[13px] font-semibold text-slate-900">
                            {entry.actor_name || 'system'}
                          </div>
                          <div className="text-[11px] text-slate-500">{entry.actor_email || '—'}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={actionVariant(entry.action)}>{entry.action}</Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-[12px] text-slate-700">{entry.entity_type || '—'}</div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {entry.entity_id ? String(entry.entity_id).slice(-12) : '—'}
                          </div>
                        </td>
                        <td className="max-w-[420px] px-3 py-2.5 text-[13px] text-slate-700">
                          {entry.summary || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-300">›</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="border-t border-slate-100 px-4 pb-4">
              <Pagination
                page={page}
                limit={limit}
                total={total}
                noun="events"
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

      {selected && <AuditDetail entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
