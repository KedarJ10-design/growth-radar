// ── RPG AI Game Master ────────────────────────────────────
// Uses the same Groq API as ai.js but with RPG-specific prompts
import { ChatGroq } from '@langchain/groq';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

let chatModel = null;

function getModel() {
  if (!chatModel) {
    const key = process.env.GROQ_API_KEY;
    if (!key || key === 'your_groq_api_key_here') {
      throw new Error('GROQ_API_KEY not configured.');
    }
    chatModel = new ChatGroq({
      apiKey: key,
      model: "openai/gpt-oss-120b",
      temperature: 0.8, // Slightly higher for creative Game Master narration
    });
  }
  return chatModel;
}

// ── Schemas ───────────────────────────────────────────────

const GameMasterMessageSchema = z.object({
  game_master_message: z.string().describe("A punchy 2-3 sentence Game Master narration. Dramatic, specific to what happened, never generic praise. Reference exactly what the user did."),
});

const BossFightSchema = z.object({
  boss_name: z.string().describe("Creative boss name themed to the dimension (e.g., 'The Array Gauntlet', 'The CSS Labyrinth')"),
  boss_description: z.string().describe("What the boss fight challenge is — specific, actionable, with clear deliverables"),
  rules: z.array(z.string()).describe("3-5 specific rules for the boss fight"),
  time_limit: z.string().describe("Time limit (e.g., '2 hours', '1 day')"),
  badge_reward: z.string().describe("A badge with emoji earned on completion (e.g., '⚔️ Array Slayer')"),
  game_master_message: z.string().describe("Epic, dramatic introduction of the boss. Make it feel like a real boss encounter. 2-3 sentences."),
});

const SideQuestSchema = z.object({
  quest_name: z.string().describe("Creative quest name (e.g., 'The Open Source Contribution', 'The LinkedIn Chronicles')"),
  quest_type: z.string().describe("One of: LIMITED_TIME, RANDOM, REPEATABLE, HIDDEN"),
  difficulty: z.string().describe("One of: easy, medium, hard"),
  description: z.string().describe("Exactly what to do to complete the quest"),
  xp_reward: z.number().describe("XP reward between 20 and 300 based on difficulty"),
  badge_reward: z.string().describe("A badge with emoji (e.g., '🐛 Bug Slayer')"),
  expires_in: z.string().nullable().describe("When it expires (e.g., 'in 3 days', 'weekly reset', null for no expiry)"),
  dimension_affected: z.string().nullable().describe("Which dimension this helps, or null if general"),
  game_master_message: z.string().describe("Quest reveal narration — make it sound exciting and worth doing. 2-3 sentences."),
});

const LogTasksResponseSchema = z.object({
  game_master_message: z.string().describe("Punchy, specific Game Master narration referencing what was actually done. Never say 'Great job' or 'Well done'. 2-3 sentences max."),
  suggestion: z.string().nullable().describe("If the user leveled up, strongly recommend they manually update their Radar score for this dimension in the Dimensions tab. Otherwise, suggest what they should do next."),
});

const JudgeEvidenceSchema = z.object({
  approved: z.boolean().describe("True if the evidence plausibly proves the challenge was completed according to the rules, False otherwise."),
  feedback: z.string().describe("If rejected, specifically explain why the evidence is insufficient or which rule was missed. If approved, a very short congratulatory note. Address the user directly."),
});

// ── AI Functions ──────────────────────────────────────────

// Generate a Game Master message for task completion / XP gain
export async function generateTaskNarration({ dimensionName, tasksCompleted, xpEarned, newLevel, levelTitle, levelUp, streakDays }) {
  const model = getModel();
  const structured = model.withStructuredOutput(LogTasksResponseSchema);

  const prompt = `You are a Game Master for Kedar's RPG growth system. He is a CS student in Pune hunting for a Full Stack SDE job.

He just completed tasks in "${dimensionName}":
Tasks: ${tasksCompleted.join(', ')}
XP earned: ${xpEarned}
${levelUp ? `🎉 LEVEL UP! Now Level ${newLevel} — "${levelTitle}"` : `Current Level: ${newLevel} — "${levelTitle}"`}
Streak: ${streakDays} days

TONE RULES:
- You are a Game Master — dramatic, precise, never hollow
- Reference what Kedar ACTUALLY did, not generic praise
- Victory feels earned, not handed
- Never say "Great job!" or "Well done!" — show don't tell
- Keep game_master_message under 3 sentences — punchy not preachy
- If level up, make it feel EPIC`;

  return await structured.invoke(prompt);
}

// Generate a boss fight challenge
export async function generateBossFight({ dimensionName, level, tier, completedBosses }) {
  const model = getModel();
  const structured = model.withStructuredOutput(BossFightSchema);

  const tierDesc = {
    mini: "Mini Boss (unlocks every 2 levels, 200 XP reward, timed challenge)",
    major: "Major Boss (unlocks at Level 5 and 8, 500 XP reward, hard and high-stakes)",
    final: "Final Boss (Level 10 only, 1000 XP reward, real-world proof of mastery required)"
  };

  const pastBosses = completedBosses.length > 0
    ? `Past bosses defeated: ${completedBosses.map(b => b.boss_name).join(', ')}`
    : 'No bosses defeated yet in this dimension.';

  const prompt = `You are a Game Master creating a ${tierDesc[tier]} for Kedar's RPG system.

Dimension: ${dimensionName}
Current Level: ${level}
Boss Tier: ${tier}
${pastBosses}

Kedar is a CS student in Pune job-hunting for Full Stack SDE roles.
His stack: React, TypeScript, Node.js, Firebase, Supabase, Flutter, Gemini API.

Create a boss fight that:
- Is a REAL, actionable challenge (not a quiz — something he builds, solves, or proves)
- Difficulty matches the tier (mini = doable in 1-2 hours, major = needs a full day, final = multi-day with proof)
- Is specific to the "${dimensionName}" dimension
- Has clear completion criteria
- The badge should be creative and dimension-themed

TONE: Make the boss fight introduction feel like encountering a real boss in a game — dramatic and slightly intimidating but exciting.`;

  return await structured.invoke(prompt);
}

// Generate a side quest
export async function generateSideQuest({ characterTitle, dimensions, recentActivity, weeklyQuestsDone }) {
  const model = getModel();
  const structured = model.withStructuredOutput(SideQuestSchema);

  const dimSummary = dimensions.map(d => `${d.name} (Lv.${d.level}, ${d.score}/10)`).join(', ');

  const prompt = `You are a Game Master generating a side quest for Kedar's RPG growth system.

Character: "${characterTitle}"
Dimensions: ${dimSummary}
Recent activity: ${recentActivity || 'Normal daily grind'}
Side quests done this week: ${weeklyQuestsDone}/3 (3 = bonus badge)

Kedar is a CS student in Pune job-hunting for Full Stack SDE roles.

Generate a side quest that:
- Is a real-world activity he can actually do (not theoretical)
- Focus heavily on "learning" activities rather than "doing/building" activities.
- Examples: read a specific technical paper, research a new concept, watch a deep-dive conference talk, explore an open-source codebase to see how it works, or write a summary of a complex topic.
- Quest type should match the nature (LIMITED_TIME for urgent opportunities, REPEATABLE for habits, HIDDEN for unlockable achievements)
- XP should match difficulty (easy: 20-40, medium: 50-100, hard: 150-300)

TONE: Make the quest sound worth doing. Create urgency for LIMITED_TIME quests.`;

  return await structured.invoke(prompt);
}

// Generate Game Master message for boss fight completion
export async function generateBossVictoryNarration({ bossName, bossTier, dimensionName, evidence, xpAwarded, newLevel, levelTitle, badgeEarned, nextBossPreview }) {
  const model = getModel();
  const structured = model.withStructuredOutput(GameMasterMessageSchema);

  const prompt = `You are a Game Master. Kedar just defeated a boss in his RPG growth system!

Boss: "${bossName}" (${bossTier} tier)
Dimension: ${dimensionName}
Evidence: "${evidence}"
XP Awarded: ${xpAwarded}
New Level: ${newLevel} — "${levelTitle}"
Badge Earned: ${badgeEarned}
${nextBossPreview ? `Next boss preview: ${nextBossPreview}` : ''}

TONE RULES:
- Epic victory narration — this is a BOSS DEFEAT moment
- Reference the specific evidence Kedar gave
- Make the badge feel earned
- Tease the next challenge if applicable
- 2-3 sentences, punchy, dramatic, never generic`;

  return await structured.invoke(prompt);
}

// Judge boss fight or side quest evidence
export async function judgeChallenge({ challengeName, rules, evidence }) {
  const model = getModel();
  // Using lower temperature for strict judging
  const judgeModel = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "openai/gpt-oss-120b",
    temperature: 0.1,
  });
  
  const structured = judgeModel.withStructuredOutput(JudgeEvidenceSchema);

  const prompt = `You are the Game Master, a strict but fair judge for an RPG gamification system.
Kedar is trying to claim victory for a challenge.

Challenge Name: ${challengeName}
Rules to satisfy:
${rules ? (Array.isArray(rules) ? rules.map(r => '- ' + r).join('\n') : rules) : 'No specific rules, just complete the challenge.'}

Kedar's Submitted Evidence:
"${evidence}"

Evaluate if the evidence plausibly proves he completed the challenge according to the rules. 
If the evidence is lazy (like "done by vibe coding", "done", or just "yes"), you MUST reject it.
If the evidence contains a relevant GitHub link, deployed URL, or a specific, plausible explanation of how he solved it, approve it.
Be strict on the rules but assume good faith if detailed code or links are provided.

Output whether it is approved and provide feedback.`;

  return await structured.invoke(prompt);
}
