import { useState } from 'react';
import { catColor, scoreHue } from '../constants';
import { api } from '../api';

export default function Dimensions({ dims, onUpdateScore, onRemove }) {
  const [reflectionModal, setReflectionModal] = useState(null);
  const [reflectionText, setReflectionText] = useState('');
  const [animatingDim, setAnimatingDim] = useState(null);

  const handleScoreChange = (dim, newScore) => {
    if (newScore <= dim.score) {
      // Direct update if decreasing or same
      onUpdateScore(dim.id, newScore);
      return;
    }
    // Increasing: trigger reflection
    setReflectionModal({ dim, newScore });
    setReflectionText('');
  };

  const submitReflection = async () => {
    if (!reflectionModal || !reflectionText.trim()) return;
    const { dim, newScore } = reflectionModal;
    try {
      await api.request('/rpg/reflections', {
        method: 'POST',
        body: JSON.stringify({ dimension_id: dim.id, old_score: dim.score, new_score: newScore, reflection: reflectionText })
      });
    } catch (e) {
      console.error(e);
    }
    
    setReflectionModal(null);
    onUpdateScore(dim.id, newScore);
    
    // Trigger animation
    setAnimatingDim(dim.id);
    setTimeout(() => setAnimatingDim(null), 1000);
  };

  return (
    <div className="flex-col gap-12 slide-up">
      {/* Reflection Modal */}
      {reflectionModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="card fade-in" style={{ width: 400, maxWidth: '90%', padding: 24, border: `1px solid ${catColor(reflectionModal.dim.category)}` }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 18, color: '#f8fafc' }}>
              🚀 Upgrading {reflectionModal.dim.name} to Level {reflectionModal.newScore}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              What was your biggest breakthrough or most impactful action to reach this level?
            </p>
            <textarea
              autoFocus
              value={reflectionText}
              onChange={e => setReflectionText(e.target.value)}
              placeholder="e.g., Finally understood how context API works under the hood..."
              style={{ width: '100%', height: 80, padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setReflectionModal(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={submitReflection} className="btn" style={{ background: catColor(reflectionModal.dim.category), color: '#fff' }} disabled={!reflectionText.trim()}>
                Save Upgrade
              </button>
            </div>
          </div>
        </div>
      )}

      {dims.map((d, i) => {
        const col = catColor(d.category);
        const isAnimating = animatingDim === d.id;
        return (
          <div key={d.id} className={`card fade-in ${isAnimating ? 'ripple-animate' : ''}`} style={{ padding: '18px 22px', animationDelay: `${i * 0.04}s` }}>
            {isAnimating && <div className="sparkle" style={{ top: -20, right: 20 }}>✨</div>}
            {isAnimating && <div className="sparkle" style={{ top: -10, left: 20, animationDelay: '0.1s' }}>⭐</div>}

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
                onChange={e => handleScoreChange(d, +e.target.value)}
                style={{ flex: 1, accentColor: col }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {[0, 2, 4, 6, 8, 10].map(v => (
                  <button key={v} onClick={() => handleScoreChange(d, v)}
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
