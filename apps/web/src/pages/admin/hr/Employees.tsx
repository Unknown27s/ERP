/**
 * ==============================================================================
 * DESIGN SPECIFICATION: Employee Master Directory (Employees.tsx)
 * ==============================================================================
 * Functional Scope:
 * - Comprehensive staff records for HR, biometric attendance, and monthly payroll.
 * - Filters by employment status (Active, Notice Period, Exited, All).
 * - Employee Form Dialog: Code, Contact, Department/Designation link, Joining Date,
 *   PAN, and Bank account for statutory payroll disbursements.
 * ==============================================================================
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { useAuth } from '../../../hooks/auth';
import {
  UserCheck,
  Plus,
  Search,
  Building2,
  Briefcase,
  CheckCircle2,
  Calendar,
  LogOut,
  Mail,
  Phone,
  Clock3,
  Eye,
  Pencil,
} from 'lucide-react';
import HrShell, { KPI_TINTS, useHrOverview } from './HrShell';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { useToast } from '../../../components/ui/Toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../../components/ui/Dialog';

type Employee = {
  id: string;
  emp_code: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  dob: string | null;
  gender: string | null;
  joining_date: string;
  exit_date: string | null;
  employment_type: string;
  status: string;
  department_id: string | null;
  designation_id: string | null;
  branch_id: string | null;
  department_name: string | null;
  designation_name: string | null;
  branch_name: string | null;
  pan: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  user_id: string | null;
  linked_user_email?: string | null;
  manager_name?: string | null;
  address?: string | null;
};

type LinkableUser = {
  user_id: string;
  email: string;
  display_name: string;
  role_name: string | null;
  employee_id: string | null;
  emp_code: string | null;
  employee_name: string | null;
};

type Lookup = { id: string; name: string; grade?: string | null };

function ProfileSection({ title, fields }: { title: string; fields: Array<[string, string | null | undefined]> }) {
  return <section className="rounded-lg border border-line bg-white p-5">
    <h3 className="mb-4 text-sm font-semibold text-ink">{title}</h3>
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {fields.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-ink-muted">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-ink">{value || 'Not provided'}</dd></div>)}
    </dl>
  </section>;
}

const EMPTY_FORM = {
  emp_code: '',
  full_name: '',
  phone: '',
  email: '',
  dob: '',
  gender: '',
  joining_date: '',
  employment_type: 'full_time',
  status: 'active',
  department_id: '',
  designation_id: '',
  branch_id: '',
  pan: '',
  bank_account: '',
  bank_ifsc: '',
  user_id: '',
};

const GENDERS: Array<[string, string]> = [
  ['', 'Select Gender…'],
  ['female', 'Female'],
  ['male', 'Male'],
  ['other', 'Other'],
];

const EMPLOYMENT_TYPES: Array<[string, string]> = [
  ['full_time', 'Full Time'],
  ['part_time', 'Part Time'],
  ['contract', 'Contractual'],
  ['trainee', 'Trainee / Intern'],
];

const STATUS_FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'notice', label: 'On Notice' },
  { key: 'exited', label: 'Exited' },
  { key: 'all', label: 'All Records' },
];

export default function HREmployees() {
  const toast = useToast();
  const { can } = useAuth();
  const manage = can('hr.manage');
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workMonth, setWorkMonth] = useState(new Date().toISOString().slice(0, 7));
  const detail = useQuery({
    queryKey: ['hr-employee-detail', selectedId],
    queryFn: () => api.get(`/hr/employees/${selectedId}`),
    enabled: !!selectedId,
  });
  const work = useQuery({
    queryKey: ['hr-employee-work', selectedId, workMonth],
    queryFn: () => api.get(`/hr/employees/${selectedId}/work?month=${workMonth}`),
    enabled: !!selectedId,
  });

  // Queries for employee records and dropdown lookups
  const list = useQuery({
    queryKey: ['hr-employees', status, search],
    queryFn: () =>
      api.get(`/hr/employees?status=${encodeURIComponent(status)}&q=${encodeURIComponent(search)}`),
  });

  const allQuery = useQuery({
    queryKey: ['hr-employees-all'],
    queryFn: () => api.get('/hr/employees?status=all'),
  });

  const depts = useQuery({ queryKey: ['hr-departments'], queryFn: () => api.get('/hr/departments') });
  const desigs = useQuery({ queryKey: ['hr-designations'], queryFn: () => api.get('/hr/designations') });
  const logins = useQuery({ queryKey: ['hr-linkable-users'], queryFn: () => api.get('/hr/employees/linkable-users') });
  const overview = useHrOverview();

  const employees: Employee[] = list.data?.data || [];
  const everyone: Employee[] = allQuery.data?.data || [];
  const departments: Lookup[] = depts.data?.data || [];
  const designations: Lookup[] = desigs.data?.data || [];
  const linkableUsers: LinkableUser[] = logins.data?.data || [];

  const countOf = (s: string) =>
    allQuery.isLoading ? '—' : String(everyone.filter((e) => e.status === s).length);

  const refresh = () => Promise.all([list.refetch(), allQuery.refetch(), depts.refetch(), desigs.refetch(), logins.refetch()]);

  const setField = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { ...form };
    for (const k of ['department_id', 'designation_id', 'branch_id']) {
      if (!payload[k]) payload[k] = null;
    }

    try {
      if (editId) {
        await api.patch(`/hr/employees/${editId}`, payload);
        toast.success('Employee updated', `${form.full_name}'s profile was saved.`);
      } else {
        await api.post('/hr/employees', payload);
        toast.success('Employee created', `${form.full_name} was added to the directory.`);
      }
      await refresh();
      if (selectedId) await detail.refetch();
      reset();
      setShowForm(false);
    } catch (err: any) {
      toast.error('Could not save employee', err.message || 'Please try again.');
    }
  };

  const startEdit = (e: Employee) => {
    setEditId(e.id);
    setForm({
      emp_code: e.emp_code,
      full_name: e.full_name,
      phone: e.phone || '',
      email: e.email || '',
      dob: e.dob || '',
      gender: e.gender || '',
      joining_date: e.joining_date,
      employment_type: e.employment_type,
      status: e.status,
      department_id: e.department_id || '',
      designation_id: e.designation_id || '',
      branch_id: e.branch_id || '',
      pan: e.pan || '',
      bank_account: e.bank_account || '',
      bank_ifsc: e.bank_ifsc || '',
      user_id: e.user_id || '',
    });
    setShowForm(true);
  };

  const markExited = async (e: Employee) => {
    if (!window.confirm(`Mark ${e.full_name} as exited today? Historical payroll will be preserved.`)) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await api.patch(`/hr/employees/${e.id}`, { status: 'exited', exit_date: today });
      toast.success('Employee marked exited', e.full_name);
      refresh();
    } catch (err: any) {
      toast.error('Could not mark employee exited', err.message || 'Please try again.');
    }
  };

  return (
    <HrShell
      title="Employees Directory"
      subtitle="Master records for payroll, biometric attendance, and statutory reporting."
      kpis={[
        { label: 'Headcount', value: overview ? String(overview.headcount) : '—', meta: 'Active & notice staff', ...KPI_TINTS.gold },
        { label: 'Active', value: countOf('active'), meta: 'Currently on payroll', ...KPI_TINTS.green },
        { label: 'On Notice', value: countOf('notice'), meta: 'Serving exit notice', ...KPI_TINTS.amber },
        { label: 'Exited', value: countOf('exited'), meta: 'Historical records retained', ...KPI_TINTS.rose },
      ]}
      actions={
        manage ? <Button onClick={() => { reset(); setShowForm(true); }} className="gap-1.5 shadow-sm">
          <Plus className="w-4 h-4" />
          <span>Add Employee</span>
        </Button> : null
      }
    >
      {/* Control Bar: Search & Status Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Input
            placeholder="Search by name, emp code, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                status === f.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Employee Data Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Login</th>
                <th className="py-3 px-4">Department &amp; Title</th>
                <th className="py-3 px-4">Joined Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.isLoading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading employee directory…
                  </td>
                </tr>
              )}
              {!list.isLoading && employees.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No employees found matching filter criteria.
                  </td>
                </tr>
              )}
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{e.emp_code}</td>
                  <td className="py-3 px-4">
                    <button type="button" onClick={() => setSelectedId(e.id)}
                      className="font-semibold text-brand-700 hover:underline text-left">{e.full_name}</button>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      {e.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{e.email}</span>}
                      {e.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{e.phone}</span>}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {e.linked_user_email ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" />
                        {e.linked_user_email}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-600">Not linked</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-slate-800 font-medium">{e.department_name || '—'}</div>
                    <div className="text-[11px] text-slate-500">{e.designation_name || '—'}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {e.joining_date}
                    {e.exit_date && <div className="text-[10px] text-rose-500">Exited {e.exit_date}</div>}
                  </td>
                  <td className="py-3 px-4">
                    <Badge
                      variant={
                        e.status === 'active'
                          ? 'success'
                          : e.status === 'notice'
                          ? 'warning'
                          : 'destructive'
                      }
                    >
                      {e.status === 'active' ? 'Active' : e.status === 'notice' ? 'On Notice' : 'Exited'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(e.id)}
                        className="h-7 px-2 text-[11px]"><Eye className="w-3.5 h-3.5 mr-1" />View</Button>
                      {manage && <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(e)}
                        className="h-7 px-2.5 text-[11px]"
                      >
                        Edit
                      </Button>}
                      {manage && e.status !== 'exited' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markExited(e)}
                          className="h-7 px-2 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedId && (
        <Dialog open onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
          <DialogContent size="xl" className="gap-0 overflow-hidden rounded-lg p-0 sm:max-w-6xl">
            <DialogHeader className="border-b border-line bg-slate-50 px-5 py-6 pr-14 sm:px-8">
              <div className="flex items-center gap-4">
                <div aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 text-xl font-semibold text-brand-700">{detail.data?.data?.full_name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('') || <UserCheck size={26} />}</div>
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-700">Employee profile</p>
                  <DialogTitle className="break-words text-xl leading-tight sm:text-2xl">{detail.data?.data?.full_name || 'Employee details'}</DialogTitle>
                  <DialogDescription className="mt-2 text-sm">{[detail.data?.data?.designation_name, detail.data?.data?.department_name].filter(Boolean).join(' · ') || 'Profile and work records for this employee.'}</DialogDescription>
                </div>
              </div>
              {detail.data?.data && <div className="flex flex-wrap items-center gap-2 pt-3"><span className="rounded border border-line bg-white px-2.5 py-1 font-mono text-xs text-ink-secondary">{detail.data.data.emp_code}</span><Badge variant={detail.data.data.status === 'active' ? 'success' : detail.data.data.status === 'notice' ? 'warning' : 'secondary'}>{STATUS_FILTERS.find((entry) => entry.key === detail.data.data.status)?.label || detail.data.data.status}</Badge></div>}
            </DialogHeader>
            <div className="min-h-0 max-h-[60dvh] overflow-y-auto bg-canvas p-5 text-sm sm:p-8">
              <div className="grid items-start gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4">
              {detail.isLoading ? <p>Loading employee…</p> : detail.isError ? (
                <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-700">Could not load employee details. <Button variant="outline" size="sm" onClick={() => void detail.refetch()}>Retry profile</Button></div>
              ) : detail.data?.data && (
                <>
                  <ProfileSection title="Contact details" fields={[
                    ['Email', detail.data.data.email], ['Phone', detail.data.data.phone],
                    ['Login account', detail.data.data.linked_user_email], ['Address', detail.data.data.address],
                  ]} />
                  <ProfileSection title="Employment details" fields={[
                    ['Department', detail.data.data.department_name], ['Designation', detail.data.data.designation_name],
                    ['Joined', detail.data.data.joining_date], ['Manager', detail.data.data.manager_name],
                    ['Employment type', EMPLOYMENT_TYPES.find(([key]) => key === detail.data.data.employment_type)?.[1] || detail.data.data.employment_type],
                    ['Branch', detail.data.data.branch_name],
                    ...(detail.data.data.exit_date ? [['Exit date', detail.data.data.exit_date] as [string, string]] : []),
                  ]} />
                  {[detail.data.data.pan, detail.data.data.bank_account, detail.data.data.bank_ifsc].some(Boolean) && <ProfileSection title="Payroll & statutory details" fields={[
                    ['PAN', detail.data.data.pan], ['Bank account', detail.data.data.bank_account], ['IFSC', detail.data.data.bank_ifsc],
                  ]} />}
                </>
              )}
              </div>
              <section aria-label="Employee work activity" className="space-y-5 rounded-lg border border-line bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold text-slate-900">Work activity</h3>
                <input aria-label="Work month" type="month" value={workMonth}
                  onChange={(e) => setWorkMonth(e.target.value)} className="w-auto text-xs" />
              </div>
              {work.isLoading ? <p className="text-slate-500">Loading work records…</p> : work.isError ? (
                <p className="text-rose-600">Could not load work records.</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge variant="info">{work.data?.data?.summary?.task_count || 0} work logs</Badge>
                    <Badge variant="secondary">{work.data?.data?.summary?.task_hours || 0} task hours</Badge>
                    <Badge variant="secondary">{((work.data?.data?.summary?.clocked_minutes || 0) / 60).toFixed(1)} clocked hours</Badge>
                  </div>
                  <div className="space-y-2">
                    {(work.data?.data?.tasks || []).map((task: any) => (
                      <div key={task.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex justify-between gap-2">
                          <strong className="text-slate-900">{task.task_title}</strong>
                          <span className="text-xs text-slate-500 whitespace-nowrap">{task.work_date}</span>
                        </div>
                        <p className="text-xs text-slate-600">{task.description || task.tag}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {task.started_at && task.ended_at
                            ? `${new Date(task.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${new Date(task.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                            : 'Legacy entry (no start/end time)'} · {task.hours_spent}h · {task.status}
                        </p>
                      </div>
                    ))}
                    {!work.data?.data?.tasks?.length && <p className="rounded-lg bg-canvas p-4 text-slate-500">No work logs this month.</p>}
                  </div>
                  <h4 className="flex items-center gap-2 font-semibold"><Clock3 className="w-4 h-4" /> Work sessions</h4>
                  {(work.data?.data?.sessions || []).map((session: any) => (
                    <p key={session.id} className="text-xs text-slate-600">
                      {session.work_date}: {new Date(session.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {' – '}{session.clock_out ? new Date(session.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                      {session.clock_out ? ` (${session.total_minutes} min)` : ''}
                    </p>
                  ))}
                  <section aria-label="Employee attendance">
                    <div className="mb-3 flex items-center justify-between gap-2"><h4 className="font-semibold">Attendance</h4><span className="text-xs text-ink-muted">{work.data?.data?.attendance?.length || 0} recorded days</span></div>
                    {work.data?.data?.attendance?.length ? <div role="region" aria-label="Scrollable attendance records" tabIndex={0} className="max-h-72 overflow-auto rounded-lg border border-line">
                      <table className="w-full text-left text-xs">
                        <caption className="sr-only">Employee attendance for {workMonth}</caption>
                        <thead className="sticky top-0 bg-slate-50 text-ink-secondary"><tr>
                          <th scope="col" className="whitespace-nowrap px-3 py-3 font-semibold">Date</th>
                          <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                          <th scope="col" className="whitespace-nowrap px-3 py-3 text-right font-semibold">Worked</th>
                          <th scope="col" className="px-3 py-3 font-semibold">Source</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-100">{work.data.data.attendance.map((day: { work_date: string; status: string; worked_minutes: number | null; source: string | null }) => <tr key={day.work_date} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-3 py-3 tabular-nums">{day.work_date}</td>
                          <td className="px-3 py-3"><Badge variant={day.status === 'present' ? 'success' : day.status === 'absent' ? 'destructive' : day.status === 'half_day' ? 'warning' : 'secondary'}><span className="whitespace-nowrap capitalize">{day.status.replace(/_/g, ' ')}</span></Badge></td>
                          <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{day.worked_minutes == null ? '—' : `${Math.floor(Number(day.worked_minutes) / 60)}h ${Number(day.worked_minutes) % 60}m`}</td>
                          <td className="px-3 py-3 capitalize text-ink-muted">{day.source?.replace(/_/g, ' ') || '—'}</td>
                        </tr>)}</tbody>
                      </table>
                    </div> : <p className="rounded-lg bg-canvas p-4 text-xs text-slate-500">No attendance recorded for this month.</p>}
                  </section>
                  {can('payroll.view') && !!detail.data?.data?.salary_structures?.length && (
                    <div className="border-t pt-3">
                      <h4 className="font-semibold">Salary structures</h4>
                      {detail.data.data.salary_structures.map((structure: any) => (
                        <p key={structure.id} className="text-xs text-slate-600">
                          Effective {structure.effective_from} · Basic ₹{Number(structure.basic_inr).toLocaleString('en-IN')}
                          {' · '}HRA ₹{Number(structure.hra_inr).toLocaleString('en-IN')}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              )}
              </section>
              </div>
            </div>
            <DialogFooter className="m-0 gap-2 border-t border-line bg-white px-5 py-4 sm:px-8">
              <Button variant="outline" onClick={() => setSelectedId(null)}>Close profile</Button>
              {manage && detail.data?.data && !detail.isError && <Button onClick={() => startEdit(detail.data.data)}><Pencil size={15} aria-hidden="true" />Edit employee</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Add / Edit Employee Dialog */}
      {showForm && (
        <Dialog open={true} onOpenChange={() => setShowForm(false)}>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>{editId ? 'Edit Employee Details' : 'Add New Employee Record'}</DialogTitle>
              <DialogDescription>
                Fill staff information for attendance tracking, organization structure, and payroll calculations.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Employee Code *</label>
                  <Input
                    value={form.emp_code}
                    onChange={(e) => setField('emp_code', e.target.value)}
                    required
                    placeholder="e.g. EMP-101"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Full Name *</label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setField('full_name', e.target.value)}
                    required
                    placeholder="e.g. Priya Natarajan"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Phone</label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setField('phone', e.target.value)}
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Email</label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    placeholder="priya@company.com"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700">Linked login account</label>
                  <select
                    value={form.user_id}
                    onChange={(e) => setField('user_id', e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Not linked — admin only</option>
                    {linkableUsers.map((u) => {
                      const takenByOther = Boolean(u.employee_id && u.employee_id !== editId);
                      return (
                        <option key={u.user_id} value={u.user_id} disabled={takenByOther}>
                          {u.display_name} · {u.email}
                          {u.role_name ? ` (${u.role_name})` : ''}
                          {takenByOther ? ` — linked to ${u.emp_code}` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <p className="text-[11px] text-slate-400">
                    The selected login gets its own My Profile, tasks, leave and payslip records.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Department</label>
                  <select
                    value={form.department_id}
                    onChange={(e) => setField('department_id', e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Select Department…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Designation / Role</label>
                  <select
                    value={form.designation_id}
                    onChange={(e) => setField('designation_id', e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Select Designation…</option>
                    {designations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Joining Date *</label>
                  <Input
                    type="date"
                    value={form.joining_date}
                    onChange={(e) => setField('joining_date', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Employment Type</label>
                  <select
                    value={form.employment_type}
                    onChange={(e) => setField('employment_type', e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {EMPLOYMENT_TYPES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">PAN Card</label>
                  <Input
                    value={form.pan}
                    onChange={(e) => setField('pan', e.target.value.toUpperCase())}
                    placeholder="e.g. ABCDE1234F"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Bank Account Number</label>
                  <Input
                    value={form.bank_account}
                    onChange={(e) => setField('bank_account', e.target.value)}
                    placeholder="Account number"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Bank IFSC Code</label>
                  <Input
                    value={form.bank_ifsc}
                    onChange={(e) => setField('bank_ifsc', e.target.value.toUpperCase())}
                    placeholder="e.g. HDFC0001234"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Employment Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setField('status', e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="active">Active</option>
                    <option value="notice">On Notice</option>
                    <option value="exited">Exited</option>
                  </select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  {editId ? 'Update Profile' : 'Save Employee'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </HrShell>
  );
}
