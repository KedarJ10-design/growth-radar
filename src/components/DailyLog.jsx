import { useState, useEffect } from 'react';
import { api } from '../api';
import { catColor, todayStr } from '../constants';

export default function DailyLog({ dims }) {
  const [date, setDate] = useState(todayStr());
  const [logs, setLogs] = useState([]);
  const [streak, setStreak] = useState({ streak: 0, total_logs: 0 });
  const [form, setForm] = useState({ dimension_id: '', activity: '', duration_min: 30, notes: '' });
  const [loading, setLoading] = useState(false);

  const loadLogs = async () => {
    try {
      const [logsData, streakData] = await Promise.all([api.getDailyLogs(date), api.getStreak()]);
      setLogs(logsData);
      setStreak(streakData);
    } catch {}
  };

  useEffect(() => { loadLogs(); }, [date]);

  const addLog = async () => {
    if (!form.activity.trim()) return;
    setLoading(true);
    try {
      await api.addDailyLog({ ...form, date, activity: form.activity.trim() });
      setForm({ dimension_id: '', activity: '', duration_min: 30, notes: '' });
      await loadLogs();
    } catch {}
    setLoading(false);
  };

  const toggleLog = async (id) => {
    try {
      await api.toggleDailyLog(id);
      await loadLogs();
    } catch {}
  };

  const deleteLog = async (id) => {
    try {
      await api.deleteDailyLog(id);
      await loadLogs();
    } catch {}
  };

  const completed = logs.filter(l => l.completed).length;
  const totalMins = logs.filter(l => l.completed).reduce((s, l) => s + (l.duration_min || 0), 0);
  const pct = logs.length > 0 ? Math.round((completed / logs.length) * 100) : 0;
  const isToday = date === todayStr();

  return (
    <div className="slide-up" style={{ maxWidth: 700, margin: '0 auto' }}>
      {/* Header Stats */}
      <div className="grid-3" style={{ marginBottom: 18 }}>
        <div className="card" style={{ textAlign: 'center', padding: '18px 12px', background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(239,68,68,0.06))' }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--yellow)', letterSpacing: '-1px' }}>🔥 {streak.streak}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Day Streak</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '18px 12px' }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--green)', letterSpacing: '-1px' }}>{pct}%</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Completed</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '18px 12px' }}>
          <div style={{ fontSize: 30, fontWeight: 900, color: 'var(--accent-light)', letterSpacing: '-1px' }}>{totalMins}m</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Logged</div>
        </div>
      </div>

      {/* Date Picker */}
      <div className="card" style={{ marginBottom: 18, padding: '14px 20px' }}>
        <div className="flex-between">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() - 1); setDate(d.toISOString().split('T')[0]); }}
              className="btn btn-ghost" style={{ fontSize: 16, padding: '4px 10px' }}>←</button>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="input" style={{ width: 'auto', padding: '8px 14px', textAlign: 'center' }} />
            <button onClick={() => { const d = new Date(date); d.setDate(d.getDate() + 1); setDate(d.toISOString().split('T')[0]); }}
              className="btn btn-ghost" style={{ fontSize: 16, padding: '4px 10px' }}>→</button>
          </div>
          {!isToday && <button onClick={() => setDate(todayStr())} className="btn btn-ghost" style={{ fontSize: 12 }}>Today</button>}
        </div>
      </div>

      {/* Add Activity Form */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="label" style={{ marginBottom: 12 }}>Log Activity</div>
        <div className="grid-2" style={{ marginBottom: 12 }}>
          <div>
            <label className="label" style={{ fontSize: 10, marginBottom: 4 }}>Dimension</label>
            <select value={form.dimension_id} onChange={e => setForm({ ...form, dimension_id: e.target.value })}
              className="input" style={{ padding: '10px 14px' }}>
              <option value="">— General —</option>
              {dims.map(d => <option key={d.id} value={d.id}>{d.name} ({d.category})</option>)}
            </select>
          </div>
          <div>
            <label className="label" style={{ fontSize: 10, marginBottom: 4 }}>Duration: <span style={{ color: 'var(--accent-light)' }}>{form.duration_min} min</span></label>
            <input type="range" min={5} max={240} step={5} value={form.duration_min}
              onChange={e => setForm({ ...form, duration_min: +e.target.value })}
              style={{ width: '100%', marginTop: 8 }} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="label" style={{ fontSize: 10, marginBottom: 4 }}>What did you do? *</label>
          <input value={form.activity} onChange={e => setForm({ ...form, activity: e.target.value })}
            className="input" placeholder="e.g. Solved 3 LeetCode mediums, pushed MahaYatri feature"
            onKeyDown={e => e.key === 'Enter' && addLog()} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label className="label" style={{ fontSize: 10, marginBottom: 4 }}>Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
          <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
            className="input" placeholder="Any reflections, links, or details…" />
        </div>
        <button onClick={addLog} disabled={!form.activity.trim() || loading}
          className="btn btn-primary" style={{ width: '100%', padding: 13 }}>
          {loading ? 'Saving…' : '+ Log Activity'}
        </button>
      </div>

      {/* Activity List */}
      {logs.length === 0 ? (
        <div className="empty-state" style={{ padding: '50px 20px' }}>
          <div className="icon">📝</div>
          <div className="title">No activities logged</div>
          <div className="desc">{isToday ? 'Log what you worked on today to build your streak!' : 'No logs for this date.'}</div>
        </div>
      ) : (
        <div className="flex-col gap-8">
          {logs.map((log, i) => {
            const col = log.dim_category ? catColor(log.dim_category) : 'var(--text-muted)';
            return (
              <div key={log.id} className="card fade-in" style={{
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                opacity: log.completed ? 0.7 : 1, animationDelay: `${i * 0.04}s`
              }}>
                {/* Checkbox */}
                <button onClick={() => toggleLog(log.id)}
                  style={{
                    width: 24, height: 24, borderRadius: 7, border: `2px solid ${log.completed ? 'var(--green)' : 'var(--border)'}`,
                    background: log.completed ? 'var(--green)' : 'transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, color: '#fff', flexShrink: 0, transition: 'all 0.2s',
                  }}>
                  {log.completed && '✓'}
                </button>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, textDecoration: log.completed ? 'line-through' : 'none', color: log.completed ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                    {log.activity}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                    {log.dim_name && <span className="badge" style={{ background: `${col}18`, color: col, fontSize: 10, padding: '1px 8px' }}>{log.dim_name}</span>}
                    {log.duration_min > 0 && <span>⏱ {log.duration_min}m</span>}
                    {log.notes && <span style={{ opacity: 0.7 }}>— {log.notes}</span>}
                  </div>
                </div>

                <button onClick={() => deleteLog(log.id)} className="btn-ghost"
                  style={{ color: 'var(--text-muted)', fontSize: 16, border: 'none', background: 'none', cursor: 'pointer', padding: '2px 6px' }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Progress bar */}
      {logs.length > 0 && (
        <div className="card" style={{ marginTop: 18, padding: '14px 20px' }}>
          <div className="flex-between" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Daily Progress</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: pct === 100 ? 'var(--green)' : 'var(--accent-light)' }}>{completed}/{logs.length}</span>
          </div>
          <div className="progress-track" style={{ height: 6 }}>
            <div className="progress-fill" style={{ width: `${pct}%`, height: 6, background: pct === 100 ? 'var(--green)' : 'var(--accent)', borderRadius: 3 }} />
          </div>
        </div>
      )}
    </div>
  );
}
