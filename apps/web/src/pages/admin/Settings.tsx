/**
 * ==============================================================================
 * SYSTEM · COMPANY SETTINGS (Settings.tsx)
 * ==============================================================================
 * One company record, shared by every module, edited as a single form.
 *
 * Behaviour worth knowing:
 * - Only the keys the user actually changed are PUT to the API, so the audit
 *   trail records the real delta instead of "everything was saved".
 * - The field list mirrors SETTING_DEFAULTS in server/src/routes/admin.js.
 *   A key that is not in that list is silently ignored by the API, so adding a
 *   field here requires adding it there too.
 * - Values are validated in the browser for fast feedback only. The server is
 *   still the enforcement point for the yes/no settings.
 * - Recent settings changes are read from the audit trail when the role holds
 *   audit.view. No separate history table is invented.
 * ==============================================================================
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  Check,
  CircleDollarSign,
  Clock3,
  History,
  Info,
  Mail,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { cn, relativeTime } from '../../lib/utils';
import PageHeader from '../../components/PageHeader';
import { useBranding } from '../../hooks/branding';
import { useAuth } from '../../hooks/auth';
import { Switch } from '../../components/ui/Switch';

/* ── Field schema (mirrors server/src/routes/admin.js SETTING_DEFAULTS) ────── */

type FieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'toggle' | 'number';

type FieldDef = {
  key: string;
  label: string;
  type?: FieldType;
  hint?: string;
  options?: string[];
  placeholder?: string;
  required?: boolean;
};

type Section = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  fields: FieldDef[];
};

const SECTIONS: Section[] = [
  {
    id: 'branding',
    title: 'Branding',
    description: 'These names appear on the sign-in screen, the sidebar and the browser title.',
    icon: Sparkles,
    fields: [
      {
        key: 'product_name',
        label: 'Product name',
        required: true,
        hint: 'Shown in the sidebar, sign-in screen and browser tab.',
        placeholder: 'MarvelSoftware',
      },
      {
        key: 'company_name',
        label: 'Company display name',
        required: true,
        hint: 'Friendly name used across the workspace.',
      },
      {
        key: 'company_legal_name',
        label: 'Registered legal name',
        hint: 'Appears on statutory documents and invoices.',
      },
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    description: 'Where customers and staff reach the company.',
    icon: Mail,
    fields: [
      { key: 'company_email', label: 'Company email', type: 'email', placeholder: 'admin@example.com' },
      { key: 'company_phone', label: 'Phone', type: 'tel', placeholder: '+91 80000 00000' },
      { key: 'company_address', label: 'Registered address', type: 'textarea' },
    ],
  },
  {
    id: 'regional',
    title: 'Regional & accounting',
    description: 'Time zone, currency and the financial year used for every report.',
    icon: Clock3,
    fields: [
      {
        key: 'timezone',
        label: 'Time zone',
        type: 'select',
        options: [
          'Asia/Kolkata',
          'Asia/Dubai',
          'Asia/Singapore',
          'Europe/London',
          'Europe/Berlin',
          'America/New_York',
          'America/Los_Angeles',
          'Australia/Sydney',
          'UTC',
        ],
        hint: 'Attendance, report boundaries and scheduled email use this zone.',
      },
      {
        key: 'currency',
        label: 'Currency code',
        type: 'select',
        options: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD'],
        hint: 'Amounts are stored as numeric values; this controls formatting.',
      },
      {
        key: 'financial_year_start',
        label: 'Financial year start',
        hint: 'MM-DD. India uses 04-01; the US uses 01-01.',
        placeholder: '04-01',
      },
    ],
  },
  {
    id: 'invoicing',
    title: 'Invoicing',
    description: 'Numbering and the footer printed on every invoice.',
    icon: CircleDollarSign,
    fields: [
      {
        key: 'invoice_prefix',
        label: 'Invoice number prefix',
        placeholder: 'INV',
        hint: 'Prepended to the generated invoice number.',
      },
      {
        key: 'invoice_footer',
        label: 'Invoice footer',
        type: 'textarea',
        hint: 'Closing note printed below the totals.',
      },
    ],
  },
  {
    id: 'automations',
    title: 'Automations',
    description: 'Occasion reminders and campaign behaviour.',
    icon: Settings2,
    fields: [
      {
        key: 'occasion_autosend',
        label: 'Occasion auto-send',
        type: 'toggle',
        hint: 'When enabled, birthday and anniversary reminders are queued automatically.',
      },
      {
        key: 'occasion_window_days',
        label: 'Occasion lead time (days)',
        type: 'number',
        hint: 'How many days ahead the reminder list looks.',
        placeholder: '10',
      },
    ],
  },
  {
    id: 'legacy',
    title: 'Legacy aliases',
    description: 'Older keys still read by email templates and integrations. Safe to leave as-is.',
    icon: Info,
    fields: [
      { key: 'shop_name', label: 'Shop name', hint: 'Used by email templates and older integrations.' },
      { key: 'shop_phone', label: 'Shop phone', type: 'tel' },
      { key: 'shop_address', label: 'Shop address', type: 'textarea' },
    ],
  },
];

const FY_PATTERN = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values: Record<string, any>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!String(values.product_name ?? '').trim()) errors.product_name = 'Product name is required.';
  if (!String(values.company_name ?? '').trim()) errors.company_name = 'Company name is required.';
  const email = String(values.company_email ?? '').trim();
  if (email && !EMAIL_PATTERN.test(email)) errors.company_email = "That doesn't look like an email address.";
  const fy = String(values.financial_year_start ?? '').trim();
  if (fy && !FY_PATTERN.test(fy)) errors.financial_year_start = 'Use MM-DD, for example 04-01.';
  const window = String(values.occasion_window_days ?? '').trim();
  if (window && (!/^\d+$/.test(window) || Number(window) < 1 || Number(window) > 90)) {
    errors.occasion_window_days = 'Enter a whole number between 1 and 90.';
  }
  const prefix = String(values.invoice_prefix ?? '').trim();
  if (prefix && prefix.length > 12) errors.invoice_prefix = 'Keep the prefix to 12 characters or fewer.';
  return errors;
}

/* ── One field ─────────────────────────────────────────────────────────────── */

function SettingField({
  field,
  value,
  error,
  onChange,
}: {
  field: FieldDef;
  value: any;
  error?: string;
  onChange: (next: string) => void;
}) {
  const text = String(value ?? '');

  return (
    <div className={field.type === 'textarea' ? 'sm:col-span-2' : undefined}>
      <label className="lbl">
        {field.label}
        {field.required ? ' *' : ''}
      </label>

      {field.type === 'toggle' ? (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <Switch
            checked={text === 'yes'}
            onCheckedChange={(checked) => onChange(checked ? 'yes' : 'no')}
            aria-label={field.label}
          />
          <span className={cn('text-sm font-medium', text === 'yes' ? 'text-emerald-700' : 'text-slate-500')}>
            {text === 'yes' ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      ) : field.type === 'textarea' ? (
        <textarea
          rows={3}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          aria-invalid={!!error}
        />
      ) : field.type === 'select' ? (
        <select value={text} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error}>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          aria-invalid={!!error}
        />
      )}

      {error ? (
        <div className="modal-error">{error}</div>
      ) : (
        field.hint && <div className="mt-1 text-[11px] text-slate-500">{field.hint}</div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function Settings() {
  const { can } = useAuth();
  const { refresh } = useBranding();
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/admin/settings'),
  });

  const history = useQuery({
    queryKey: ['settings-history'],
    queryFn: () => api.get('/audit-logs?action=settings.update&limit=6'),
    enabled: can('audit.view'),
    retry: false,
  });

  const saved: Record<string, string> = settings.data?.data || {};
  const values: Record<string, string> = form ?? saved;

  const changedKeys = useMemo(
    () => Object.keys(values).filter((key) => String(values[key] ?? '') !== String(saved[key] ?? '')),
    [values, saved],
  );
  const dirty = changedKeys.length > 0;

  const set = (key: string, next: string) => {
    setForm((prev) => ({ ...(prev ?? saved), [key]: next }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });
    setMessage('');
  };

  const discard = () => {
    setForm(null);
    setErrors({});
    setMessage('');
    setIsError(false);
  };

  const save = async () => {
    if (!dirty) return;
    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setIsError(true);
      setMessage('Some values need attention before this can be saved.');
      return;
    }

    // Send only what changed so the audit summary is a true delta.
    const payload = Object.fromEntries(changedKeys.map((key) => [key, values[key]]));
    setBusy(true);
    setMessage('');
    setIsError(false);
    try {
      await api.put('/admin/settings', payload);
      setMessage(`Saved ${changedKeys.length} change${changedKeys.length === 1 ? '' : 's'}. Branding refreshed.`);
      setForm(null);
      await settings.refetch();
      refresh();
      if (can('audit.view')) history.refetch();
    } catch (e: any) {
      setIsError(true);
      setMessage(e.body?.message || e.message || 'Could not save the settings.');
    } finally {
      setBusy(false);
    }
  };

  const scrollTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(`setting-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 lg:p-8">
      <PageHeader
        eyebrow="System"
        meta={dirty ? `${changedKeys.length} unsaved change${changedKeys.length === 1 ? '' : 's'}` : 'All changes are audited'}
        title="Company settings"
        description="One company record shared by every module. Saving updates branding immediately and writes an audit entry with your user and the changed keys."
        actions={
          <>
            <button type="button" className="btn ghost" onClick={discard} disabled={!dirty || busy}>
              <span className="inline-flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Discard
              </span>
            </button>
            <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>
              <span className="inline-flex items-center gap-1.5">
                {busy ? <Save className="h-3.5 w-3.5 animate-pulse" /> : <Check className="h-3.5 w-3.5" />}
                {busy ? 'Saving…' : 'Save settings'}
              </span>
            </button>
          </>
        }
      />

      {message && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-xl border p-3 text-sm',
            isError
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700',
          )}
          role="status"
        >
          {isError ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <Check className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{message}</span>
        </div>
      )}

      {settings.isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          Could not load the company settings. Check the API connection.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="Settings sections">
          <div className="sticky top-6 space-y-1">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const active = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollTo(section.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-semibold transition-colors',
                    active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {section.title}
                </button>
              );
            })}

            {dirty && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                Unsaved: {changedKeys.join(', ')}
              </div>
            )}
          </div>
        </nav>

        <div className="space-y-6">
          {settings.isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
              ))}
            </div>
          )}

          {!settings.isLoading &&
            SECTIONS.map((section) => {
              const Icon = section.icon;
              return (
                <section
                  key={section.id}
                  id={`setting-${section.id}`}
                  className="scroll-mt-6 rounded-xl border border-slate-200/80 bg-white shadow-sm"
                >
                  <header className="flex items-start gap-3 border-b border-slate-100 p-5">
                    <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-slate-900">{section.title}</h2>
                      <p className="mt-0.5 text-xs text-slate-500">{section.description}</p>
                    </div>
                  </header>

                  <div className="grid gap-4 p-5 sm:grid-cols-2">
                    {section.fields.map((field) => (
                      <SettingField
                        key={field.key}
                        field={field}
                        value={values[field.key]}
                        error={errors[field.key]}
                        onChange={(next) => set(field.key, next)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

          {can('audit.view') && (
            <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
              <header className="flex items-center gap-3 border-b border-slate-100 p-5">
                <div className="rounded-lg bg-slate-100 p-2 text-slate-600">
                  <History className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Recent changes</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    From the audit trail: who changed settings and when.
                  </p>
                </div>
              </header>
              <div className="p-5">
                {history.isLoading && <div className="text-xs text-slate-500">Loading history…</div>}
                {history.isError && <div className="text-xs text-slate-500">Audit trail unavailable.</div>}
                {!history.isLoading && !history.isError && !(history.data?.data || []).length && (
                  <div className="text-xs text-slate-500">No settings changes recorded yet.</div>
                )}
                <ul className="space-y-2">
                  {(history.data?.data || []).map((entry: any) => (
                    <li key={entry.id} className="flex items-start justify-between gap-3 text-[13px]">
                      <span className="min-w-0">
                        <strong className="font-semibold text-slate-800">
                          {entry.actor_name || 'system'}
                        </strong>
                        <span className="ml-2 text-slate-600">{entry.summary}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-500">{relativeTime(entry.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <Building2 className="h-4 w-4 text-slate-400" />
            <span className="text-xs text-slate-500">
              Currency and financial year affect how every module formats and groups money.
            </span>
            <span className="grow" />
            <button type="button" className="btn ghost" onClick={discard} disabled={!dirty || busy}>
              Discard changes
            </button>
            <button type="button" className="btn" onClick={save} disabled={!dirty || busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
