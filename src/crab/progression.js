export const BASE_HEALTH = 30;
export const HEALTH_PER_LEVEL = 8;
export const ATTACK_PER_LEVEL = 1;
export const MAX_LEVEL = 50;
export const GATHER_EXPERIENCE = 2;

export const MOLT_LEVELS = [3, 6, 9, 12, 15, 18, 21, 24];
export const EXPERIENCE_PER_EXTRA_MOLT = 1500;
export const MAX_MOLTS = 8;
export const MOLT_SECONDS = 60;
export const SOFT_SECONDS = 120;
export const SOFT_DEFENSE_FACTOR = 0.5;
export const MOLT_KINDS = {
  crusher: { label: 'Crusher', icon: '🔨', description: 'big claw grows: +5% damage', damagePerMolt: 0.05 },
  cutter: { label: 'Cutter', icon: '✂️', description: 'small claw grows: attacks 5% faster', intervalPerMolt: 0.95 },
};

export const MAX_CLAW_SKILL = 20;
export const CLAW_SKILL_DAMAGE_PER_LEVEL = 0.01;
export const CLAW_SKILL_PER_HIT = 0.12;
export const CLAW_SKILL_SLOWDOWN = 0.25;
export const CLAW_SKILL_DEATH_SHARE = 0.95;

export const DIFFICULTY_TIERS = [
  { name: 'trivial', below: -5 },
  { name: 'easy', below: -2 },
  { name: 'even', below: 3 },
  { name: 'tough', below: 5 },
  { name: 'hard', below: 7 },
  { name: 'deadly', below: 9 },
  { name: 'impossible', below: Infinity },
];
const BLUE_EXPERIENCE_SHARE = 0.5;
const TRIVIAL_EXPERIENCE_SHARE = 0.1;
const TRIVIAL_EXPERIENCE_DECAY = 0.8;
const TRIVIAL_LEVEL_DIFFERENCE = -6;

export function difficultyOf(enemyLevel, playerLevel) {
  const difference = enemyLevel - playerLevel;
  return DIFFICULTY_TIERS.find((tier) => difference < tier.below).name;
}

export function experienceForKill(baseExperience, enemyLevel, playerLevel) {
  const difference = enemyLevel - playerLevel;
  let share = 1;
  if (difference <= TRIVIAL_LEVEL_DIFFERENCE) share = TRIVIAL_EXPERIENCE_SHARE * TRIVIAL_EXPERIENCE_DECAY ** (TRIVIAL_LEVEL_DIFFERENCE - difference);
  else if (difference <= -3) share = BLUE_EXPERIENCE_SHARE;
  return Math.max(1, Math.round(baseExperience * share));
}

export function experienceForLevel(level) {
  return Math.round(20 * Math.pow(level, 1.6));
}

export function createProgression(saved) {
  const state = { level: 1, experience: 0, health: BASE_HEALTH, capExperience: 0, molts: [], clawSkill: 0, ...(saved || {}) };

  const maxHealth = () => BASE_HEALTH + HEALTH_PER_LEVEL * (state.level - 1);
  const attackBonus = () => ATTACK_PER_LEVEL * (state.level - 1);
  const experienceToNext = () => (state.level >= MAX_LEVEL ? 0 : experienceForLevel(state.level));
  state.health = Math.min(state.health, maxHealth());

  const moltsEarned = () => Math.min(MAX_MOLTS, MOLT_LEVELS.filter((level) => state.level >= level).length + Math.floor(state.capExperience / EXPERIENCE_PER_EXTRA_MOLT));
  const moltsAvailable = () => Math.max(0, moltsEarned() - state.molts.length);
  const moltCount = (kind) => state.molts.filter((molt) => molt === kind).length;

  function gainExperience(amount) {
    if (state.level >= MAX_LEVEL) {
      state.capExperience += amount;
      return 0;
    }
    let levelsGained = 0;
    state.experience += amount;
    while (state.level < MAX_LEVEL && state.experience >= experienceForLevel(state.level)) {
      state.experience -= experienceForLevel(state.level);
      state.level++;
      levelsGained++;
    }
    if (state.level >= MAX_LEVEL) {
      state.capExperience += state.experience;
      state.experience = 0;
    }
    if (levelsGained) state.health = maxHealth();
    return levelsGained;
  }

  function setLevel(level) {
    state.level = Math.max(1, Math.min(MAX_LEVEL, level));
    state.experience = 0;
    state.capExperience = 0;
    state.health = maxHealth();
  }

  function molt(kind) {
    if (!MOLT_KINDS[kind] || !moltsAvailable()) return false;
    state.molts.push(kind);
    return true;
  }

  function practiceClaws() {
    state.clawSkill = Math.min(MAX_CLAW_SKILL, state.clawSkill + CLAW_SKILL_PER_HIT / (1 + CLAW_SKILL_SLOWDOWN * state.clawSkill));
  }

  function loseSkillOnDeath() {
    state.clawSkill *= CLAW_SKILL_DEATH_SHARE;
  }

  function combatModifiers() {
    return {
      attackMultiplier: (1 + MOLT_KINDS.crusher.damagePerMolt * moltCount('crusher')) * (1 + CLAW_SKILL_DAMAGE_PER_LEVEL * state.clawSkill),
      attackIntervalFactor: MOLT_KINDS.cutter.intervalPerMolt ** moltCount('cutter'),
    };
  }

  return {
    state,
    maxHealth,
    attackBonus,
    experienceToNext,
    gainExperience,
    setLevel,
    moltsEarned,
    moltsAvailable,
    moltCount,
    molt,
    practiceClaws,
    loseSkillOnDeath,
    combatModifiers,
    serialize: () => ({ ...state, molts: [...state.molts] }),
  };
}
