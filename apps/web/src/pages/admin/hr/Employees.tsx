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
import {
  UserCheck,
  Plus,
  Search,
  Building2,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  Calendar,
  LogOut,
  Mail,
  Phone,
} from 'lucide-react';
import HrShell, { KPI_TINTS, useHrOverview } from './HrShell';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
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
};

type Lookup = { id: string; name: string; grade?: string | null };

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
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

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
  const overview = useHrOverview();

  const employees: Employee[] = list.data?.data || [];
  const everyone: Employee[] = allQuery.data?.data || [];
  const departments: Lookup[] = depts.data?.data || [];
  const designations: Lookup[] = desigs.data?.data || [];

  const countOf = (s: string) =>
    allQuery.isLoading ? '—' : String(everyone.filter((e) => e.status === s).length);

  const refresh = () => Promise.all([list.refetch(), depts.refetch(), desigs.refetch()]);

  const setField = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const reset = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const payload: any = { ...form };
    for (const k of ['department_id', 'designation_id', 'branch_id']) {
      if (!payload[k]) payload[k] = null;
    }

    try {
      if (editId) {
        await api.patch(`/hr/employees/${editId}`, payload);
        setMsg({ ok: true, text: 'Employee profile updated successfully.' });
      } else {
        await api.post('/hr/employees', payload);
        setMsg({ ok: true, text: 'Employee created successfully.' });
      }
      await refresh();
      reset();
      setShowForm(false);
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Operation failed.' });
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
    });
    setShowForm(true);
  };

  const markExited = async (e: Employee) => {
    if (!window.confirm(`Mark ${e.full_name} as exited today? Historical payroll will be preserved.`)) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await api.patch(`/hr/employees/${e.id}`, { status: 'exited', exit_date: today });
      setMsg({ ok: true, text: `${e.full_name} has been marked exited.` });
      refresh();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Action failed.' });
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
        <Button onClick={() => { reset(); setShowForm(true); }} className="gap-1.5 shadow-sm">
          <Plus className="w-4 h-4" />
          <span>Add Employee</span>
        </Button>
      }
    >
      {/* Alert Banner */}
      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            msg.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          {msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{msg.text}</span>
        </div>
      )}

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
                <th className="py-3 px-4">Department &amp; Title</th>
                <th className="py-3 px-4">Joined Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.isLoading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading employee directory…
                  </td>
                </tr>
              )}
              {!list.isLoading && employees.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No employees found matching filter criteria.
                  </td>
                </tr>
              )}
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">{e.emp_code}</td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">{e.full_name}</div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      {e.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{e.email}</span>}
                      {e.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{e.phone}</span>}
                    </div>
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
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(e)}
                        className="h-7 px-2.5 text-[11px]"
                      >
                        Edit
                      </Button>
                      {e.status !== 'exited' && (
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
