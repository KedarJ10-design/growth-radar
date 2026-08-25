import { catColor, scoreHue } from '../constants';

export default function History({ history, dims }) {
  if (history.length === 0) {
    return (
      <div className="empty-state slide-up">
        <div className="icon">📸</div>
        <div className="title">No snapshots yet</div>
        <div className="desc">Click "📸 Snapshot" in the header to capture your current scores.<br />Track growth over time by comparing snapshots.</div>
      </div>
    );
  }

  const curr = Object.fromEntries(dims.map(d => [d.id, d.score]));

  return (
    <div className="flex-col gap-16 slide-up">
      {history.map((snap, i) => {
        const improved = snap.data.filter(x => (curr[x.id] || 0) > x.score).length;
        return (
          <div key={i} className="card fade-in" style={{ animationDelay: `${i * 0.06}s` }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{snap.date}</span>
                {i === 0 && (
                  <span className="badge" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>Latest</span>
                )}
              </div>
              {i > 0 && (
                <span style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>
                  ↑ {improved} improved
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: 8 }}>
              {snap.data.map(item => {
                const dim = dims.find(d => d.id === item.id);
                if (!dim) return null;
                const diff = i > 0 && curr[item.id] !== undefined ? curr[item.id] - item.score : null;
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
                    background: 'rgba(255,255,255,0.03)', borderRadius: 8
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: catColor(dim.category), flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dim.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: scoreHue(item.score) }}>{item.score}</span>
                    {diff !== null && diff !== 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: diff > 0 ? 'var(--green)' : 'var(--red)' }}>
                        {diff > 0 ? `+${diff}` : diff}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
