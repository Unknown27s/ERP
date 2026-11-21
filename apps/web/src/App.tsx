import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './hooks/auth';
import { BrandingProvider } from './hooks/branding';
import { ToastProvider } from './components/ui/Toast';
import WorkspaceShell from './components/WorkspaceShell';
import Login from './pages/Login';
import Dashboard from './pages/admin/Dashboard';
import Staff from './pages/admin/Staff';
import Customers from './pages/admin/Customers';
import Leads from './pages/admin/crm/Leads';
import SupportCases from './pages/admin/crm/SupportCases';
import Settings from './pages/admin/Settings';
import AuditLogs from './pages/admin/AuditLogs';
import Reports from './pages/admin/Reports';
import HREmployees from './pages/admin/hr/Employees';
import HRAttendance from './pages/admin/hr/Attendance';
import HRLeaves from './pages/admin/hr/Leaves';
import HRPayroll from './pages/admin/hr/Payroll';
import EmployeePortal from './pages/employee/EmployeePortal';
import Inventory from './pages/admin/Inventory';
import Sales from './pages/admin/Sales';
import Finance from './pages/admin/Finance';
import Email from './pages/admin/Email';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
function Guard({ permissions, children }: { permissions?: string[]; children: React.ReactNode }) {
  const { can } = useAuth();
  if (permissions && !permissions.some(can)) return <div className="p-8"><h1 className="text-xl font-bold">Access restricted</h1><p className="my-3">Your role cannot open this screen.</p><Link to="/employee">Go to my workspace</Link></div>;
  return <>{children}</>;
}
function Screen({ permissions, children }: { permissions?: string[]; children: React.ReactNode }) {
  return <WorkspaceShell><Guard permissions={permissions}>{children}</Guard></WorkspaceShell>;
}
function Home() {
  const { user } = useAuth();
  return user?.role_name === 'Employee' ? <Navigate to="/employee" replace /> : <Dashboard />;
}
export default function App() {
  return <QueryClientProvider client={qc}><ToastProvider><BrandingProvider><AuthProvider><BrowserRouter><Routes>
    <Route path="/" element={<Navigate to="/admin" replace />} />
    <Route path="/login" element={<Login />} />
    <Route path="/admin" element={<Screen><Home /></Screen>} />
    <Route path="/employee/profile" element={<Navigate to="/employee" replace />} />
    {['profile', 'tasks', 'leaves', 'payslips', 'reports'].map((tab) => <Route key={tab} path={tab === 'profile' ? '/employee' : `/employee/${tab}`} element={<Screen><EmployeePortal initialTab={tab} /></Screen>} />)}
    {(['users', 'roles', 'departments', 'designations'] as const).map((tab) => <Route key={tab} path={tab === 'users' ? '/admin/staff' : `/admin/staff/${tab}`} element={<Screen permissions={['staff.view']}><Staff tab={tab} /></Screen>} />)}
    <Route path="/admin/crm" element={<Navigate to="/admin/crm/leads" replace />} />
    <Route path="/admin/crm/leads" element={<Screen permissions={['crm.view']}><Leads /></Screen>} />
    <Route path="/admin/crm/support-cases" element={<Screen permissions={['crm.view']}><SupportCases /></Screen>} />
    <Route path="/admin/customers" element={<Screen permissions={['crm.view']}><Customers mode="view" /></Screen>} />
    <Route path="/admin/customers/new" element={<Screen permissions={['crm.manage']}><Customers mode="new" /></Screen>} />
    <Route path="/admin/hr" element={<Navigate to="/admin/hr/employees" replace />} />
    <Route path="/admin/hr/employees" element={<Screen permissions={['hr.view']}><HREmployees /></Screen>} />
    <Route path="/admin/hr/attendance" element={<Screen permissions={['hr.view']}><HRAttendance /></Screen>} />
    <Route path="/admin/hr/leaves" element={<Screen permissions={['hr.view', 'leave.approve', 'leave.manage']}><HRLeaves /></Screen>} />
    <Route path="/admin/hr/payroll" element={<Screen permissions={['payroll.view']}><HRPayroll /></Screen>} />
    <Route path="/admin/sales" element={<Screen permissions={['crm.view', 'finance.view']}><Sales /></Screen>} />
    <Route path="/admin/inventory" element={<Screen permissions={['inventory.view']}><Inventory /></Screen>} />
    <Route path="/admin/finance" element={<Screen permissions={['finance.view']}><Finance /></Screen>} />
    <Route path="/admin/reports" element={<Screen permissions={['reports.view']}><Reports /></Screen>} />
    <Route path="/admin/settings" element={<Screen permissions={['company.manage']}><Settings /></Screen>} />
    <Route path="/admin/audit" element={<Screen permissions={['audit.view']}><AuditLogs /></Screen>} />
    <Route path="/admin/email" element={<Screen permissions={['company.manage']}><Email /></Screen>} />
    <Route path="*" element={<Screen><div className="p-8"><h1 className="text-xl font-bold">Page not found</h1><Link to="/admin">Return to workspace</Link></div></Screen>} />
  </Routes></BrowserRouter></AuthProvider></BrandingProvider></ToastProvider></QueryClientProvider>;
}
