import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useBranding } from '../../hooks/branding';

const FIELDS: { group: string; note?: string; fields: [string, string, string?][] }[] = [
  {
    group: 'Branding',
    note: 'These names appear on the sign-in screen, sidebar and browser title.',
    fields: [
      ['product_name', 'Product name', 'Shown in the sidebar and sign-in screen'],
      ['company_name', 'Company display name'],
      ['company_legal_name', 'Registered legal name'],
    ],
  },
  {
    group: 'Contact',
    fields: [
      ['company_email', 'Company email'],
      ['company_phone', 'Phone'],
      ['company_address', 'Address'],
    ],
  },
  {
    group: 'Regional & accounting',
    note: 'Configure default timezone, currency code, and financial year cycle.',
    fields: [
      ['timezone', 'Time zone'],
      ['currency', 'Currency code'],
      ['financial_year_start', 'Financial year start (MM-DD)'],
    ],
  },
  {
    group: 'Invoicing',
    fields: [
      ['invoice_prefix', 'Invoice number prefix'],
      ['invoice_footer', 'Invoice footer text'],
    ],
  },
];

export default function Settings() {
  const { data, refetch } = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/admin/settings') });
  const { refresh } = useBranding();
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const cur = form || data?.data || {};
  const set = (k: string, v: string) => setForm({ ...cur, [k]: v });

  const save = async () => {
    setMsg(''); setError(false); setBusy(true);
    try {
      await api.put('/admin/settings', form || {});
      setMsg('Settings saved. Branding refreshed.');
      setForm(null);
      refetch();
      refresh();
    } catch (e: any) {
      setMsg(e.message || 'Could not save settings');
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page hr-page">
      <header className="hr-head">
        <div className="hr-head-copy">
          <span className="hr-eyebrow">System</span>
          <h1>Company settings</h1>
          <p>One company record shared by every module. Changes are audited with your user and time.</p>
        </div>
      </header>

      {msg && <div className={`hr-msg${error ? ' err' : ''}`}>{msg}</div>}

      <div className="settings-stack">
        {FIELDS.map((section) => (
          <div className="hr-card" key={section.group}>
            <div className="hr-card-head">
              <h2>{section.group}</h2>
              {section.note && <span className="sub">{section.note}</span>}
            </div>
            <div className="hr-card-body">
              <div className="hr-form-grid">
                {section.fields.map(([k, label, hint]) => (
                  <div className="hr-field" key={k}>
                    <label className="lbl">{label}</label>
                    {k === 'timezone' ? (
                      <select value={cur[k] || ''} onChange={(e) => set(k, e.target.value)}>
                        {['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'UTC'].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    ) : k === 'currency' ? (
                      <select value={cur[k] || ''} onChange={(e) => set(k, e.target.value)}>
                        {['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input value={cur[k] || ''} onChange={(e) => set(k, e.target.value)} />
                    )}
                    {hint && <span className="hint">{hint}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        <div className="hr-card">
          <div className="hr-card-foot">
            <span className="modal-hint">Currency and financial year affect how every module formats and groups money.</span>
            <span className="grow" />
            <button type="button" className="btn ghost" onClick={() => setForm(null)} disabled={!form}>Discard changes</button>
            <button type="button" className="btn" onClick={save} disabled={busy || !form}>{busy ? 'Saving…' : 'Save settings'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
