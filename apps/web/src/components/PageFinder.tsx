import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/Dialog';

export default function PageFinder({ items }: { items: Array<{ label: string; to: string }> }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const id = useId();
  const results = items.filter((item) => item.label.toLowerCase().includes(search.trim().toLowerCase()));
  const changeOpen = (next: boolean) => { setOpen(next); setSearch(''); setActive(0); };
  const select = (to: string) => { changeOpen(false); navigate(to); };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setOpen((value) => !value); setSearch(''); setActive(0);
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (open) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, id]);

  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger asChild><button type="button" aria-label="Find a page" className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-sm text-ink-muted hover:border-slate-400 hover:text-ink"><Search size={16} aria-hidden="true" /><span className="hidden sm:inline">Find a page</span><kbd className="ml-5 hidden rounded border border-line bg-white px-1.5 py-0.5 text-[11px] md:inline">Ctrl K</kbd></button></DialogTrigger>
    <DialogContent size="md">
      <DialogHeader><DialogTitle>Find a page</DialogTitle><DialogDescription>Search pages available to your role.</DialogDescription></DialogHeader>
      <label htmlFor={`${id}-search`} className="sr-only">Search pages</label>
      <input id={`${id}-search`} role="combobox" aria-expanded="true" aria-controls={`${id}-results`} aria-autocomplete="list" aria-activedescendant={results.length ? `${id}-option-${active}` : undefined} value={search} placeholder="Type a page name…" autoComplete="off" onChange={(event) => { setSearch(event.target.value); setActive(0); }} onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => results.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0); }
        if (event.key === 'Enter' && results[active]) { event.preventDefault(); select(results[active].to); }
      }} />
      <ul id={`${id}-results`} role="listbox" aria-label="Pages" className="max-h-[45vh] space-y-1 overflow-y-auto">
        {results.map((item, index) => <li key={item.to} id={`${id}-option-${index}`} role="option" aria-selected={index === active} onMouseMove={() => setActive(index)} onClick={() => select(item.to)} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-3 text-sm ${index === active ? 'bg-brand-50 font-medium text-brand-700' : 'text-ink-secondary'}`}>{item.label}<ArrowUpRight size={15} aria-hidden="true" /></li>)}
      </ul>
      {!results.length && <p role="status" className="py-6 text-center text-sm text-ink-muted">No matching pages. Try another name.</p>}
      <p className="border-t border-line pt-3 text-xs text-ink-muted">Use ↑ ↓ to browse, Enter to open, or Escape to close.</p>
    </DialogContent>
  </Dialog>;
}
