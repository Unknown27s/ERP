import { Children, cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode } from 'react';
import PageHeader from './PageHeader';
import { DataRegion, ErrorState, LoadingState, type QueryStatus } from './feedback/DataState';
export function ModulePage({ title, description, actions, children }: { title: string; description: string; actions?: ReactNode; children: ReactNode }) {
  return <div className="erp-page"><PageHeader eyebrow="Business operations" title={title} description={description} actions={actions} />{children}</div>;
}
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return <section aria-labelledby={id} className="erp-panel"><h2 id={id} className="mb-4 text-base font-semibold text-ink">{title}</h2>{children}</section>;
}
export function QueryState({ query }: { query: QueryStatus }) {
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState query={query} stale={query.data != null} />;
  return null;
}
export function Field({ label, hint, error, required, children }: { label: string; hint?: string; error?: string; required?: boolean; children: ReactElement<{ id?: string; required?: boolean; 'aria-describedby'?: string; 'aria-invalid'?: boolean }> }) {
  const generatedId = useId();
  const id = children.props.id || generatedId;
  const describedBy = [children.props['aria-describedby'], (hint || error) && `${id}-help`].filter(Boolean).join(' ') || undefined;
  return <div className="min-w-0 space-y-1.5 text-sm"><div className="flex items-center gap-1"><label htmlFor={id} className="block font-medium text-ink-secondary">{label}</label>{(required || children.props.required) && <span aria-hidden="true" className="text-rose-700">*</span>}</div>{cloneElement(children, { id, required: required ?? children.props.required, 'aria-describedby': describedBy, 'aria-invalid': error ? true : children.props['aria-invalid'] })}{(hint || error) && <p id={`${id}-help`} className={`text-xs ${error ? 'text-rose-700' : 'text-ink-muted'}`}>{error || hint}</p>}</div>;
}
export function Register({ headers, children, empty, query, label = 'Records', numericColumns = [], emptyTitle, emptyDescription, emptyAction }: {
  headers: string[]; children: ReactNode; empty: boolean; query?: QueryStatus; label?: string; numericColumns?: number[]; emptyTitle?: string; emptyDescription?: string; emptyAction?: ReactNode;
}) {
  const rows = Children.map(children, (row) => {
    if (!isValidElement<{ children?: ReactNode }>(row)) return row;
    return cloneElement(row, {}, Children.map(row.props.children, (cell, index) => {
      if (!isValidElement<{ 'data-numeric'?: boolean }>(cell)) return cell;
      return cloneElement(cell, { 'data-numeric': numericColumns.includes(index) || undefined });
    }));
  });
  const table = <div role="region" aria-label={`${label} table`} tabIndex={0} className="overflow-x-auto rounded-lg border border-line"><table className="erp-register"><caption className="sr-only">{label}</caption><thead><tr>{headers.map((header, index) => <th scope="col" key={header} data-numeric={numericColumns.includes(index) || undefined}>{header}</th>)}</tr></thead><tbody>{rows}</tbody></table></div>;
  return <DataRegion query={query || { isLoading: false, isError: false, error: null }} empty={empty} emptyTitle={emptyTitle} emptyDescription={emptyDescription} emptyAction={emptyAction}>{table}</DataRegion>;
}
export function useOperation() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function run<T>(action: () => Promise<T>, success: string): Promise<T | undefined> {
    setBusy(true); setError(''); setMessage('');
    try { const value = await action(); setMessage(success); return value; }
    catch (e: any) { setError(e.message || 'Action failed'); return undefined; }
    finally { setBusy(false); }
  }
  const notice = <>{error && <p role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-700">{message}</p>}</>;
  const clear = () => { setMessage(''); setError(''); };
  return { busy, run, notice, clear };
}
