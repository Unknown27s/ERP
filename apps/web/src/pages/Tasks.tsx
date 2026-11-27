import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { ClipboardList, Plus, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/auth';
import { useBranding } from '../hooks/branding';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { Field, Register, useOperation } from '../components/OperationalUi';
import { Button } from '../components/ui/Button';
import { Badge, type BadgeProps } from '../components/ui/Badge';
import { QueryState } from '../components/OperationalUi';

type Status = 'pending' | 'in_progress' | 'blocked' | 'completed';
type Task = { id: string; title: string; description: string; assigned_to: string; assigned_by: string; assignee_name: string; assigner_name: string; due_date: string | null; status: Status; progress_note: string; completed_at: string | null; version: number };
type Assignee = { user_id: string; display_name: string; role_name: string };
const STATUS: Record<Status, { label: string; variant: BadgeProps['variant'] }> = {
  pending: { label: 'Assigned', variant: 'secondary' }, in_progress: { label: 'In progress', variant: 'info' }, blocked: { label: 'Blocked', variant: 'warning' }, completed: { label: 'Completed', variant: 'success' },
};
const NEXT: Record<Status, Status[]> = { pending: ['in_progress'], in_progress: ['completed', 'blocked'], blocked: ['in_progress'], completed: [] };
const EMPTY = { title: '', description: '', assigned_to: '', due_date: '' };
const actionLabel = (next: Status, current: Status) => next === 'completed' ? 'Mark completed' : next === 'blocked' ? 'Mark blocked' : current === 'blocked' ? 'Resume task' : 'Start task';

export default function Tasks({ scope = 'mine' }: { scope?: 'mine' | 'team' }) {
  const { user, can } = useAuth();
  const { brand } = useBranding();
  const manage = can('hr.manage');
  const qc = useQueryClient();
  const op = useOperation();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState<Task | null>(null);
  const [next, setNext] = useState<Status>('in_progress');
  const [note, setNote] = useState('');
  const tasks = useQuery<{ data: Task[]; total: number }>({ queryKey: ['assigned-tasks', scope, search, status, page], queryFn: () => api.get(`/tasks?scope=${scope}&q=${encodeURIComponent(search)}&status=${status}&page=${page}`), refetchInterval: 30000 });
  const assignees = useQuery<{ data: Assignee[] }>({ queryKey: ['task-assignees'], queryFn: () => api.get('/tasks/assignees'), enabled: manage && createOpen });
  const rows = tasks.data?.data || [];
  const total = tasks.data?.total || 0;
  const filtered = !!search || status !== 'all';
  const timezone = brand.timezone || 'Asia/Kolkata';
  const currentDay = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timezone }).formatToParts(new Date());
  const today = ['year', 'month', 'day'].map((part) => currentDay.find((item) => item.type === part)?.value).join('-');
  const refresh = () => qc.invalidateQueries({ queryKey: ['assigned-tasks'] });
  const closeCreate = () => {
    if (op.busy) return;
    if (JSON.stringify(form) !== JSON.stringify(EMPTY) && !window.confirm('Discard this unsaved task?')) return;
    setCreateOpen(false); setForm(EMPTY);
  };
  const closeDetail = () => {
    if (op.busy) return;
    if (note && !window.confirm('Discard your unsaved progress note?')) return;
    setSelected(null); setNote('');
  };
  const openDetail = (task: Task) => { op.clear(); setSelected(task); setNext(NEXT[task.status][0] || 'completed'); setNote(''); };
  const openCreate = () => { op.clear(); setCreateOpen(true); };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (op.busy || !form.title.trim() || !form.assigned_to) return;
    const result = await op.run(() => api.post('/tasks', form), 'Task assigned. The person can now find it in My tasks.');
    if (result) { setCreateOpen(false); setForm(EMPTY); await refresh(); }
  };
  const update = async (event: React.FormEvent) => {
    event.preventDefault();
    if (op.busy || !selected) return;
    const result = await op.run(() => api.patch(`/tasks/${selected.id}/status`, { status: next, version: selected.version, note }), next === 'completed' ? 'Task completed.' : 'Task progress updated.');
    if (result) { setSelected(result.data); setNext(NEXT[result.data.status as Status][0] || 'completed'); setNote(''); await refresh(); }
  };

  return <div className="erp-page">
    <PageHeader eyebrow={scope === 'team' ? 'People & work' : 'My workspace'} title={scope === 'team' ? 'Team tasks' : 'My tasks'} description={scope === 'team' ? 'Assign clear work to a person and follow their progress through completion.' : 'Work assigned to you. Start a task, flag blockers and record completion.'} actions={<><Button variant="outline" onClick={() => refresh()} disabled={tasks.isFetching}><RefreshCw size={15} aria-hidden="true" className={tasks.isFetching ? 'animate-spin' : ''} />Refresh</Button>{manage && scope === 'team' && <Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Assign task</Button>}</>} />
    {manage && <nav aria-label="Task views" className="flex w-fit gap-1 rounded-lg border border-line bg-surface p-1">{[{ to: '/employee/tasks', label: 'My tasks' }, { to: '/admin/tasks', label: 'Team tasks' }].map((item) => <NavLink key={item.to} to={item.to} className={({ isActive }) => `rounded-md px-4 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-secondary hover:bg-canvas'}`}>{item.label}</NavLink>)}</nav>}
    {!createOpen && !selected && op.notice}
    <section aria-label="Assigned work" className="erp-panel">
      <div className="mb-5 flex flex-wrap items-end gap-4"><div className="min-w-0 flex-1 sm:max-w-sm"><Field label="Search tasks"><input type="search" placeholder="Search title or instructions" maxLength={200} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></Field></div><div className="w-44"><Field label="Task status"><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">All statuses</option>{Object.entries(STATUS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></Field></div></div>
      <Register label="Assigned tasks" query={tasks} headers={['Task', scope === 'team' ? 'Assigned to' : 'Assigned by', 'Due date', 'Status', 'Action']} empty={!rows.length} emptyTitle={filtered ? 'No matching tasks' : scope === 'team' ? 'No tasks assigned yet' : 'No tasks assigned to you'} emptyDescription={filtered ? 'Clear the filters to see more work.' : scope === 'team' ? 'Assign a task to give a teammate a clear next step.' : 'Tasks will appear here when someone assigns work to you.'} emptyAction={filtered ? <Button variant="outline" onClick={() => { setSearch(''); setStatus('all'); setPage(1); }}>Clear filters</Button> : manage && scope === 'team' ? <Button onClick={openCreate}>Assign task</Button> : undefined}>
        {rows.map((task) => <tr key={task.id}><td><button className="text-left font-semibold text-ink hover:text-brand-700 hover:underline" onClick={() => openDetail(task)}>{task.title}</button><p className="mt-1 max-w-md text-xs text-ink-muted line-clamp-2">{task.description || 'No additional instructions'}</p></td><td>{scope === 'team' ? task.assignee_name : task.assigner_name}</td><td className="whitespace-nowrap">{task.due_date || 'No due date'}{task.due_date && task.due_date < today && task.status !== 'completed' && <span className="mt-1 block text-xs font-medium text-rose-700">Overdue</span>}</td><td><Badge variant={STATUS[task.status].variant}>{STATUS[task.status].label}</Badge></td><td><Button variant="ghost" size="sm" aria-label={`View task: ${task.title}`} onClick={() => openDetail(task)}>View task</Button></td></tr>)}
      </Register>
      {tasks.data && <nav aria-label="Task pagination" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm text-ink-muted"><span>{total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} of ${total} tasks` : '0 tasks'}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 1 || tasks.isFetching} onClick={() => setPage(page - 1)}>Previous tasks</Button><Button variant="outline" size="sm" disabled={page * 25 >= total || tasks.isFetching} onClick={() => setPage(page + 1)}>Next tasks</Button></div></nav>}
    </section>
    <p className="text-xs text-ink-muted">This list refreshes every 30 seconds while open. Assigned tasks are separate from timed work logs.</p>

    {createOpen && <Modal title="Assign task" subtitle="Choose the person responsible and give them clear instructions." icon={<ClipboardList size={19} />} onClose={closeCreate} pending={op.busy} size="md">
      <form onSubmit={create} className="space-y-5">{op.notice}<QueryState query={assignees} /><fieldset disabled={op.busy} className="min-w-0 space-y-4">
        <Field label="Task title"><input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="What needs to be done?" /></Field>
        <Field label="Assign to" hint="Active people in this company. Their account role is shown beside their name."><select required disabled={assignees.isLoading || assignees.isError} value={form.assigned_to} onChange={(event) => setForm({ ...form, assigned_to: event.target.value })}><option value="">Choose a person</option>{assignees.data?.data?.map((person) => <option key={person.user_id} value={person.user_id}>{person.display_name} · {person.role_name}</option>)}</select></Field>
        <Field label="Due date" hint="Optional. Dates follow the company's calendar."><input type="date" value={form.due_date} onChange={(event) => setForm({ ...form, due_date: event.target.value })} /></Field>
        <Field label="Instructions" hint="Explain the expected result and any useful context."><textarea rows={4} maxLength={5000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
      </fieldset><div className="flex justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="outline" onClick={closeCreate} disabled={op.busy}>Cancel</Button><Button disabled={op.busy || assignees.isLoading || assignees.isError}>{op.busy ? 'Assigning…' : 'Assign task'}</Button></div></form>
    </Modal>}

    {selected && <Modal title={selected.title} subtitle={`Assigned by ${selected.assigner_name} to ${selected.assignee_name}`} onClose={closeDetail} pending={op.busy} size="md">
      <div className="space-y-5"><div className="flex flex-wrap items-center gap-3"><Badge variant={STATUS[selected.status].variant}>{STATUS[selected.status].label}</Badge><span className="text-sm text-ink-muted">Due: {selected.due_date || 'No due date'}</span></div><p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink-secondary">{selected.description || 'No additional instructions.'}</p>
        {selected.progress_note && <div className="rounded-lg border border-line bg-canvas p-4"><h3 className="mb-2 text-xs font-semibold text-ink">Latest progress note</h3><p className="whitespace-pre-wrap break-words text-sm text-ink-secondary">{selected.progress_note}</p></div>}
        {selected.completed_at && <p className="text-sm text-emerald-800">Completed {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(selected.completed_at))}</p>}
        {op.notice}
        {selected.assigned_to === user?.user_id && NEXT[selected.status].length > 0 ? <form onSubmit={update} className="space-y-4 border-t border-line pt-5"><fieldset disabled={op.busy} className="min-w-0 space-y-4"><Field label="Update progress"><select value={next} onChange={(event) => setNext(event.target.value as Status)}>{NEXT[selected.status].map((value) => <option key={value} value={value}>{actionLabel(value, selected.status)}</option>)}</select></Field><Field label="Progress note" hint={next === 'blocked' ? 'Explain the blocker so the person who assigned it can help.' : 'Optional. Add context about the work or completed result.'}><textarea required={next === 'blocked'} maxLength={2000} rows={3} value={note} onChange={(event) => setNote(event.target.value)} /></Field></fieldset><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeDetail} disabled={op.busy}>Close</Button><Button disabled={op.busy}>{op.busy ? 'Saving…' : actionLabel(next, selected.status)}</Button></div></form> : <p className="border-t border-line pt-4 text-xs text-ink-muted">{selected.status === 'completed' ? 'This task is complete.' : 'Only the assigned person can update progress.'}</p>}
      </div>
    </Modal>}
  </div>;
}
