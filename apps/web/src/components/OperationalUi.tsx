import { cloneElement, useId, useState, type ReactElement, type ReactNode } from 'react';
import PageHeader from './PageHeader';
export function ModulePage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-8"><PageHeader eyebrow="Business operations" title={title} description={description} />{children}</div>;
}
export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-4 text-sm font-bold text-slate-900">{title}</h2>{children}</section>;
}
export function QueryState({ query }: { query: { isLoading: boolean; isError: boolean; error: unknown } }) {
  if (query.isLoading) return <p role="status" className="p-4 text-sm text-slate-500">Loading…</p>;
  if (query.isError) return <p role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700">{(query.error as Error)?.message || 'Unable to load records'}</p>;
  return null;
}
export function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const generatedId = useId();
  const id = children.props.id || generatedId;
  return <div className="min-w-0 space-y-1 text-xs font-semibold text-slate-600"><label htmlFor={id} className="block">{label}</label>{cloneElement(children, { id })}</div>;
}
export function Register({ headers, children, empty }: { headers: string[]; children: ReactNode; empty: boolean }) {
  if (empty) return <p className="py-8 text-center text-sm text-slate-500">No records yet.</p>;
  return <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500">{headers.map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 [&_td]:px-3 [&_td]:py-3">{children}</tbody></table></div>;
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
  return { busy, run, notice };
}
