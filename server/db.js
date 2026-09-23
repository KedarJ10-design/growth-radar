import { createClient } from '@libsql/client';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { xpToLevel, xpToCharacterTitle } from './rpg.js';
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
      xp_awarded   INTEGER NOT NULL DEFAULT 0,
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

    -- ── RPG Gamification Tables ──────────────────────────────
    CREATE TABLE IF NOT EXISTS rpg_dimension_stats (
      dimension_id TEXT PRIMARY KEY,
      level        INTEGER NOT NULL DEFAULT 1,
      current_xp   INTEGER NOT NULL DEFAULT 0,
      total_xp     INTEGER NOT NULL DEFAULT 0,
      xp_bonus_pct INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rpg_xp_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension_id TEXT,
      xp_amount    INTEGER NOT NULL,
      source       TEXT NOT NULL,
      multiplier   REAL NOT NULL DEFAULT 1.0,
      description  TEXT DEFAULT '',
      created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS rpg_boss_fights (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension_id TEXT NOT NULL,
      boss_tier    TEXT NOT NULL,
      boss_name    TEXT NOT NULL,
      description  TEXT DEFAULT '',
      rules        TEXT DEFAULT '[]',
      reward_xp    INTEGER NOT NULL DEFAULT 200,
      status       TEXT NOT NULL DEFAULT 'available',
      evidence     TEXT DEFAULT '',
      badge_reward TEXT DEFAULT '',
      unlocked_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      completed_at TEXT,
      FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rpg_side_quests (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_name      TEXT NOT NULL,
      quest_type      TEXT NOT NULL,
      difficulty      TEXT NOT NULL DEFAULT 'medium',
      description     TEXT DEFAULT '',
      dimension_id    TEXT,
      status          TEXT NOT NULL DEFAULT 'available',
      xp_reward       INTEGER NOT NULL DEFAULT 0,
      badge_earned    TEXT DEFAULT '',
      evidence        TEXT DEFAULT '',
      expires_at      TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      completed_at    TEXT,
      FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS rpg_character (
      id              INTEGER PRIMARY KEY DEFAULT 1,
      character_title TEXT NOT NULL DEFAULT 'Fresher',
      total_xp        INTEGER NOT NULL DEFAULT 0,
      badges          TEXT NOT NULL DEFAULT '[]',
      side_quests_this_week INTEGER NOT NULL DEFAULT 0,
      week_reset_date TEXT NOT NULL DEFAULT (date('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS rpg_reflections (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension_id    TEXT NOT NULL,
      old_score       INTEGER NOT NULL,
      new_score       INTEGER NOT NULL,
      reflection      TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rpg_skill_nodes (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension_id    TEXT NOT NULL,
      name            TEXT NOT NULL,
      is_completed    INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quest_stack (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT 'task',
      priority        TEXT NOT NULL DEFAULT 'backlog',
      dimension_id    TEXT,
      due_date        TEXT,
      est_hours       REAL DEFAULT 0,
      notes           TEXT DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'todo',
      sort_order      INTEGER NOT NULL DEFAULT 0,
      completed_at    TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (dimension_id) REFERENCES dimensions(id) ON DELETE SET NULL
    );
  `);

  await seedDefaults();
  await seedRpgDefaults();
  await seedRpgSkillNodes();
  await upgradeGenericNodes();
  await applyMigrations();
}

// Safely apply schema migrations to existing databases
async function applyMigrations() {
  try {
    const tableInfo = await db.execute("PRAGMA table_info(daily_logs)");
    const hasXpAwarded = tableInfo.rows.some(row => row.name === 'xp_awarded');
    
    if (!hasXpAwarded) {
      await db.execute("ALTER TABLE daily_logs ADD COLUMN xp_awarded INTEGER NOT NULL DEFAULT 0");
      console.log('✅ Migrated database: Added xp_awarded column to daily_logs');
    }
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

// Seed RPG dimension stats for any dimension that doesn't have one yet
async function seedRpgDefaults() {
  const dims = await db.execute('SELECT id FROM dimensions');
  for (const dim of dims.rows) {
    const existing = await db.execute({
      sql: 'SELECT dimension_id FROM rpg_dimension_stats WHERE dimension_id = ?',
      args: [dim.id]
    });
    if (existing.rows.length === 0) {
      await db.execute({
        sql: 'INSERT INTO rpg_dimension_stats (dimension_id) VALUES (?)',
        args: [dim.id]
      });
    }
  }
  // Ensure character row exists
  const charRow = await db.execute('SELECT id FROM rpg_character WHERE id = 1');
  if (charRow.rows.length === 0) {
    await db.execute("INSERT INTO rpg_character (id) VALUES (1)");
  }

  // Run historical migration if character total_xp is still 0
  const charState = await db.execute('SELECT total_xp FROM rpg_character WHERE id = 1');
  if (charState.rows[0].total_xp === 0) {
    await migrateHistoricalXP();
  }
}

function getSpecificNodes(name) {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('consistency')) {
    return ['Daily Habit Building', 'Overcoming Procrastination', 'Time Blocking', 'Flow State Maintenance', 'Unbreakable Routine'];
  } else if (lowerName.includes('communication') || lowerName.includes('comm')) {
    return ['Active Listening', 'Clear Articulation', 'Public Speaking Basics', 'Conflict Resolution', 'Persuasive Storytelling'];
  } else if (lowerName.includes('goal focus') || lowerName.includes('focus')) {
    return ['Setting SMART Goals', 'Prioritization (Eisenhower)', 'Deep Work Sessions', 'Distraction Elimination', 'Long-term Vision Alignment'];
  } else if (lowerName.includes('networking') || lowerName.includes('net')) {
    return ['Cold Outreach Strategy', 'Building Rapport', 'Maintaining Connections', 'Value-First Interactions', 'Community Leadership'];
  } else if (lowerName.includes('interview prep') || lowerName.includes('int')) {
    return ['Resume Optimization', 'Behavioral STAR Method', 'Mock Interviews', 'Salary Negotiation', 'System Design Whiteboarding'];
  } else if (lowerName.includes('mahayatri') || lowerName.includes('proj')) {
    return ['Project Scoping', 'Architecture Planning', 'MVP Execution', 'User Feedback Integration', 'Production Launch'];
  } else if (lowerName.includes('linkedin') || lowerName.includes('li')) {
    return ['Profile Optimization', 'Writing Engaging Hooks', 'Content Consistency', 'Networking in DMs', 'Building a Personal Brand'];
  } else if (lowerName.includes('github') || lowerName.includes('gh')) {
    return ['Markdown & READMEs', 'Git Workflow (Rebase/Merge)', 'Open Source Contributions', 'Automating with Actions', 'Building a Portfolio'];
  } else if (lowerName.includes('python')) {
    return ['Syntax & Data Types', 'Object-Oriented Python', 'List Comprehensions', 'Decorators & Generators', 'Data Analysis (Pandas)'];
  } else if (lowerName.includes('sql')) {
    return ['CRUD Operations', 'Complex Joins', 'Window Functions', 'Query Optimization', 'Database Normalization'];
  } else if (lowerName.includes('linux')) {
    return ['Command Line Navigation', 'File Permissions', 'Bash Scripting Basics', 'Process Management', 'Networking & SSH'];
  } else {
    return [
      `Foundational ${name}`,
      `Intermediate ${name}`,
      `Advanced ${name}`,
      `${name} Best Practices`,
      `${name} Mastery`
    ];
  }
}

async function upgradeGenericNodes() {
  const dimensions = await db.execute('SELECT id, name FROM dimensions');
  
  const statements = [];
  for (const dim of dimensions.rows) {
    const specifics = getSpecificNodes(dim.name);
    // If it falls back to generic, there's no upgrade to do
    if (specifics[0].startsWith('Foundational ')) continue;

    const oldNames = [
      `Foundational ${dim.name}`,
      `Intermediate ${dim.name}`,
      `Advanced ${dim.name}`,
      `${dim.name} Best Practices`,
      `${dim.name} Mastery`
    ];

    for (let i = 0; i < 5; i++) {
      statements.push({
        sql: 'UPDATE rpg_skill_nodes SET name = ? WHERE dimension_id = ? AND name = ?',
        args: [specifics[i], dim.id, oldNames[i]]
      });
    }
  }

  if (statements.length > 0) {
    await db.batch(statements, 'write');
  }
}

async function seedRpgSkillNodes() {
  const result = await db.execute('SELECT COUNT(*) as c FROM rpg_skill_nodes');
  if (result.rows[0].c > 0) return;

  const dimsResult = await db.execute('SELECT id, name FROM dimensions');
  const dims = dimsResult.rows;

  const statements = [];
  for (const dim of dims) {
    let nodes = [];
    switch (dim.id) {
      case 'fs':
        nodes = ['React Hooks Mastery', 'Node.js Event Loop', 'REST API Design', 'SQL Joins & Indexes', 'CSS Grid & Flexbox'];
        break;
      case 'ai':
        nodes = ['LLM Prompt Engineering', 'RAG Architecture', 'Vector Databases', 'LangChain Basics', 'Fine-Tuning Concepts'];
        break;
      case 'dsa':
        nodes = ['Two Pointers Technique', 'Binary Search', 'Sliding Window', 'Graph BFS/DFS', 'Dynamic Programming 1D'];
        break;
      case 'sd':
        nodes = ['Load Balancing Strategies', 'Database Sharding', 'Microservices Architecture', 'Caching with Redis', 'Message Queues (Kafka)'];
        break;
      case 'mob':
        nodes = ['Widget Tree Basics', 'State Management (Riverpod)', 'Flutter Animations', 'Native Integration', 'App Deployment (Stores)'];
        break;
      case 'sec':
        nodes = ['OWASP Top 10', 'OAuth2 & JWTs', 'SQL Injection Prevention', 'XSS Prevention', 'Encryption Basics'];
        break;
      case 'java':
        nodes = ['Spring Boot Fundamentals', 'JPA/Hibernate', 'Java Concurrency', 'JVM Memory Model', 'JUnit Testing'];
        break;
      default:
        nodes = getSpecificNodes(dim.name);
    }
    for (const nodeName of nodes) {
      statements.push({
        sql: 'INSERT INTO rpg_skill_nodes (dimension_id, name, is_completed) VALUES (?, ?, 0)',
        args: [dim.id, nodeName]
      });
    }
  }

  await db.batch(statements, 'write');
}

// One-time migration: calculate XP from completed daily logs
async function migrateHistoricalXP() {
  const completedLogs = await db.execute(
    "SELECT dimension_id, COUNT(*) as task_count, SUM(duration_min) as total_min FROM daily_logs WHERE completed = 1 AND dimension_id IS NOT NULL GROUP BY dimension_id"
  );

  let globalXP = 0;
  for (const row of completedLogs.rows) {
    // Award 25 XP per completed task (medium difficulty baseline)
    const xp = Number(row.task_count) * 25;
    globalXP += xp;

    await db.execute({
      sql: 'UPDATE rpg_dimension_stats SET current_xp = ?, total_xp = ? WHERE dimension_id = ?',
      args: [xp, xp, row.dimension_id]
    });

    // Calculate level from XP
    const level = xpToLevel(xp);
    await db.execute({
      sql: 'UPDATE rpg_dimension_stats SET level = ? WHERE dimension_id = ?',
      args: [level, row.dimension_id]
    });

    // Log the migration
    await db.execute({
      sql: "INSERT INTO rpg_xp_log (dimension_id, xp_amount, source, description) VALUES (?, ?, 'migration', ?)",
      args: [row.dimension_id, xp, `Historical migration: ${row.task_count} completed tasks`]
    });
  }

  // Update global character XP and title
  const charTitle = xpToCharacterTitle(globalXP);
  await db.execute({
    sql: 'UPDATE rpg_character SET total_xp = ?, character_title = ? WHERE id = 1',
    args: [globalXP, charTitle]
  });

  if (globalXP > 0) {
    console.log(`🎮 RPG Migration: Awarded ${globalXP} XP from historical logs`);
  }
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
  const result = await db.execute(`
    SELECT d.*, COALESCE(s.level, 1) as rpg_level 
    FROM dimensions d 
    LEFT JOIN rpg_dimension_stats s ON d.id = s.dimension_id 
    ORDER BY d.sort_order ASC, d.created_at ASC
  `);
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

export async function addDailyLog({ date, dimension_id, activity, duration_min, notes, xp_awarded }) {
  const result = await db.execute({
    sql: 'INSERT INTO daily_logs (date, dimension_id, activity, duration_min, notes, completed, xp_awarded) VALUES (?, ?, ?, ?, ?, 0, ?)',
    args: [date, dimension_id || null, activity, duration_min || 0, notes || '', xp_awarded ? 1 : 0]
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

export async function markXPAwarded(logId) {
  await db.execute({
    sql: 'UPDATE daily_logs SET xp_awarded = 1 WHERE id = ?',
    args: [logId]
  });
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

// ── RPG Queries ───────────────────────────────────────────

// Get full character profile
export async function getRpgCharacter() {
  const result = await db.execute('SELECT * FROM rpg_character WHERE id = 1');
  const char = result.rows[0];
  if (char) {
    char.badges = JSON.parse(char.badges || '[]');
    // Reset weekly counter if we're in a new week
    const today = new Date().toISOString().split('T')[0];
    const resetDate = char.week_reset_date;
    if (resetDate && today > getEndOfWeek(resetDate)) {
      await db.execute("UPDATE rpg_character SET side_quests_this_week = 0, week_reset_date = date('now','localtime') WHERE id = 1");
      char.side_quests_this_week = 0;
    }
  }
  return char;
}

function getEndOfWeek(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = 7 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

// Get all dimension RPG stats joined with dimension names
export async function getRpgStats() {
  const result = await db.execute(`
    SELECT rs.*, d.name, d.category, d.score 
    FROM rpg_dimension_stats rs 
    JOIN dimensions d ON rs.dimension_id = d.id 
    ORDER BY d.sort_order ASC
  `);
  return result.rows;
}

// Get single dimension RPG stats
export async function getRpgStatsForDim(dimId) {
  const result = await db.execute({
    sql: `SELECT rs.*, d.name, d.category, d.score 
          FROM rpg_dimension_stats rs 
          JOIN dimensions d ON rs.dimension_id = d.id 
          WHERE rs.dimension_id = ?`,
    args: [dimId]
  });
  return result.rows[0];
}

// Award XP to a dimension and log the transaction
export async function awardXP(dimId, amount, source, multiplier = 1.0, description = '') {
  const finalAmount = Math.round(amount * multiplier);

  // Get old level before update
  const oldStats = await db.execute({
    sql: 'SELECT level FROM rpg_dimension_stats WHERE dimension_id = ?',
    args: [dimId]
  });
  const oldLevel = oldStats.rows.length > 0 ? oldStats.rows[0].level : 1;

  // Update dimension stats
  await db.execute({
    sql: 'UPDATE rpg_dimension_stats SET current_xp = current_xp + ?, total_xp = total_xp + ? WHERE dimension_id = ?',
    args: [finalAmount, finalAmount, dimId]
  });

  // Recalculate level
  const stats = await db.execute({
    sql: 'SELECT total_xp FROM rpg_dimension_stats WHERE dimension_id = ?',
    args: [dimId]
  });
  const newLevel = xpToLevel(stats.rows[0].total_xp);
  await db.execute({
    sql: 'UPDATE rpg_dimension_stats SET level = ? WHERE dimension_id = ?',
    args: [newLevel, dimId]
  });

  // Log the XP transaction
  await db.execute({
    sql: 'INSERT INTO rpg_xp_log (dimension_id, xp_amount, source, multiplier, description) VALUES (?, ?, ?, ?, ?)',
    args: [dimId, finalAmount, source, multiplier, description]
  });

  // Update global character XP
  await db.execute({
    sql: 'UPDATE rpg_character SET total_xp = total_xp + ? WHERE id = 1',
    args: [finalAmount]
  });

  // Recalculate character title
  const charResult = await db.execute('SELECT total_xp FROM rpg_character WHERE id = 1');
  const newTitle = xpToCharacterTitle(charResult.rows[0].total_xp);
  await db.execute({
    sql: 'UPDATE rpg_character SET character_title = ? WHERE id = 1',
    args: [newTitle]
  });

  return { dimId, xpAwarded: finalAmount, newLevel, newTotalXP: stats.rows[0].total_xp };
}

// Apply permanent XP bonus from boss fight
export async function applyBossBonus(dimId, bonusPct) {
  await db.execute({
    sql: 'UPDATE rpg_dimension_stats SET xp_bonus_pct = xp_bonus_pct + ? WHERE dimension_id = ?',
    args: [bonusPct, dimId]
  });
}

// Add a badge to the character
export async function addBadge(badge) {
  const char = await getRpgCharacter();
  const badges = char.badges || [];
  if (!badges.includes(badge)) {
    badges.push(badge);
    await db.execute({
      sql: 'UPDATE rpg_character SET badges = ? WHERE id = 1',
      args: [JSON.stringify(badges)]
    });
  }
}

// ── Boss Fight Queries ────────────────────────────────────

export async function getBossHistory(dimId) {
  const result = await db.execute({
    sql: 'SELECT * FROM rpg_boss_fights WHERE dimension_id = ? ORDER BY unlocked_at DESC',
    args: [dimId]
  });
  return result.rows.map(b => ({ ...b, rules: JSON.parse(b.rules || '[]') }));
}

export async function getAllBossFights() {
  const result = await db.execute(
    "SELECT bf.*, d.name as dimension_name FROM rpg_boss_fights bf JOIN dimensions d ON bf.dimension_id = d.id ORDER BY bf.unlocked_at DESC"
  );
  return result.rows.map(b => ({ ...b, rules: JSON.parse(b.rules || '[]') }));
}

export async function getAvailableBosses() {
  const result = await db.execute(
    "SELECT bf.*, d.name as dimension_name FROM rpg_boss_fights bf JOIN dimensions d ON bf.dimension_id = d.id WHERE bf.status = 'available' ORDER BY bf.unlocked_at DESC"
  );
  return result.rows.map(b => ({ ...b, rules: JSON.parse(b.rules || '[]') }));
}

export async function createBoss({ dimId, tier, name, description, rules, rewardXP, badgeReward }) {
  const result = await db.execute({
    sql: `INSERT INTO rpg_boss_fights (dimension_id, boss_tier, boss_name, description, rules, reward_xp, badge_reward) 
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [dimId, tier, name, description || '', JSON.stringify(rules || []), rewardXP || BOSS_XP_MAP[tier] || 200, badgeReward || '']
  });
  return { id: Number(result.lastInsertRowid) };
}

const BOSS_XP_MAP = { mini: 200, major: 500, final: 1000 };

export async function completeBoss(bossId, evidence) {
  const boss = await db.execute({ sql: 'SELECT * FROM rpg_boss_fights WHERE id = ?', args: [bossId] });
  if (boss.rows.length === 0) return null;

  const b = boss.rows[0];
  await db.execute({
    sql: "UPDATE rpg_boss_fights SET status = 'completed', evidence = ?, completed_at = datetime('now','localtime') WHERE id = ?",
    args: [evidence, bossId]
  });

  return { ...b, rules: JSON.parse(b.rules || '[]') };
}

export async function getBossById(bossId) {
  const result = await db.execute({ sql: 'SELECT * FROM rpg_boss_fights WHERE id = ?', args: [bossId] });
  if (result.rows.length === 0) return null;
  const b = result.rows[0];
  return { ...b, rules: JSON.parse(b.rules || '[]') };
}

// ── Side Quest Queries ────────────────────────────────────

export async function getSideQuests(status) {
  let sql = "SELECT sq.*, d.name as dimension_name FROM rpg_side_quests sq LEFT JOIN dimensions d ON sq.dimension_id = d.id";
  const args = [];
  if (status) {
    sql += " WHERE sq.status = ?";
    args.push(status);
  }
  sql += " ORDER BY sq.created_at DESC";
  const result = await db.execute({ sql, args });
  return result.rows;
}

export async function createSideQuest({ questName, questType, difficulty, description, dimId, xpReward, badgeEarned, expiresAt }) {
  const result = await db.execute({
    sql: `INSERT INTO rpg_side_quests (quest_name, quest_type, difficulty, description, dimension_id, xp_reward, badge_earned, expires_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [questName, questType, difficulty || 'medium', description || '', dimId || null, xpReward || 50, badgeEarned || '', expiresAt || null]
  });
  return { id: Number(result.lastInsertRowid) };
}
export async function getSideQuestById(questId) {
  const result = await db.execute({ sql: 'SELECT * FROM rpg_side_quests WHERE id = ?', args: [questId] });
  return result.rows.length ? result.rows[0] : null;
}

export async function completeSideQuest(questId, evidence) {
  const quest = await db.execute({ sql: 'SELECT * FROM rpg_side_quests WHERE id = ?', args: [questId] });
  if (quest.rows.length === 0) return null;

  await db.execute({
    sql: "UPDATE rpg_side_quests SET status = 'completed', evidence = ?, completed_at = datetime('now','localtime') WHERE id = ?",
    args: [evidence, questId]
  });

  // Increment weekly counter
  await db.execute("UPDATE rpg_character SET side_quests_this_week = side_quests_this_week + 1 WHERE id = 1");

  return quest.rows[0];
}

// ── XP Log ────────────────────────────────────────────────

export async function getXPLog(dimId, limit = 30) {
  let sql, args;
  if (dimId) {
    sql = `SELECT xl.*, d.name as dimension_name FROM rpg_xp_log xl 
           LEFT JOIN dimensions d ON xl.dimension_id = d.id 
           WHERE xl.dimension_id = ? ORDER BY xl.created_at DESC LIMIT ?`;
    args = [dimId, limit];
  } else {
    sql = `SELECT xl.*, d.name as dimension_name FROM rpg_xp_log xl 
           LEFT JOIN dimensions d ON xl.dimension_id = d.id 
           ORDER BY xl.created_at DESC LIMIT ?`;
    args = [limit];
  }
  const result = await db.execute({ sql, args });
  return result.rows;
}

export async function getDailyXPSummary(days = 90) {
  const result = await db.execute({
    sql: `SELECT date(created_at) as date, SUM(xp_amount) as total_xp 
          FROM rpg_xp_log 
          WHERE created_at >= date('now', '-' || ? || ' days')
          GROUP BY date(created_at) 
          ORDER BY date(created_at) ASC`,
    args: [days]
  });
  return result.rows;
}

export async function addReflection({ dimension_id, old_score, new_score, reflection }) {
  const result = await db.execute({
    sql: `INSERT INTO rpg_reflections (dimension_id, old_score, new_score, reflection) 
          VALUES (?, ?, ?, ?)`,
    args: [dimension_id, old_score, new_score, reflection]
  });
  return { id: Number(result.lastInsertRowid) };
}

export async function getSkillNodes(dimension_id = null) {
  let sql = 'SELECT * FROM rpg_skill_nodes';
  let args = [];
  if (dimension_id) {
    sql += ' WHERE dimension_id = ?';
    args.push(dimension_id);
  }
  sql += ' ORDER BY is_completed ASC, created_at ASC';
  const result = await db.execute({ sql, args });
  return result.rows.map(r => ({ ...r, is_completed: Boolean(r.is_completed) }));
}

export async function addSkillNode(dimension_id, name) {
  const result = await db.execute({
    sql: 'INSERT INTO rpg_skill_nodes (dimension_id, name) VALUES (?, ?)',
    args: [dimension_id, name]
  });
  return { id: Number(result.lastInsertRowid), dimension_id, name, is_completed: false };
}

export async function completeSkillNode(nodeId) {
  await db.execute({
    sql: 'UPDATE rpg_skill_nodes SET is_completed = 1 WHERE id = ?',
    args: [nodeId]
  });
}

// ── Quest Stack Queries ───────────────────────────────────

export async function getQuestStack(status = null) {
  let sql = `SELECT qs.*, d.name as dimension_name, d.category as dimension_category 
             FROM quest_stack qs 
             LEFT JOIN dimensions d ON qs.dimension_id = d.id`;
  const args = [];
  if (status) {
    sql += ' WHERE qs.status = ?';
    args.push(status);
  }
  sql += ' ORDER BY CASE qs.priority WHEN \'do_first\' THEN 1 WHEN \'schedule\' THEN 2 WHEN \'delegate\' THEN 3 WHEN \'backlog\' THEN 4 END, CASE WHEN qs.due_date IS NOT NULL AND qs.due_date != \'\' THEN qs.due_date ELSE \'9999-99-99\' END ASC, qs.sort_order ASC, qs.created_at DESC';
  const result = await db.execute({ sql, args });
  return result.rows;
}

export async function addQuestItem({ title, type, priority, dimension_id, due_date, est_hours, notes }) {
  // Get next sort_order for this priority
  const orderResult = await db.execute({
    sql: 'SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM quest_stack WHERE priority = ? AND status != \'completed\'',
    args: [priority || 'backlog']
  });
  const sortOrder = orderResult.rows[0].next;

  const result = await db.execute({
    sql: `INSERT INTO quest_stack (title, type, priority, dimension_id, due_date, est_hours, notes, sort_order) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [title, type || 'task', priority || 'backlog', dimension_id || null, due_date || null, est_hours || 0, notes || '', sortOrder]
  });
  return { id: Number(result.lastInsertRowid), title, type, priority, dimension_id, due_date, est_hours, notes, status: 'todo', sort_order: sortOrder };
}

export async function updateQuestItem(id, fields) {
  const allowed = ['title', 'type', 'priority', 'dimension_id', 'due_date', 'est_hours', 'notes', 'status', 'sort_order'];
  const updates = [];
  const args = [];
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.includes(k)) {
      updates.push(`${k} = ?`);
      args.push(v);
    }
  }
  if (updates.length === 0) return getQuestItemById(id);
  args.push(id);
  await db.execute({
    sql: `UPDATE quest_stack SET ${updates.join(', ')} WHERE id = ?`,
    args
  });
  return getQuestItemById(id);
}

export async function deleteQuestItem(id) {
  await db.execute({
    sql: 'DELETE FROM quest_stack WHERE id = ?',
    args: [id]
  });
}

export async function getQuestItemById(id) {
  const result = await db.execute({
    sql: `SELECT qs.*, d.name as dimension_name, d.category as dimension_category 
          FROM quest_stack qs 
          LEFT JOIN dimensions d ON qs.dimension_id = d.id 
          WHERE qs.id = ?`,
    args: [id]
  });
  return result.rows[0] || null;
}

export async function completeQuestItem(id) {
  await db.execute({
    sql: "UPDATE quest_stack SET status = 'completed', completed_at = datetime('now','localtime') WHERE id = ?",
    args: [id]
  });
  return getQuestItemById(id);
}

export async function getQuestStackStats() {
  const [total, completed, ongoing, todayCompleted] = await Promise.all([
    db.execute('SELECT COUNT(*) as c FROM quest_stack'),
    db.execute("SELECT COUNT(*) as c FROM quest_stack WHERE status = 'completed'"),
    db.execute("SELECT COUNT(*) as c FROM quest_stack WHERE status = 'ongoing'"),
    db.execute("SELECT COUNT(*) as c FROM quest_stack WHERE status = 'completed' AND date(completed_at) = date('now','localtime')")
  ]);
  return {
    total: total.rows[0].c,
    completed: completed.rows[0].c,
    ongoing: ongoing.rows[0].c,
    today_completed: todayCompleted.rows[0].c
  };
}

export async function reorderQuestStack(updates) {
  for (const u of updates) {
    await db.execute({
      sql: 'UPDATE quest_stack SET sort_order = ? WHERE id = ?',
      args: [u.sort_order, u.id]
    });
  }
}
