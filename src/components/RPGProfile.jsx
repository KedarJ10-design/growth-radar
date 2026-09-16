import { useState, useEffect } from 'react';
import { api } from '../api';

const TIER_COLORS = { mini: '#f59e0b', major: '#ef4444', final: '#8b5cf6' };
const TIER_ICONS = { mini: '⚔️', major: '🐉', final: '💀' };
const QUEST_COLORS = { LIMITED_TIME: '#ef4444', RANDOM: '#3b82f6', REPEATABLE: '#10b981', HIDDEN: '#8b5cf6' };

export default function RPGProfile({ dims }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState('skills'); // skills, log, boss, quests, history
  const [logForm, setLogForm] = useState({ dimension_id: '', tasks: '', difficulty: 'medium' });
  const [logResult, setLogResult] = useState(null);
  const [logLoading, setLogLoading] = useState(false);
  const [bossData, setBossData] = useState(null);
  const [bossLoading, setBossLoading] = useState(false);
  const [bossEvidence, setBossEvidence] = useState('');
  const [bossResult, setBossResult] = useState(null);
  const [bossError, setBossError] = useState('');
  const [questLoading, setQuestLoading] = useState(false);
  const [questResult, setQuestResult] = useState(null);
  const [questError, setQuestError] = useState('');
  const [xpLog, setXpLog] = useState([]);
  const [completeQuestId, setCompleteQuestId] = useState(null);
  const [questEvidence, setQuestEvidence] = useState('');
  const [questSubmitError, setQuestSubmitError] = useState('');
  const [xpHeatmap, setXpHeatmap] = useState([]);
  const [skillNodes, setSkillNodes] = useState([]);
  const [newNodeName, setNewNodeName] = useState({}); // mapped by dimension_id
  const [nodesLoading, setNodesLoading] = useState(false);

  useEffect(() => { loadProfile(); loadSkillNodes(); }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const profile = await api.rpgGetCharacter();
      setData(profile);
    } catch (e) { console.error('RPG Load Error:', e); }
    setLoading(false);
  };

  // ── Log Tasks ──────────────────────────────────────────
  const handleLogTasks = async (e) => {
    e.preventDefault();
    if (!logForm.dimension_id || !logForm.tasks.trim()) return;
    setLogLoading(true);
    setLogResult(null);
    try {
      const tasks = logForm.tasks.split('\n').map(t => t.trim()).filter(Boolean);
      const result = await api.rpgLogTasks({
        dimension_id: logForm.dimension_id,
        tasks_completed: tasks,
        difficulty: logForm.difficulty
      });
      setLogResult(result);
      setLogForm({ dimension_id: '', tasks: '', difficulty: 'medium' });
      loadProfile(); // Refresh stats
    } catch (e) { setLogResult({ error: e.message }); }
    setLogLoading(false);
  };

  // ── Boss Fight ─────────────────────────────────────────
  const handleCheckBoss = async (dimId) => {
    setBossLoading(true);
    setBossData(null);
    setBossResult(null);
    setBossError('');
    try {
      const result = await api.rpgCheckBoss(dimId);
      setBossData(result);
    } catch (e) {
      console.error(e);
      setBossError(e.message || 'Failed to load boss fight. Try again.');
    }
    setBossLoading(false);
  };

  const handleCompleteBoss = async (bossId) => {
    if (!bossEvidence.trim()) return;
    setBossLoading(true);
    try {
      const result = await api.rpgCompleteBoss(bossId, bossEvidence);
      setBossResult(result);
      setBossEvidence('');
      loadProfile();
    } catch (e) { setBossResult({ error: e.message }); }
    setBossLoading(false);
  };

  // ── Side Quests ────────────────────────────────────────
  const handleDiscoverQuest = async () => {
    setQuestLoading(true);
    setQuestResult(null);
    setQuestError('');
    try {
      const result = await api.rpgDiscoverQuest('');
      setQuestResult(result);
      loadProfile();
    } catch (e) {
      console.error(e);
      setQuestError(e.message || 'Failed to discover quest. Try again.');
    }
    setQuestLoading(false);
  };

  const handleCompleteQuest = async (questId) => {
    setQuestLoading(true);
    setQuestSubmitError('');
    try {
      await api.rpgCompleteQuest(questId, questEvidence);
      setCompleteQuestId(null);
      setQuestEvidence('');
      loadProfile();
    } catch (e) {
      console.error(e);
      setQuestSubmitError(e.message || 'Failed to complete quest.');
    }
    setQuestLoading(false);
  };

  // ── XP Log & Heatmap ───────────────────────────────────
  const loadXPLog = async () => {
    try {
      const [log, heatmap] = await Promise.all([
        api.rpgGetXPLog(),
        api.rpgGetHeatmap(180)
      ]);
      setXpLog(log);
      setXpHeatmap(heatmap);
    } catch (e) { console.error(e); }
  };

  // ── Skill Nodes ────────────────────────────────────────
  const loadSkillNodes = async () => {
    try {
      setSkillNodes(await api.rpgGetNodes());
    } catch (e) { console.error(e); }
  };

  const handleAddNode = async (dimId) => {
    const name = newNodeName[dimId];
    if (!name?.trim()) return;
    setNodesLoading(true);
    try {
      await api.rpgAddNode(dimId, name);
      setNewNodeName(prev => ({ ...prev, [dimId]: '' }));
      await loadSkillNodes();
    } catch (e) { console.error(e); }
    setNodesLoading(false);
  };

  const handleCompleteNode = async (nodeId) => {
    setNodesLoading(true);
    try {
      const result = await api.rpgCompleteNode(nodeId);
      if (result.xp_awarded) {
        alert(`🎉 +${result.xp_awarded} XP for completing node!`);
        loadProfile();
      }
      await loadSkillNodes();
    } catch (e) { console.error(e); }
    setNodesLoading(false);
  };

  if (loading || !data) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 40, marginBottom: 12, animation: 'pulse 1.5s infinite' }}>🎮</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Loading RPG Profile…</div>
      </div>
    );
  }

  const { character, stats, streak, available_bosses, active_quests } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Character Card ───────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(59,130,246,0.1))',
        border: '1px solid rgba(139,92,246,0.3)',
        borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: -20, right: -20, fontSize: 120, opacity: 0.05 }}>⚔️</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 900, color: '#fff', flexShrink: 0
          }}>K</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.5px' }}>Kedar</div>
            <div style={{
              display: 'inline-block', padding: '3px 12px', borderRadius: 20,
              background: 'rgba(139,92,246,0.2)', color: '#a78bfa',
              fontSize: 13, fontWeight: 700, marginTop: 4
            }}>{character.character_title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              Total XP: <span style={{ color: '#fbbf24', fontWeight: 700 }}>{character.total_xp.toLocaleString()}</span>
              {' · '}Streak: <span style={{ color: '#ef4444' }}>{streak}🔥</span>
              {streak >= 7 && <span style={{ color: '#10b981', marginLeft: 6, fontWeight: 700 }}>2x XP ACTIVE</span>}
            </div>
          </div>
          {/* Badges */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {character.badges.length > 0
              ? character.badges.map((b, i) => (
                <span key={i} style={{
                  padding: '4px 10px', borderRadius: 12,
                  background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
                  fontSize: 12, fontWeight: 600
                }}>{b}</span>
              ))
              : <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No badges yet — defeat a boss!</span>
            }
          </div>
        </div>
      </div>

      {/* ── Panel Tabs ───────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          ['skills', '📊 Skill Tree'],
          ['boss', `⚔️ Boss Fights${available_bosses.length > 0 ? ` (${available_bosses.length})` : ''}`],
          ['quests', `🗺️ Side Quests${active_quests.length > 0 ? ` (${active_quests.length})` : ''}`],
          ['history', '📜 XP History']
        ].map(([id, label]) => (
          <button key={id}
            onClick={() => { setActivePanel(id); if (id === 'history') loadXPLog(); }}
            style={{
              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              border: activePanel === id ? '1px solid rgba(139,92,246,0.5)' : '1px solid var(--border)',
              background: activePanel === id ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.04)',
              color: activePanel === id ? '#a78bfa' : 'var(--text-muted)', cursor: 'pointer',
              transition: 'all 0.2s'
            }}>{label}</button>
        ))}
      </div>

      {/* ── Skill Tree Panel ─────────────────────────────── */}
      {activePanel === 'skills' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            padding: '12px 16px', borderRadius: 10,
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
            fontSize: 13, color: '#60a5fa', lineHeight: 1.5
          }}>
            💡 <strong>XP is earned automatically</strong> when you complete tasks in the <strong>📝 Daily Log</strong> tab.
            Your Radar scores auto-update when your RPG level increases!
          </div>
          {stats.map(s => (
            <div key={s.dimension_id} style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 16, transition: 'all 0.2s'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{s.name}</span>
                  <span style={{
                    marginLeft: 8, padding: '2px 8px', borderRadius: 8,
                    background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                    fontSize: 11, fontWeight: 700
                  }}>Lv.{s.level} {s.level_title}</span>
                  {s.xp_bonus_pct > 0 && (
                    <span style={{
                      marginLeft: 6, padding: '2px 8px', borderRadius: 8,
                      background: 'rgba(251,191,36,0.15)', color: '#fbbf24',
                      fontSize: 11, fontWeight: 700
                    }}>+{s.xp_bonus_pct}% 🏆</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {s.total_xp} XP
                  {s.boss_available && (
                    <span style={{ marginLeft: 8, color: '#f59e0b', cursor: 'pointer' }}
                      onClick={() => { setActivePanel('boss'); handleCheckBoss(s.dimension_id); }}>
                      ⚔️ Boss Ready!
                    </span>
                  )}
                </div>
              </div>
              {/* XP Progress Bar */}
              <div style={{
                height: 8, borderRadius: 4,
                background: 'rgba(255,255,255,0.06)', overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  width: `${s.progress_pct}%`,
                  background: s.level >= 10
                    ? 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                    : 'linear-gradient(90deg, #8b5cf6, #3b82f6)',
                  transition: 'width 0.5s ease'
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {s.level >= 10 ? '🏆 MAX LEVEL' : `${s.xp_in_level} / ${s.xp_span} XP to Level ${s.level + 1}`}
              </div>

              {/* Skill Tree Nodes */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Path of Mastery</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {skillNodes.filter(n => n.dimension_id === s.dimension_id).map(node => (
                    <div key={node.id} style={{
                      padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                      background: node.is_completed ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${node.is_completed ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                      color: node.is_completed ? '#10b981' : '#f8fafc',
                      display: 'flex', alignItems: 'center', gap: 6,
                      boxShadow: node.is_completed ? '0 0 10px rgba(16,185,129,0.2)' : 'none'
                    }}>
                      {node.name}
                      {!node.is_completed && (
                        <button onClick={() => handleCompleteNode(node.id)} disabled={nodesLoading} title="Mark as Completed"
                          style={{ border: 'none', background: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10, transition: 'background 0.2s' }}>
                          ✓
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {/* Add Custom Node */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input type="text" placeholder="+ Add custom learning node (e.g. Master React Hooks)..."
                    value={newNodeName[s.dimension_id] || ''}
                    onChange={e => setNewNodeName(p => ({ ...p, [s.dimension_id]: e.target.value }))}
                    style={{ flex: 1, padding: '6px 12px', borderRadius: 6, background: 'rgba(0,0,0,0.2)', border: '1px dashed rgba(255,255,255,0.2)', color: '#fff', fontSize: 12 }} />
                  <button onClick={() => handleAddNode(s.dimension_id)} disabled={nodesLoading || !newNodeName[s.dimension_id]?.trim()}
                    style={{ padding: '6px 14px', borderRadius: 6, background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: (!newNodeName[s.dimension_id]?.trim() || nodesLoading) ? 0.5 : 1 }}>
                    Add
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Log Tasks Panel ──────────────────────────────── */}
      {activePanel === 'log' && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>⚡ Log Completed Tasks</h3>
          <form onSubmit={handleLogTasks} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <select value={logForm.dimension_id}
              onChange={e => setLogForm(f => ({ ...f, dimension_id: e.target.value }))}
              style={{
                padding: '10px 14px', borderRadius: 10, fontSize: 14,
                background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                color: 'var(--text)', appearance: 'none'
              }}>
              <option value="">Select Dimension…</option>
              {dims.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            <textarea value={logForm.tasks}
              onChange={e => setLogForm(f => ({ ...f, tasks: e.target.value }))}
              placeholder="What did you complete? (one task per line)&#10;e.g., Solved 2 LeetCode mediums on arrays&#10;Revised binary search patterns"
              rows={4}
              style={{
                padding: '10px 14px', borderRadius: 10, fontSize: 14,
                background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                color: 'var(--text)', resize: 'vertical', fontFamily: 'inherit'
              }} />

            <div style={{ display: 'flex', gap: 8 }}>
              {['easy', 'medium', 'hard'].map(d => (
                <button key={d} type="button"
                  onClick={() => setLogForm(f => ({ ...f, difficulty: d }))}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.2s',
                    border: logForm.difficulty === d ? '1px solid' : '1px solid var(--border)',
                    background: logForm.difficulty === d
                      ? d === 'easy' ? 'rgba(16,185,129,0.15)' : d === 'medium' ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)'
                      : 'rgba(255,255,255,0.04)',
                    borderColor: logForm.difficulty === d
                      ? d === 'easy' ? '#10b981' : d === 'medium' ? '#3b82f6' : '#ef4444'
                      : 'var(--border)',
                    color: logForm.difficulty === d
                      ? d === 'easy' ? '#10b981' : d === 'medium' ? '#3b82f6' : '#ef4444'
                      : 'var(--text-muted)'
                  }}>
                  {d} ({d === 'easy' ? '10' : d === 'medium' ? '25' : '50'} XP)
                </button>
              ))}
            </div>

            <button type="submit" disabled={logLoading || !logForm.dimension_id || !logForm.tasks.trim()}
              style={{
                padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', color: '#fff',
                border: 'none', cursor: 'pointer', opacity: logLoading ? 0.6 : 1
              }}>
              {logLoading ? '⏳ Calculating XP…' : '⚡ Log & Earn XP'}
            </button>
          </form>

          {/* XP Result */}
          {logResult && !logResult.error && (
            <div style={{
              marginTop: 20, padding: 20, borderRadius: 12,
              background: logResult.level_up
                ? 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.1))'
                : 'rgba(16,185,129,0.08)',
              border: `1px solid ${logResult.level_up ? 'rgba(251,191,36,0.3)' : 'rgba(16,185,129,0.2)'}`
            }}>
              {logResult.level_up && (
                <div style={{
                  fontSize: 24, fontWeight: 900, textAlign: 'center', marginBottom: 12,
                  color: '#fbbf24', animation: 'pulse 1s infinite'
                }}>
                  🎉 LEVEL UP! → Lv.{logResult.new_level} {logResult.new_title}
                </div>
              )}
              <div style={{ fontSize: 28, fontWeight: 900, color: '#10b981', textAlign: 'center' }}>
                +{logResult.total_xp_earned} XP
              </div>
              {logResult.multiplier_reasons?.length > 0 && (
                <div style={{ textAlign: 'center', marginTop: 6 }}>
                  {logResult.multiplier_reasons.map((r, i) => (
                    <span key={i} style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 8, margin: '2px 4px',
                      background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontSize: 12, fontWeight: 600
                    }}>{r}</span>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                {logResult.streak_status}
              </div>
              {logResult.game_master_message && (
                <div style={{
                  marginTop: 16, padding: 14, borderRadius: 10,
                  background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                  fontSize: 14, fontStyle: 'italic', lineHeight: 1.5, color: '#c4b5fd'
                }}>
                  🎮 {logResult.game_master_message}
                </div>
              )}
              {logResult.suggestion && (
                <div style={{ marginTop: 10, fontSize: 13, color: '#60a5fa' }}>
                  💡 <strong>Next:</strong> {logResult.suggestion}
                </div>
              )}
              {logResult.boss_unlocked && (
                <div style={{
                  marginTop: 14, padding: 12, borderRadius: 10,
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                  fontSize: 13, fontWeight: 700, color: '#f59e0b', textAlign: 'center'
                }}>
                  ⚔️ BOSS UNLOCKED: {logResult.boss_unlocked.boss_name}
                </div>
              )}
            </div>
          )}
          {logResult?.error && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
              ❌ {logResult.error}
            </div>
          )}
        </div>
      )}

      {/* ── Boss Fight Panel ─────────────────────────────── */}
      {activePanel === 'boss' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Active Bosses Overview (if any are available) */}
          {available_bosses?.length > 0 && !bossData && !bossLoading && (
            <div style={{ marginBottom: 8 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>🚨 Active Bosses Awaiting You</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {available_bosses.map(b => (
                  <div key={b.id} style={{ 
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(153,27,27,0.1))',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 12, padding: 16,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#f87171' }}>{b.boss_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {b.dimension_name} · <span style={{ textTransform: 'capitalize' }}>{b.boss_tier}</span> Boss
                      </div>
                    </div>
                    <button onClick={() => handleCheckBoss(b.dimension_id)} 
                      style={{ 
                        padding: '8px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.2)', 
                        color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)', 
                        fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
                      }}>
                        Face Boss ⚔️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Boss Selection */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 20
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>⚔️ Check Boss Availability</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {dims.map(d => (
                <button key={d.id} onClick={() => handleCheckBoss(d.id)}
                  style={{
                    padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                    color: 'var(--text)', cursor: 'pointer', transition: 'all 0.2s'
                  }}>{d.name}</button>
              ))}
            </div>
          </div>

          {bossLoading && (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 14 }}>
              ⚔️ Summoning boss… (this may take a few seconds)
            </div>
          )}

          {bossError && !bossLoading && (
            <div style={{
              padding: 16, borderRadius: 12,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171', fontSize: 13, textAlign: 'center'
            }}>
              ❌ {bossError}
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                Click a dimension above to try again.
              </div>
            </div>
          )}

          {bossData && !bossLoading && (
            <div style={{
              background: bossData.boss_available
                ? 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(153,27,27,0.1))'
                : 'var(--card)',
              border: `1px solid ${bossData.boss_available ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
              borderRadius: 16, padding: 24
            }}>
              {bossData.boss_available ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <span style={{ fontSize: 36 }}>{TIER_ICONS[bossData.boss?.boss_tier] || '⚔️'}</span>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: TIER_COLORS[bossData.boss?.boss_tier] || '#f59e0b' }}>
                        {bossData.boss?.boss_name}
                      </div>
                      <span style={{
                        padding: '2px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: `${TIER_COLORS[bossData.boss?.boss_tier]}20`,
                        color: TIER_COLORS[bossData.boss?.boss_tier], textTransform: 'uppercase'
                      }}>{bossData.boss?.boss_tier} Boss · {bossData.boss?.reward_xp} XP</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)', margin: '0 0 16px' }}>
                    {bossData.boss?.description}
                  </p>
                  {bossData.boss?.rules?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>RULES:</div>
                      {bossData.boss.rules.map((r, i) => (
                        <div key={i} style={{ fontSize: 13, color: '#f87171', marginBottom: 4 }}>• {r}</div>
                      ))}
                    </div>
                  )}
                  {bossData.boss?.badge_reward && (
                    <div style={{ fontSize: 13, marginBottom: 16 }}>
                      🏆 <strong>Reward:</strong> {bossData.boss.badge_reward} + {bossData.boss.reward_xp} XP + permanent +10% XP
                    </div>
                  )}
                  {bossData.game_master_message && (
                    <div style={{
                      padding: 14, borderRadius: 10, marginBottom: 16,
                      background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)',
                      fontSize: 14, fontStyle: 'italic', color: '#c4b5fd'
                    }}>🎮 {bossData.game_master_message}</div>
                  )}
                  {/* Evidence submission */}
                  {!bossResult && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={bossEvidence}
                        onChange={e => setBossEvidence(e.target.value)}
                        placeholder="Describe how you defeated the boss (evidence)…"
                        style={{
                          flex: 1, padding: '10px 14px', borderRadius: 10, fontSize: 14,
                          background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                          color: 'var(--text)'
                        }} />
                      <button onClick={() => handleCompleteBoss(bossData.boss.id)}
                        disabled={!bossEvidence.trim() || bossLoading}
                        style={{
                          padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                          background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                          color: '#fff', border: 'none', cursor: 'pointer',
                          opacity: bossLoading ? 0.7 : 1
                        }}>
                        {bossLoading ? '⚖️ Game Master Judging...' : '⚔️ Claim Victory'}
                      </button>
                    </div>
                  )}
                  {bossResult && bossResult.error && (
                    <div style={{
                      marginTop: 16, padding: 16, borderRadius: 12,
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                      color: '#fca5a5', fontSize: 14
                    }}>
                      <div style={{ fontWeight: 800, marginBottom: 4 }}>❌ Claim Rejected</div>
                      {bossResult.error}
                      <div style={{ marginTop: 12 }}>
                        <button onClick={() => setBossResult(null)}
                          style={{
                            padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            background: 'rgba(239,68,68,0.2)', color: '#fca5a5', border: 'none', cursor: 'pointer'
                          }}>Try Again</button>
                      </div>
                    </div>
                  )}
                  {bossResult && !bossResult.error && (
                    <div style={{
                      marginTop: 16, padding: 20, borderRadius: 12, textAlign: 'center',
                      background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(16,185,129,0.1))',
                      border: '1px solid rgba(251,191,36,0.3)'
                    }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: '#fbbf24', marginBottom: 8 }}>
                        🏆 BOSS DEFEATED!
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>+{bossResult.xp_awarded} XP</div>
                      {bossResult.badge_earned && (
                        <div style={{ fontSize: 14, color: '#fbbf24', marginTop: 6 }}>Badge: {bossResult.badge_earned}</div>
                      )}
                      <div style={{ fontSize: 12, color: '#a78bfa', marginTop: 6 }}>{bossResult.permanent_bonus}</div>
                      {bossResult.game_master_message && (
                        <div style={{
                          marginTop: 12, padding: 12, borderRadius: 10,
                          background: 'rgba(139,92,246,0.08)', fontSize: 14, fontStyle: 'italic', color: '#c4b5fd'
                        }}>🎮 {bossResult.game_master_message}</div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{bossData.game_master_message}</div>
                  {bossData.next_boss_at && (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#60a5fa' }}>Next boss at: {bossData.next_boss_at}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Side Quests Panel ────────────────────────────── */}
      {activePanel === 'quests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>🗺️ Quest Board</h3>
            <button onClick={handleDiscoverQuest} disabled={questLoading}
              style={{
                padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', color: '#fff',
                border: 'none', cursor: 'pointer', opacity: questLoading ? 0.6 : 1
              }}>
              {questLoading ? '🔮 Discovering…' : '🔮 Discover New Quest'}
            </button>
          </div>

          {questError && !questLoading && (
            <div style={{
              padding: 16, borderRadius: 12,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#f87171', fontSize: 13, textAlign: 'center'
            }}>
              ❌ {questError}
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                Click "Discover New Quest" to try again.
              </div>
            </div>
          )}

          {questResult && !questResult.error && (
            <div style={{
              padding: 16, borderRadius: 12,
              background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)'
            }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{questResult.quest?.quest_name}</div>
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 8, marginTop: 4,
                background: `${QUEST_COLORS[questResult.quest?.quest_type]}15`,
                color: QUEST_COLORS[questResult.quest?.quest_type],
                fontSize: 11, fontWeight: 700
              }}>{questResult.quest?.quest_type} · {questResult.quest?.difficulty}</span>
              <p style={{ fontSize: 13, marginTop: 8, color: 'var(--text)', lineHeight: 1.5 }}>
                {questResult.quest?.description}
              </p>
              <div style={{ fontSize: 13, color: '#fbbf24', marginTop: 6 }}>
                Reward: {questResult.quest?.xp_reward} XP {questResult.quest?.badge_reward && `+ ${questResult.quest.badge_reward}`}
              </div>
              {questResult.game_master_message && (
                <div style={{
                  marginTop: 10, padding: 10, borderRadius: 8,
                  background: 'rgba(139,92,246,0.08)', fontSize: 13, fontStyle: 'italic', color: '#c4b5fd'
                }}>🎮 {questResult.game_master_message}</div>
              )}
            </div>
          )}

          {/* Active Quests */}
          {active_quests.length > 0 ? (
            active_quests.map(q => (
              <div key={q.id} style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 16
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{q.quest_name}</span>
                    <span style={{
                      marginLeft: 8, padding: '2px 8px', borderRadius: 8,
                      background: `${QUEST_COLORS[q.quest_type]}15`,
                      color: QUEST_COLORS[q.quest_type],
                      fontSize: 11, fontWeight: 700
                    }}>{q.quest_type}</span>
                  </div>
                  <span style={{ fontSize: 13, color: '#fbbf24', fontWeight: 700 }}>{q.xp_reward} XP</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '8px 0', lineHeight: 1.4 }}>{q.description}</p>
                {completeQuestId === q.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={questEvidence} onChange={e => setQuestEvidence(e.target.value)}
                        placeholder="Evidence of completion…"
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 13,
                          background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)',
                          color: 'var(--text)'
                        }} />
                      <button onClick={() => handleCompleteQuest(q.id)} disabled={!questEvidence.trim() || questLoading}
                        style={{
                          padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                          background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer',
                          opacity: questLoading ? 0.7 : 1
                        }}>
                        {questLoading ? '⚖️ Judging...' : '✓ Complete'}
                      </button>
                    </div>
                    {questSubmitError && (
                      <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', color: '#fca5a5', fontSize: 12, border: '1px solid rgba(239,68,68,0.2)' }}>
                        ❌ {questSubmitError}
                      </div>
                    )}
                  </div>
                ) : (
                  <button onClick={() => {
                    setCompleteQuestId(q.id);
                    setQuestSubmitError('');
                  }}
                    style={{
                      marginTop: 8, padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                      color: '#10b981', cursor: 'pointer'
                    }}>Mark Complete</button>
                )}
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>
              No active quests. Click "Discover New Quest" to get one!
            </div>
          )}
        </div>
      )}

      {/* ── XP History Panel ─────────────────────────────── */}
      {activePanel === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* XP Heatmap */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, overflowX: 'auto' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              180-Day XP Contribution Grid
            </h3>
            
            {(() => {
              // Build array of last 180 days
              const today = new Date();
              const dates = [];
              for (let i = 179; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(today.getDate() - i);
                dates.push(d.toISOString().split('T')[0]);
              }
              
              // Pad the start so the grid aligns with Sunday at the top row
              const startDate = new Date(dates[0]);
              const padDays = startDate.getDay();
              const paddedDates = Array(padDays).fill(null).concat(dates);
              
              const xpMap = {};
              xpHeatmap.forEach(x => { xpMap[x.date] = x.total_xp; });

              // Generate month labels
              const months = [];
              let currentMonth = -1;
              for (let i = 0; i < paddedDates.length; i += 7) {
                const dateStr = paddedDates[i] || paddedDates[i + 6]; // First day of week or end if padded
                if (!dateStr) continue;
                const d = new Date(dateStr);
                const m = d.getMonth();
                if (m !== currentMonth) {
                  months.push({ label: d.toLocaleString('default', { month: 'short' }), index: i / 7 });
                  currentMonth = m;
                }
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Month Labels */}
                  <div style={{ display: 'flex', position: 'relative', height: 16, fontSize: 10, color: 'var(--text-muted)' }}>
                    {/* Add padding for days-of-week column */}
                    <div style={{ width: 28 }} />
                    <div style={{ flex: 1, position: 'relative' }}>
                      {months.map((m, i) => (
                        <div key={i} style={{ position: 'absolute', left: m.index * 18 }}>
                          {m.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gap: 4, fontSize: 10, color: 'var(--text-muted)', textAlign: 'right', paddingRight: 4, width: 20 }}>
                      <div style={{ visibility: 'hidden', height: 14 }}>Sun</div>
                      <div style={{ height: 14 }}>Mon</div>
                      <div style={{ visibility: 'hidden', height: 14 }}>Tue</div>
                      <div style={{ height: 14 }}>Wed</div>
                      <div style={{ visibility: 'hidden', height: 14 }}>Thu</div>
                      <div style={{ height: 14 }}>Fri</div>
                      <div style={{ visibility: 'hidden', height: 14 }}>Sat</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateRows: 'repeat(7, 1fr)', gridAutoFlow: 'column', gap: 4 }}>
                      {paddedDates.map((dateStr, i) => {
                        if (!dateStr) return <div key={`pad-${i}`} style={{ width: 14, height: 14 }} />;
                        
                        const total_xp = xpMap[dateStr] || 0;
                        let alpha = 0.05;
                        let borderColor = '1px solid rgba(255,255,255,0.05)';
                        if (total_xp > 0) { alpha = 0.3; borderColor = 'none'; }
                        if (total_xp >= 150) { alpha = 0.6; borderColor = 'none'; }
                        if (total_xp >= 300) { alpha = 0.8; borderColor = 'none'; }
                        if (total_xp >= 500) { alpha = 1.0; borderColor = 'none'; }
                        
                        return (
                          <div key={dateStr} title={`${dateStr}: ${total_xp} XP`} style={{
                            width: 14, height: 14, borderRadius: 3,
                            background: `rgba(16, 185, 129, ${alpha})`,
                            border: borderColor
                          }} />
                        );
                      })}
                    </div>
                  </div>

                  {/* Legend */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    <span>Less</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(255,255,255,0.05)' }} />
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(16, 185, 129, 0.3)' }} />
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(16, 185, 129, 0.6)' }} />
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(16, 185, 129, 0.8)' }} />
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(16, 185, 129, 1.0)' }} />
                    </div>
                    <span>More</span>
                  </div>
                </div>
              );
            })()}
          </div>

          <h3 style={{ margin: '0 0 0', fontSize: 16, fontWeight: 800 }}>📜 XP Transaction Log</h3>
          {xpLog.length > 0 ? xpLog.map(entry => (
            <div key={entry.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderRadius: 10,
              background: 'var(--card)', border: '1px solid var(--border)'
            }}>
              <div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  {entry.source === 'task' ? '⚡' : entry.source === 'boss' ? '⚔️' : entry.source === 'side_quest' ? '🗺️' : entry.source === 'daily_log' ? '📝' : '🔄'}
                  {' '}{entry.dimension_name || 'Global'}
                </span>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{entry.description}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981' }}>+{entry.xp_amount}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {new Date(entry.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </div>
              </div>
            </div>
          )) : (
            <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: 13 }}>
              No XP transactions yet. Start logging tasks!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
