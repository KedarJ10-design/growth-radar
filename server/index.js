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
  getDailyLogs, addDailyLog, toggleDailyLog, deleteDailyLog, getStreak,
  saveSchedule, getSchedules, getRecentLogsForDims, getRecentSchedulesLimit,
  getStats, getAllDataForExport,
  getSetting, setSetting
} from './db.js';
import { generateSchedule } from './ai.js';
import { generateExcel, generateCSV } from './export.js';

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
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables");
  }
  
  let redirectUri = `${API_URL}/api/calendar/callback`;
  if (req && process.env.NODE_ENV === 'production') {
     const protocol = req.headers['x-forwarded-proto'] || req.protocol;
     const host = req.get('host');
     redirectUri = `${protocol}://${host}/api/calendar/callback`;
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
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
    res.json(log);
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
        const client = getOAuthClient(req);
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
