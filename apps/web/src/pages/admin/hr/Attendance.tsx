/**
 * ==============================================================================
 * DESIGN SPECIFICATION: Attendance Tracking & Punch Ingestion (Attendance.tsx)
 * ==============================================================================
 * Functional Scope:
 * - Daily shift attendance tracking (manual entry & bulk biometric punch CSV import).
 * - Calculations: Worked hours, overtime tracking, punch check-in / check-out.
 * - Single record per employee per day (idempotent re-import support).
 * ==============================================================================
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import {
  CalendarClock,
  Upload,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  FileSpreadsheet,
} from 'lucide-react';
import HrShell, { KPI_TINTS, monthName } from './HrShell';
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

type Employee = { id: string; emp_code: string; full_name: string; status: string };
type Row = {
  id: string;
  employee_id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  worked_minutes: number;
  overtime_minutes: number;
  source: string;
  note: string | null;
  full_name: string;
  emp_code: string;
  department_name: string | null;
};

const STATUSES = [
  ['present', 'Present'],
  ['absent', 'Absent'],
  ['half_day', 'Half Day'],
  ['leave', 'On Leave'],
  ['holiday', 'Holiday'],
  ['week_off', 'Week Off'],
];

const monthNow = () => new Date().toISOString().slice(0, 7);
const dayNow = () => new Date().toISOString().slice(0, 10);
const hhmm = (mins: number) => {
  const m = Number(mins) || 0;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

export default function HRAttendance() {
  const [month, setMonth] = useState(monthNow());
  const [empFilter, setEmpFilter] = useState('');
  const [form, setForm] = useState({
    employee_id: '',
    work_date: dayNow(),
    status: 'present',
    check_in: '10:00',
    check_out: '19:00',
    overtime_minutes: '0',
    note: '',
  });
  const [csv, setCsv] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showMark, setShowMark] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const employees = useQuery({ queryKey: ['hr-employees-all'], queryFn: () => api.get('/hr/employees?status=all') });
  const list = useQuery({
    queryKey: ['hr-attendance', month, empFilter],
    queryFn: () => api.get(`/hr/attendance?month=${month}${empFilter ? `&employee_id=${empFilter}` : ''}`),
  });

  const staff: Employee[] = (employees.data?.data || []).filter((e: Employee) => e.status !== 'exited');
  const rows: Row[] = list.data?.data || [];
  const setField = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const counts = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const overtimeTotal = rows.reduce((s, r) => s + (Number(r.overtime_minutes) || 0), 0);

  const mark = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/hr/attendance', {
        employee_id: form.employee_id,
        work_date: form.work_date,
        status: form.status,
        check_in: form.check_in || null,
        check_out: form.check_out || null,
        overtime_minutes: Number(form.overtime_minutes) || 0,
        note: form.note || null,
      });
      setMsg({ ok: true, text: 'Attendance record saved successfully.' });
      setShowMark(false);
      await list.refetch();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Could not save attendance' });
    }
  };

  const importRows = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rowsIn = lines
      .filter((l) => !/^emp_?code/i.test(l))
      .map((line) => {
        const [emp_code, date, check_in, check_out, status, overtime_minutes] = line.split(',').map((s) => s.trim());
        return {
          emp_code,
          date: date || undefined,
          check_in: check_in || null,
          check_out: check_out || null,
          status: status || 'present',
          overtime_minutes: Number(overtime_minutes) || 0,
        };
      })
      .filter((r) => r.emp_code && r.date);

    if (!rowsIn.length) {
      setMsg({ ok: false, text: 'Paste CSV rows as: emp_code,date,check_in,check_out,status' });
      return;
    }

    try {
      const r = await api.post('/hr/attendance/import', { source: 'biometric', rows: rowsIn });
      const d = r.data;
      const hint = d.errors?.length ? ` First error: ${d.errors[0].error}` : '';
      setMsg({ ok: d.failed === 0, text: `Import complete: ${d.imported} processed, ${d.failed} failed.${hint}` });
      if (d.failed === 0) setShowImport(false);
      await list.refetch();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Import failed' });
    }
  };

  return (
    <HrShell
      title="Attendance &amp; Punches"
      subtitle="Ingest automated biometric punches or manually record daily check-in / check-out times."
      kpis={[
        { label: 'Logged Entries', value: String(rows.length), meta: monthName(month), ...KPI_TINTS.blue },
        { label: 'Present', value: String(counts.present || 0), meta: 'Full day worked', ...KPI_TINTS.green },
        { label: 'Absent', value: String(counts.absent || 0), meta: 'Unexcused / unpaid', ...KPI_TINTS.red },
        { label: 'Total Overtime', value: hhmm(overtimeTotal), meta: 'Approved extra hours', ...KPI_TINTS.amber },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)} className="gap-1.5 shadow-sm">
            <Upload className="w-4 h-4 text-slate-500" />
            <span>Import Biometric CSV</span>
          </Button>
          <Button onClick={() => setShowMark(true)} className="gap-1.5 shadow-sm">
            <Plus className="w-4 h-4" />
            <span>Mark Attendance</span>
          </Button>
        </div>
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

      {/* Control Bar: Month Picker & Employee Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white shadow-sm text-xs">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border-0 p-0 text-xs font-semibold text-slate-800 focus:outline-none"
            />
          </div>

          <select
            value={empFilter}
            onChange={(e) => setEmpFilter(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 shadow-sm max-w-xs"
          >
            <option value="">All Staff Members</option>
            {staff.map((e) => (
              <option key={e.id} value={e.id}>
                {e.emp_code} — {e.full_name}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs text-slate-500 font-medium">
          {rows.length} {rows.length === 1 ? 'record' : 'records'} for {monthName(month)}
        </span>
      </div>

      {/* Attendance Records Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Check In</th>
                <th className="py-3 px-4">Check Out</th>
                <th className="py-3 px-4">Hours</th>
                <th className="py-3 px-4">Overtime</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.isLoading && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Loading attendance entries…
                  </td>
                </tr>
              )}
              {!list.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No attendance records logged for {monthName(month)}.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-semibold text-slate-800">{r.work_date}</td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-900">{r.full_name}</span>
                    <span className="font-mono text-[11px] text-slate-400 ml-1.5">({r.emp_code})</span>
                    {r.department_name && (
                      <span className="text-[11px] text-slate-400 block">{r.department_name}</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">{r.check_in || '—'}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{r.check_out || '—'}</td>
                  <td className="py-3 px-4 font-semibold text-slate-800">{hhmm(r.worked_minutes)}</td>
                  <td className="py-3 px-4">
                    {r.overtime_minutes > 0 ? (
                      <span className="text-amber-700 font-semibold font-mono">
                        +{hhmm(r.overtime_minutes)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <Badge
                      variant={
                        r.status === 'present'
                          ? 'success'
                          : r.status === 'half_day'
                          ? 'warning'
                          : r.status === 'absent'
                          ? 'destructive'
                          : 'info'
                      }
                    >
                      {r.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[10px] uppercase font-bold text-slate-400 font-mono">
                      {r.source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Manual Mark Dialog */}
      {showMark && (
        <Dialog open={true} onOpenChange={() => setShowMark(false)}>
          <DialogContent size="md">
            <DialogHeader>
              <DialogTitle>Mark Daily Attendance</DialogTitle>
              <DialogDescription>
                Record manual check-in, check-out, and status override for a staff member.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={mark} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Staff Member *</label>
                <select
                  value={form.employee_id}
                  onChange={(e) => setField('employee_id', e.target.value)}
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

              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Work Date *</label>
                  <Input
                    type="date"
                    value={form.work_date}
                    onChange={(e) => setField('work_date', e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Status *</label>
                  <select
                    value={form.status}
                    onChange={(e) => setField('status', e.target.value)}
                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {STATUSES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Check In</label>
                  <Input
                    type="time"
                    value={form.check_in}
                    onChange={(e) => setField('check_in', e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Check Out</label>
                  <Input
                    type="time"
                    value={form.check_out}
                    onChange={(e) => setField('check_out', e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Overtime (Mins)</label>
                  <Input
                    type="number"
                    min="0"
                    value={form.overtime_minutes}
                    onChange={(e) => setField('overtime_minutes', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Operational Note</label>
                <Input
                  value={form.note}
                  onChange={(e) => setField('note', e.target.value)}
                  placeholder="e.g. Field visit, approved late check-in"
                />
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setShowMark(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!form.employee_id || !form.work_date}>
                  Save Attendance
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Biometric CSV Import Dialog */}
      {showImport && (
        <Dialog open={true} onOpenChange={() => setShowImport(false)}>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>Import Biometric Punch Records</DialogTitle>
              <DialogDescription>
                Paste CSV exported from your biometric attendance machine or punch scanner.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={importRows} className="space-y-4 pt-2">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1 text-slate-600 font-mono">
                <div className="font-bold text-slate-800">Expected Format (Comma Separated):</div>
                <div>emp_code, date (YYYY-MM-DD), check_in (HH:MM), check_out (HH:MM), status</div>
                <div className="text-slate-400">Example: EMP-101, 2026-11-12, 09:30, 18:30, present</div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Paste CSV Rows</label>
                <textarea
                  rows={8}
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  placeholder="EMP-101,2026-11-12,09:30,18:30,present&#10;EMP-102,2026-11-12,10:00,19:00,present"
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setShowImport(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!csv.trim()}>
                  Process Biometric Import
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </HrShell>
  );
}
