/**
 * ==============================================================================
 * DESIGN SPECIFICATION: Executive Dashboard Screen (Dashboard.tsx)
 * ==============================================================================
 * Layout & Visual Hierarchy:
 * 1. Top Executive Welcome Banner:
 *    - Product branding + live Indian formatted date string
 *    - Personalized greeting ("Welcome back, {User}")
 *    - Real-time connection status pill (System Active) & role chip
 * 2. High-Impact KPI Metrics Grid:
 *    - Responsive 4-column cards (1 col on mobile, 2 on tablet, 4 on desktop)
 *    - Lucide icons with subtle tinted background badges
 *    - Formatted numerical values & INR currency formatting via formatInr()
 *    - Descriptive sub-captions providing operational context
 * 3. Operational Launchpad (2-column layout on md+):
 *    - Action cards filtered dynamically by active role permissions
 *    - Hover state with brand border accent and right arrow shift
 * 4. Live Audit Stream:
 *    - Real-time feed of the last 8 administrative actions
 *    - Relative timestamps ("Just now", "5m ago", "Yesterday")
 *    - Entity and action pill tags
 * ==============================================================================
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatInr } from '../../lib/utils';
import { useAuth } from '../../hooks/auth';
import { useBranding } from '../../hooks/branding';
import {
  Users,
  UserCheck,
  CalendarRange,
  Banknote,
  UsersRound,
  Target,
  LifeBuoy,
  Boxes,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
  Activity,
  Calendar,
  Building2,
  Clock,
  Sparkles,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

/* ── 1. Types & Data Definitions ────────────────────────────────────────────── */

type DashData = {
  month: string;
  headcount: number | null;
  present_today: number | null;
  pending_leaves: number | null;
  payroll_net: number | null;
  customers: number | null;
  open_leads: number | null;
  overdue_follow_ups: number | null;
  open_support_cases: number | null;
  active_items: number | null;
  revenue_month: number | null;
  recent_activity: Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string;
    summary: string;
    created_at: string;
  }>;
};

/** Action shortcuts displayed on the operational launchpad */
const ACTION_SHORTCUTS = [
  {
    to: '/admin/staff',
    label: 'User Management',
    desc: 'Add staff, manage access credentials, and assign roles.',
    icon: Users,
    permission: 'staff.view',
    color: 'text-blue-600 bg-blue-50',
  },
  {
    to: '/admin/hr/employees',
    label: 'Employee Directory',
    desc: 'Browse staff records, departments, and designations.',
    icon: Building2,
    permission: 'hr.view',
    color: 'text-indigo-600 bg-indigo-50',
  },
  {
    to: '/admin/hr/attendance',
    label: 'Daily Attendance',
    desc: 'Review biometric punches, work shifts, and logs.',
    icon: Clock,
    permission: 'hr.view',
    color: 'text-emerald-600 bg-emerald-50',
  },
  {
    to: '/admin/hr/leaves',
    label: 'Leave Requests',
    desc: 'Approve or reject time off and verify annual balances.',
    icon: CalendarRange,
    permission: 'leave.view',
    color: 'text-amber-600 bg-amber-50',
  },
  {
    to: '/admin/hr/payroll',
    label: 'Payroll Engine',
    desc: 'Generate monthly runs, deductions, and payslips.',
    icon: Banknote,
    permission: 'payroll.view',
    color: 'text-teal-600 bg-teal-50',
  },
  {
    to: '/admin/crm/leads',
    label: 'Leads & Pipeline',
    desc: 'Work enquiries, follow-ups and lead-to-customer conversion.',
    icon: Target,
    permission: 'crm.view',
    color: 'text-blue-600 bg-blue-50',
  },
  {
    to: '/admin/customers',
    label: 'Customer Directory',
    desc: 'Manage CRM contacts, interactions, and customer records.',
    icon: UsersRound,
    permission: 'crm.view',
    color: 'text-purple-600 bg-purple-50',
  },
  {
    to: '/admin/crm/support-cases',
    label: 'Support Cases',
    desc: 'Track customer issues, priorities and resolution status.',
    icon: LifeBuoy,
    permission: 'crm.view',
    color: 'text-rose-600 bg-rose-50',
  },
];

/* ── 2. Time Helper ─────────────────────────────────────────────────────────── */

/** Calculates relative elapsed time for the audit stream */
function formatTimeAgo(dateString: string) {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / (1000 * 60));
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

/* ── 3. Executive Dashboard View Component ──────────────────────────────────── */

export default function Dashboard() {
  const { user, can } = useAuth();
  const { brand } = useBranding();

  // Fetch real-time dashboard telemetry from backend
  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard'),
  });

  const d: DashData | undefined = data?.data;
  const firstName = user?.display_name?.split(' ')[0] || 'there';

  // Format today's date according to Indian regional standard
  const todayStr = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  // Filter launchpad cards by what the user's role permits
  const permittedActions = ACTION_SHORTCUTS.filter((a) => can(a.permission));

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
      {/* ──────────────────────────────────────────────────────────────────
          3.1 EXECUTIVE WELCOME BANNER
          ────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-brand-600">
              {brand.product_name || 'MarvelSoftware'} Enterprise
            </span>
            <span className="text-slate-300">•</span>
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{todayStr}</span>
            </div>
          </div>
          <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-1">
            Real-time organizational telemetry across people, payroll, operations, and compliance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge variant="success" className="px-3 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
            System Active
          </Badge>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
            <span>{user?.role_name || user?.role}</span>
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-xl bg-white border border-slate-200/80 p-5 animate-pulse space-y-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100" />
              <div className="w-24 h-4 bg-slate-100 rounded" />
              <div className="w-16 h-6 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error Banner */}
      {isError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>Could not load live dashboard telemetry. Please ensure the API is running on port 4000.</span>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────
          3.2 HIGH-IMPACT KPI METRICS GRID
          ────────────────────────────────────────────────────────────────── */}
      {!isLoading && !isError && d && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI: Staff Headcount */}
            {d.headcount !== null && (
              <Card className="hover:border-slate-300 transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Total Headcount
                  </span>
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                    <Users className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 tracking-tight">{d.headcount}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Active staff on payroll</p>
                </CardContent>
              </Card>
            )}

            {/* KPI: Present Today */}
            {d.present_today !== null && (
              <Card className="hover:border-slate-300 transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Present Today
                  </span>
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                    <UserCheck className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600 tracking-tight">{d.present_today}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Biometric &amp; manual punches</p>
                </CardContent>
              </Card>
            )}

            {/* KPI: Pending Leave Approvals */}
            {d.pending_leaves !== null && (
              <Card className="hover:border-slate-300 transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Pending Leaves
                  </span>
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                    <CalendarRange className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600 tracking-tight">{d.pending_leaves}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Awaiting manager approval</p>
                </CardContent>
              </Card>
            )}

            {/* KPI: Monthly Payroll */}
            {d.payroll_net !== null && (
              <Card className="hover:border-slate-300 transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Monthly Payroll
                  </span>
                  <div className="p-2 rounded-lg bg-teal-50 text-teal-600">
                    <Banknote className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 tracking-tight">
                    {formatInr(d.payroll_net)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Disbursed period: {d.month}</p>
                </CardContent>
              </Card>
            )}

            {/* KPI: CRM Customers */}
            {d.customers !== null && (
              <Card className="hover:border-slate-300 transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Customers
                  </span>
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
                    <UsersRound className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 tracking-tight">{d.customers}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Verified CRM contact profiles</p>
                </CardContent>
              </Card>
            )}

            {/* KPI: Open Leads */}
            {d.open_leads != null && (
              <Card className="hover:border-slate-300 transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Open Leads
                  </span>
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                    <Target className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 tracking-tight">{d.open_leads}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Enquiries not yet won or lost</p>
                </CardContent>
              </Card>
            )}

            {/* KPI: Overdue Follow-ups */}
            {d.overdue_follow_ups != null && (
              <Card className="hover:border-slate-300 transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Overdue Follow-ups
                  </span>
                  <div className={`p-2 rounded-lg ${d.overdue_follow_ups > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    <Clock className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold tracking-tight ${d.overdue_follow_ups > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {d.overdue_follow_ups}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Leads past their next follow-up date</p>
                </CardContent>
              </Card>
            )}

            {/* KPI: Open Support Cases */}
            {d.open_support_cases != null && (
              <Card className="hover:border-slate-300 transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Open Support Cases
                  </span>
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                    <LifeBuoy className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600 tracking-tight">{d.open_support_cases}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Open or pending customer issues</p>
                </CardContent>
              </Card>
            )}

            {/* KPI: Active Inventory Items */}
            {d.active_items !== null && (
              <Card className="hover:border-slate-300 transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Active Items
                  </span>
                  <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
                    <Boxes className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-slate-900 tracking-tight">{d.active_items}</div>
                  <p className="text-[11px] text-slate-500 mt-1">Stock SKU catalogue records</p>
                </CardContent>
              </Card>
            )}

            {/* KPI: Invoiced Revenue */}
            {d.revenue_month !== null && (
              <Card className="hover:border-slate-300 transition-all hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Monthly Revenue
                  </span>
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600 tracking-tight">
                    {formatInr(d.revenue_month)}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Invoiced sales period: {d.month}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ──────────────────────────────────────────────────────────────────
              3.3 OPERATIONAL LAUNCHPAD & ACTIVITY FEED
              ────────────────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Action Launchpad (2 Columns) */}
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900">
                        Operational Launchpad
                      </CardTitle>
                      <CardDescription>
                        Direct access to functions permitted for your current role.
                      </CardDescription>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      {permittedActions.length} Actions Available
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {permittedActions.map((action) => {
                      const IconComp = action.icon;
                      return (
                        <Link
                          key={action.to}
                          to={action.to}
                          className="group p-4 rounded-xl border border-slate-200/80 bg-white hover:border-brand-500/50 hover:bg-brand-50/20 transition-all flex items-start gap-3.5 shadow-sm hover:shadow"
                        >
                          <div className={`p-2.5 rounded-lg shrink-0 ${action.color} group-hover:scale-105 transition-transform`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm text-slate-900 group-hover:text-brand-600 transition-colors">
                                {action.label}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                              {action.desc}
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 3.4 Live Audit Stream (Recent System Activity) */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-brand-600" />
                      <CardTitle className="text-base font-bold text-slate-900">
                        Live Audit Stream
                      </CardTitle>
                    </div>
                    {can('audit.view') && (
                      <Link to="/admin/audit" className="text-xs font-semibold text-brand-600 hover:underline">
                        View All
                      </Link>
                    )}
                  </div>
                  <CardDescription>
                    Recent administrative and transactional activity.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {d.recent_activity && d.recent_activity.length > 0 ? (
                    <div className="space-y-3.5">
                      {d.recent_activity.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 pb-3 border-b border-slate-100 last:border-0 last:pb-0"
                        >
                          <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-800 leading-snug">
                              {item.summary || `${item.action} on ${item.entity_type}`}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                                {item.action}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {formatTimeAgo(item.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-400 space-y-2">
                      <FileText className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="text-xs">No recent administrative events recorded.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
