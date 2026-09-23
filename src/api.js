const API = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${API}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include', // Send cookies with requests
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  // Handle blob responses (export)
  if (options.responseType === 'blob') return res.blob();
  return res.json();
}

export const api = {
  // Auth
  checkAuth: () => request('/auth/check'),
  login: (pin) => request('/auth/login', { method: 'POST', body: JSON.stringify({ pin }) }),

  // Dimensions
  getDimensions: () => request('/dimensions'),
  addDimension: (data) => request('/dimensions', { method: 'POST', body: JSON.stringify(data) }),
  updateDimension: (id, data) => request(`/dimensions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDimension: (id) => request(`/dimensions/${id}`, { method: 'DELETE' }),

  // Snapshots
  getSnapshots: () => request('/snapshots'),
  createSnapshot: () => request('/snapshots', { method: 'POST' }),

  // Daily Logs
  getDailyLogs: (date) => request(`/daily-log/${date}`),
  addDailyLog: (data) => request('/daily-log', { method: 'POST', body: JSON.stringify(data) }),
  toggleDailyLog: (id) => request(`/daily-log/${id}/toggle`, { method: 'PUT' }),
  deleteDailyLog: (id) => request(`/daily-log/${id}`, { method: 'DELETE' }),
  getStreak: () => request('/daily-log-streak'),

  // AI Schedule
  generateSchedule: (data) => request('/schedule/generate', { method: 'POST', body: JSON.stringify(data) }),
  getSchedules: () => request('/schedules'),
  syncCalendar: (schedule, date) => request('/calendar/add', { method: 'POST', body: JSON.stringify({ schedule, date }) }),

  // Stats
  getStats: () => request('/stats'),

  // Export — triggers download
  exportData: async (format) => {
    const res = await fetch(`${API}/export/${format}`);
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `growth-radar-${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // ── RPG ──────────────────────────────────────────────────
  rpgGetCharacter: () => request('/rpg/character'),
  rpgGetStats: () => request('/rpg/stats'),
  rpgLogTasks: (data) => request('/rpg/log-tasks', { method: 'POST', body: JSON.stringify(data) }),
  rpgCheckBoss: (dimId) => request('/rpg/check-boss', { method: 'POST', body: JSON.stringify({ dimension_id: dimId }) }),
  rpgCompleteBoss: (bossId, evidence) => request('/rpg/complete-boss', { method: 'POST', body: JSON.stringify({ boss_id: bossId, evidence }) }),
  rpgDiscoverQuest: (recentActivity) => request('/rpg/side-quest/discover', { method: 'POST', body: JSON.stringify({ recent_activity: recentActivity }) }),
  rpgCompleteQuest: (questId, evidence) => request('/rpg/side-quest/complete', { method: 'POST', body: JSON.stringify({ quest_id: questId, evidence }) }),
  rpgGetQuests: (status) => request(`/rpg/side-quests${status ? `?status=${status}` : ''}`),
  rpgGetXPLog: (dimId) => request(`/rpg/xp-log${dimId ? `?dimension_id=${dimId}` : ''}`),
  rpgGetBosses: () => request('/rpg/bosses'),
  rpgGetHeatmap: (days) => request(`/rpg/heatmap?days=${days || 90}`),
  rpgGetNodes: (dimId) => request(`/rpg/nodes${dimId ? `?dimension_id=${dimId}` : ''}`),
  rpgAddNode: (dimId, name) => request('/rpg/nodes', { method: 'POST', body: JSON.stringify({ dimension_id: dimId, name }) }),
  rpgCompleteNode: (nodeId) => request(`/rpg/nodes/${nodeId}/complete`, { method: 'POST' }),

  // ── Quest Stack ──────────────────────────────────────────
  getQuestStack: (status) => request(`/quest-stack${status ? `?status=${status}` : ''}`),
  addQuestItem: (data) => request('/quest-stack', { method: 'POST', body: JSON.stringify(data) }),
  updateQuestItem: (id, data) => request(`/quest-stack/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteQuestItem: (id) => request(`/quest-stack/${id}`, { method: 'DELETE' }),
  completeQuestItem: (id) => request(`/quest-stack/${id}/complete`, { method: 'POST' }),
  reorderQuestStack: (updates) => request('/quest-stack/reorder', { method: 'PUT', body: JSON.stringify({ updates }) }),
};
