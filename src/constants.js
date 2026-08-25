// Shared constants used across components
export const CATS = {
  Technical:     { color: '#6366f1', light: 'rgba(99,102,241,0.12)' },
  'Soft Skills': { color: '#10b981', light: 'rgba(16,185,129,0.12)' },
  Portfolio:     { color: '#f59e0b', light: 'rgba(245,158,11,0.12)' },
  Habits:        { color: '#ef4444', light: 'rgba(239,68,68,0.12)' },
  Other:         { color: '#8b5cf6', light: 'rgba(139,92,246,0.12)' },
};

export const catColor = (c) => (CATS[c] || CATS.Other).color;
export const catLight = (c) => (CATS[c] || CATS.Other).light;
export const scoreHue = (s) => s <= 3 ? '#ef4444' : s <= 5 ? '#f59e0b' : s <= 7 ? '#818cf8' : '#10b981';

export function todayStr() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}
