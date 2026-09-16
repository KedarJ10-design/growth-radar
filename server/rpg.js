// ── RPG Engine: XP Calculation, Levels, Multipliers ───────
// Pure math — no AI calls, no database access

export const LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1500, 2200, 3000, 4000, 5200];
export const LEVEL_TITLES = ['Novice', 'Apprentice', 'Practitioner', 'Skilled', 'Proficient',
  'Advanced', 'Expert', 'Master', 'Elite', 'Legend'];
export const CHARACTER_TITLES = ['Fresher', 'Apprentice Dev', 'Junior Dev', 'Rising Dev',
  'Mid Dev', 'Senior Dev', 'Lead Dev', 'Architect', 'Principal', 'Legend'];

export const XP_BASE = { easy: 10, medium: 25, hard: 50 };
export const BOSS_XP = { mini: 200, major: 500, final: 1000 };

// Calculate level from total XP
export function xpToLevel(totalXP) {
  let level = 1;
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalXP >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return Math.min(level, 10);
}

// Get XP needed for next level
export function xpForNextLevel(level) {
  if (level >= 10) return 0; // Max level
  return LEVEL_THRESHOLDS[level]; // threshold[level] is the XP needed to reach level+1
}

// XP remaining in current level
export function xpInCurrentLevel(totalXP, level) {
  if (level >= 10) return totalXP;
  const currentThreshold = level > 1 ? LEVEL_THRESHOLDS[level - 1] : 0;
  return totalXP - currentThreshold;
}

// XP span of current level
export function xpSpanOfLevel(level) {
  if (level >= 10) return 1; // prevent div by zero
  const currentThreshold = level > 1 ? LEVEL_THRESHOLDS[level - 1] : 0;
  return LEVEL_THRESHOLDS[level] - currentThreshold;
}

// Get title for a level
export function levelTitle(level) {
  return LEVEL_TITLES[Math.min(level, 10) - 1] || 'Novice';
}

// Get character title based on global XP
export function xpToCharacterTitle(globalXP) {
  // Character title thresholds (roughly based on combined XP across all dims)
  const thresholds = [0, 500, 1500, 3000, 6000, 10000, 16000, 25000, 35000, 50000];
  let idx = 0;
  for (let i = 1; i < thresholds.length; i++) {
    if (globalXP >= thresholds[i]) idx = i;
    else break;
  }
  return CHARACTER_TITLES[idx] || 'Fresher';
}

// Calculate XP for a set of tasks
export function calculateTaskXP({ taskCount, difficulty, streakDays, comboDimensions, bonusPct }) {
  const basePerTask = XP_BASE[difficulty] || XP_BASE.medium;
  let baseXP = taskCount * basePerTask;

  let multiplier = 1.0;
  const multiplierReasons = [];

  // 7-day streak bonus
  if (streakDays >= 7) {
    multiplier *= 2.0;
    multiplierReasons.push('🔥 7-day streak (2x)');
  }

  // DSA + System Design combo
  if (comboDimensions && comboDimensions.length >= 2) {
    const hasDSA = comboDimensions.some(d => d.toLowerCase().includes('dsa'));
    const hasSD = comboDimensions.some(d => d.toLowerCase().includes('system design'));
    if (hasDSA && hasSD) {
      multiplier *= 1.5;
      multiplierReasons.push('⚡ DSA+SD combo (1.5x)');
    }
  }

  // Permanent boss fight bonus
  if (bonusPct && bonusPct > 0) {
    multiplier *= (1 + bonusPct / 100);
    multiplierReasons.push(`🏆 Boss bonus (+${bonusPct}%)`);
  }

  const finalXP = Math.round(baseXP * multiplier);

  return {
    baseXP,
    multiplier: Math.round(multiplier * 100) / 100,
    multiplierReasons,
    finalXP
  };
}

// Daily log completion XP (for auto-award)
export function calculateLogCompletionXP(durationMin) {
  if (durationMin >= 120) return { difficulty: 'hard', xp: XP_BASE.hard };
  if (durationMin >= 45) return { difficulty: 'medium', xp: XP_BASE.medium };
  return { difficulty: 'easy', xp: XP_BASE.easy };
}

// Check which boss tier is available at a given level
export function getAvailableBossTier(level, completedBosses) {
  const completedTiers = completedBosses.map(b => `${b.boss_tier}_${b.dimension_id}`);

  if (level >= 10) return 'final';
  if (level >= 8) return 'major';
  if (level >= 5) {
    // Check if mini bosses done for levels 2,4 — then major is next
    return 'major';
  }
  if (level >= 2 && level % 2 === 0) return 'mini';
  if (level >= 3 && (level - 1) % 2 === 0) return 'mini';

  return null; // No boss available
}

// Check if a boss fight should be unlocked
export function shouldUnlockBoss(level) {
  // Mini boss every 2 levels (2, 4, 6, 8, 10)
  // Major boss at 5 and 8
  // Final boss at 10
  if (level === 10) return 'final';
  if (level === 5 || level === 8) return 'major';
  if (level >= 2 && level % 2 === 0) return 'mini';
  return null;
}

// Side quest weekly counter check
export function checkWeeklyQuestBonus(questsDoneThisWeek) {
  if (questsDoneThisWeek >= 3) {
    return { bonusXP: 50, badge: '🏃 Side Hustler' };
  }
  return null;
}
