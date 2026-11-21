/**
 * ==============================================================================
 * DESIGN COMPONENT: Planned Module Screen (ModulePlaceholder.tsx)
 * ==============================================================================
 * Displayed for future operational modules scheduled in the product roadmap.
 * Presents planned capabilities cleanly without developer notes.
 * ==============================================================================
 */

import React from 'react';
import { CheckCircle2, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

const MODULE_DATA: Record<string, { purpose: string; bullets: string[] }> = {
  'Inventory': {
    purpose: 'Centralized catalog, multi-warehouse stock tracking, and supplier procurement.',
    bullets: [
      'Item and supplier master records with reorder thresholds',
      'Purchase requests, purchase orders, and goods receipt notes (GRN)',
      'Automated stock valuation (FIFO / Weighted Average)',
      'Low-stock notifications and physical inventory reconciliation',
    ],
  },
  'Finance & Accounting': {
    purpose: 'Complete double-entry accounting, GST invoicing, tax ledgers, and financial statements.',
    bullets: [
      'Standard Chart of Accounts (COA) and general journal entries',
      'Sales and purchase GST tax invoices, debit and credit notes',
      'Payment receipts, expense tracking, and bank reconciliation',
      'Real-time Trial Balance, Profit & Loss (P&L), and Balance Sheet reports',
    ],
  },
  'Reports': {
    purpose: 'Consolidated executive reports with scheduled delivery and data exports.',
    bullets: [
      'Cross-departmental management dashboards and trends',
      'One-click Excel and PDF exports across all operational registers',
      'Scheduled recurring summary reports delivered via email',
    ],
  },
  'Email settings': {
    purpose: 'Manage outbound SMTP mail gateways for automated alerts and notifications.',
    bullets: [
      'Secure SMTP server credentials and sender profiles',
      'Automated email notifications for leave approvals and low-stock alerts',
      'Delivery audit logs and automated retry queues',
    ],
  },
};

export default function ModulePlaceholder({ module, phase }: { module: string; phase?: string }) {
  const info = MODULE_DATA[module] || {
    purpose: 'This module is scheduled on the operational roadmap.',
    bullets: [],
  };

  return (
    <div className="p-6 lg:p-12 max-w-4xl mx-auto space-y-6">
      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="space-y-3 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Planned module{phase ? ` · ${phase}` : ''}</span>
            </Badge>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-slate-900">{module}</CardTitle>
            <CardDescription className="text-sm text-slate-500 mt-1">{info.purpose}</CardDescription>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              This module is on the roadmap and is not enabled in this demo. The working demo covers
              Dashboard, Self-Service, Staff, HR, CRM, Customers, Sales, Reports and Audit.
            </p>
          </div>
        </CardHeader>

        <CardContent className="pt-6 space-y-6">
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Planned Core Capabilities
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {info.bullets.map((bullet, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50"
                >
                  <CheckCircle2 className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" />
                  <span className="text-xs text-slate-700 leading-relaxed">{bullet}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
