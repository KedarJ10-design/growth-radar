import { useState, useEffect } from 'react';
import { catColor } from '../constants';
import { api } from '../api';

export default function Schedule({ dims, onGenerate, generatedSchedule, loading, error }) {
  const [todayGoals, setTodayGoals] = useState('');
  const [selectedDims, setSelectedDims] = useState([]);
  const [availableHours, setAvailableHours] = useState(8);
  const [startTime, setStartTime] = useState('09:00');
  const [blockedTime, setBlockedTime] = useState('');
  
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    // Check URL for OAuth callback result
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar_sync') === 'success') {
      setSyncSuccess(true);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('calendar_sync') === 'error') {
      setSyncError('Google Authentication failed. Please try again.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const toggleDim = (id) => setSelectedDims(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const handleGenerate = () => {
    onGenerate({ todayGoals, selectedDims, availableHours, startTime, blockedTime });
    setSyncSuccess(false);
    setSyncError(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      await api.syncCalendar(generatedSchedule.schedule, today);
      setSyncSuccess(true);
    } catch (err) {
      if (err.message === 'Not authenticated with Google' || err.message === 'Authentication expired') {
        // Redirect to Express auth endpoint
        window.location.href = '/api/calendar/auth';
      } else {
        setSyncError(err.message || 'Failed to sync to calendar');
      }
    } finally {
      setSyncing(false);
    }
  };

  // ── Input Form ──────────────────────────────────────────
  if (!generatedSchedule) {
    return (
      <div className="slide-up" style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="flex-col gap-16">
          {/* Hero */}
          <div className="card" style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
            border: '1px solid rgba(99,102,241,0.2)',
            padding: '22px 26px'
          }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>✨ AI Schedule Generator</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Tell me your goals — I'll build your day around them + your radar gaps</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, opacity: 0.7 }}>Powered by Groq · Llama 3.3 70B</div>
          </div>

          {/* Goals */}
          <div className="card">
            <label className="label">What do you want to achieve today? *</label>
            <textarea value={todayGoals} onChange={e => setTodayGoals(e.target.value)} rows={3}
              className="input" placeholder="e.g. Solve DSA problems, apply to 2 companies, push MahaYatri feature…" />
          </div>

          {/* Dimension focus */}
          <div className="card">
            <label className="label">Focus Dimensions <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--text-muted)' }}>(leave empty = auto-pick lowest gaps)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {dims.map(d => {
                const sel = selectedDims.includes(d.id);
                const col = catColor(d.category);
                return (
                  <button key={d.id} onClick={() => toggleDim(d.id)}
                    className={`chip ${sel ? 'active' : ''}`}
                    style={sel ? { borderColor: col, background: `${col}18`, color: col } : {}}
                  >
                    {d.name} <span style={{ opacity: 0.6, fontSize: 11 }}>{d.score}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time settings */}
          <div className="card">
            <label className="label">Time Settings</label>
            <div className="grid-2" style={{ marginBottom: 16 }}>
              <div>
                <label className="label" style={{ fontSize: 10, marginBottom: 6 }}>Start Time</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label" style={{ fontSize: 10, marginBottom: 6 }}>
                  Available: <span style={{ color: 'var(--accent-light)', fontWeight: 800 }}>{availableHours}h</span>
                </label>
                <input type="range" min={2} max={12} value={availableHours}
                  onChange={e => setAvailableHours(+e.target.value)}
                  style={{ width: '100%', marginTop: 10 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>2h</span><span>12h</span>
                </div>
              </div>
            </div>
            <div>
              <label className="label" style={{ fontSize: 10, marginBottom: 6 }}>
                Blocked Time <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </label>
              <input value={blockedTime} onChange={e => setBlockedTime(e.target.value)}
                className="input" placeholder="e.g. 2 PM – 3 PM college lecture, 5 PM family time" />
            </div>
          </div>

          {error && (
            <div style={{ padding: '12px 18px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}

          <button onClick={handleGenerate} disabled={loading} className="btn btn-primary"
            style={{ padding: '16px', fontSize: 15, borderRadius: 14, width: '100%', animation: loading ? 'pulse 1.5s infinite' : 'none' }}>
            {loading ? '✨ Generating your day…' : '✨ Generate My Schedule'}
          </button>
        </div>
      </div>
    );
  }

  // ── Result ──────────────────────────────────────────────
  return (
    <div className="slide-up" style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* AI Insight */}
      <div className="card fade-in" style={{
        marginBottom: 18, borderLeft: '3px solid var(--accent)',
        background: 'var(--accent-bg)', padding: '16px 20px'
      }}>
        <div className="label" style={{ color: 'var(--accent-light)', marginBottom: 6 }}>✨ AI Insight</div>
        <div style={{ fontSize: 13, color: 'var(--accent-light)', lineHeight: 1.6 }}>
          <strong>Insight: </strong>{generatedSchedule.insight}
        </div>
        {generatedSchedule.path_context && (
          <div style={{ fontSize: 13, color: 'var(--accent-light)', lineHeight: 1.6, marginTop: 8 }}>
            <strong>Learning Path: </strong>{generatedSchedule.path_context}
          </div>
        )}
      </div>

      {/* Schedule blocks */}
      <div className="flex-col gap-12" style={{ marginBottom: 22 }}>
        {generatedSchedule.schedule.map((block, i) => {
          const col = catColor(block.category || 'Other');
          return (
            <div key={i} className="card fade-in" style={{
              padding: '18px 22px', borderLeft: `3px solid ${col}`,
              display: 'flex', gap: 18, alignItems: 'flex-start',
              animationDelay: `${i * 0.06}s`
            }}>
              <div style={{ textAlign: 'center', minWidth: 58, flexShrink: 0 }}>
                <div style={{ fontSize: 24 }}>{block.emoji || '🎯'}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: col, marginTop: 6 }}>{block.start}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>↓</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: col }}>{block.end}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{block.title}</span>
                  <span className="badge" style={{ background: `${col}18`, color: col }}>{block.category}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{block.desc}</div>
                {block.search_query && (
                  <div style={{ 
                    marginTop: 8, 
                    padding: '6px 10px', 
                    background: 'rgba(255,255,255,0.05)', 
                    borderRadius: 4,
                    fontSize: 12,
                    color: 'var(--text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <span>🔍</span>
                    <span><strong>Search:</strong> {block.search_query}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => onGenerate(null)} className="btn btn-secondary" style={{ flex: 1 }}>
          ← Generate New
        </button>
        <button 
          onClick={handleSync} 
          disabled={syncing || syncSuccess}
          className="btn btn-primary" 
          style={{ flex: 2, background: syncSuccess ? 'var(--green)' : 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          {syncing ? '⏳ Syncing...' : syncSuccess ? '✅ Synced to Calendar' : '📅 Sync to Google Calendar'}
        </button>
      </div>
      
      {syncError && (
        <div style={{ marginTop: 12, padding: '10px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 8, fontSize: 12, textAlign: 'center' }}>
          {syncError}
        </div>
      )}
    </div>
  );
}
