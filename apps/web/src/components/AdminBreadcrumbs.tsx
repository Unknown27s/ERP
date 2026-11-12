/**
 * ==============================================================================
 * DESIGN COMPONENT: Modern Admin Breadcrumbs (AdminBreadcrumbs.tsx)
 * ==============================================================================
 * - Provides immediate contextual navigation trail across all sub-modules.
 * - Uses Lucide Home icon for workspace root and ChevronRight dividers.
 * - Smooth color transitions on hover (text-slate-500 -> text-brand-600).
 * ==============================================================================
 */

import { Link, useLocation } from 'react-router-dom';
import { Home, ChevronRight } from 'lucide-react';

interface Crumb {
  label: string;
  to?: string;
}

const SIMPLE: Record<string, string> = {
  '/admin': 'Overview',
  '/admin/customers': 'Customers',
  '/admin/customers/new': 'New Customer',
  '/admin/inventory': 'Inventory & Stock',
  '/admin/finance': 'Finance & Accounting',
  '/admin/reports': 'Reports',
  '/admin/settings': 'Company Settings',
  '/admin/email': 'Email Settings',
  '/admin/audit': 'Audit Trail',
  '/admin/staff': 'Users',
  '/admin/staff/roles': 'Roles & Permissions',
  '/admin/staff/departments': 'Departments',
  '/admin/staff/designations': 'Designations',
  '/admin/hr/employees': 'Employees',
  '/admin/hr/attendance': 'Attendance',
  '/admin/hr/leaves': 'Leave & Holidays',
  '/admin/hr/payroll': 'Payroll',
};

export default function AdminBreadcrumbs() {
  const loc = useLocation();
  const path = loc.pathname;
  const crumbs: Crumb[] = [{ label: 'Workspace', to: '/admin' }];

  if (path.startsWith('/admin/staff')) {
    crumbs.push({ label: 'Staff Management', to: '/admin/staff' });
    if (path !== '/admin/staff') crumbs.push({ label: SIMPLE[path] || 'Staff' });
  } else if (path.startsWith('/admin/hr')) {
    crumbs.push({ label: 'HR', to: '/admin/hr/employees' });
    const label = SIMPLE[path];
    if (label) crumbs.push({ label });
  } else if (SIMPLE[path]) {
    crumbs.push({ label: SIMPLE[path] });
  } else {
    const segments = path.replace(/^\/admin\/?/, '').split('/').filter(Boolean);
    segments.forEach((seg, i) => {
      const isLast = i === segments.length - 1;
      crumbs.push({
        label: seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' '),
        to: isLast ? undefined : `/admin/${segments.slice(0, i + 1).join('/')}`,
      });
    });
  }

  return (
    <nav aria-label="Breadcrumbs" className="flex items-center gap-1 text-xs font-medium text-slate-500">
      <Link to="/admin" className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
        <Home className="w-3.5 h-3.5" />
      </Link>
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <div key={idx} className="flex items-center gap-1">
            <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
            {isLast || !crumb.to ? (
              <span className="font-semibold text-slate-800">{crumb.label}</span>
            ) : (
              <Link
                to={crumb.to}
                className="hover:text-brand-600 transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
