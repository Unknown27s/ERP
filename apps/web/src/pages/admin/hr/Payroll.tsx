/**
 * ==============================================================================
 * DESIGN SPECIFICATION: Payroll Engine & Compensation Management (Payroll.tsx)
 * ==============================================================================
 * Functional Scope:
 * 1. Monthly Payroll Runs:
 *    - Period selection (e.g. 2026-11), working days computation.
 *    - State machine: Draft -> Locked -> Paid.
 *    - Individual employee payslip calculation (Gross - Deductions = Net Pay).
 *    - Integrated PDF payslip generation and download.
 * 2. Salary Structures (Indian Statutory Composition):
 *    - Earnings: Basic, HRA, Conveyance, Special Allowance, Incentive.
 *    - Deductions: PF (Provident Fund), ESI, Professional Tax, TDS, Other.
 * ==============================================================================
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { formatInr } from '../../../lib/utils';
import { downloadPayslipPdf } from '../../../lib/payslipPdf';
import {
  Banknote,
  Plus,
  Play,
  Lock,
  CheckCircle2,
  AlertCircle,
  FileDown,
  Calendar,
  Wallet,
  ShieldCheck,
  Calculator,
} from 'lucide-react';
import HrShell, { KPI_TINTS, monthName, useHrOverview } from './HrShell';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../../components/ui/Dialog';

type Employee = { id: string; emp_code: string; full_name: string; status: string };
type Salary = {
  id: string;
  employee_id: string;
  full_name: string;
  emp_code: string;
  effective_from: string;
  basic_inr: number;
  hra_inr: number;
  conveyance_inr: number;
  special_allowance_inr: number;
  incentive_inr: number;
  pf_inr: number;
  esi_inr: number;
  professional_tax_inr: number;
  tds_inr: number;
  other_deduction_inr: number;
};
type Run = {
  id: string;
  period: string;
  status: string;
  working_days: number;
  employee_count?: number;
  gross_total?: number;
  net_total?: number;
  locked_at?: string | null;
  paid_at?: string | null;
};

const dayNow = () => new Date().toISOString().slice(0, 10);
const monthNow = () => dayNow().slice(0, 7);

const daysInMonth = (period: string) => {
  if (!/^\d{4}-\d{2}$/.test(period)) return 30;
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};

const EMPTY_SALARY = {
  basic_inr: '0',
  hra_inr: '0',
  conveyance_inr: '0',
  special_allowance_inr: '0',
  incentive_inr: '0',
  pf_inr: '0',
  esi_inr: '0',
  professional_tax_inr: '0',
  tds_inr: '0',
  other_deduction_inr: '0',
};

const EARNINGS: Array<[keyof typeof EMPTY_SALARY, string]> = [
  ['basic_inr', 'Basic Salary'],
  ['hra_inr', 'House Rent Allowance (HRA)'],
  ['conveyance_inr', 'Conveyance Allowance'],
  ['special_allowance_inr', 'Special Allowance'],
  ['incentive_inr', 'Performance Incentive'],
];

const DEDUCTIONS: Array<[keyof typeof EMPTY_SALARY, string]> = [
  ['pf_inr', 'Provident Fund (PF)'],
  ['esi_inr', 'Employee State Insurance (ESI)'],
  ['professional_tax_inr', 'Professional Tax (PT)'],
  ['tds_inr', 'Tax Deducted at Source (TDS)'],
  ['other_deduction_inr', 'Other Deductions'],
];

export default function HRPayroll() {
  const [period, setPeriod] = useState(monthNow());
  const [workingDays, setWorkingDays] = useState(String(daysInMonth(monthNow())));
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [salaryForm, setSalaryForm] = useState({
    employee_id: '',
    effective_from: dayNow(),
    ...EMPTY_SALARY,
  });
  const [showGenerate, setShowGenerate] = useState(false);
  const [showSalary, setShowSalary] = useState(false);

  const employees = useQuery({ queryKey: ['hr-employees-all'], queryFn: () => api.get('/hr/employees?status=all') });
  const salaries = useQuery({ queryKey: ['hr-salaries'], queryFn: () => api.get('/hr/salary') });
  const runs = useQuery({ queryKey: ['hr-payroll-runs'], queryFn: () => api.get('/hr/payroll') });

  const runRows: Run[] = runs.data?.data || [];
  const staff: Employee[] = (employees.data?.data || []).filter((e: Employee) => e.status !== 'exited');
  const salaryRows: Salary[] = salaries.data?.data || [];

  // Default to latest run if none explicitly picked
  const activeRunId = selectedRunId || (runRows.length > 0 ? runRows[0].id : '');

  const runDetail = useQuery({
    queryKey: ['hr-payroll-run', activeRunId],
    queryFn: () => api.get(`/hr/payroll/${activeRunId}`),
    enabled: !!activeRunId,
  });

  const overview = useHrOverview();
  const detail: any = runDetail.data?.data;

  // Real-time calculation for salary form dialog
  const gross = EARNINGS.reduce((s, [k]) => s + (Number(salaryForm[k]) || 0), 0);
  const deductions = DEDUCTIONS.reduce((s, [k]) => s + (Number(salaryForm[k]) || 0), 0);
  const net = gross - deductions;

  const onPeriodChange = (v: string) => {
    setPeriod(v);
    if (/^\d{4}-\d{2}$/.test(v)) setWorkingDays(String(daysInMonth(v)));
  };

  const generateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await api.post('/hr/payroll/preview', {
        period,
        working_days: Number(workingDays) || daysInMonth(period),
      });
      setSelectedRunId(res.data.id);
      const skipped = res.data.skipped?.length || 0;
      setMsg({
        ok: true,
        text: `Payroll run generated for ${monthName(period)}.${
          skipped ? ` ${skipped} staff skipped (missing salary structure).` : ''
        }`,
      });
      setShowGenerate(false);
      runs.refetch();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Payroll generation failed.' });
    }
  };

  const lockRun = async () => {
    if (!detail) return;
    if (!window.confirm(`Lock payroll for ${monthName(detail.period)}? Locked payroll cannot be regenerated.`)) return;
    try {
      await api.post(`/hr/payroll/${detail.id}/lock`, {});
      setMsg({ ok: true, text: `Payroll for ${monthName(detail.period)} locked.` });
      runs.refetch();
      runDetail.refetch();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Action failed.' });
    }
  };

  const payRun = async () => {
    if (!detail) return;
    const totalNet = detail.payslips?.reduce((s: number, p: any) => s + Number(p.net_inr), 0) || 0;
    if (!window.confirm(`Mark ${monthName(detail.period)} payroll as paid and record ${formatInr(totalNet)} to expenses?`)) return;
    try {
      await api.post(`/hr/payroll/${detail.id}/pay`, {});
      setMsg({ ok: true, text: `Payroll marked as paid and posted to general ledger.` });
      runs.refetch();
      runDetail.refetch();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Payment mark failed.' });
    }
  };

  const pickEmployeeForSalary = (id: string) => {
    const existing = salaryRows.find((s) => s.employee_id === id);
    if (existing) {
      setSalaryForm({
        employee_id: id,
        effective_from: dayNow(),
        basic_inr: String(existing.basic_inr),
        hra_inr: String(existing.hra_inr),
        conveyance_inr: String(existing.conveyance_inr),
        special_allowance_inr: String(existing.special_allowance_inr),
        incentive_inr: String(existing.incentive_inr),
        pf_inr: String(existing.pf_inr),
        esi_inr: String(existing.esi_inr),
        professional_tax_inr: String(existing.professional_tax_inr),
        tds_inr: String(existing.tds_inr),
        other_deduction_inr: String(existing.other_deduction_inr),
      });
    } else {
      setSalaryForm({ employee_id: id, effective_from: dayNow(), ...EMPTY_SALARY });
    }
  };

  const saveSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const payload: any = {
        employee_id: salaryForm.employee_id,
        effective_from: salaryForm.effective_from,
      };
      for (const [k] of [...EARNINGS, ...DEDUCTIONS]) {
        payload[k] = Number(salaryForm[k]) || 0;
      }
      await api.post('/hr/salary', payload);
      setMsg({ ok: true, text: 'Salary structure updated successfully.' });
      setShowSalary(false);
      salaries.refetch();
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Could not save salary structure' });
    }
  };

  return (
    <HrShell
      title="Payroll &amp; Compensation"
      subtitle="Generate monthly salary calculations, manage statutory deductions (PF/ESI/TDS), and export payslips."
      kpis={[
        { label: 'Current Month Net', value: overview?.current_month_net ? formatInr(overview.current_month_net) : '₹0', meta: monthName(overview?.month), ...KPI_TINTS.blue },
        { label: 'Configured Structures', value: String(salaryRows.length), meta: 'Staff on compensation plan', ...KPI_TINTS.green },
        { label: 'Payroll Runs', value: String(runRows.length), meta: 'Generated periods', ...KPI_TINTS.gold },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowSalary(true)} className="gap-1.5 shadow-sm">
            <Calculator className="w-4 h-4 text-slate-500" />
            <span>Salary Structures</span>
          </Button>
          <Button onClick={() => setShowGenerate(true)} className="gap-1.5 shadow-sm">
            <Play className="w-4 h-4" />
            <span>Run Monthly Payroll</span>
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

      {/* ──────────────────────────────────────────────────────────────────
          1. RUN SELECTOR & RUN METRICS BAR
          ────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Run Selector Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {runRows.map((r) => {
            const isSelected = r.id === activeRunId;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRunId(r.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50/70 text-brand-700 shadow-sm'
                    : 'border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{monthName(r.period)}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                    r.status === 'paid'
                      ? 'bg-emerald-100 text-emerald-800'
                      : r.status === 'locked'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {r.status}
                </span>
              </button>
            );
          })}
        </div>

        {/* Action Controls for Active Run */}
        {detail && (
          <div className="flex items-center gap-2 shrink-0">
            {detail.status === 'draft' && (
              <Button size="sm" variant="outline" onClick={lockRun} className="gap-1.5 h-8 text-xs">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>Lock Calculations</span>
              </Button>
            )}
            {detail.status === 'locked' && (
              <Button size="sm" onClick={payRun} className="gap-1.5 h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Disburse &amp; Post Expense</span>
              </Button>
            )}
            {detail.status === 'paid' && (
              <Badge variant="success" className="px-3 py-1">
                Disbursed on {detail.paid_at?.slice(0, 10)}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          2. DETAILED PAYSLIPS BREAKDOWN TABLE
          ────────────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900">
              {detail ? `Payslip Register — ${monthName(detail.period)}` : 'Payroll Register'}
            </CardTitle>
            <CardDescription>
              {detail
                ? `${detail.payslips?.length || 0} staff included · ${detail.working_days} working days basis`
                : 'Select or generate a payroll run to view generated payslips.'}
            </CardDescription>
          </div>
          {detail?.payslips && (
            <div className="text-xs font-bold text-slate-800">
              Total Disbursement:{' '}
              <span className="text-brand-600">
                {formatInr(detail.payslips.reduce((s: number, p: any) => s + Number(p.net_inr), 0))}
              </span>
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200/80">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Pay Days</th>
                  <th className="py-3 px-4">Gross Earnings</th>
                  <th className="py-3 px-4">Deductions</th>
                  <th className="py-3 px-4">Net Salary</th>
                  <th className="py-3 px-4 text-right">Payslip PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runDetail.isLoading && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Loading run payslips…
                    </td>
                  </tr>
                )}
                {!runDetail.isLoading && (!detail?.payslips || detail.payslips.length === 0) && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No payslips generated for this period. Click &quot;Run Monthly Payroll&quot; above to calculate.
                    </td>
                  </tr>
                )}
                {detail?.payslips?.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {p.full_name}
                      <span className="font-mono text-[11px] text-slate-400 ml-1.5">({p.emp_code})</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {p.paid_days} / {detail.working_days}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {formatInr(Number(p.gross_inr))}
                    </td>
                    <td className="py-3 px-4 text-rose-600 font-medium">
                      -{formatInr(Number(p.deductions_inr))}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                      {formatInr(Number(p.net_inr))}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadPayslipPdf({ ...p, period: detail.period, working_days: detail.working_days })}
                        className="h-7 px-2.5 text-[11px] gap-1"
                      >
                        <FileDown className="w-3.5 h-3.5 text-slate-500" />
                        <span>PDF</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ──────────────────────────────────────────────────────────────────
          3. GENERATE MONTHLY RUN DIALOG
          ────────────────────────────────────────────────────────────────── */}
      {showGenerate && (
        <Dialog open={true} onOpenChange={() => setShowGenerate(false)}>
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>Generate Monthly Payroll Run</DialogTitle>
              <DialogDescription>
                Calculates attendance, leaves, and salary structures to produce draft payslips.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={generateRun} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Salary Period (Month)</label>
                <Input
                  type="month"
                  value={period}
                  onChange={(e) => onPeriodChange(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Total Working Days</label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={workingDays}
                  onChange={(e) => setWorkingDays(e.target.value)}
                  required
                />
              </div>

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                Staff without an active salary structure will be automatically skipped.
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setShowGenerate(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Generate Draft Payslips
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ──────────────────────────────────────────────────────────────────
          4. SALARY STRUCTURE CONFIGURATION DIALOG
          ────────────────────────────────────────────────────────────────── */}
      {showSalary && (
        <Dialog open={true} onOpenChange={() => setShowSalary(false)}>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>Configure Staff Salary Structure</DialogTitle>
              <DialogDescription>
                Define monthly gross allowances and statutory deductions (INR amounts).
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={saveSalary} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Staff Member *</label>
                  <select
                    value={salaryForm.employee_id}
                    onChange={(e) => pickEmployeeForSalary(e.target.value)}
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
                  <label className="text-xs font-semibold text-slate-700">Effective From *</label>
                  <Input
                    type="date"
                    value={salaryForm.effective_from}
                    onChange={(e) => setSalaryForm({ ...salaryForm, effective_from: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Earnings vs Deductions Split Columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Earnings Column */}
                <div className="p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/20 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                    Gross Earnings (Monthly)
                  </div>
                  {EARNINGS.map(([k, label]) => (
                    <div key={k} className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600">{label}</label>
                      <Input
                        type="number"
                        min="0"
                        value={salaryForm[k]}
                        onChange={(e) => setSalaryForm({ ...salaryForm, [k]: e.target.value })}
                      />
                    </div>
                  ))}
                  <div className="pt-2 border-t border-emerald-200 flex justify-between text-xs font-bold text-emerald-800">
                    <span>Total Gross:</span>
                    <span>{formatInr(gross)}</span>
                  </div>
                </div>

                {/* Deductions Column */}
                <div className="p-3.5 rounded-xl border border-rose-100 bg-rose-50/20 space-y-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-800">
                    Statutory Deductions (Monthly)
                  </div>
                  {DEDUCTIONS.map(([k, label]) => (
                    <div key={k} className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-600">{label}</label>
                      <Input
                        type="number"
                        min="0"
                        value={salaryForm[k]}
                        onChange={(e) => setSalaryForm({ ...salaryForm, [k]: e.target.value })}
                      />
                    </div>
                  ))}
                  <div className="pt-2 border-t border-rose-200 flex justify-between text-xs font-bold text-rose-800">
                    <span>Total Deductions:</span>
                    <span>{formatInr(deductions)}</span>
                  </div>
                </div>
              </div>

              {/* Real-Time Net Pay Preview Card */}
              <div className="p-3.5 rounded-xl bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-400 font-medium">Estimated Monthly Take-Home (Net Pay)</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">{formatInr(net)}</div>
                </div>
                <Badge variant="outline" className="border-slate-700 text-slate-300">
                  {gross > 0 ? `${Math.round((net / gross) * 100)}% of gross` : '0%'}
                </Badge>
              </div>

              <DialogFooter>
                <Button variant="outline" type="button" onClick={() => setShowSalary(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!salaryForm.employee_id || gross <= 0}>
                  Save Salary Structure
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </HrShell>
  );
}
