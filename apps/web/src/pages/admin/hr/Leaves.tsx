/**
 * ==============================================================================
 * DESIGN SPECIFICATION: Leave Requests & Holiday Calendar (Leaves.tsx)
 * ==============================================================================
 * Functional Scope:
 * 1. Leave Requests & Approval Workflow:
 *    - Status tabs (Pending, Approved, Rejected, Cancelled).
 *    - Approval/Rejection buttons with notes; approval auto-deducts balances.
 * 2. Leave Policy & Annual Quotas:
 *    - Configure leave types (Sick, Casual, Earned) with paid/unpaid toggle Switch.
 * 3. Company Holiday Schedule:
 *    - Track public, festival, and corporate holidays.
 * ==============================================================================
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import {
  CalendarRange,
  Plus,
  Check,
  X,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Clock,
  Sparkles,
} from 'lucide-react';
import HrShell, { KPI_TINTS, useHrOverview } from './HrShell';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Switch } from '../../../components/ui/Switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../../components/ui/Dialog';

type Employee = { id: string; emp_code: string; full_name: string; status: string };
type LeaveType = { id: string; name: string; annual_quota: number; paid: number };
type Leave = {
  id: string;
  employee_id: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  status: string;
  leave_type: string;
  paid: number;
  full_name: string;
  emp_code: string;
  decision_note: string | null;
};
type Balance = {
  id: string;
  employee_id: string;
  full_name: string;
  emp_code: string;
  leave_type: string;
  year: number;
  entitled: number;
  used: number;
  balance: number;
};
type Holiday = { id: string; holiday_date: string; name: string; holiday_type: string };

const today = () => new Date().toISOString().slice(0, 10);
const yearNow = () => new Date().getFullYear();

const daysBetween = (a: string, b: string) => {
  const x = Date.parse(`${a}T00:00:00Z`);
  const y = Date.parse(`${b}T00:00:00Z`);
  return Number.isFinite(x) && Number.isFinite(y) && y >= x
    ? Math.round((y - x) / 86400000) + 1
    : 0;
};

const STATUS_FILTERS = [
  { key: 'pending', label: 'Pending Approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All Requests' },
];

export default function HRLeaves() {
  const [status, setStatus] = useState('pending');
  const [year, setYear] = useState(String(yearNow()));
  const [form, setForm] = useState({
    employee_id: '',
    leave_type_id: '',
    from_date: today(),
    to_date: today(),
    reason: '',
  });
  const [typeForm, setTypeForm] = useState({ name: '', annual_quota: '12', paid: true });
  const [holidayForm, setHolidayForm] = useState({ holiday_date: today(), name: '', holiday_type: 'public' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showApply, setShowApply] = useState(false);
  const [showType, setShowType] = useState(false);
  const [showHoliday, setShowHoliday] = useState(false);

  const employees = useQuery({ queryKey: ['hr-employees-all'], queryFn: () => api.get('/hr/employees?status=all') });
  const types = useQuery({ queryKey: ['hr-leave-types'], queryFn: () => api.get('/hr/leave-types') });
  const leaves = useQuery({ queryKey: ['hr-leaves', status], queryFn: () => api.get(`/hr/leaves?status=${status}`) });
  const balances = useQuery({ queryKey: ['hr-balances', year], queryFn: () => api.get(`/hr/leave-balances?year=${year}`) });
  const holidays = useQuery({ queryKey: ['hr-holidays', year], queryFn: () => api.get(`/hr/holidays?year=${year}`) });
  const overview = useHrOverview();

  const staff: Employee[] = (employees.data?.data || []).filter((e: Employee) => e.status !== 'exited');
  const leaveTypes: LeaveType[] = types.data?.data || [];
  const rows: Leave[] = leaves.data?.data || [];
  const balRows: Balance[] = balances.data?.data || [];
  const holidayRows: Holiday[] = holidays.data?.data || [];
  const reqDays = daysBetween(form.from_date, form.to_date);
  const balanceLeft = balRows.reduce((s, b) => s + Number(b.balance || 0), 0);

  const refreshAll = () =>
    Promise.all([leaves.refetch(), balances.refetch(), holidays.refetch(), types.refetch()]);

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/hr/leaves', { ...form, days: reqDays });
      setMsg({ ok: true, text: 'Leave request submitted successfully (pending review).' });
      setForm({ ...form, reason: '' });
      setShowApply(false);
      refreshAll();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Submission failed.' });
    }
  };

  const decide = async (l: Leave, next: 'approved' | 'rejected') => {
    const note = next === 'rejected' ? window.prompt('Reason for rejection (optional)') || '' : '';
    setMsg(null);
    try {
      await api.post(`/hr/leaves/${l.id}/decide`, { status: next, note });
      setMsg({ ok: true, text: `Leave request ${next}.` });
      refreshAll();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Action failed.' });
    }
  };

  const addType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeForm.name.trim()) return;
    try {
      await api.post('/hr/leave-types', {
        name: typeForm.name.trim(),
        annual_quota: Number(typeForm.annual_quota) || 0,
        paid: typeForm.paid ? 1 : 0,
      });
      setMsg({ ok: true, text: 'Leave policy type registered.' });
      setTypeForm({ name: '', annual_quota: '12', paid: true });
      setShowType(false);
      types.refetch();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Could not add leave type.' });
    }
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayForm.name.trim()) return;
    try {
      await api.post('/hr/holidays', holidayForm);
      setMsg({ ok: true, text: 'Company holiday added to calendar.' });
      setHolidayForm({ ...holidayForm, name: '' });
      setShowHoliday(false);
      holidays.refetch();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Could not add holiday.' });
    }
  };

  const removeHoliday = async (h: Holiday) => {
    if (!window.confirm(`Delete holiday ${h.name}?`)) return;
    try {
      await api.del(`/hr/holidays/${h.id}`);
      setMsg({ ok: true, text: 'Holiday removed.' });
      holidays.refetch();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Could not delete holiday.' });
    }
  };

  return (
    <HrShell
      title="Leave &amp; Holidays"
      subtitle="Manage employee time off approvals, annual leave balance quotas, and statutory holiday schedules."
      kpis={[
        { label: 'Pending Approvals', value: overview ? String(overview.pending_leaves) : '—', meta: 'Awaiting review', ...KPI_TINTS.amber },
        { label: 'Remaining Balance', value: String(balanceLeft), meta: `Days total in ${year}`, ...KPI_TINTS.green },
        { label: 'Scheduled Holidays', value: String(holidayRows.length), meta: `Calendar year ${year}`, ...KPI_TINTS.rose },
        { label: 'Leave Policies', value: String(leaveTypes.length), meta: 'Configured quota types', ...KPI_TINTS.gold },
      ]}
      actions={
        <Button onClick={() => setShowApply(true)} className="gap-1.5 shadow-sm">
          <Plus className="w-4 h-4" />
          <span>Apply Leave</span>
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

      {/* ──────────────────────────────────────────────────────────────────
          1. LEAVE REQUESTS APPROVAL SECTION
          ────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">Leave Requests</CardTitle>
            <CardDescription>Submitted applications requiring supervisor or manager review.</CardDescription>
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
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Leave Policy</th>
                  <th className="py-3 px-4">From</th>
                  <th className="py-3 px-4">To</th>
                  <th className="py-3 px-4">Days</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Decision</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaves.isLoading && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Loading leave requests…
                    </td>
                  </tr>
                )}
                {!leaves.isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No leave applications found for this filter.
                    </td>
                  </tr>
                )}
                {rows.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {l.full_name}
                      <span className="font-mono text-[11px] text-slate-400 ml-1.5">({l.emp_code})</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-800">{l.leave_type}</span>
                      <span className="text-[10px] text-slate-400 block">{l.paid ? 'Paid' : 'Unpaid'}</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{l.from_date}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{l.to_date}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{l.days} {l.days === 1 ? 'day' : 'days'}</td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{l.reason || '—'}</td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          l.status === 'approved'
                            ? 'success'
                            : l.status === 'pending'
                            ? 'warning'
                            : l.status === 'rejected'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {l.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {l.status === 'pending' ? (
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => decide(l, 'approved')}
                            className="h-7 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => decide(l, 'rejected')}
                            className="h-7 px-2.5 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">Resolved</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ──────────────────────────────────────────────────────────────────
          2. LEAVE TYPES & HOLIDAY CALENDAR GRIDS
          ────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leave Policy Types */}
        <Card>
          <CardHeader className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900">Leave Quota Policies</CardTitle>
              <CardDescription>Configured annual allowances and compensation terms.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowType(true)} className="h-7 px-2.5 text-xs gap-1">
              <Plus className="w-3.5 h-3.5" />
              <span>Policy</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200/80">
                <tr>
                  <th className="py-2.5 px-4">Leave Name</th>
                  <th className="py-2.5 px-4">Yearly Quota</th>
                  <th className="py-2.5 px-4 text-right">Compensation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaveTypes.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{t.name}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">{t.annual_quota} days/yr</td>
                    <td className="py-2.5 px-4 text-right">
                      <Badge variant={t.paid ? 'success' : 'outline'} className="text-[10px]">
                        {t.paid ? 'Paid' : 'Unpaid'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Holiday Calendar */}
        <Card>
          <CardHeader className="pb-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900">Corporate &amp; Public Holidays</CardTitle>
              <CardDescription>Mandatory days off scheduled for calendar year {year}.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowHoliday(true)} className="h-7 px-2.5 text-xs gap-1">
              <Plus className="w-3.5 h-3.5" />
              <span>Holiday</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200/80">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Holiday Title</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {holidayRows.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono text-slate-600">{h.holiday_date}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-800">{h.name}</td>
                    <td className="py-2.5 px-4">
                      <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                        {h.holiday_type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => removeHoliday(h)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Apply Leave Dialog */}
      {showApply && (
        <Dialog open={true} onOpenChange={() => setShowApply(false)}>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>Submit Leave Application</DialogTitle>
              <DialogDescription>
                Request time off. Approving a paid leave will consume your allocated policy balance.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={apply} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Staff Member *</label>
                <select
                  value={form.employee_id}
                  onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                  required
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select Employee…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.emp_code} — {s.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Leave Type *</label>
                <select
                  value={form.leave_type_id}
                  onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}
                  required
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select Leave Policy…</option>
                  {leaveTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.annual_quota} days/yr, {t.paid ? 'Paid' : 'Unpaid'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">From Date *</label>
                  <Input
                    type="date"
                    value={form.from_date}
                    onChange={(e) => setForm({ ...form, from_date: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">To Date *</label>
                  <Input
                    type="date"
                    value={form.to_date}
                    onChange={(e) => setForm({ ...form, to_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 text-xs text-slate-600 font-semibold">
                Requested Duration: <span className="text-brand-600 font-bold">{reqDays}</span> day(s)
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Reason / Notes</label>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Medical reason, family event, personal emergency…"
                />
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setShowApply(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!form.employee_id || !form.leave_type_id || reqDays <= 0}>
                  Submit Application
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Leave Type Dialog with Radix Switch */}
      {showType && (
        <Dialog open={true} onOpenChange={() => setShowType(false)}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Configure Leave Policy</DialogTitle>
              <DialogDescription>Define an annual leave quota and compensation type.</DialogDescription>
            </DialogHeader>

            <form onSubmit={addType} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Policy Title</label>
                <Input
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  required
                  placeholder="e.g. Casual Leave (CL)"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Annual Quota (Days/Year)</label>
                <Input
                  type="number"
                  min="0"
                  value={typeForm.annual_quota}
                  onChange={(e) => setTypeForm({ ...typeForm, annual_quota: e.target.value })}
                  required
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200">
                <div>
                  <div className="text-xs font-semibold text-slate-800">Paid Leave</div>
                  <div className="text-[11px] text-slate-400">Salary continues during absence</div>
                </div>
                <Switch
                  checked={typeForm.paid}
                  onCheckedChange={(checked) => setTypeForm({ ...typeForm, paid: checked })}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setShowType(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!typeForm.name.trim()}>
                  Save Policy
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Holiday Dialog */}
      {showHoliday && (
        <Dialog open={true} onOpenChange={() => setShowHoliday(false)}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Schedule Company Holiday</DialogTitle>
              <DialogDescription>Add a holiday date to the official company calendar.</DialogDescription>
            </DialogHeader>

            <form onSubmit={addHoliday} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Holiday Date</label>
                <Input
                  type="date"
                  value={holidayForm.holiday_date}
                  onChange={(e) => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Holiday Name</label>
                <Input
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                  required
                  placeholder="e.g. Independence Day, Diwali"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Category</label>
                <select
                  value={holidayForm.holiday_type}
                  onChange={(e) => setHolidayForm({ ...holidayForm, holiday_type: e.target.value })}
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="public">National / Public</option>
                  <option value="festival">Festival</option>
                  <option value="shop">Corporate / Office Off</option>
                </select>
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setShowHoliday(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!holidayForm.name.trim()}>
                  Add Holiday
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </HrShell>
  );
}
