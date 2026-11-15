import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';

export default function AuditLogs() {
  const [q, setQ] = useState('');
  const { data, isLoading, isError } = useQuery({ queryKey: ['audit'], queryFn: () => api.get('/audit-logs?limit=300') });
  const rows: any[] = data?.data || [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((a) =>
      `${a.action} ${a.entity_type} ${a.entity_id} ${a.summary} ${a.actor_name || ''} ${a.actor_email || ''}`
        .toLowerCase().includes(needle)
    );
  }, [rows, q]);

  return (
    <div className="page hr-page">
      <header className="hr-head">
        <div className="hr-head-copy">
          <span className="hr-eyebrow">System</span>
          <h1>Audit trail</h1>
          <p>Complete historical trace of all system actions, user events, and record modifications for compliance.</p>
        </div>
      </header>

      <div className="hr-card">
        <div className="hr-card-head">
          <h2>Events</h2>
          <span className="sub">{filtered.length} shown</span>
          <div className="hr-card-actions">
            <input
              placeholder="Filter by action, entity, person or summary…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ minWidth: 300 }}
            />
          </div>
        </div>
        {isLoading ? <div className="skeleton" style={{ height: 220 }} /> : isError ? (
          <div className="empty">Could not load the audit trail.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Summary</th></tr></thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td><small>{new Date(a.created_at).toLocaleString()}</small></td>
                    <td>
                      <small>
                        <strong>{a.actor_name || 'system'}</strong>
                        <br />{a.actor_email || a.actor_id || '—'}
                      </small>
                    </td>
                    <td><code>{a.action}</code></td>
                    <td><small>{a.entity_type || '—'}<br />{a.entity_id ? String(a.entity_id).slice(-10) : '—'}</small></td>
                    <td><small>{a.summary || '—'}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="empty">No audit entries match.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
