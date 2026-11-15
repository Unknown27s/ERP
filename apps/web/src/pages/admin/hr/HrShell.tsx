/**
 * ==============================================================================
 * DESIGN SPECIFICATION: HR Module Shell & Shared Navigation (HrShell.tsx)
 * ==============================================================================
 * Shared framing across all 4 HR sub-modules:
 * - Employees (/admin/hr/employees)
 * - Daily Attendance (/admin/hr/attendance)
 * - Leave & Holidays (/admin/hr/leaves)
 * - Payroll & Compensation (/admin/hr/payroll)
 * ==============================================================================
 */

import React, { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { api } from '../../../lib/api';
import { UserCheck, CalendarClock, CalendarRange, Banknote } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';

export type HrOverview = {
  headcount: number;
  pending_leaves: number;
  present_today: number;
  current_month_net: number;
  month: string;
};

export type HrKpi = {
  label: string;
  value: string;
  meta?: string;
  icon?: string[];
  tint?: string;
  fg?: string;
};

export const KPI_TINTS = {
  gold: { tint: '#FBF3E3', fg: '#8A6A22' },
  green: { tint: '#E7F4EC', fg: '#26734D' },
  amber: { tint: '#FDF2DC', fg: '#946200' },
  rose: { tint: '#F7E9EF', fg: '#8C3A55' },
  blue: { tint: '#E8EFF9', fg: '#2F5597' },
  red: { tint: '#FDECEA', fg: '#B42318' },
};

/** Shared, cached HR overview telemetry */
export function useHrOverview(): HrOverview | undefined {
  const q = useQuery({
    queryKey: ['hr-overview'],
    queryFn: () => api.get('/hr/overview'),
    staleTime: 30_000,
  });
  return q.data?.data;
}

export const monthName = (period?: string) => {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return 'This month';
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const HR_TABS = [
  { to: '/admin/hr/employees', label: 'Employees Directory', icon: UserCheck },
  { to: '/admin/hr/attendance', label: 'Attendance & Punches', icon: CalendarClock },
  { to: '/admin/hr/leaves', label: 'Leave & Holidays', icon: CalendarRange },
  { to: '/admin/hr/payroll', label: 'Payroll & Compensation', icon: Banknote },
];

export default function HrShell({
  title,
  subtitle,
  kpis,
  actions,
  children,
}: {
  title: string;
  subtitle: ReactNode;
  kpis: HrKpi[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ── 1. Header Zone ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1">
            <UserCheck className="w-4 h-4" />
            <span>Human Capital Management</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{title}</h1>
          <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
        </div>
        {actions && <div className="flex items-center gap-2.5">{actions}</div>}
      </div>

      {/* ── 2. Metric KPI Cards ────────────────────────────────────────────── */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <Card key={k.label} className="hover:border-slate-300 transition-all hover:shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    {k.label}
                  </span>
                  <div className="text-xl font-bold text-slate-900 mt-1 tracking-tight">{k.value}</div>
                  {k.meta && <span className="text-[11px] text-slate-400 block mt-0.5">{k.meta}</span>}
                </div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
                  style={{
                    backgroundColor: k.tint || '#F1F5F9',
                    color: k.fg || '#334155',
                  }}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: k.fg || '#334155' }} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── 3. Pill Tab Navigation ──────────────────────────────────────────── */}
      <nav className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-xl w-fit" aria-label="HR sections">
        {HR_TABS.map((t) => {
          const IconComp = t.icon;
          return (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`
              }
            >
              <IconComp className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* ── 4. Content Body ─────────────────────────────────────────────────── */}
      <div className="space-y-6">{children}</div>
    </div>
  );
}
