import { useState } from 'react';
import { CATS, catColor, catLight } from '../constants';

export default function AddDimension({ dims, onAdd }) {
  const [form, setForm] = useState({ name: '', category: 'Technical', score: 5 });

  const handleAdd = () => {
    if (!form.name.trim()) return;
    onAdd({ name: form.name.trim(), category: form.category, score: +form.score });
    setForm({ name: '', category: 'Technical', score: 5 });
  };

  const col = catColor(form.category);

  return (
    <div className="slide-up" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="card" style={{ padding: 28 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Add New Direction</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 26 }}>
          Expand your radar with a new growth dimension
        </div>

        {/* Name */}
        <div style={{ marginBottom: 20 }}>
          <label className="label">Name *</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            className="input" placeholder="e.g. Public Speaking, Python, Time Management"
            onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        </div>

        {/* Category */}
        <div style={{ marginBottom: 20 }}>
          <label className="label">Category</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.keys(CATS).map(c => {
              const catCol = catColor(c);
              const sel = form.category === c;
              return (
                <button key={c} onClick={() => setForm({ ...form, category: c })}
                  className={`chip ${sel ? 'active' : ''}`}
                  style={sel ? { borderColor: catCol, background: `${catCol}18`, color: catCol } : {}}>
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {/* Score */}
        <div style={{ marginBottom: 28 }}>
          <label className="label">
            Current Level: <span style={{ color: col, fontWeight: 800 }}>{form.score}/10</span>
          </label>
          <input type="range" min={0} max={10} step={1} value={form.score}
            onChange={e => setForm({ ...form, score: +e.target.value })}
            style={{ width: '100%', accentColor: col }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
            <span>Beginner</span><span>Intermediate</span><span>Expert</span>
          </div>
        </div>

        <button onClick={handleAdd} disabled={!form.name.trim()}
          className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 14, borderRadius: 12 }}>
          + Add to Radar
        </button>
      </div>

      {/* Current radar preview */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="label" style={{ marginBottom: 12 }}>Current Radar · {dims.length} directions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {dims.map(d => (
            <span key={d.id} className="badge" style={{ background: catLight(d.category), color: catColor(d.category), padding: '5px 12px' }}>
              {d.name} <span style={{ opacity: 0.5 }}>· {d.score}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
