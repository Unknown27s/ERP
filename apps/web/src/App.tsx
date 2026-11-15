/**
 * ==============================================================================
 * DESIGN SPECIFICATION: Application Shell & Root Navigation (App.tsx)
 * ==============================================================================
 * Architecture:
 * - Persistent Single-Page App Shell with dynamic RBAC-driven navigation.
 * - Sidebar: Fixed/responsive dark sidebar (#0B0F19) displaying the company logo,
 *   product title, role-partitioned module links with Lucide icons, and user footer.
 * - Topbar: Sticky glassmorphic bar (#FFFFFF / 80% opacity with backdrop blur),
 *   interactive breadcrumb trail, quick search trigger (⌘K), active role badge,
 *   and avatar.
 * - Content Area: Flexible container (bg-slate-50/60) with smooth scroll behavior.
 * ==============================================================================
 */

import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth, can } from './hooks/auth';
import { BrandingProvider, useBranding } from './hooks/branding';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import Staff from './pages/admin/Staff';
import Customers from './pages/admin/Customers';
import Settings from './pages/admin/Settings';
import AuditLogs from './pages/admin/AuditLogs';
import ModulePlaceholder from './pages/admin/ModulePlaceholder';
import HREmployees from './pages/admin/hr/Employees';
import HRAttendance from './pages/admin/hr/Attendance';
import HRLeaves from './pages/admin/hr/Leaves';
import HRPayroll from './pages/admin/hr/Payroll';
import AdminBreadcrumbs from './components/AdminBreadcrumbs';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Building2,
  Briefcase,
  UserCheck,
  CalendarClock,
  CalendarRange,
  Banknote,
  UsersRound,
  Boxes,
  Wallet,
  BarChart3,
  Settings as SettingsIcon,
  History,
  Menu,
  X,
  LogOut,
  Search,
} from 'lucide-react';

const qc = new QueryClient();

/* ── 1. Access Control & Permission Guards ──────────────────────────────────── */

/** Displayed when a user navigates to a screen forbidden by their role permissions */
function Denied() {
  return (
    <div className="p-8 max-w-2xl mx-auto mt-12">
      <div className="p-8 rounded-2xl bg-white border border-slate-200/80 shadow-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Your account does not currently hold the permission required to access this screen.
          Contact your administrator to adjust your role in <strong>Staff Management → Roles &amp; permissions</strong>.
        </p>
        <Link
          to="/admin"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition-colors shadow-sm"
        >
          Return to Overview
        </Link>
      </div>
    </div>
  );
}

/** Route wrapper that checks active user permissions before mounting the screen */
function Guard({ permission, children }: { permission?: string; children: React.ReactNode }) {
  const { user } = useAuth();
  if (permission && !can(user, permission)) return <Denied />;
  return <>{children}</>;
}

/* ── 2. Enterprise Admin Shell Layout ───────────────────────────────────────── */

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, can: canDo } = useAuth();
  const { brand } = useBranding();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Loading skeleton while session credentials resolve
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium text-slate-500">Loading workspace…</span>
        </div>
      </div>
    );
  }

  // Redirect unauthenticated visitors to login
  if (!user) return <Navigate to="/login" replace />;

  const productName = brand.product_name || brand.company_name || 'MarvelSoftware';
  const closeSidebar = () => setSidebarOpen(false);

  // Generate 2-letter uppercase initials for profile avatars
  const initials =
    user.display_name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || 'U';

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans text-slate-900">
      {/* 2.1 Mobile Overlay Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* 2.2 Modern Dark Sidebar (Width: 256px / w-64, Background: #0B0F19) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0B0F19] text-slate-300 flex flex-col border-r border-slate-800/80 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <Link to="/admin" onClick={closeSidebar} className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-white p-1 shadow-md shadow-black/30 flex items-center justify-center shrink-0">
              <img src="/logo.avif" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-white tracking-tight truncate">{productName}</div>
              <div className="text-[10px] uppercase font-semibold text-brand-400 tracking-wider">Enterprise Suite</div>
            </div>
          </Link>
          <button
            type="button"
            className="lg:hidden text-slate-400 hover:text-white p-1.5"
            onClick={closeSidebar}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2.3 Scrollable Categorized Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 text-xs">
          {/* Section: Overview */}
          <div className="space-y-1">
            <NavLink
              to="/admin"
              end
              onClick={closeSidebar}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`
              }
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span>Overview</span>
            </NavLink>
          </div>

          {/* Section: Staff & Permissions */}
          {canDo('staff.view') && (
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Staff &amp; Access
              </div>
              <NavLink
                to="/admin/staff"
                end
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>Users</span>
              </NavLink>
              <NavLink
                to="/admin/staff/roles"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Roles &amp; Permissions</span>
              </NavLink>
              <NavLink
                to="/admin/staff/departments"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <Building2 className="w-4 h-4 shrink-0" />
                <span>Departments</span>
              </NavLink>
              <NavLink
                to="/admin/staff/designations"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <Briefcase className="w-4 h-4 shrink-0" />
                <span>Designations</span>
              </NavLink>
            </div>
          )}

          {/* Section: Human Resources & Payroll */}
          {(canDo('hr.view') || canDo('leave.view') || canDo('payroll.view')) && (
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Human Resources
              </div>
              {canDo('hr.view') && (
                <>
                  <NavLink
                    to="/admin/hr/employees"
                    onClick={closeSidebar}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                      }`
                    }
                  >
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span>Employees</span>
                  </NavLink>
                  <NavLink
                    to="/admin/hr/attendance"
                    onClick={closeSidebar}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                      }`
                    }
                  >
                    <CalendarClock className="w-4 h-4 shrink-0" />
                    <span>Attendance</span>
                  </NavLink>
                </>
              )}
              {canDo('leave.view') && (
                <NavLink
                  to="/admin/hr/leaves"
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`
                  }
                >
                  <CalendarRange className="w-4 h-4 shrink-0" />
                  <span>Leaves &amp; Holidays</span>
                </NavLink>
              )}
              {canDo('payroll.view') && (
                <NavLink
                  to="/admin/hr/payroll"
                  onClick={closeSidebar}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                    }`
                  }
                >
                  <Banknote className="w-4 h-4 shrink-0" />
                  <span>Payroll</span>
                </NavLink>
              )}
            </div>
          )}

          {/* Section: CRM & Customers */}
          {canDo('crm.view') && (
            <div className="space-y-1">
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                CRM &amp; Sales
              </div>
              <NavLink
                to="/admin/customers"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <UsersRound className="w-4 h-4 shrink-0" />
                <span>Customers</span>
              </NavLink>
            </div>
          )}

          {/* Section: Enterprise Operations (Next Phases) */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Operations
            </div>
            {canDo('inventory.view') && (
              <NavLink
                to="/admin/inventory"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <Boxes className="w-4 h-4 shrink-0" />
                <span>Inventory &amp; Stock</span>
              </NavLink>
            )}
            {canDo('finance.view') && (
              <NavLink
                to="/admin/finance"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <Wallet className="w-4 h-4 shrink-0" />
                <span>Finance &amp; Books</span>
              </NavLink>
            )}
            {canDo('reports.view') && (
              <NavLink
                to="/admin/reports"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span>Reports</span>
              </NavLink>
            )}
          </div>

          {/* Section: Settings & Auditing */}
          <div className="space-y-1">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Settings &amp; Audit
            </div>
            {canDo('company.manage') && (
              <NavLink
                to="/admin/settings"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <SettingsIcon className="w-4 h-4 shrink-0" />
                <span>Company Settings</span>
              </NavLink>
            )}
            {canDo('audit.view') && (
              <NavLink
                to="/admin/audit"
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`
                }
              >
                <History className="w-4 h-4 shrink-0" />
                <span>Audit Trail</span>
              </NavLink>
            )}
          </div>
        </div>

        {/* 2.4 User Profile & Sign Out Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <div className="w-9 h-9 rounded-lg bg-brand-600/20 text-brand-400 border border-brand-500/30 flex items-center justify-center font-bold text-xs shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">{user.display_name}</div>
              <div className="text-[11px] text-slate-400 truncate">{user.role_name || user.role}</div>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2.5 Main Viewport Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-14 border-b border-slate-200/80 bg-white/80 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <AdminBreadcrumbs />
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Search Shortcut Display */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100/80 border border-slate-200/80 text-xs text-slate-500">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span>Quick search…</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-mono text-slate-400">
                ⌘K
              </kbd>
            </div>

            {/* Current Active Role Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
              <span>{user.role_name || user.role}</span>
            </div>

            {/* User Initials Avatar */}
            <div
              className="w-8 h-8 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center shadow-sm"
              title={user.display_name}
            >
              {initials}
            </div>
          </div>
        </header>

        {/* Scrollable Viewport Child Pages */}
        <main className="flex-1 overflow-y-auto bg-slate-50/60">{children}</main>
      </div>
    </div>
  );
}

/* ── 3. Router Hierarchy Definition ─────────────────────────────────────────── */

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrandingProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Default Redirect to Dashboard */}
              <Route path="/" element={<Navigate to="/admin" replace />} />

              {/* Public Authentication Screen */}
              <Route path="/login" element={<Login />} />

              {/* Authenticated Workspace: Executive Dashboard */}
              <Route path="/admin" element={<AdminShell><Dashboard /></AdminShell>} />

              {/* Authenticated Workspace: Staff & Organizational Structure */}
              <Route path="/admin/staff" element={<AdminShell><Guard permission="staff.view"><Staff tab="users" /></Guard></AdminShell>} />
              <Route path="/admin/staff/roles" element={<AdminShell><Guard permission="staff.view"><Staff tab="roles" /></Guard></AdminShell>} />
              <Route path="/admin/staff/departments" element={<AdminShell><Guard permission="staff.view"><Staff tab="departments" /></Guard></AdminShell>} />
              <Route path="/admin/staff/designations" element={<AdminShell><Guard permission="staff.view"><Staff tab="designations" /></Guard></AdminShell>} />

              {/* Authenticated Workspace: CRM & Customers */}
              <Route path="/admin/customers" element={<AdminShell><Guard permission="crm.view"><Customers mode="view" /></Guard></AdminShell>} />
              <Route path="/admin/customers/new" element={<AdminShell><Guard permission="crm.manage"><Customers mode="new" /></Guard></AdminShell>} />

              {/* Authenticated Workspace: Human Resources & Payroll */}
              <Route path="/admin/hr" element={<Navigate to="/admin/hr/employees" replace />} />
              <Route path="/admin/hr/employees" element={<AdminShell><Guard permission="hr.view"><HREmployees /></Guard></AdminShell>} />
              <Route path="/admin/hr/attendance" element={<AdminShell><Guard permission="hr.view"><HRAttendance /></Guard></AdminShell>} />
              <Route path="/admin/hr/leaves" element={<AdminShell><Guard permission="leave.view"><HRLeaves /></Guard></AdminShell>} />
              <Route path="/admin/hr/payroll" element={<AdminShell><Guard permission="payroll.view"><HRPayroll /></Guard></AdminShell>} />

              {/* Authenticated Workspace: Operations Placeholders (Next Build Phases) */}
              <Route path="/admin/inventory" element={<AdminShell><Guard permission="inventory.view"><ModulePlaceholder module="Inventory" phase="Phase 4" /></Guard></AdminShell>} />
              <Route path="/admin/finance" element={<AdminShell><Guard permission="finance.view"><ModulePlaceholder module="Finance &amp; Accounting" phase="Phase 3" /></Guard></AdminShell>} />
              <Route path="/admin/reports" element={<AdminShell><Guard permission="reports.view"><ModulePlaceholder module="Reports" phase="Phase 7" /></Guard></AdminShell>} />

              {/* Authenticated Workspace: Administration & Auditing */}
              <Route path="/admin/settings" element={<AdminShell><Guard permission="company.manage"><Settings /></Guard></AdminShell>} />
              <Route path="/admin/audit" element={<AdminShell><Guard permission="audit.view"><AuditLogs /></Guard></AdminShell>} />
              <Route path="/admin/email" element={<AdminShell><Guard permission="company.manage"><ModulePlaceholder module="Email settings" phase="Phase 7" /></Guard></AdminShell>} />

              {/* Fallback 404 handler */}
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </BrandingProvider>
    </QueryClientProvider>
  );
}
