import type { ReactNode } from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

export type QueryStatus = {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data?: unknown;
  isFetching?: boolean;
  refetch?: () => unknown;
};

export function LoadingState({ label = 'Loading records…' }: { label?: string }) {
  return <div role="status" className="flex min-h-40 items-center justify-center gap-2 p-6 text-sm text-ink-muted"><Loader2 size={18} className="animate-spin" aria-hidden="true" />{label}</div>;
}

export function ErrorState({ query, stale = false }: { query: QueryStatus; stale?: boolean }) {
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
    <AlertCircle size={18} className="shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1"><p className="font-semibold">{stale ? 'Unable to refresh. Showing previously loaded data.' : 'Unable to load records.'}</p><p className="mt-1 break-words">{query.error instanceof Error ? query.error.message : 'Please try again.'}</p></div>
    {query.refetch && <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch?.()}><RefreshCw size={14} aria-hidden="true" />Retry</Button>}
  </div>;
}

export function EmptyState({ title = 'No records yet', description = 'Records will appear here when they are added.', action }: { title?: string; description?: string; action?: ReactNode }) {
  return <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
    <div className="mb-3 rounded-xl border border-line bg-canvas p-3 text-ink-muted"><Inbox size={22} aria-hidden="true" /></div>
    <p className="text-sm font-semibold text-ink">{title}</p><p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>{action && <div className="mt-4">{action}</div>}
  </div>;
}

export function DataRegion({ query, empty, emptyTitle, emptyDescription, emptyAction, className = '', children }: {
  query: QueryStatus; empty: boolean; emptyTitle?: string; emptyDescription?: string; emptyAction?: ReactNode; className?: string; children: ReactNode;
}) {
  if (query.isLoading) return <LoadingState />;
  if (query.isError && query.data == null) return <ErrorState query={query} />;
  return <div aria-busy={query.isFetching || undefined} className={className}>
    {query.isError && <ErrorState query={query} stale />}
    {empty ? <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} /> : children}
  </div>;
}
