/**
 * ==============================================================================
 * DESIGN SPECIFICATION: Staff Management & RBAC Administration (Staff.tsx)
 * ==============================================================================
 * Sub-modules:
 * 1. Users (/admin/staff):
 *    - Directory of organization logins with assigned role, status, and last activity.
 *    - Actions: Add user, edit details, reset password (returns temp credentials),
 *      and view user activity log.
 * 2. Roles & Permissions (/admin/staff/roles):
 *    - Role selector with system role badges.
 *    - Interactive permission matrix utilizing modern Radix Switch toggles,
 *      grouped by functional module.
 * 3. Departments (/admin/staff/departments):
 *    - Cost centres and organizational units with active employee counts.
 * 4. Designations (/admin/staff/designations):
 *    - Job titles and pay grades with active counts and status toggles.
 * ==============================================================================
 */

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/auth';
import {
  Users,
  ShieldCheck,
  Building2,
  Briefcase,
  Plus,
  KeyRound,
  History,
  CheckCircle2,
  AlertCircle,
  Search,
  Check,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Switch } from '../../components/ui/Switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../components/ui/Dialog';

type Tab = 'users' | 'roles' | 'departments' | 'designations';

type UserRow = {
  user_id: string;
  display_name: string;
  email: string;
  phone: string | null;
  role: string;
  role_id: string | null;
  role_name: string | null;
  active: number;
  is_primary: number;
  last_login_at: string | null;
};

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: number;
  active: number;
  user_count: number;
  permissions: string[];
};

type Permission = { key: string; module: string; label: string };
type OrgRow = { id: string; name: string; grade?: string | null; active: number; employee_count: number };

const TABS: { key: Tab; to: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'users', to: '/admin/staff', label: 'Users & Accounts', icon: Users },
  { key: 'roles', to: '/admin/staff/roles', label: 'Roles & Permissions', icon: ShieldCheck },
  { key: 'departments', to: '/admin/staff/departments', label: 'Departments', icon: Building2 },
  { key: 'designations', to: '/admin/staff/designations', label: 'Designations', icon: Briefcase },
];

export default function Staff({ tab }: { tab: Tab }) {
  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ── Top Header & Tab Navigation ──────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Identity &amp; Access Governance</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Staff Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage company users, granular permissions, departments, and job titles.
          </p>
        </div>
      </div>

      {/* Pill Tab Bar */}
      <nav className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-xl w-fit" aria-label="Staff navigation">
        {TABS.map((t) => {
          const IconComp = t.icon;
          return (
            <NavLink
              key={t.key}
              to={t.to}
              end={t.key === 'users'}
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

      {/* Tab Panels */}
      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'departments' && <OrgTab kind="departments" />}
      {tab === 'designations' && <OrgTab kind="designations" />}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   1. USERS TAB: Directory, Credential Resets, Status Toggles
   ────────────────────────────────────────────────────────────────────────────── */

function UsersTab() {
  const { can } = useAuth();
  const users = useQuery({ queryKey: ['staff-users'], queryFn: () => api.get('/staff/users') });
  const roles = useQuery({ queryKey: ['staff-roles'], queryFn: () => api.get('/staff/roles') });

  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [tempPw, setTempPw] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [activity, setActivity] = useState<{ who: string; rows: any[] } | null>(null);

  const rows: UserRow[] = users.data?.data || [];
  const roleRows: RoleRow[] = roles.data?.data || [];
  const manage = can('staff.manage');

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter(
      (u) =>
        u.display_name.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        (u.role_name || u.role).toLowerCase().includes(s)
    );
  }, [rows, search]);

  const resetPw = async (u: UserRow) => {
    setMsg(null);
    setTempPw('');
    try {
      const res = await api.post(`/staff/users/${u.user_id}/reset-password`, {});
      setMsg({ text: `Password reset successfully for ${u.display_name}.` });
      setTempPw(`${res.data.email}: ${res.data.temporaryPassword}`);
    } catch (e: any) {
      setMsg({ text: e.message || 'Password reset failed.', error: true });
    }
  };

  const toggleActive = async (u: UserRow) => {
    if (u.is_primary) {
      setMsg({ text: 'The primary system administrator cannot be deactivated.', error: true });
      return;
    }
    setMsg(null);
    try {
      await api.patch(`/staff/users/${u.user_id}`, { active: u.active ? 0 : 1 });
      setMsg({ text: `User ${u.display_name} has been ${u.active ? 'deactivated' : 'activated'}.` });
      users.refetch();
    } catch (e: any) {
      setMsg({ text: e.message || 'Status update failed.', error: true });
    }
  };

  const showActivity = async (u: UserRow) => {
    try {
      const res = await api.get(`/audit-logs?actor_id=${u.user_id}&limit=12`);
      setActivity({ who: u.display_name, rows: res.data || [] });
    } catch (e: any) {
      setMsg({ text: 'Could not load activity log.', error: true });
    }
  };

  return (
    <div className="space-y-4">
      {/* Alert Messages */}
      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            msg.error
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            <span>{msg.text}</span>
          </div>
          {tempPw && (
            <span className="font-mono bg-white px-2.5 py-1 rounded border border-emerald-300 text-slate-800 font-bold select-all">
              {tempPw}
            </span>
          )}
        </div>
      )}

      {/* Action Bar & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative max-w-sm w-full">
          <Input
            placeholder="Search users by name, email, or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            icon={<Search className="w-4 h-4" />}
          />
        </div>

        {manage && (
          <Button onClick={() => setAddOpen(true)} className="shrink-0 gap-1.5">
            <Plus className="w-4 h-4" />
            <span>Add User</span>
          </Button>
        )}
      </div>

      {/* Users Data Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Phone</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Login</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.isLoading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading users…
                  </td>
                </tr>
              )}
              {!users.isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No users matching criteria.
                  </td>
                </tr>
              )}
              {filtered.map((u) => {
                const initials = u.display_name
                  .split(' ')
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase() ?? '')
                  .join('');
                return (
                  <tr key={u.user_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-bold text-xs shrink-0">
                          {initials}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{u.display_name}</div>
                          <div className="text-[11px] text-slate-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={u.role_name === 'Administrator' ? 'default' : 'secondary'}>
                        {u.role_name || u.role}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-slate-500">{u.phone || '—'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={Boolean(u.active)}
                          disabled={!manage || Boolean(u.is_primary)}
                          onCheckedChange={() => toggleActive(u)}
                        />
                        <span className={`text-[11px] font-medium ${u.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {u.active ? 'Active' : 'Deactivated'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {u.last_login_at ? u.last_login_at.slice(0, 16).replace('T', ' ') : 'Never'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => showActivity(u)}
                          title="View activity log"
                          className="h-7 px-2 text-[11px]"
                        >
                          <History className="w-3.5 h-3.5 text-slate-500" />
                        </Button>
                        {manage && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => resetPw(u)}
                              title="Reset password"
                              className="h-7 px-2 text-[11px] gap-1"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                              <span>Reset</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditing(u)}
                              className="h-7 px-2 text-[11px]"
                            >
                              Edit
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add / Edit User Dialog */}
      {(addOpen || editing) && (
        <UserFormDialog
          user={editing || undefined}
          roles={roleRows}
          onClose={() => {
            setAddOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAddOpen(false);
            setEditing(null);
            users.refetch();
            setMsg({ text: `User ${editing ? 'updated' : 'created'} successfully.` });
          }}
          onError={(m) => setMsg({ text: m, error: true })}
        />
      )}

      {/* Activity Log Dialog */}
      {activity && (
        <Dialog open={true} onOpenChange={() => setActivity(null)}>
          <DialogContent size="lg">
            <DialogHeader>
              <DialogTitle>Activity Audit: {activity.who}</DialogTitle>
              <DialogDescription>Recent recorded events logged for this user.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {activity.rows.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No recent activity found.</p>
              ) : (
                activity.rows.map((a: any) => (
                  <div key={a.id} className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/50 text-xs flex justify-between">
                    <div>
                      <span className="font-semibold text-slate-800">{a.action}</span> on {a.entity_type}
                      <p className="text-slate-500 text-[11px] mt-0.5">{a.summary}</p>
                    </div>
                    <span className="text-[10px] text-slate-400">{a.created_at?.slice(0, 16).replace('T', ' ')}</span>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActivity(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function UserFormDialog({
  user,
  roles,
  onClose,
  onSaved,
  onError,
}: {
  user?: UserRow;
  roles: RoleRow[];
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const editing = Boolean(user);
  const [name, setName] = useState(user?.display_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [roleId, setRoleId] = useState(user?.role_id || roles.find((r) => r.name === 'Employee')?.id || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await api.patch(`/staff/users/${user!.user_id}`, { name, phone, role_id: roleId });
      } else {
        await api.post('/staff/users', { name, email, phone, role_id: roleId, password });
      }
      onSaved();
    } catch (e: any) {
      onError(e.message || 'Could not save the user');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit User Credentials' : 'Add New Organization User'}</DialogTitle>
          <DialogDescription>
            The assigned role determines permissions enforced server-side.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Full Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Rahul Sharma" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Login Email</label>
            <Input
              type="email"
              value={email}
              disabled={editing}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="rahul@company.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Phone (Optional)</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Assigned Role</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {!editing && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Initial Password</label>
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="At least 8 characters"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || (!editing && !email.trim())}>
              {busy ? 'Saving…' : editing ? 'Update User' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   2. ROLES TAB: Role Definitions & Interactive Permission Matrix
   ────────────────────────────────────────────────────────────────────────────── */

function RolesTab() {
  const { can } = useAuth();
  const roles = useQuery({ queryKey: ['staff-roles'], queryFn: () => api.get('/staff/roles') });
  const perms = useQuery({ queryKey: ['permissions'], queryFn: () => api.get('/staff/permissions') });

  const roleRows: RoleRow[] = roles.data?.data || [];
  const permissionRows: Permission[] = perms.data?.data || [];

  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const manage = can('roles.manage');

  const selected = useMemo(
    () =>
      roleRows.find((r) => r.id === selectedId) ||
      roleRows.find((r) => r.name !== 'Administrator') ||
      roleRows[0] ||
      null,
    [roleRows, selectedId]
  );

  const currentDraft = useMemo(
    () => draft ?? new Set<string>(selected?.permissions || []),
    [draft, selected]
  );

  const readOnly = !manage || selected?.name === 'Administrator';
  const dirty = Boolean(
    draft &&
      selected &&
      [...draft].sort().join('|') !== [...(selected.permissions || [])].sort().join('|')
  );

  const modules = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissionRows) {
      if (!map.has(p.module)) map.set(p.module, []);
      map.get(p.module)!.push(p);
    }
    return [...map.entries()];
  }, [permissionRows]);

  const toggle = (key: string) => {
    if (readOnly) return;
    setDraft(() => {
      const base = new Set(draft ?? selected?.permissions ?? []);
      base.has(key) ? base.delete(key) : base.add(key);
      return base;
    });
  };

  const save = async () => {
    if (!selected) return;
    setMsg(null);
    try {
      await api.put(`/staff/roles/${selected.id}/permissions`, { permissions: [...currentDraft] });
      setMsg({ text: `Saved ${currentDraft.size} permission(s) for ${selected.name}.` });
      setDraft(null);
      roles.refetch();
    } catch (e: any) {
      setMsg({ text: e.message || 'Permission update failed.', error: true });
    }
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            msg.error
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          {msg.error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: Role List Selection Cards */}
        <Card className="space-y-4">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">Configured Roles</CardTitle>
                <CardDescription>Select a role to inspect or update permissions.</CardDescription>
              </div>
              {manage && (
                <Button size="sm" onClick={() => setNewOpen(true)} className="h-7 px-2 text-xs gap-1">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Role</span>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-1">
            {roleRows.map((r) => {
              const active = selected?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(r.id);
                    setDraft(null);
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between ${
                    active
                      ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500'
                      : 'border-slate-200/80 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-xs text-slate-900 flex items-center gap-2">
                      <span>{r.name}</span>
                      {Boolean(r.is_system) && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-medium">
                          System
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[200px]">
                      {r.description || 'No description provided.'}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {r.user_count} {r.user_count === 1 ? 'user' : 'users'}
                  </Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Right: Permission Matrix with Radix Switches */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base font-bold text-slate-900">
                    {selected ? selected.name : 'Role'} Permissions
                  </CardTitle>
                  {selected?.name === 'Administrator' && (
                    <Badge variant="default" className="text-[10px]">
                      Full Superuser (*)
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {readOnly
                    ? 'Administrator has all system privileges by default.'
                    : 'Toggle individual module capabilities for this role.'}
                </CardDescription>
              </div>

              {dirty && (
                <Button size="sm" onClick={save} className="gap-1.5 shadow-sm">
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Changes</span>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            {modules.map(([modName, pList]) => (
              <div key={modName} className="space-y-2.5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {modName}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {pList.map((p) => {
                    const granted = selected?.name === 'Administrator' || currentDraft.has(p.key);
                    return (
                      <div
                        key={p.key}
                        onClick={() => toggle(p.key)}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer select-none ${
                          granted
                            ? 'border-brand-300 bg-brand-50/30'
                            : 'border-slate-200/80 bg-white hover:bg-slate-50'
                        } ${readOnly ? 'cursor-default opacity-85' : ''}`}
                      >
                        <div className="pr-3">
                          <div className="font-semibold text-xs text-slate-800">{p.label}</div>
                          <div className="font-mono text-[10px] text-slate-400 mt-0.5">{p.key}</div>
                        </div>
                        <Switch
                          checked={granted}
                          disabled={readOnly}
                          onCheckedChange={() => toggle(p.key)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {newOpen && (
        <NewRoleDialog
          onClose={() => setNewOpen(false)}
          onSaved={() => {
            setNewOpen(false);
            roles.refetch();
          }}
          onError={(m) => setMsg({ text: m, error: true })}
        />
      )}
    </div>
  );
}

function NewRoleDialog({
  onClose,
  onSaved,
  onError,
}: {
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/staff/roles', { name, description });
      onSaved();
    } catch (e: any) {
      onError(e.message || 'Could not create the role');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Define New Role</DialogTitle>
          <DialogDescription>
            Roles start with no permissions granted. You can toggle capabilities right after creation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Role Title</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Inventory Manager"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Role Purpose / Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Responsibilities assigned to this role"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create Role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────────────────────────────────────────────────────────────────
   3. ORG TAB: Departments & Designations with Radix Switches
   ────────────────────────────────────────────────────────────────────────────── */

function OrgTab({ kind }: { kind: 'departments' | 'designations' }) {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['staff', kind], queryFn: () => api.get(`/staff/${kind}`) });
  const rows: OrgRow[] = q.data?.data || [];

  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OrgRow | null>(null);
  const manage = can('staff.manage');
  const noun = kind === 'departments' ? 'Department' : 'Designation';

  const toggleActive = async (r: OrgRow) => {
    setMsg(null);
    try {
      await api.patch(`/staff/${kind}/${r.id}`, { active: r.active ? 0 : 1 });
      setMsg({ text: `${noun} ${r.name} ${r.active ? 'deactivated' : 'activated'}.` });
      q.refetch();
    } catch (e: any) {
      setMsg({ text: e.message || 'Status update failed.', error: true });
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
            msg.error
              ? 'bg-rose-50 border-rose-200 text-rose-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          {msg.error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-slate-500">
            {rows.filter((r) => r.active).length} Active / {rows.length} Total Registered
          </span>
        </div>
        {manage && (
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            <span>Add {noun}</span>
          </Button>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="py-3 px-4">Name</th>
                {kind === 'designations' && <th className="py-3 px-4">Pay Grade</th>}
                <th className="py-3 px-4">Active Staff</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.isLoading && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Loading {kind}…
                  </td>
                </tr>
              )}
              {!q.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No {kind} registered yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-semibold text-slate-900">{r.name}</td>
                  {kind === 'designations' && (
                    <td className="py-3 px-4 text-slate-500">{r.grade || '—'}</td>
                  )}
                  <td className="py-3 px-4">
                    <Badge variant="outline" className="text-[10px]">
                      {r.employee_count} {r.employee_count === 1 ? 'member' : 'members'}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={Boolean(r.active)}
                        disabled={!manage}
                        onCheckedChange={() => toggleActive(r)}
                      />
                      <span className={`text-[11px] font-medium ${r.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                        {r.active ? 'Active' : 'Deactivated'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {manage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(r)}
                        className="h-7 px-2.5 text-[11px]"
                      >
                        Edit
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {(open || editing) && (
        <OrgFormDialog
          kind={kind}
          row={editing || undefined}
          onClose={() => {
            setOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setOpen(false);
            setEditing(null);
            q.refetch();
            setMsg({ text: `${noun} saved successfully.` });
          }}
          onError={(m) => setMsg({ text: m, error: true })}
        />
      )}
    </div>
  );
}

function OrgFormDialog({
  kind,
  row,
  onClose,
  onSaved,
  onError,
}: {
  kind: 'departments' | 'designations';
  row?: OrgRow;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState(row?.name || '');
  const [grade, setGrade] = useState(row?.grade || '');
  const [busy, setBusy] = useState(false);
  const noun = kind === 'departments' ? 'Department' : 'Designation';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body: any = { name };
      if (kind === 'designations') body.grade = grade;
      if (row) await api.patch(`/staff/${kind}/${row.id}`, body);
      else await api.post(`/staff/${kind}`, body);
      onSaved();
    } catch (e: any) {
      onError(e.message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{row ? `Edit ${noun}` : `Add New ${noun}`}</DialogTitle>
          <DialogDescription>
            {kind === 'departments'
              ? 'Departments serve as reporting lines and cost centers.'
              : 'Designations define job roles and compensation grades.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4 pt-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">{noun} Title</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={`e.g. ${kind === 'departments' ? 'Engineering' : 'Lead Architect'}`} />
          </div>
          {kind === 'designations' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Salary Grade / Level (Optional)</label>
              <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. L4, M2" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
