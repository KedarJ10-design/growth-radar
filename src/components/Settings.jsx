import { useState, useEffect } from 'react';
import { api } from '../api';

export default function Settings() {
  const [stats, setStats] = useState(null);
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
  }, []);

  const handleExport = async (format) => {
    setExporting(format);
    try {
      await api.exportData(format);
    } catch (e) {
      alert('Export failed: ' + e.message);
    }
    setExporting('');
  };

  return (
    <div className="slide-up" style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Export Section */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>📥 Export Data</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
          Download all your dimensions, snapshots, and daily logs
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => handleExport('xlsx')} disabled={!!exporting}
            className="btn btn-primary" style={{ flex: 1, padding: 14 }}>
            {exporting === 'xlsx' ? 'Generating…' : '📊 Download Excel (.xlsx)'}
          </button>
          <button onClick={() => handleExport('csv')} disabled={!!exporting}
            className="btn btn-secondary" style={{ flex: 1, padding: 14 }}>
            {exporting === 'csv' ? 'Generating…' : '📄 Download CSV'}
          </button>
        </div>
      </div>

      {/* Database Stats */}
      {stats && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>📊 Database Stats</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Dimensions', val: stats.dims, icon: '🎚' },
              { label: 'Snapshots', val: stats.snaps, icon: '📸' },
              { label: 'Daily Logs', val: stats.logs, icon: '📝' },
              { label: 'Completed', val: stats.completed, icon: '✅' },
              { label: 'Schedules', val: stats.schedules, icon: '✨' },
              { label: 'Avg Score', val: stats.avgScore, icon: '📈' },
            ].map(s => (
              <div key={s.label} style={{
                padding: '14px 10px', textAlign: 'center',
                background: 'rgba(255,255,255,0.03)', borderRadius: 10
              }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent-light)', letterSpacing: '-0.5px' }}>{s.val}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="card" style={{ borderLeft: '3px solid var(--accent)', background: 'var(--accent-bg)', padding: '14px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-light)', marginBottom: 4 }}>💾 Where's my data?</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          All data is stored locally in <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>server/data/growth.db</code> (SQLite file).
          <br />Back it up anytime by copying that file. No cloud, no accounts — 100% yours.
        </div>
      </div>

      {/* AI Config */}
      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>🤖 AI Configuration</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
          Schedule generation uses Groq (Llama 3.3 70B) — free, fast, no credit card needed
        </div>
        <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <strong>Setup:</strong> Get your free API key from{' '}
          <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent-light)', textDecoration: 'underline' }}>console.groq.com</a>
          <br />Then add it to <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>server/.env</code> as <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>GROQ_API_KEY=gsk_...</code>
        </div>
      </div>
    </div>
  );
}
