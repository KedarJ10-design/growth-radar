import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const dbUrl = process.env.TURSO_DB_URL || `file:${path.join(DATA_DIR, 'growth.db')}`;

export const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// ── Schema ────────────────────────────────────────────────
export async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS dimensions (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      category   TEXT NOT NULL DEFAULT 'Other',
      score      INTEGER NOT NULL DEFAULT 5 CHECK(score >= 0 AND score <= 10),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS daily_logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         TEXT NOT NULL,
      dimension_id TEXT,
      activity     TEXT NOT NULL,
      duration_min INTEGER DEFAULT 0,
      notes        TEXT DEFAULT '',
      completed    INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL,
      schedule   TEXT NOT NULL,
      insight    TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  await seedDefaults();
}

// ── Default Dimensions Seed ────────────────────────────────
const DEFAULT_DIMS = [
  { id: 'fs',    name: 'Full Stack',     category: 'Technical',   score: 7 },
  { id: 'ai',    name: 'AI / GenAI',     category: 'Technical',   score: 6 },
  { id: 'dsa',   name: 'DSA',            category: 'Technical',   score: 4 },
  { id: 'sd',    name: 'System Design',  category: 'Technical',   score: 3 },
  { id: 'mob',   name: 'Flutter',        category: 'Technical',   score: 5 },
  { id: 'sec',   name: 'Cybersecurity',  category: 'Technical',   score: 4 },
  { id: 'java',  name: 'Java/Backend',   category: 'Technical',   score: 4 },
  { id: 'con',   name: 'Consistency',    category: 'Soft Skills', score: 3 },
  { id: 'comm',  name: 'Communication',  category: 'Soft Skills', score: 6 },
  { id: 'focus', name: 'Goal Focus',     category: 'Soft Skills', score: 5 },
  { id: 'net',   name: 'Networking',     category: 'Soft Skills', score: 3 },
  { id: 'int',   name: 'Interview Prep', category: 'Soft Skills', score: 4 },
  { id: 'proj',  name: 'MahaYatri',      category: 'Portfolio',   score: 7 },
  { id: 'li',    name: 'LinkedIn',       category: 'Portfolio',   score: 4 },
  { id: 'gh',    name: 'GitHub',         category: 'Portfolio',   score: 5 },
];

async function seedDefaults() {
  const result = await db.execute('SELECT COUNT(*) as c FROM dimensions');
  const count = result.rows[0].c;
  
  if (count === 0) {
    // Transaction-like approach for libSQL
    const statements = DEFAULT_DIMS.map((d, i) => ({
      sql: 'INSERT INTO dimensions (id, name, category, score, sort_order) VALUES (?, ?, ?, ?, ?)',
      args: [d.id, d.name, d.category, d.score, i]
    }));
    await db.batch(statements, 'write');
  }
}

// ── Dimension Queries ──────────────────────────────────────
export async function getAllDimensions() {
  const result = await db.execute('SELECT * FROM dimensions ORDER BY sort_order ASC, created_at ASC');
  return result.rows;
}

export async function addDimension({ id, name, category, score }) {
  const r1 = await db.execute('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM dimensions');
  const maxOrder = r1.rows[0].next;
  await db.execute({
    sql: 'INSERT INTO dimensions (id, name, category, score, sort_order) VALUES (?, ?, ?, ?, ?)',
    args: [id, name, category, score, maxOrder]
  });
  return getDimension(id);
}

export async function getDimension(id) {
  const result = await db.execute({
    sql: 'SELECT * FROM dimensions WHERE id = ?',
    args: [id]
  });
  return result.rows[0];
}

export async function updateDimension(id, fields) {
  const allowed = ['name', 'category', 'score', 'sort_order'];
  const updates = [];
  const args = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) {
      updates.push(`${k} = ?`);
      args.push(v);
    }
  }
  if (updates.length === 0) return getDimension(id);
  updates.push("updated_at = datetime('now','localtime')");
  args.push(id);
  await db.execute({
    sql: `UPDATE dimensions SET ${updates.join(', ')} WHERE id = ?`,
    args
  });
  return getDimension(id);
}

export async function deleteDimension(id) {
  await db.execute({
    sql: 'DELETE FROM dimensions WHERE id = ?',
    args: [id]
  });
}

// ── Snapshot Queries ───────────────────────────────────────
export async function getAllSnapshots() {
  const result = await db.execute('SELECT * FROM snapshots ORDER BY created_at DESC LIMIT 50');
  return result.rows.map(s => ({ ...s, data: JSON.parse(s.data) }));
}

export async function createSnapshot() {
  const dims = await getAllDimensions();
  const date = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const data = dims.map(d => ({ id: d.id, score: d.score }));
  const result = await db.execute({
    sql: 'INSERT INTO snapshots (date, data) VALUES (?, ?)',
    args: [date, JSON.stringify(data)]
  });
  return { id: Number(result.lastInsertRowid), date, data };
}

// ── Daily Log Queries ──────────────────────────────────────
export async function getDailyLogs(date) {
  const result = await db.execute({
    sql: `
      SELECT l.*, d.name as dimension_name, d.category as dimension_category 
      FROM daily_logs l 
      LEFT JOIN dimensions d ON l.dimension_id = d.id 
      WHERE l.date = ?
      ORDER BY l.id ASC
    `,
    args: [date]
  });
  return result.rows;
}

// AI Memory Helper: Get recent logs for specific dimensions (regardless of how many days ago)
export async function getRecentLogsForDims(dimIds, limit = 15) {
  if (!dimIds || dimIds.length === 0) return [];
  const placeholders = dimIds.map(() => '?').join(',');
  const result = await db.execute({
    sql: `
      SELECT l.date, l.activity, l.duration_min, l.notes, l.completed, d.name as dimension_name 
      FROM daily_logs l 
      JOIN dimensions d ON l.dimension_id = d.id 
      WHERE l.dimension_id IN (${placeholders})
      ORDER BY l.date DESC, l.id DESC
      LIMIT ?
    `,
    args: [...dimIds, limit]
  });
  return result.rows;
}

export async function addDailyLog({ date, dimension_id, activity, duration_min, notes }) {
  const result = await db.execute({
    sql: 'INSERT INTO daily_logs (date, dimension_id, activity, duration_min, notes, completed) VALUES (?, ?, ?, ?, ?, 0)',
    args: [date, dimension_id || null, activity, duration_min || 0, notes || '']
  });
  const getRes = await db.execute({
    sql: 'SELECT dl.*, d.name as dim_name, d.category as dim_category FROM daily_logs dl LEFT JOIN dimensions d ON dl.dimension_id = d.id WHERE dl.id = ?',
    args: [Number(result.lastInsertRowid)]
  });
  return getRes.rows[0];
}

export async function toggleDailyLog(id) {
  await db.execute({
    sql: 'UPDATE daily_logs SET completed = CASE WHEN completed = 1 THEN 0 ELSE 1 END WHERE id = ?',
    args: [id]
  });
  const getRes = await db.execute({
    sql: 'SELECT dl.*, d.name as dim_name, d.category as dim_category FROM daily_logs dl LEFT JOIN dimensions d ON dl.dimension_id = d.id WHERE dl.id = ?',
    args: [id]
  });
  return getRes.rows[0];
}

export async function deleteDailyLog(id) {
  await db.execute({
    sql: 'DELETE FROM daily_logs WHERE id = ?',
    args: [id]
  });
}

export async function getStreak() {
  const result = await db.execute(`
    SELECT DISTINCT date FROM daily_logs
    WHERE completed = 1
    ORDER BY date DESC
  `);
  const rows = result.rows;

  if (rows.length === 0) return { streak: 0, total_logs: 0 };

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < rows.length; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() - i);
    const checkStr = checkDate.toISOString().split('T')[0];
    if (rows.some(r => r.date === checkStr)) {
      streak++;
    } else {
      break;
    }
  }

  const r2 = await db.execute('SELECT COUNT(*) as c FROM daily_logs WHERE completed = 1');
  const totalLogs = r2.rows[0].c;
  return { streak, total_logs: totalLogs };
}

// ── Schedule Queries ───────────────────────────────────────
export async function saveSchedule({ date, schedule, insight }) {
  const result = await db.execute({
    sql: 'INSERT INTO schedules (date, schedule, insight) VALUES (?, ?, ?)',
    args: [date, JSON.stringify(schedule), insight || '']
  });
  return { id: Number(result.lastInsertRowid) };
}

export async function getSchedules() {
  const result = await db.execute('SELECT * FROM schedules ORDER BY created_at DESC LIMIT 20');
  return result.rows.map(s => ({ ...s, schedule: JSON.parse(s.schedule) }));
}

// AI Memory Helper: Get recent schedules overall to prevent repeating exact blocks
export async function getRecentSchedulesLimit(limit = 3) {
  const result = await db.execute({
    sql: 'SELECT date, schedule FROM schedules ORDER BY date DESC LIMIT ?',
    args: [limit]
  });
  return result.rows;
}

// ── Stats ──────────────────────────────────────────────────
export async function getStats() {
  const rDims = await db.execute('SELECT COUNT(*) as c FROM dimensions');
  const rSnaps = await db.execute('SELECT COUNT(*) as c FROM snapshots');
  const rLogs = await db.execute('SELECT COUNT(*) as c FROM daily_logs');
  const rComp = await db.execute('SELECT COUNT(*) as c FROM daily_logs WHERE completed = 1');
  const rSched = await db.execute('SELECT COUNT(*) as c FROM schedules');
  const rAvg = await db.execute('SELECT ROUND(AVG(score), 1) as avg FROM dimensions');
  
  return { 
    dims: rDims.rows[0].c, 
    snaps: rSnaps.rows[0].c, 
    logs: rLogs.rows[0].c, 
    completed: rComp.rows[0].c, 
    schedules: rSched.rows[0].c, 
    avgScore: rAvg.rows[0].avg || 0 
  };
}

// ── Settings ───────────────────────────────────────────────
export async function getSetting(key) {
  const result = await db.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: [key]
  });
  return result.rows.length > 0 ? result.rows[0].value : null;
}

export async function setSetting(key, value) {
  await db.execute({
    sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    args: [key, value]
  });
}

// ── Export helpers ─────────────────────────────────────────
export async function getAllDataForExport() {
  const dimensions = await getAllDimensions();
  const snapshots = await getAllSnapshots();
  const dailyLogsResult = await db.execute('SELECT dl.*, d.name as dim_name, d.category as dim_category FROM daily_logs dl LEFT JOIN dimensions d ON dl.dimension_id = d.id ORDER BY dl.date DESC, dl.created_at ASC');
  const schedules = await getSchedules();
  
  return {
    dimensions,
    snapshots,
    dailyLogs: dailyLogsResult.rows,
    schedules,
  };
}
