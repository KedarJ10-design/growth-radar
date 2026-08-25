import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from 'recharts';
import { CATS, catColor, scoreHue } from '../constants';

export default function Dashboard({ dims, filter }) {
  const shown = filter === 'All' ? dims : dims.filter(d => d.category === filter);
  const radarData = shown.map(d => ({
    subject: d.name.length > 11 ? d.name.slice(0, 10) + '…' : d.name,
    score: d.score,
    fullMark: 10,
  }));
  const avg = dims.length ? (dims.reduce((s, d) => s + d.score, 0) / dims.length).toFixed(1) : 0;
  const strengths = dims.filter(d => d.score >= 7).length;
  const weaknesses = dims.filter(d => d.score <= 3).length;
  const topFocus = [...dims].sort((a, b) => a.score - b.score).slice(0, 4);

  return (
    <div className="slide-up">
      <div className="grid-2" style={{ marginBottom: 18 }}>
        {/* Radar Chart */}
        <div className="card card-glow">
          <div className="label" style={{ marginBottom: 10 }}>Growth Radar</div>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData} margin={{ top: 14, right: 34, bottom: 14, left: 34 }}>
              <PolarGrid stroke="rgba(255,255,255,0.06)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 500 }} />
              <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.15)' }} tickCount={6} />
              <Radar dataKey="score" stroke="#818cf8" fill="#6366f1" fillOpacity={0.15} strokeWidth={2}
                dot={{ fill: '#818cf8', r: 3, strokeWidth: 0 }} />
              <Tooltip
                formatter={(v) => [`${v}/10`, 'Score']}
                contentStyle={{ fontSize: 12, borderRadius: 10, background: 'rgba(15,15,26,0.9)', border: '1px solid rgba(255,255,255,0.1)', color: '#f1f5f9', backdropFilter: 'blur(8px)' }}
                labelStyle={{ color: '#94a3b8' }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Stats + Focus */}
        <div className="flex-col gap-16">
          <div className="grid-3">
            {[
              { label: 'Avg Score', val: avg, color: '#818cf8', gradient: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))' },
              { label: 'Strengths', val: strengths, color: '#10b981', gradient: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,95,70,0.08))' },
              { label: 'Gaps', val: weaknesses, color: '#ef4444', gradient: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(153,27,27,0.08))' },
            ].map(s => (
              <div key={s.label} className="card" style={{ textAlign: 'center', padding: '18px 12px', background: s.gradient }}>
                <div style={{ fontSize: 30, fontWeight: 900, color: s.color, letterSpacing: '-1px' }}>{s.val}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ flex: 1 }}>
            <div className="label" style={{ marginBottom: 4 }}>🎯 Priority Focus</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>Lowest scores — highest growth leverage</div>
            {topFocus.map((d, i) => {
              const col = catColor(d.category);
              return (
                <div key={d.id} className="fade-in" style={{ marginBottom: 14, animationDelay: `${i * 0.06}s` }}>
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.06)',
                        fontSize: 10, fontWeight: 800, color: 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>{i + 1}</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                      <span className="badge" style={{ background: `${col}18`, color: col }}>{d.category}</span>
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 800, color: scoreHue(d.score) }}>{d.score}/10</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${d.score * 10}%`, background: col }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* All Dimensions — Ranked */}
      <div className="card">
        <div className="label" style={{ marginBottom: 14 }}>All Dimensions — Ranked</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
          {[...shown].sort((a, b) => b.score - a.score).map((d, i) => (
            <div key={d.id} className="fade-in" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
              background: 'rgba(255,255,255,0.03)', borderRadius: 10, animationDelay: `${i * 0.03}s`,
              transition: 'background 0.2s', cursor: 'default'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: catColor(d.category), flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: scoreHue(d.score) }}>{d.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
