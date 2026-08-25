import { catColor, scoreHue } from '../constants';

export default function Dimensions({ dims, onUpdateScore, onRemove }) {
  return (
    <div className="flex-col gap-12 slide-up">
      {dims.map((d, i) => {
        const col = catColor(d.category);
        return (
          <div key={d.id} className="card fade-in" style={{ padding: '18px 22px', animationDelay: `${i * 0.04}s` }}>
            <div className="flex-between" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge" style={{ background: `${col}18`, color: col }}>{d.category}</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{d.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: scoreHue(d.score), letterSpacing: '-1px' }}>
                  {d.score}<span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>/10</span>
                </span>
                <button onClick={() => onRemove(d.id)} className="btn-ghost"
                  style={{ color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: '2px 6px', borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer' }}
                  title="Remove dimension"
                >×</button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <input type="range" min={0} max={10} step={1} value={d.score}
                onChange={e => onUpdateScore(d.id, +e.target.value)}
                style={{ flex: 1, accentColor: col }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 2, 4, 6, 8, 10].map(v => (
                  <button key={v} onClick={() => onUpdateScore(d.id, v)}
                    style={{
                      width: 30, height: 26, fontSize: 10, fontWeight: 700,
                      border: 'none', borderRadius: 6, cursor: 'pointer',
                      background: v <= d.score ? col : 'rgba(255,255,255,0.05)',
                      color: v <= d.score ? '#fff' : 'var(--text-muted)',
                      transition: 'all 0.15s',
                      fontFamily: 'inherit',
                    }}
                  >{v}</button>
                ))}
              </div>
            </div>

            <div className="progress-track" style={{ marginTop: 12 }}>
              <div className="progress-fill" style={{ width: `${d.score * 10}%`, background: col }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
