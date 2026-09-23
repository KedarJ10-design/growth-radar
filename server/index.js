import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { setupAuth, requireAuth } from './auth.js';

// Load .env from server directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import {
  initDb, getAllDimensions, addDimension, updateDimension, deleteDimension,
  createSnapshot, getAllSnapshots,
  getDailyLogs, addDailyLog, toggleDailyLog, deleteDailyLog, getStreak, markXPAwarded,
  saveSchedule, getSchedules, getRecentLogsForDims, getRecentSchedulesLimit,
  getStats, getAllDataForExport,
  getSetting, setSetting,
  // RPG queries
  getRpgCharacter, getRpgStats, getRpgStatsForDim,
  awardXP, applyBossBonus, addBadge,
  getBossHistory, getAllBossFights, getAvailableBosses, createBoss, completeBoss, getBossById,
  getSideQuests, createSideQuest, getSideQuestById, completeSideQuest,
  getXPLog, getDailyXPSummary, addReflection, getSkillNodes, addSkillNode, completeSkillNode,
  // Quest Stack
  getQuestStack, addQuestItem, updateQuestItem, deleteQuestItem, getQuestItemById, completeQuestItem, getQuestStackStats, reorderQuestStack
} from './db.js';
import { generateSchedule } from './ai.js';
import { generateExcel, generateCSV } from './export.js';
import { calculateTaskXP, calculateLogCompletionXP, xpToLevel, levelTitle, xpToCharacterTitle, xpForNextLevel, xpInCurrentLevel, xpSpanOfLevel, shouldUnlockBoss, checkWeeklyQuestBonus, BOSS_XP, LEVEL_TITLES } from './rpg.js';
import { generateTaskNarration, generateBossFight, generateSideQuest, generateBossVictoryNarration, judgeChallenge } from './rpg-ai.js';

const app = express();
const PORT = process.env.PORT || 3001;
const APP_URL = process.env.APP_URL || (process.env.NODE_ENV === 'production' ? 'https://your-app.onrender.com' : 'http://localhost:3000');
const API_URL = process.env.NODE_ENV === 'production' ? APP_URL : `http://localhost:${PORT}`;

// ── Security & Middleware ─────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // Vite uses inline scripts/styles sometimes
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  APP_URL
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Set up Auth PIN middleware (includes cookie-parser and login/check endpoints)
setupAuth(app);

// Apply auth to all /api routes (requireAuth handles exceptions like login and google callback)
app.use('/api', requireAuth);

// Rate limiting for AI Generate endpoint
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // limit each IP to 15 requests per windowMs
  message: { error: 'Too many requests for AI generation. Please try again later.' }
});

// ── Google OAuth Setup ──────────────────────────────────────
function getOAuthClient(req) {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();

  if (!clientId || !clientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables");
  }
  
  let redirectUri = `${API_URL}/api/calendar/callback`;
  if (req && process.env.NODE_ENV === 'production') {
     const protocol = req.headers['x-forwarded-proto'] || req.protocol;
     const host = req.get('host');
     redirectUri = `${protocol}://${host}/api/calendar/callback`;
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

// We will load tokens asynchronously after DB is ready

// ── Health ─────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Debug OAuth (temporary - remove after fixing) ─────────
app.get('/api/debug-oauth', (_, res) => {
  const cid = process.env.GOOGLE_CLIENT_ID || '';
  const csec = process.env.GOOGLE_CLIENT_SECRET || '';
  const apiUrl = API_URL;
  res.json({
    clientIdLength: cid.length,
    clientIdPreview: cid ? `${cid.substring(0, 10)}...${cid.substring(cid.length - 5)}` : 'EMPTY',
    secretLength: csec.length,
    secretPreview: csec ? `${csec.substring(0, 8)}...` : 'EMPTY',
    redirectUri: `${apiUrl}/api/calendar/callback`,
    apiUrl: apiUrl,
    nodeEnv: process.env.NODE_ENV
  });
});

// ── Google Calendar Sync ──────────────────────────────────
app.get('/api/calendar/auth', (req, res) => {
  try {
    const client = getOAuthClient(req);
    const url = client.generateAuthUrl({
      access_type: 'offline', 
      prompt: 'consent', 
      login_hint: 'jadhavkedar55@gmail.com',
      scope: ['https://www.googleapis.com/auth/calendar.events']
    });
    res.redirect(url);
  } catch (err) {
    res.status(500).send(`Server Configuration Error: ${err.message}`);
  }
});

app.get('/api/calendar/logout', async (req, res) => {
  const client = getOAuthClient(req);
  client.setCredentials({});
  await setSetting('google_tokens', '');
  res.redirect(`${APP_URL}/`);
});

app.get('/api/calendar/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');
  
  try {
    const client = getOAuthClient(req);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    await setSetting('google_tokens', JSON.stringify(tokens));
    
    res.redirect(`${APP_URL}/?calendar_sync=success`);
  } catch (error) {
    console.error('Auth Error:', error);
    res.redirect(`${APP_URL}/?calendar_sync=error`);
  }
});

app.post('/api/calendar/add', async (req, res) => {
  try {
    const tokens = await getSetting('google_tokens');
    if (!tokens) {
      return res.status(401).json({ error: 'Not authenticated with Google' });
    }
    
    const client = getOAuthClient(req);
    client.setCredentials(JSON.parse(tokens));
    
    const { schedule, date } = req.body; 
    if (!schedule || !schedule.length) return res.status(400).json({ error: 'No schedule provided' });
    
    const calendar = google.calendar({ version: 'v3', auth: client });
    let addedCount = 0;
    
    for (const block of schedule) {
       const event = {
         summary: `${block.emoji || ''} ${block.title}`.trim(),
         description: block.desc,
         start: {
           dateTime: `${date}T${block.start}:00+05:30`,
           timeZone: 'Asia/Kolkata',
         },
         end: {
           dateTime: `${date}T${block.end}:00+05:30`,
           timeZone: 'Asia/Kolkata',
         },
       };
       
       await calendar.events.insert({
         calendarId: 'primary',
         resource: event,
       });
       addedCount++;
    }
    
    res.json({ success: true, count: addedCount });
  } catch (e) {
    console.error('Calendar Insert Error:', e);
    if (e.message.includes('invalid_grant') || e.code === 401) {
       await setSetting('google_tokens', ''); 
       return res.status(401).json({ error: 'Authentication expired' });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── Dimensions ─────────────────────────────────────────────
app.get('/api/dimensions', async (_, res) => {
  try { res.json(await getAllDimensions()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/dimensions', async (req, res) => {
  try {
    const { name, category, score } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    const id = String(Date.now());
    const dim = await addDimension({ id, name: name.trim(), category: category || 'Other', score: score ?? 5 });
    res.status(201).json(dim);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/dimensions/:id', async (req, res) => {
  try {
    const dim = await updateDimension(req.params.id, req.body);
    if (!dim) return res.status(404).json({ error: 'Dimension not found' });
    res.json(dim);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/dimensions/:id', async (req, res) => {
  try {
    await deleteDimension(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Snapshots ──────────────────────────────────────────────
app.get('/api/snapshots', async (_, res) => {
  try { res.json(await getAllSnapshots()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/snapshots', async (_, res) => {
  try { res.status(201).json(await createSnapshot()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Daily Logs ─────────────────────────────────────────────
app.get('/api/daily-log/:date', async (req, res) => {
  try { res.json(await getDailyLogs(req.params.date)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/daily-log', async (req, res) => {
  try {
    const { date, dimension_id, activity, duration_min, notes } = req.body;
    if (!date || !activity?.trim()) return res.status(400).json({ error: 'Date and activity are required' });
    const log = await addDailyLog({ date, dimension_id, activity: activity.trim(), duration_min, notes });
    res.status(201).json(log);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/daily-log/:id/toggle', async (req, res) => {
  try {
    const log = await toggleDailyLog(parseInt(req.params.id));
    if (!log) return res.status(404).json({ error: 'Log not found' });

    // Auto-award RPG XP when a daily log is marked as completed
    let rpgXP = null;
    if (log.completed && log.dimension_id && !log.xp_awarded) {
      try {
        const { difficulty, xp } = calculateLogCompletionXP(log.duration_min || 0);
        const streak = await getStreak();
        const dimStats = await getRpgStatsForDim(log.dimension_id);
        const multiplier = streak.streak >= 7 ? 2.0 : 1.0;
        const bonusMultiplier = dimStats?.xp_bonus_pct ? (1 + dimStats.xp_bonus_pct / 100) : 1.0;
        const totalMultiplier = multiplier * bonusMultiplier;
        const result = await awardXP(log.dimension_id, xp, 'daily_log', totalMultiplier, log.activity);
        
        // Mark XP as permanently awarded so toggling this log again won't give double XP
        await markXPAwarded(log.id);
        log.xp_awarded = 1;

        rpgXP = { xp: result.xpAwarded, newLevel: result.newLevel, difficulty };
      } catch (rpgErr) {
        console.error('RPG auto-XP error (non-fatal):', rpgErr.message);
      }
    }

    res.json({ ...log, rpgXP });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/daily-log/:id', async (req, res) => {
  try {
    await deleteDailyLog(parseInt(req.params.id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/daily-log-streak', async (_, res) => {
  try { res.json(await getStreak()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AI Schedule ────────────────────────────────────────────
app.post('/api/schedule/generate', aiLimiter, async (req, res) => {
  try {
    const dims = await getAllDimensions();
    
    // Fetch History Context for AI Memory
    let historyContext = "";
    try {
      const selectedDims = req.body.selectedDims || [];
      const focusDimIds = selectedDims.length > 0 ? selectedDims : dims.sort((a, b) => a.score - b.score).slice(0, 5).map(d => d.id);
      
      const recentLogs = await getRecentLogsForDims(focusDimIds);
      const recentSchedules = await getRecentSchedulesLimit(3);
      
      let logsText = recentLogs.map(l => `- [${l.date}] ${l.dimension_name}: ${l.activity} (Completed: ${l.completed ? 'Yes' : 'No'}) ${l.notes ? 'Notes: '+l.notes : ''}`).join('\n');
      
      let schedulesText = recentSchedules.map(s => {
        try {
          const parsed = JSON.parse(s.schedule);
          return `- [${s.date}] ${parsed.map(i => i.title).join(', ')}`;
        } catch(e) { return ''; }
      }).filter(Boolean).join('\n');
      
      if (logsText || schedulesText) {
        historyContext = "PAST CONTEXT & CONTINUOUS PATH:\n";
        if (logsText) historyContext += "User recently logged these activities related to the focus topics:\n" + logsText + "\n\n";
        if (schedulesText) historyContext += "You recently scheduled these blocks for the user:\n" + schedulesText + "\n\n";
      }
    } catch(e) {
      console.error("Failed to build history context:", e.message);
    }

    const result = await generateSchedule({ dims, historyContext, ...req.body });
    const today = new Date().toISOString().split('T')[0];
    await saveSchedule({ date: today, schedule: result.schedule, insight: result.insight });
    res.json(result);
  } catch (e) {
    console.error('AI Schedule Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/schedules', async (_, res) => {
  try { res.json(await getSchedules()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Stats ──────────────────────────────────────────────────
app.get('/api/stats', async (_, res) => {
  try { res.json(await getStats()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Export ──────────────────────────────────────────────────
app.get('/api/export/:format', async (req, res) => {
  try {
    const data = await getAllDataForExport();
    const format = req.params.format;

    if (format === 'xlsx') {
      const buffer = generateExcel(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=growth-radar-${new Date().toISOString().split('T')[0]}.xlsx`);
      res.send(Buffer.from(buffer));
    } else if (format === 'csv') {
      const csv = generateCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=growth-radar-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } else {
      res.status(400).json({ error: 'Format must be xlsx or csv' });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RPG Gamification ───────────────────────────────────────

// Character profile
app.get('/api/rpg/character', async (_, res) => {
  try {
    const [character, stats, streak, availableBosses, activeQuests] = await Promise.all([
      getRpgCharacter(),
      getRpgStats(),
      getStreak(),
      getAvailableBosses(),
      getSideQuests('available')
    ]);

    // Enrich each dimension stat with level title and progress
    const enrichedStats = stats.map(s => ({
      ...s,
      level_title: levelTitle(s.level),
      xp_to_next: xpForNextLevel(s.level),
      xp_in_level: xpInCurrentLevel(s.total_xp, s.level),
      xp_span: xpSpanOfLevel(s.level),
      progress_pct: s.level >= 10 ? 100 : Math.round((xpInCurrentLevel(s.total_xp, s.level) / xpSpanOfLevel(s.level)) * 100),
      boss_available: shouldUnlockBoss(s.level) !== null
    }));

    res.json({
      character,
      stats: enrichedStats,
      streak: streak.streak,
      available_bosses: availableBosses,
      active_quests: activeQuests
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Log tasks (manual XP)
app.post('/api/rpg/log-tasks', aiLimiter, async (req, res) => {
  try {
    const { dimension_id, tasks_completed, difficulty, combo_dimensions } = req.body;
    if (!dimension_id || !tasks_completed?.length) {
      return res.status(400).json({ error: 'dimension_id and tasks_completed are required' });
    }

    const streak = await getStreak();
    const dimStats = await getRpgStatsForDim(dimension_id);
    if (!dimStats) return res.status(404).json({ error: 'Dimension not found in RPG stats' });

    const xpResult = calculateTaskXP({
      taskCount: tasks_completed.length,
      difficulty: difficulty || 'medium',
      streakDays: streak.streak,
      comboDimensions: combo_dimensions,
      bonusPct: dimStats.xp_bonus_pct
    });

    const oldLevel = dimStats.level;
    const award = await awardXP(dimension_id, xpResult.baseXP, 'task', xpResult.multiplier, tasks_completed.join(', '));
    const newStats = await getRpgStatsForDim(dimension_id);
    const levelUp = newStats.level > oldLevel;

    // Check if boss should be unlocked after level up
    let bossUnlocked = null;
    if (levelUp) {
      const bossTier = shouldUnlockBoss(newStats.level);
      if (bossTier) {
        try {
          const bossData = await generateBossFight({
            dimensionName: dimStats.name,
            level: newStats.level,
            tier: bossTier,
            completedBosses: await getBossHistory(dimension_id)
          });
          const created = await createBoss({
            dimId: dimension_id,
            tier: bossTier,
            name: bossData.boss_name,
            description: bossData.boss_description,
            rules: bossData.rules,
            rewardXP: BOSS_XP[bossTier],
            badgeReward: bossData.badge_reward
          });
          bossUnlocked = { ...bossData, id: created.id, tier: bossTier };
        } catch (bossErr) {
          console.error('Boss generation failed (non-fatal):', bossErr.message);
        }
      }
    }

    // Generate Game Master narration (AI)
    let narration = { game_master_message: '', suggestion: null };
    try {
      narration = await generateTaskNarration({
        dimensionName: dimStats.name,
        tasksCompleted: tasks_completed,
        xpEarned: award.xpAwarded,
        newLevel: newStats.level,
        levelTitle: levelTitle(newStats.level),
        levelUp,
        streakDays: streak.streak
      });
    } catch (aiErr) {
      console.error('Game Master narration failed (non-fatal):', aiErr.message);
      narration.game_master_message = levelUp
        ? `Level ${newStats.level} reached. The grind continues.`
        : `+${award.xpAwarded} XP logged. Keep pushing.`;
    }

    const character = await getRpgCharacter();

    res.json({
      xp_breakdown: tasks_completed.map((task, i) => ({
        task,
        base_xp: xpResult.baseXP / tasks_completed.length,
        multiplier: xpResult.multiplier,
        final_xp: Math.round(xpResult.finalXP / tasks_completed.length)
      })),
      total_xp_earned: award.xpAwarded,
      new_total_xp: newStats.total_xp,
      level_up: levelUp,
      new_level: newStats.level,
      new_title: levelTitle(newStats.level),
      xp_to_next_level: xpForNextLevel(newStats.level) - newStats.total_xp,
      streak_status: streak.streak >= 7
        ? `🔥 ${streak.streak}-day streak — 2x XP active!`
        : `Day ${streak.streak} streak 🔥 — ${7 - streak.streak} more for 2x bonus`,
      multiplier_reasons: xpResult.multiplierReasons,
      boss_unlocked: bossUnlocked,
      character_title: character.character_title,
      game_master_message: narration.game_master_message,
      suggestion: narration.suggestion
    });
  } catch (e) {
    console.error('RPG Log Tasks Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Check boss availability
app.post('/api/rpg/check-boss', aiLimiter, async (req, res) => {
  try {
    const { dimension_id } = req.body;
    const dimStats = await getRpgStatsForDim(dimension_id);
    if (!dimStats) return res.status(404).json({ error: 'Dimension not found' });

    const existingBosses = await getBossHistory(dimension_id);
    const availableBoss = existingBosses.find(b => b.status === 'available');

    if (availableBoss) {
      return res.json({
        boss_available: true,
        boss: availableBoss,
        game_master_message: `The ${availableBoss.boss_name} awaits. Are you ready?`
      });
    }

    const bossTier = shouldUnlockBoss(dimStats.level);
    if (!bossTier) {
      const nextBossLevel = dimStats.level < 2 ? 2 : (Math.ceil(dimStats.level / 2) * 2);
      return res.json({
        boss_available: false,
        next_boss_at: `Level ${nextBossLevel}`,
        game_master_message: `No boss available yet. Reach Level ${nextBossLevel} to unlock the next challenge.`
      });
    }

    // Generate a new boss fight (with fallback if AI fails)
    let bossData;
    try {
      bossData = await generateBossFight({
        dimensionName: dimStats.name,
        level: dimStats.level,
        tier: bossTier,
        completedBosses: existingBosses.filter(b => b.status === 'completed')
      });
    } catch (aiErr) {
      console.error('Boss AI generation failed, using fallback:', aiErr.message);
      bossData = {
        boss_name: `The ${dimStats.name} Trial`,
        boss_description: `Complete a focused ${bossTier === 'mini' ? '2-hour' : bossTier === 'major' ? 'full-day' : 'multi-day'} deep work session on ${dimStats.name}. Demonstrate concrete output — code, notes, or a project.`,
        rules: ['No distractions allowed', 'Must produce tangible output', 'Self-report with evidence'],
        time_limit: bossTier === 'mini' ? '2 hours' : bossTier === 'major' ? '1 day' : '3 days',
        badge_reward: `⚔️ ${dimStats.name} Warrior`,
        game_master_message: `A challenge rises from the ${dimStats.name} domain. Prove your worth.`
      };
    }

    const created = await createBoss({
      dimId: dimension_id,
      tier: bossTier,
      name: bossData.boss_name,
      description: bossData.boss_description || bossData.description,
      rules: bossData.rules,
      rewardXP: BOSS_XP[bossTier],
      badgeReward: bossData.badge_reward
    });

    res.json({
      boss_available: true,
      boss: {
        id: created.id,
        boss_tier: bossTier,
        boss_name: bossData.boss_name,
        description: bossData.boss_description || bossData.description,
        rules: bossData.rules,
        reward_xp: BOSS_XP[bossTier],
        badge_reward: bossData.badge_reward,
        time_limit: bossData.time_limit
      },
      game_master_message: bossData.game_master_message
    });
  } catch (e) {
    console.error('RPG Check Boss Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Complete a boss fight
app.post('/api/rpg/complete-boss', aiLimiter, async (req, res) => {
  try {
    const { boss_id, evidence } = req.body;
    if (!boss_id || !evidence) return res.status(400).json({ error: 'boss_id and evidence are required' });

    const boss = await getBossById(boss_id);
    if (!boss) return res.status(404).json({ error: 'Boss not found' });
    if (boss.status !== 'available') return res.status(400).json({ error: 'Boss already completed or expired' });

    const dimStats = await getRpgStatsForDim(boss.dimension_id);
    const oldLevel = dimStats.level;

    // AI Judge Evaluation
    let judgement;
    try {
      judgement = await judgeChallenge({
        challengeName: boss.boss_name,
        rules: boss.rules, // Might be undefined or parsed string/array
        evidence: evidence
      });
      if (!judgement.approved) {
        return res.status(400).json({ error: judgement.feedback || 'The Game Master rejected your evidence. Provide more detail or a valid link.' });
      }
    } catch (judgeErr) {
      console.error('Judge AI failed, falling back to accept:', judgeErr.message);
    }

    // Complete the boss
    await completeBoss(boss_id, evidence);

    // Award XP
    const xpReward = boss.reward_xp || BOSS_XP[boss.boss_tier] || 200;
    await awardXP(boss.dimension_id, xpReward, 'boss', 1.0, `Boss defeated: ${boss.boss_name}`);

    // Apply permanent +10% bonus
    await applyBossBonus(boss.dimension_id, 10);

    // Award badge
    if (boss.badge_reward) {
      await addBadge(boss.badge_reward);
    }

    const newStats = await getRpgStatsForDim(boss.dimension_id);
    const levelUp = newStats.level > oldLevel;
    const character = await getRpgCharacter();

    // Generate victory narration
    let narration = { game_master_message: `${boss.boss_name} has fallen. +${xpReward} XP.` };
    try {
      narration = await generateBossVictoryNarration({
        bossName: boss.boss_name,
        bossTier: boss.boss_tier,
        dimensionName: dimStats.name,
        evidence,
        xpAwarded: xpReward,
        newLevel: newStats.level,
        levelTitle: levelTitle(newStats.level),
        badgeEarned: boss.badge_reward,
        nextBossPreview: shouldUnlockBoss(newStats.level) ? 'Next boss tier available!' : null
      });
    } catch (aiErr) {
      console.error('Boss victory narration failed (non-fatal):', aiErr.message);
    }

    res.json({
      boss_defeated: true,
      xp_awarded: xpReward,
      permanent_bonus: '+10% XP on this dimension forever',
      badge_earned: boss.badge_reward,
      new_total_xp: newStats.total_xp,
      level_up: levelUp,
      new_level: newStats.level,
      new_title: levelTitle(newStats.level),
      character_title: character.character_title,
      game_master_message: narration.game_master_message
    });
  } catch (e) {
    console.error('RPG Complete Boss Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Discover a new side quest (AI generated)
app.post('/api/rpg/side-quest/discover', aiLimiter, async (req, res) => {
  try {
    const character = await getRpgCharacter();
    const stats = await getRpgStats();

    // Pre-defined fallback quests in case AI fails
    const fallbackQuests = [
      { quest_name: 'The Open Source Contribution', quest_type: 'RANDOM', difficulty: 'medium', description: 'Find a bug or improvement in an open-source repo on GitHub. Fork it, fix it, and submit a pull request.', xp_reward: 150, badge_reward: '🐛 Bug Slayer', expires_in: null, dimension_affected: 'GitHub', game_master_message: 'The open source world calls. Leave your mark on a codebase that isn\'t yours.' },
      { quest_name: 'The LinkedIn Chronicles', quest_type: 'REPEATABLE', difficulty: 'easy', description: 'Write a LinkedIn post sharing something you learned this week — a technical insight, a project update, or a career reflection.', xp_reward: 40, badge_reward: '📝 Thought Leader', expires_in: 'weekly reset', dimension_affected: 'LinkedIn', game_master_message: 'Your network is watching. Share your journey — one post at a time.' },
      { quest_name: 'The Mentor Path', quest_type: 'RANDOM', difficulty: 'easy', description: 'Help someone debug their code — a classmate, an online forum post, or a Discord server question.', xp_reward: 30, badge_reward: '🤝 First Assist', expires_in: null, dimension_affected: 'Communication', game_master_message: 'Teaching is the highest form of understanding. Help another developer today.' },
      { quest_name: 'The Knowledge Vault', quest_type: 'REPEATABLE', difficulty: 'easy', description: 'Read one chapter of a technical book or complete one module of an online course.', xp_reward: 20, badge_reward: '📖 Bookworm', expires_in: 'weekly reset', dimension_affected: null, game_master_message: 'Knowledge compounds silently. One chapter today, expertise tomorrow.' },
      { quest_name: 'The Video Scroll', quest_type: 'RANDOM', difficulty: 'medium', description: 'Record yourself explaining a technical concept you recently learned. Post it anywhere or keep it private — the act of explaining is the quest.', xp_reward: 50, badge_reward: '📹 Explainer', expires_in: null, dimension_affected: 'Communication', game_master_message: 'If you can\'t explain it simply, you don\'t understand it. Prove that you do.' },
    ];

    let questData;
    try {
      questData = await generateSideQuest({
        characterTitle: character.character_title,
        dimensions: stats,
        recentActivity: req.body.recent_activity || '',
        weeklyQuestsDone: character.side_quests_this_week
      });
    } catch (aiErr) {
      console.error('Side Quest AI generation failed, using fallback:', aiErr.message);
      questData = fallbackQuests[Math.floor(Math.random() * fallbackQuests.length)];
    }

    const created = await createSideQuest({
      questName: questData.quest_name,
      questType: questData.quest_type,
      difficulty: questData.difficulty,
      description: questData.description,
      dimId: stats.find(s => s.name === questData.dimension_affected)?.dimension_id || null,
      xpReward: questData.xp_reward,
      badgeEarned: questData.badge_reward,
      expiresAt: questData.expires_in && questData.expires_in !== 'no expiry' && questData.expires_in !== 'weekly reset'
        ? new Date(Date.now() + parseDuration(questData.expires_in)).toISOString()
        : null
    });

    res.json({
      quest: { id: created.id, ...questData },
      weekly_progress: `${character.side_quests_this_week}/3 side quests this week${character.side_quests_this_week >= 2 ? ' — 1 more for Side Hustler badge + 50 XP!' : ''}`,
      game_master_message: questData.game_master_message
    });
  } catch (e) {
    console.error('RPG Side Quest Discover Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

function parseDuration(str) {
  if (!str) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const match = str.match(/(\d+)\s*(day|hour|week)/i);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const num = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'hour') return num * 60 * 60 * 1000;
  if (unit === 'week') return num * 7 * 24 * 60 * 60 * 1000;
  return num * 24 * 60 * 60 * 1000; // days
}

// Complete a side quest
app.post('/api/rpg/side-quest/complete', async (req, res) => {
  try {
    const { quest_id, evidence } = req.body;
    if (!quest_id) return res.status(400).json({ error: 'quest_id is required' });

    const q = await getSideQuestById(quest_id);
    if (!q) return res.status(404).json({ error: 'Quest not found' });
    if (q.status !== 'available') return res.status(400).json({ error: 'Quest already completed or expired' });

    // AI Judge Evaluation
    let judgement;
    try {
      judgement = await judgeChallenge({
        challengeName: q.quest_name,
        rules: q.description,
        evidence: evidence
      });
      if (!judgement.approved) {
        return res.status(400).json({ error: judgement.feedback || 'The Game Master rejected your evidence. Provide more detail or a valid link.' });
      }
    } catch (judgeErr) {
      console.error('Judge AI failed, falling back to accept:', judgeErr.message);
    }

    const quest = await completeSideQuest(quest_id, evidence || '');

    // Award XP
    if (quest.dimension_id) {
      await awardXP(quest.dimension_id, quest.xp_reward, 'side_quest', 1.0, `Side quest: ${quest.quest_name}`);
    } else {
      // Global XP with no specific dimension — pick the lowest one
      const stats = await getRpgStats();
      if (stats.length > 0) {
        const lowest = stats.sort((a, b) => a.total_xp - b.total_xp)[0];
        await awardXP(lowest.dimension_id, quest.xp_reward, 'side_quest', 1.0, `Side quest: ${quest.quest_name}`);
      }
    }

    // Award badge
    if (quest.badge_earned) {
      await addBadge(quest.badge_earned);
    }

    // Check weekly bonus
    const character = await getRpgCharacter();
    const weeklyBonus = checkWeeklyQuestBonus(character.side_quests_this_week);
    if (weeklyBonus) {
      await addBadge(weeklyBonus.badge);
      // Award bonus XP to lowest dimension
      const stats = await getRpgStats();
      if (stats.length > 0) {
        const lowest = stats.sort((a, b) => a.total_xp - b.total_xp)[0];
        await awardXP(lowest.dimension_id, weeklyBonus.bonusXP, 'weekly_bonus', 1.0, 'Weekly Side Hustler bonus');
      }
    }

    res.json({
      quest_completed: true,
      xp_awarded: quest.xp_reward,
      badge_earned: quest.badge_earned || null,
      weekly_progress: `${character.side_quests_this_week}/3 side quests this week`,
      weekly_bonus: weeklyBonus,
      character: character
    });
  } catch (e) {
    console.error('RPG Side Quest Complete Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// List side quests
app.get('/api/rpg/side-quests', async (req, res) => {
  try {
    const status = req.query.status || null;
    res.json(await getSideQuests(status));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// XP history log
app.get('/api/rpg/xp-log', async (req, res) => {
  try {
    const dimId = req.query.dimension_id || null;
    res.json(await getXPLog(dimId, 50));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// All boss fights
app.get('/api/rpg/bosses', async (_, res) => {
  try { res.json(await getAllBossFights()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// RPG stats for all dimensions
app.get('/api/rpg/stats', async (_, res) => {
  try {
    const stats = await getRpgStats();
    const enriched = stats.map(s => ({
      ...s,
      level_title: levelTitle(s.level),
      xp_to_next: xpForNextLevel(s.level),
      xp_in_level: xpInCurrentLevel(s.total_xp, s.level),
      xp_span: xpSpanOfLevel(s.level),
      progress_pct: s.level >= 10 ? 100 : Math.round((xpInCurrentLevel(s.total_xp, s.level) / xpSpanOfLevel(s.level)) * 100)
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RPG Heatmap & Reflections & Nodes ──────────────────────
app.get('/api/rpg/heatmap', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    res.json(await getDailyXPSummary(days));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rpg/reflections', async (req, res) => {
  try {
    const { dimension_id, old_score, new_score, reflection } = req.body;
    if (!dimension_id || !reflection) return res.status(400).json({ error: 'Missing required fields' });
    const result = await addReflection({ dimension_id, old_score, new_score, reflection });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/rpg/nodes', async (req, res) => {
  try {
    const { dimension_id } = req.query;
    res.json(await getSkillNodes(dimension_id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rpg/nodes', async (req, res) => {
  try {
    const { dimension_id, name } = req.body;
    if (!dimension_id || !name) return res.status(400).json({ error: 'Missing dimension_id or name' });
    res.json(await addSkillNode(dimension_id, name));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/rpg/nodes/:id/complete', async (req, res) => {
  try {
    const nodeId = req.params.id;
    await completeSkillNode(nodeId);
    
    // Fetch node to get dimension_id
    const nodes = await getSkillNodes();
    const node = nodes.find(n => n.id == nodeId);
    if (node) {
      await awardXP(node.dimension_id, 25, 'skill_node', 1.0, `Completed skill node: ${node.name}`);
    }
    
    res.json({ success: true, xp_awarded: 25 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Quest Stack ─────────────────────────────────────────────

const QUEST_XP = {
  task: 15,
  podcast: 10,
  course: 10,
  certification: 50,
  project: 30,
  goal: 20
};

// Get all quest stack items
app.get('/api/quest-stack', async (req, res) => {
  try {
    const status = req.query.status || null;
    const [items, stats] = await Promise.all([
      getQuestStack(status),
      getQuestStackStats()
    ]);
    res.json({ items, stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add a new quest item
app.post('/api/quest-stack', async (req, res) => {
  try {
    const { title, type, priority, dimension_id, due_date, est_hours, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const item = await addQuestItem({ title, type, priority, dimension_id, due_date, est_hours, notes });
    res.json(item);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update a quest item (edit, change priority, change status)
app.put('/api/quest-stack/:id', async (req, res) => {
  try {
    const item = await getQuestItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Quest item not found' });

    const oldStatus = item.status;
    const updated = await updateQuestItem(req.params.id, req.body);

    // Award +5 XP "starting bonus" when moving to ongoing
    if (oldStatus === 'todo' && req.body.status === 'ongoing' && item.dimension_id) {
      await awardXP(item.dimension_id, 5, 'quest_start', 1.0, `Started: ${item.title}`);
    }

    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete a quest item
app.delete('/api/quest-stack/:id', async (req, res) => {
  try {
    await deleteQuestItem(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/quest-stack/reorder', async (req, res) => {
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates)) return res.status(400).json({ error: 'Expected updates array' });
    await reorderQuestStack(updates);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Complete a quest item
app.post('/api/quest-stack/:id/complete', async (req, res) => {
  try {
    const item = await getQuestItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Quest item not found' });
    if (item.status === 'completed') return res.status(400).json({ error: 'Already completed' });

    const completed = await completeQuestItem(req.params.id);
    const xpAmount = QUEST_XP[item.type] || QUEST_XP.task;

    let xpResult = null;
    let radarRecommendation = null;

    // Award XP to linked dimension
    if (item.dimension_id) {
      xpResult = await awardXP(item.dimension_id, xpAmount, `quest_stack_${item.type}`, 1.0, `Completed: ${item.title}`);

      // Check if radar score should be bumped
      const dimStats = await getRpgStatsForDim(item.dimension_id);
      if (dimStats) {
        const completedInDim = await getQuestStack('completed');
        const dimCompleted = completedInDim.filter(q => q.dimension_id === item.dimension_id).length;
        // Recommend +1 radar bump every 5 completions, or for certifications/projects
        if (item.type === 'certification' || item.type === 'project' || dimCompleted % 5 === 0) {
          radarRecommendation = {
            dimension_id: item.dimension_id,
            dimension_name: item.dimension_name || dimStats.name,
            current_score: dimStats.score,
            suggested_score: Math.min(10, dimStats.score + 1),
            reason: item.type === 'certification'
              ? `🏆 You completed a certification! Consider bumping your ${dimStats.name} score.`
              : item.type === 'project'
                ? `🛠️ You shipped a project! Consider bumping your ${dimStats.name} score.`
                : `🔥 You\'ve completed ${dimCompleted} tasks in ${dimStats.name}! Consider bumping your score.`
          };
        }
      }
    } else {
      // No dimension linked — award to global character only
      await awardXP(null, 0, `quest_stack_${item.type}`, 1.0, `Completed: ${item.title}`);
    }

    // Auto-log to daily logs (completed: 0 to prevent double XP — XP already awarded above)
    const today = new Date().toISOString().split('T')[0];
    try {
      await addDailyLog({
        date: today,
        dimension_id: item.dimension_id || null,
        activity: `✅ ${item.title}`,
        duration_min: Math.round((item.est_hours || 0) * 60) || 30,
        notes: `Completed from Quest Stack (${item.type}) — XP already awarded`,
        xp_awarded: true // Flag that XP has already been given for this activity
      });
    } catch (logErr) {
      console.error('Quest auto-log failed (non-fatal):', logErr.message);
    }

    // Check daily completion streak bonus
    const stats = await getQuestStackStats();
    let streakBonus = null;
    if (stats.today_completed >= 3 && item.dimension_id) {
      streakBonus = { xp: 20, message: '🔥 Daily Quest Streak! 3+ tasks completed today (+20 XP bonus)' };
      await awardXP(item.dimension_id, 20, 'quest_streak_bonus', 1.0, 'Daily Quest Streak: 3+ tasks completed today');
    }

    res.json({
      completed: true,
      item: completed,
      xp_awarded: xpAmount,
      xp_result: xpResult,
      radar_recommendation: radarRecommendation,
      streak_bonus: streakBonus,
      stats
    });
  } catch (e) {
    console.error('Quest Complete Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Serve frontend in production ───────────────────────────
const distPath = path.join(__dirname, '..', 'dist');
import fs from 'fs';
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      next();
    }
  });
}

// ── Initialize and Start Server ────────────────────────────
async function startServer() {
  try {
    await initDb();
    console.log('✅ Database initialized successfully');
    
    try {
      const savedTokens = await getSetting('google_tokens');
      if (savedTokens) {
        const client = getOAuthClient(null);
        client.setCredentials(JSON.parse(savedTokens));
        console.log('✅ Google OAuth tokens loaded');
      }
    } catch (e) {
      console.error("Failed to load google tokens:", e.message);
    }
    
    app.listen(PORT, () => {
      console.log(`\n  ⚡ Growth Radar API running on http://localhost:${PORT}`);
      console.log(`  🔒 PIN Protection Enabled (Default: 976312)`);
      if (process.env.TURSO_DB_URL) {
        console.log(`  📁 Database: Turso Cloud SQLite\n`);
      } else {
        console.log(`  📁 Database: Local SQLite (file:server/data/growth.db)\n`);
      }
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
