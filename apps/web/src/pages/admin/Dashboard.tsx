import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Banknote, Boxes, CalendarRange, CheckCircle2, Clock, LifeBuoy, RefreshCw, Target, TrendingUp, UserCheck, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { formatInr } from '../../lib/utils';
import { useAuth } from '../../hooks/auth';
import { useBranding } from '../../hooks/branding';
import PageHeader from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DataRegion, EmptyState } from '../../components/feedback/DataState';

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
  recent_activity: Array<{ id: string; action: string; entity_type: string; summary: string; created_at: string }>;
};

type Shortcut = { label: string; description: string; to: string; permissions: string[]; icon: LucideIcon };
const SHORTCUTS: Shortcut[] = [
  { label: 'Team tasks', description: 'Assign work and review progress', to: '/admin/tasks', permissions: ['hr.manage'], icon: CheckCircle2 },
  { label: 'Employees', description: 'Directory and employment records', to: '/admin/hr/employees', permissions: ['hr.view'], icon: Users },
  { label: 'Attendance', description: 'Daily attendance and imports', to: '/admin/hr/attendance', permissions: ['hr.view'], icon: UserCheck },
  { label: 'Customers', description: 'Contacts and purchase history', to: '/admin/customers', permissions: ['crm.view'], icon: UsersRound },
  { label: 'Leads', description: 'Pipeline and follow-up activities', to: '/admin/crm/leads', permissions: ['crm.view'], icon: Target },
  { label: 'Sales & invoices', description: 'Draft sales and review payments', to: '/admin/sales', permissions: ['crm.view', 'finance.view'], icon: TrendingUp },
  { label: 'Inventory', description: 'Items, availability and stock receipts', to: '/admin/inventory', permissions: ['inventory.view'], icon: Boxes },
  { label: 'Payroll', description: 'Monthly runs and payslips', to: '/admin/hr/payroll', permissions: ['payroll.view'], icon: Banknote },
  { label: 'Users & access', description: 'Accounts and permissions', to: '/admin/staff', permissions: ['staff.view'], icon: Users },
];

export default function Dashboard() {
  const { user, can } = useAuth();
  const { brand } = useBranding();
  const query = useQuery<{ data: DashData }>({ queryKey: ['dashboard'], queryFn: () => api.get('/dashboard') });
  const d = query.data?.data;
  const timezone = brand.timezone || 'Asia/Kolkata';
  const date = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone }).format(new Date());
  const updated = query.dataUpdatedAt ? new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(query.dataUpdatedAt) : null;

  const metricDefinitions = [
    { key: 'revenue_month', label: 'Monthly revenue', hint: `Invoiced sales · ${d?.month || ''}`, icon: TrendingUp, money: true },
    { key: 'headcount', label: 'Active employees', hint: 'Current employee headcount', icon: Users },
    { key: 'open_leads', label: 'Open leads', hint: 'Enquiries in your pipeline', icon: Target },
    { key: 'active_items', label: 'Active items', hint: 'Items in the stock catalogue', icon: Boxes },
    { key: 'present_today', label: 'Present today', hint: 'Manual and biometric attendance', icon: UserCheck },
    { key: 'payroll_net', label: 'Monthly payroll', hint: `Net payroll · ${d?.month || ''}`, icon: Banknote, money: true },
    { key: 'customers', label: 'Customers', hint: 'Registered customer profiles', icon: UsersRound },
  ] as const;
  // The API omits or nulls metrics outside the user's permissions. Never substitute zero.
  const metrics = metricDefinitions.flatMap((metric) => {
    const value = d?.[metric.key];
    return value == null ? [] : [{ ...metric, value: 'money' in metric && metric.money ? formatInr(value) : value.toLocaleString('en-IN') }];
  });
  const attention = d ? [
    { label: 'Leave requests', description: 'Awaiting review', count: d.pending_leaves, to: '/admin/hr/leaves', allowed: ['hr.view', 'leave.approve', 'leave.manage'].some(can), icon: CalendarRange },
    { label: 'Overdue follow-ups', description: 'Leads past their follow-up date', count: d.overdue_follow_ups, to: '/admin/crm/leads', allowed: can('crm.view'), icon: Clock },
    { label: 'Support cases', description: 'Open or pending resolution', count: d.open_support_cases, to: '/admin/crm/support-cases', allowed: can('crm.view'), icon: LifeBuoy },
  ].filter((item) => item.allowed && item.count != null).sort((a, b) => Number((b.count || 0) > 0) - Number((a.count || 0) > 0)) : [];
  const shortcuts = SHORTCUTS.filter((item) => item.permissions.some(can));

  return <div className="erp-page">
    <PageHeader eyebrow="Workspace overview" meta={date} title={`Good to see you, ${user?.display_name?.split(' ')[0] || 'there'}`} description="Your business at a glance. Review what needs attention and pick up your work." actions={
      <div className="flex items-center gap-3">
        <span role="status" className="text-xs text-ink-muted">{query.isFetching ? 'Updating…' : updated ? `Updated ${updated}` : 'Not yet updated'}</span>
        <Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw size={15} className={query.isFetching ? 'animate-spin' : ''} aria-hidden="true" />Refresh</Button>
      </div>
    } />

    <DataRegion query={query} empty={!d} emptyTitle="No overview available" emptyDescription="Your dashboard data is not available yet.">
      {d && <div className="space-y-6">
        {metrics.length > 0 && <section aria-label="Key business metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.slice(0, 4).map(({ key, label, hint, icon: Icon, value }) => <article key={key} className="erp-panel">
            <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-medium text-ink-secondary">{label}</h2><Icon size={18} className="text-ink-muted" aria-hidden="true" /></div>
            <p className="mt-4 break-words text-[28px] font-semibold leading-9 tracking-tight text-ink tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-ink-muted">{hint}</p>
          </article>)}
        </section>}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <section aria-labelledby="attention-heading" className="erp-panel">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 id="attention-heading" className="text-base font-semibold text-ink">Needs attention</h2><p className="mt-1 text-sm text-ink-muted">Requests and follow-ups to review.</p></div><Badge variant="outline">{user?.role_name || user?.role}</Badge></div>
            {attention.length ? <div className="divide-y divide-slate-100">{attention.map(({ label, description, count, to, icon: Icon }) => <Link key={to} to={to} className="group flex items-center gap-4 rounded-lg px-2 py-4 transition-colors hover:bg-canvas">
              <span className={`rounded-lg p-2.5 ${count ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-ink-muted'}`}><Icon size={18} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{label}</span><span className="mt-0.5 block text-xs text-ink-muted">{count ? description : 'None pending'}</span></span>
              <span className="text-xl font-semibold tabular-nums text-ink">{count}</span><ArrowRight size={16} className="text-ink-muted group-hover:text-brand-600" aria-hidden="true" />
            </Link>)}</div> : <EmptyState title="No review queues for your role" description="Use the workspace links below to continue your work." />}
            {attention.length > 0 && attention.every((item) => item.count === 0) && <p className="mt-3 flex items-center gap-2 border-t border-line pt-4 text-sm text-emerald-800"><CheckCircle2 size={16} aria-hidden="true" />No pending items in these queues.</p>}
          </section>

          <section aria-labelledby="snapshot-heading" className="erp-panel">
            <h2 id="snapshot-heading" className="text-base font-semibold text-ink">Business snapshot</h2><p className="mt-1 text-sm text-ink-muted">Additional figures available to your role.</p>
            {metrics.length > 4 ? <dl className="mt-5 divide-y divide-slate-100">{metrics.slice(4).map((metric) => <div key={metric.key} className="flex flex-wrap items-center justify-between gap-2 py-4"><dt className="text-sm text-ink-secondary">{metric.label}</dt><dd className="text-base font-semibold tabular-nums text-ink">{metric.value}</dd></div>)}</dl> : <p className="py-8 text-sm text-ink-muted">All available metrics are shown above.</p>}
            <div className="mt-5 rounded-lg border border-line bg-canvas p-3 text-xs leading-5 text-ink-secondary"><span className="font-medium text-ink">Reporting period: {d.month}</span><br />Figures reflect the latest successful refresh. Access is based on your permissions.</div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <section aria-labelledby="workspace-links-heading" className="erp-panel">
            <h2 id="workspace-links-heading" className="text-base font-semibold text-ink">Continue working</h2><p className="mt-1 text-sm text-ink-muted">Your team's everyday tools.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">{shortcuts.map(({ label, description, to, icon: Icon }) => <Link key={to} to={to} className="group flex items-start gap-3 rounded-lg border border-line p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40"><span className="rounded-lg bg-canvas p-2 text-ink-secondary"><Icon size={18} aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink group-hover:text-brand-700">{label}</span><span className="mt-1 block text-xs leading-5 text-ink-muted">{description}</span></span><ArrowRight size={15} className="mt-2 shrink-0 text-ink-muted" aria-hidden="true" /></Link>)}</div>
            {!shortcuts.length && <EmptyState title="Your workspace is ready" description="Use My workspace in the navigation for your personal records." />}
          </section>

          {can('audit.view') && <section aria-labelledby="recent-activity-heading" className="erp-panel">
            <div className="flex items-center justify-between gap-3"><h2 id="recent-activity-heading" className="flex items-center gap-2 text-base font-semibold text-ink"><Activity size={17} aria-hidden="true" />Recent activity</h2><Link to="/admin/audit" className="text-xs font-medium text-brand-700 hover:underline">View all</Link></div>
            {d.recent_activity?.length ? <ul className="mt-5 divide-y divide-slate-100">{d.recent_activity.slice(0, 6).map((item) => <li key={item.id} className="py-3"><p className="break-words text-sm text-ink-secondary">{item.summary || `${item.action} on ${item.entity_type}`}</p><time dateTime={item.created_at} className="mt-1 block text-xs text-ink-muted">{Number.isNaN(Date.parse(item.created_at)) ? 'Time unavailable' : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date(item.created_at))}</time></li>)}</ul> : <EmptyState title="No recent activity" description="Administrative activity will appear here after your next refresh." />}
          </section>}
        </div>
      </div>}
    </DataRegion>
  </div>;
}
