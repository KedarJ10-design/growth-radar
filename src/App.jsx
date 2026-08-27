import { useState, useEffect } from 'react';
import { api } from './api';
import { CATS, catColor } from './constants';
import Dashboard from './components/Dashboard';
import Dimensions from './components/Dimensions';
import Schedule from './components/Schedule';
import History from './components/History';
import AddDimension from './components/AddDimension';
import DailyLog from './components/DailyLog';
import Settings from './components/Settings';
import PinGate from './components/PinGate';
import PrivacyPolicy from './components/PrivacyPolicy';

const TABS = [
  ['dashboard',  '📊 Dashboard'],
  ['dimensions', '🎚 Dimensions'],
  ['dailylog',   '📝 Daily Log'],
  ['schedule',   '✨ AI Schedule'],
  ['history',    '📈 History'],
  ['add',        '＋ Add'],
  ['settings',   '⚙️ Settings'],
];

export default function App() {
  const [dims, setDims]       = useState([]);
  const [tab, setTab]         = useState('dashboard');
  const [filter, setFilter]   = useState('All');
  const [history, setHistory] = useState([]);
  const [loaded, setLoaded]   = useState(false);
  const [flash, setFlash]     = useState('');

  // AI Schedule state
  const [generatedSchedule, setGeneratedSchedule] = useState(null);
  const [scheduleLoading, setScheduleLoading]     = useState(false);
  const [scheduleError, setScheduleError]         = useState('');

  // ── Load from API ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [d, s] = await Promise.all([api.getDimensions(), api.getSnapshots()]);
        setDims(d);
        setHistory(s);
      } catch (e) {
        console.error('Load failed:', e);
      }
      setLoaded(true);
    })();
  }, []);

  const notify = (m) => { setFlash(m); setTimeout(() => setFlash(''), 2800); };

  // ── Dimension ops ─────────────────────────────────────────
  const updateScore = async (id, score) => {
    setDims(prev => prev.map(d => d.id === id ? { ...d, score } : d));
    try { await api.updateDimension(id, { score }); } catch {}
  };

  const removeDim = async (id) => {
    setDims(prev => prev.filter(d => d.id !== id));
    try { await api.deleteDimension(id); } catch {}
  };

  const addDim = async ({ name, category, score }) => {
    try {
      const dim = await api.addDimension({ name, category, score });
      setDims(prev => [...prev, dim]);
      setTab('dimensions');
      notify('Direction added ✓');
    } catch (e) {
      notify('Failed to add: ' + e.message);
    }
  };

  // ── Snapshot ──────────────────────────────────────────────
  const saveSnap = async () => {
    try {
      const snap = await api.createSnapshot();
      setHistory(prev => [snap, ...prev]);
      notify('Snapshot saved ✓');
    } catch {
      notify('Snapshot failed');
    }
  };

  // ── AI Schedule ───────────────────────────────────────────
  const handleGenerateSchedule = async (params) => {
    if (params === null) { setGeneratedSchedule(null); return; }
    setScheduleLoading(true);
    setScheduleError('');
    setGeneratedSchedule(null);
    try {
      const result = await api.generateSchedule(params);
      setGeneratedSchedule(result);
    } catch (e) {
      setScheduleError(e.message || 'Generation failed — try again.');
    }
    setScheduleLoading(false);
  };

  // ── Derived ───────────────────────────────────────────────
  const allCats = ['All', ...Object.keys(CATS).filter(c => dims.some(d => d.category === c))];
  const shown = filter === 'All' ? dims : dims.filter(d => d.category === filter);
  const avg = dims.length ? (dims.reduce((s, d) => s + d.score, 0) / dims.length).toFixed(1) : 0;

  // Handle public routes before PinGate
  if (window.location.pathname === '/privacy-policy') {
    return <PrivacyPolicy />;
  }

  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12, animation: 'pulse 1.5s infinite' }}>⚡</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Loading Radar System…</div>
        </div>
      </div>
    );
  }

  return (
    <PinGate>
      <div style={{ minHeight: '100vh' }}>
      {/* Toast */}
      {flash && <div className="toast">{flash}</div>}

      {/* Header */}
      <div className="header">
        <div className="flex-between" style={{ position: 'relative', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px' }}>
              <span style={{ marginRight: 8 }}>⚡</span>Kedar's Growth Radar
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Job Focus Mode · {dims.length} Dimensions · Avg {avg}/10
            </div>
          </div>
          <button onClick={saveSnap} className="btn btn-secondary"
            style={{ background: flash ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)', borderColor: flash ? 'rgba(16,185,129,0.3)' : 'var(--border)' }}>
            {flash || '📸 Snapshot'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(([t, label]) => (
          <button key={t}
            onClick={() => { setTab(t); if (t === 'schedule') setGeneratedSchedule(null); }}
            className={`tab-btn ${tab === t ? 'active' : ''}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Category Filter */}
      {!['add', 'schedule', 'dailylog', 'settings'].includes(tab) && (
        <div style={{ padding: '14px 32px 6px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {allCats.map(c => {
            const col = catColor(c === 'All' ? 'Other' : c);
            return (
              <button key={c}
                onClick={() => setFilter(c)}
                className={`chip ${filter === c ? 'active' : ''}`}
                style={filter === c ? { borderColor: col, background: `${col}18`, color: col } : {}}>
                {c === 'All' ? '✦ All' : c}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div style={{ maxWidth: 1020, margin: '0 auto', padding: '16px 28px 50px' }}>
        {tab === 'dashboard'  && <Dashboard dims={shown} filter={filter} />}
        {tab === 'dimensions' && <Dimensions dims={shown} onUpdateScore={updateScore} onRemove={removeDim} />}
        {tab === 'dailylog'   && <DailyLog dims={dims} />}
        {tab === 'schedule'   && <Schedule dims={dims} onGenerate={handleGenerateSchedule} generatedSchedule={generatedSchedule} loading={scheduleLoading} error={scheduleError} />}
        {tab === 'history'    && <History history={history} dims={dims} />}
        {tab === 'add'        && <AddDimension dims={dims} onAdd={addDim} />}
        {tab === 'settings'   && <Settings />}
      </div>
    </div>
    </PinGate>
  );
}
