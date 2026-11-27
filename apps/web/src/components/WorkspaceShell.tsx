import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, useLocation } from 'react-router-dom';
import { ChevronDown, Menu, X, LogOut, Layers, KeyRound, LayoutDashboard, UserRound, UsersRound, Handshake, ChartNoAxesCombined, Settings2 } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAuth } from '../hooks/auth';
import { useBranding } from '../hooks/branding';
import { api } from '../lib/api';
import AdminBreadcrumbs from './AdminBreadcrumbs';
import PageFinder from './PageFinder';
import Modal from './Modal';
import { Button } from './ui/Button';
import { Field } from './OperationalUi';

type Item = { label: string; to: string; permissions?: string[] };
const GROUPS: Array<{ label: string; items: Item[] }> = [
  { label: 'My workspace', items: [
    { label: 'My profile', to: '/employee' }, { label: 'My tasks', to: '/employee/tasks' }, { label: 'My work log', to: '/employee/work-logs' },
    { label: 'My leave', to: '/employee/leaves' }, { label: 'My payslips', to: '/employee/payslips' }, { label: 'My reports', to: '/employee/reports' },
  ] },
  { label: 'People & access', items: [
    { label: 'Team tasks', to: '/admin/tasks', permissions: ['hr.manage'] },
    { label: 'Users & onboarding', to: '/admin/staff', permissions: ['staff.view'] },
    { label: 'Roles & permissions', to: '/admin/staff/roles', permissions: ['staff.view'] },
    { label: 'Departments', to: '/admin/staff/departments', permissions: ['staff.view'] },
    { label: 'Designations', to: '/admin/staff/designations', permissions: ['staff.view'] },
    { label: 'Employees', to: '/admin/hr/employees', permissions: ['hr.view'] },
    { label: 'Attendance', to: '/admin/hr/attendance', permissions: ['hr.view'] },
    { label: 'Leave approvals', to: '/admin/hr/leaves', permissions: ['hr.view', 'leave.approve', 'leave.manage'] },
    { label: 'Payroll', to: '/admin/hr/payroll', permissions: ['payroll.view'] },
  ] },
  { label: 'Customers & sales', items: [
    { label: 'Leads', to: '/admin/crm/leads', permissions: ['crm.view'] },
    { label: 'Customers', to: '/admin/customers', permissions: ['crm.view'] },
    { label: 'Sales & invoices', to: '/admin/sales', permissions: ['crm.view', 'finance.view'] },
    { label: 'Support cases', to: '/admin/crm/support-cases', permissions: ['crm.view'] },
  ] },
  { label: 'Operations & insights', items: [
    { label: 'Inventory & purchasing', to: '/admin/inventory', permissions: ['inventory.view'] },
    { label: 'Finance register', to: '/admin/finance', permissions: ['finance.view'] },
    { label: 'Reports', to: '/admin/reports', permissions: ['reports.view'] },
  ] },
  { label: 'Administration', items: [
    { label: 'Company settings', to: '/admin/settings', permissions: ['company.manage'] },
    { label: 'Email & delivery', to: '/admin/email', permissions: ['company.manage'] },
    { label: 'Audit trail', to: '/admin/audit', permissions: ['audit.view'] },
  ] },
];
const GROUP_ICONS = [UserRound, UsersRound, Handshake, ChartNoAxesCombined, Settings2];
function isItemActive(pathname: string, to: string) {
  return pathname === to || (!['/employee', '/admin/staff'].includes(to) && pathname.startsWith(`${to}/`));
}
function MenuGroup({ label, items, close }: { label: string; items: Item[]; close: () => void }) {
  const { pathname } = useLocation();
  const active = items.some((item) => isItemActive(pathname, item.to));
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active, pathname]);
  const id = useId();
  const Icon = GROUP_ICONS[GROUPS.findIndex((group) => group.label === label)] || Layers;
  return <section className="workspace-nav-group">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className={`workspace-group-toggle ${active ? 'is-active' : ''}`}>
      <Icon size={18} aria-hidden="true" /><span>{label}</span><ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
    <div id={id} hidden={!open} className="workspace-subnav">{items.map((item) => <NavLink key={item.to} to={item.to} end={['/employee', '/admin/staff'].includes(item.to)} onClick={close} className={({ isActive }) => `workspace-nav-link ${isActive ? 'is-active' : ''}`}><span className="workspace-nav-dot" aria-hidden="true" />{item.label}</NavLink>)}</div>
  </section>;
}
export default function WorkspaceShell({ children }: { children: ReactNode }) {
  const { user, loading, can, logout } = useAuth();
  const { brand } = useBranding();
  const [sidebar, setSidebar] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [busy, setBusy] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  useEffect(() => { setSidebar(false); }, [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setSidebar(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  if (loading) return <div role="status" className="p-12 text-center">Loading workspace…</div>;
  if (!user) return <Navigate to="/login" replace />;
  const groups = GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => !item.permissions || item.permissions.some(can)) })).filter((group) => group.items.length);
  const signOut = async () => { setError(''); try { await logout(); } catch { setError('Signed out locally. The server could not confirm token revocation.'); } };
  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setPasswordError('');
    try { await api.post('/auth/change-password', { currentPassword, newPassword }); await logout(); }
    catch (e: any) { setPasswordError(e.message); }
    finally { setBusy(false); }
  };
  const closePassword = () => {
    if (busy) return;
    if ((currentPassword || newPassword) && !window.confirm('Discard your unsaved password change?')) return;
    setPasswordOpen(false); setCurrentPassword(''); setNewPassword(''); setPasswordError('');
  };
  const initials = user.display_name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const navigation = <>
      <Link to={user.role_name === 'Employee' ? '/employee' : '/admin'} onClick={() => setSidebar(false)} className="workspace-brand"><span className="workspace-brand-mark"><Layers size={22} aria-hidden="true" /></span><span className="min-w-0 truncate text-sm font-bold">{brand.product_name || 'MarvelSoftware'}<span className="block text-[11px] font-normal text-slate-500">Business workspace</span></span></Link>
      <nav aria-label="Main navigation" className="workspace-nav">
        <p className="workspace-nav-caption">Workspace</p>
        {user.role_name !== 'Employee' && <NavLink to="/admin" end onClick={() => setSidebar(false)} className={({ isActive }) => `workspace-overview ${isActive ? 'is-active' : ''}`}><LayoutDashboard size={18} aria-hidden="true" />Overview</NavLink>}
        {groups.map((group) => <MenuGroup key={group.label} {...group} close={() => setSidebar(false)} />)}
      </nav>
      <Link to="/employee" onClick={() => setSidebar(false)} className="workspace-user"><span className="workspace-avatar">{user.avatar_url ? <img src={user.avatar_url} alt="" /> : initials}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-900">{user.display_name}</span><span className="mt-1 block text-[11px] text-slate-500">{user.role_name || user.role}</span></span></Link>
  </>;
  return <div className="workspace flex h-dvh overflow-hidden bg-canvas font-sans text-ink">
    <a href="#workspace-content" className="workspace-skip-link">Skip to content</a>
    <aside aria-label="Workspace navigation" className="workspace-sidebar hidden lg:flex">{navigation}</aside>
    <Dialog.Root open={sidebar} onOpenChange={setSidebar}>
      <Dialog.Portal>
        <Dialog.Overlay className="workspace-drawer-overlay" />
        <Dialog.Content aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); menuButton.current?.focus(); }} className="workspace-sidebar workspace-drawer">
          <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
          <Dialog.Close aria-label="Close navigation" className="workspace-drawer-close"><X size={18} /></Dialog.Close>
          {navigation}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:px-7">
        <div className="flex items-center gap-3"><button ref={menuButton} aria-label="Open navigation" aria-expanded={sidebar} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setSidebar(true)}><Menu size={20} /></button><AdminBreadcrumbs /></div>
        <div className="flex items-center gap-3">
          <PageFinder items={[...(user.role_name !== 'Employee' ? [{ label: 'Overview', to: '/admin' }] : []), ...groups.flatMap((group) => group.items)]} />
          <button title="Change password" aria-label="Change password" onClick={() => setPasswordOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><KeyRound size={17} /></button>
          <Link to="/employee" className="hidden text-xs font-semibold sm:block">{user.display_name}</Link>
          <button onClick={signOut} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50"><LogOut size={15} />Sign out</button>
        </div>
      </header>
      {error && <div role="alert" className="bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <main id="workspace-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
    {passwordOpen && <Modal title="Change password" subtitle="Changing your password signs out all sessions." size="sm" onClose={closePassword} pending={busy}>
      <form onSubmit={changePassword} className="space-y-5">
        {passwordError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{passwordError}</p>}
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <Field label="Current password"><input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></Field>
          <Field label="New password" hint="Use 12–128 characters."><input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></Field>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4"><Button type="button" variant="outline" disabled={busy} onClick={closePassword}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button></div>
      </form>
    </Modal>}
  </div>;
}
