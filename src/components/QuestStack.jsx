import { useState, useEffect } from 'react';
import { api } from '../api';

const TYPE_ICONS = {
  podcast: '🎧', course: '📚', certification: '🏆',
  project: '🛠️', task: '📝', goal: '🎯'
};

const TYPE_XP = {
  task: 15, podcast: 10, course: 10,
  certification: 50, project: 30, goal: 20
};

const PRIORITY_CONFIG = {
  do_first: { label: '🔴 Do First', subtitle: 'Urgent + Important', color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' },
  schedule: { label: '🟡 Schedule', subtitle: 'Important, Not Urgent', color: '#eab308', bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.2)' },
  delegate: { label: '🟠 Delegate', subtitle: 'Urgent, Not Important', color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.2)' },
  backlog:  { label: '🔵 Backlog', subtitle: 'Neither Urgent nor Important', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' },
};

const STATUS_TABS = [
  { key: 'todo', label: '📋 To Do', color: '#a78bfa' },
  { key: 'ongoing', label: '🔄 On Going', color: '#fbbf24' },
  { key: 'completed', label: '✅ Completed', color: '#34d399' },
];

export default function QuestStack({ dims }) {
  const [stats, setStats] = useState({ total: 0, completed: 0, ongoing: 0, today_completed: 0 });
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('todo');
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [flash, setFlash] = useState('');
  const [radarPopup, setRadarPopup] = useState(null);

  // Form state
  const [form, setForm] = useState({
    title: '', type: 'task', priority: 'backlog',
    dimension_id: '', due_date: '', est_hours: '', notes: ''
  });

  const [allItems, setAllItems] = useState([]); // Store all items

  useEffect(() => { loadItems(); }, []); // Run once on mount

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await api.getQuestStack(null); // Fetch all
      setAllItems(data.items || []);
      setStats(data.stats || {});
    } catch (e) { console.error('Quest load error:', e); }
    setLoading(false);
  };

  // Filter items based on active tab
  const items = allItems.filter(item => item.status === statusTab);

  const notify = (m) => { setFlash(m); setTimeout(() => setFlash(''), 3000); };

  const resetForm = () => {
    setForm({ title: '', type: 'task', priority: 'backlog', dimension_id: '', due_date: '', est_hours: '', notes: '' });
    setEditItem(null);
  };

  const openAdd = () => { resetForm(); setShowModal(true); };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      title: item.title, type: item.type, priority: item.priority,
      dimension_id: item.dimension_id || '', due_date: item.due_date || '',
      est_hours: item.est_hours || '', notes: item.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      if (editItem) {
        await api.updateQuestItem(editItem.id, { ...form, dimension_id: form.dimension_id || null });
        notify('✏️ Task updated');
      } else {
        await api.addQuestItem({ ...form, dimension_id: form.dimension_id || null });
        notify('✅ Task added');
      }
      setShowModal(false);
      resetForm();
      loadItems();
    } catch (e) { notify('❌ ' + e.message); }
  };

  const handleComplete = async (item) => {
    try {
      const res = await api.completeQuestItem(item.id);
      notify(`🎉 +${res.xp_awarded} XP! "${item.title}" completed`);
      if (res.radar_recommendation) {
        setRadarPopup(res.radar_recommendation);
      }
      if (res.streak_bonus) {
        setTimeout(() => notify(res.streak_bonus.message), 3200);
      }
      loadItems();
    } catch (e) { notify('❌ ' + e.message); }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteQuestItem(id);
      notify('🗑️ Task deleted');
      loadItems();
    } catch (e) { notify('❌ ' + e.message); }
  };

  const handleStatusChange = async (item, newStatus) => {
    try {
      await api.updateQuestItem(item.id, { status: newStatus });
      if (newStatus === 'ongoing') notify(`🚀 Started: "${item.title}" (+5 XP)`);
      else notify(`📋 Moved to ${newStatus}`);
      loadItems();
    } catch (e) { notify('❌ ' + e.message); }
  };

  const handlePriorityChange = async (item, newPriority) => {
    try {
      await api.updateQuestItem(item.id, { priority: newPriority });
      notify(`↕️ Priority changed to ${PRIORITY_CONFIG[newPriority]?.label || newPriority}`);
      loadItems();
    } catch (e) { notify('❌ ' + e.message); }
  };

  const handleRadarBump = async () => {
    if (!radarPopup) return;
    try {
      await api.updateDimension(radarPopup.dimension_id, { score: radarPopup.suggested_score });
      notify(`📈 ${radarPopup.dimension_name} score bumped to ${radarPopup.suggested_score}/10!`);
      setRadarPopup(null);
    } catch (e) { notify('❌ ' + e.message); }
  };

  const handleMove = async (laneItems, currentItem, direction) => {
    // Only items without due dates can be manually reordered
    const manualItems = laneItems.filter(i => !i.due_date);
    const idx = manualItems.findIndex(i => i.id === currentItem.id);
    if (idx === -1) return;
    
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= manualItems.length) return;
    
    // Swap
    const temp = manualItems[idx];
    manualItems[idx] = manualItems[targetIdx];
    manualItems[targetIdx] = temp;
    
    // Generate new order
    const updates = manualItems.map((item, index) => ({ id: item.id, sort_order: index + 1 }));
    
    try {
      await api.reorderQuestStack(updates);
      loadItems();
    } catch (e) { notify('❌ ' + e.message); }
  };

  // Group items by priority
  const grouped = {};
  for (const p of Object.keys(PRIORITY_CONFIG)) {
    grouped[p] = items.filter(i => i.priority === p);
  }

  // Number items within each priority lane
  let globalCounter = 0;

  return (
    <div className="quest-stack">
      {/* Toast */}
      {flash && <div className="toast">{flash}</div>}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>📋 Quest Stack</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {stats.total} total · {stats.ongoing} ongoing · {stats.completed} completed · {stats.today_completed} today
          </div>
        </div>
        <button className="btn btn-primary" onClick={openAdd} style={{ fontSize: 13, padding: '8px 16px' }}>
          + Add Task
        </button>
      </div>

      {/* Status Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_TABS.map(st => (
          <button key={st.key} onClick={() => setStatusTab(st.key)}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
              background: statusTab === st.key ? `${st.color}18` : 'rgba(255,255,255,0.03)',
              borderColor: statusTab === st.key ? `${st.color}50` : 'var(--border)',
              color: statusTab === st.key ? st.color : 'var(--text-muted)',
            }}>
            {st.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 28, animation: 'pulse 1.5s infinite' }}>📋</div>
          <div style={{ fontSize: 13, marginTop: 8 }}>Loading Quest Stack…</div>
        </div>
      )}

      {/* Empty State */}
      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>
            {statusTab === 'completed' ? '🏆' : statusTab === 'ongoing' ? '🔄' : '📋'}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            {statusTab === 'completed' ? 'No completed tasks yet. Keep grinding!' :
             statusTab === 'ongoing' ? 'Nothing in progress. Start a task!' :
             'Your quest stack is empty. Add your first task!'}
          </div>
        </div>
      )}

      {/* Priority Lanes */}
      {!loading && items.length > 0 && (
        statusTab === 'completed' ? (
          /* Completed: flat list, no priority lanes */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((item, idx) => (
              <TaskCard key={item.id} item={item} num={idx + 1} dims={dims}
                onEdit={openEdit} onDelete={handleDelete} isCompleted />
            ))}
          </div>
        ) : (
          /* Active: grouped by priority */
          Object.entries(PRIORITY_CONFIG).map(([pKey, pCfg]) => {
            const lane = grouped[pKey];
            if (!lane || lane.length === 0) return null;
            return (
              <div key={pKey} style={{ marginBottom: 20 }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10,
                  padding: '8px 12px', borderRadius: 8,
                  background: pCfg.bg, borderLeft: `3px solid ${pCfg.color}`
                }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: pCfg.color }}>{pCfg.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— {pCfg.subtitle}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    {lane.length} {lane.length === 1 ? 'task' : 'tasks'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lane.map((item, idx) => {
                    globalCounter++;
                    return (
                      <TaskCard key={item.id} item={item} num={globalCounter} dims={dims}
                        onEdit={openEdit} onDelete={handleDelete} onComplete={handleComplete}
                        onStatusChange={handleStatusChange} onPriorityChange={handlePriorityChange}
                        onMove={(!item.due_date && lane.filter(i => !i.due_date).length > 1) ? (dir) => handleMove(lane, item, dir) : null} />
                    );
                  })}
                </div>
              </div>
            );
          })
        )
      )}

      {/* Radar Score Recommendation Popup */}
      {radarPopup && (
        <div className="quest-modal-overlay" onClick={() => setRadarPopup(null)}>
          <div className="quest-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0, fontSize: 18 }}>📈 Radar Score Recommendation</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>{radarPopup.reason}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, margin: '20px 0' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-muted)' }}>{radarPopup.current_score}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Current</div>
              </div>
              <div style={{ fontSize: 24 }}>→</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>{radarPopup.suggested_score}</div>
                <div style={{ fontSize: 11, color: '#10b981' }}>Suggested</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-primary" onClick={handleRadarBump} style={{ flex: 1 }}>
                ✅ Bump Score
              </button>
              <button className="btn btn-secondary" onClick={() => setRadarPopup(null)} style={{ flex: 1 }}>
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="quest-modal-overlay" onClick={() => { setShowModal(false); resetForm(); }}>
          <div className="quest-modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: 18 }}>{editItem ? '✏️ Edit Task' : '📋 Add New Task'}</h3>
            <form onSubmit={handleSubmit}>
              {/* Title */}
              <label className="quest-label">Title *</label>
              <input className="quest-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Watch Fireship Docker video" required autoFocus />

              {/* Type */}
              <label className="quest-label">Type</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {Object.entries(TYPE_ICONS).map(([t, icon]) => (
                  <button key={t} type="button" onClick={() => setForm({ ...form, type: t })}
                    className={`quest-type-btn ${form.type === t ? 'active' : ''}`}>
                    {icon} {t.charAt(0).toUpperCase() + t.slice(1)}
                    <span style={{ fontSize: 10, opacity: 0.6 }}> +{TYPE_XP[t]}XP</span>
                  </button>
                ))}
              </div>

              {/* Priority */}
              <label className="quest-label">Priority (Eisenhower Matrix)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                {Object.entries(PRIORITY_CONFIG).map(([pKey, pCfg]) => (
                  <button key={pKey} type="button" onClick={() => setForm({ ...form, priority: pKey })}
                    style={{
                      padding: '10px 12px', borderRadius: 8, border: '1px solid',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                      background: form.priority === pKey ? pCfg.bg : 'rgba(255,255,255,0.03)',
                      borderColor: form.priority === pKey ? pCfg.color : 'var(--border)',
                      color: form.priority === pKey ? pCfg.color : 'var(--text-muted)',
                    }}>
                    <div>{pCfg.label}</div>
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{pCfg.subtitle}</div>
                  </button>
                ))}
              </div>

              {/* Dimension */}
              <label className="quest-label">Linked Dimension</label>
              <select className="quest-input" value={form.dimension_id}
                onChange={e => setForm({ ...form, dimension_id: e.target.value })}>
                <option value="">— None (Global XP only) —</option>
                {dims.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>

              {/* Due Date + Est Hours */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="quest-label">Due Date</label>
                  <input type="date" className="quest-input" value={form.due_date}
                    onChange={e => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div>
                  <label className="quest-label">Estimated Hours</label>
                  <input type="number" min="0" step="0.5" className="quest-input" value={form.est_hours}
                    onChange={e => setForm({ ...form, est_hours: e.target.value })}
                    placeholder="e.g., 4" />
                </div>
              </div>

              {/* Notes */}
              <label className="quest-label">Notes / URL</label>
              <textarea className="quest-input" rows={2} value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Paste a link, add context..." />

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  {editItem ? '💾 Save Changes' : '➕ Add Task'}
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }}
                  onClick={() => { setShowModal(false); resetForm(); }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function TaskCard({ item, num, dims, onEdit, onDelete, onComplete, onStatusChange, onPriorityChange, onMove, isCompleted }) {
  const [showActions, setShowActions] = useState(false);
  const icon = TYPE_ICONS[item.type] || '📝';
  const pCfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.backlog;
  const xp = TYPE_XP[item.type] || 15;

  const isOverdue = item.due_date && new Date(item.due_date) < new Date() && item.status !== 'completed';

  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="quest-card" style={{
      borderLeftColor: isCompleted ? '#34d399' : pCfg.color,
      opacity: isCompleted ? 0.7 : 1,
    }}
    onMouseEnter={() => setShowActions(true)} onMouseLeave={() => setShowActions(false)}>

      {/* Main Row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        {/* Number */}
        <div style={{
          width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, flexShrink: 0,
          background: isCompleted ? 'rgba(52,211,153,0.15)' : `${pCfg.color}18`,
          color: isCompleted ? '#34d399' : pCfg.color,
          border: `1px solid ${isCompleted ? 'rgba(52,211,153,0.3)' : pCfg.border}`,
        }}>
          {isCompleted ? '✓' : `#${num}`}
        </div>

        {/* Icon + Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textDecoration: isCompleted ? 'line-through' : 'none',
            color: isCompleted ? 'var(--text-muted)' : 'var(--text)',
          }}>
            {icon} {item.title}
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-muted)', marginTop: 3, flexWrap: 'wrap' }}>
            {item.dimension_name && (
              <span style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                {item.dimension_name}
              </span>
            )}
            {item.due_date && (
              <span style={{ color: isOverdue ? '#ef4444' : 'var(--text-muted)' }}>
                {isOverdue ? '⚠️' : '📅'} {formatDate(item.due_date)}
              </span>
            )}
            {item.est_hours > 0 && <span>⏱ {item.est_hours}h</span>}
            {item.status === 'ongoing' && <span style={{ color: '#fbbf24' }}>🔄 In Progress</span>}
            {isCompleted && <span style={{ color: '#34d399' }}>+{xp} XP</span>}
          </div>
        </div>
      </div>

      {/* Actions (shown on hover or always on mobile) */}
      <div className="quest-card-actions" style={{ opacity: showActions ? 1 : 0 }}>
        {!isCompleted && (
          <>
            {item.status === 'todo' && (
              <button className="quest-action-btn" title="Start" onClick={() => onStatusChange(item, 'ongoing')}>🚀</button>
            )}
            {item.status === 'ongoing' && (
              <button className="quest-action-btn" title="Complete" onClick={() => onComplete(item)}>✅</button>
            )}

            {/* Priority selector */}
            <select className="quest-priority-select" value={item.priority}
              onChange={e => onPriorityChange(item, e.target.value)} title="Change priority">
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>

            {onMove && (
              <>
                <button className="quest-action-btn" title="Move Up" onClick={() => onMove('up')}>⬆️</button>
                <button className="quest-action-btn" title="Move Down" onClick={() => onMove('down')}>⬇️</button>
              </>
            )}

            <button className="quest-action-btn" title="Edit" onClick={() => onEdit(item)}>✏️</button>
          </>
        )}
        <button className="quest-action-btn" title="Delete" onClick={() => onDelete(item.id)}>🗑️</button>
      </div>
    </div>
  );
}
