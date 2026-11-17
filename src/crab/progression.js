export const BASE_HEALTH = 30;
export const HEALTH_PER_LEVEL = 8;
export const ATTACK_PER_LEVEL = 1;
export const MAX_LEVEL = 10;
export const GATHER_EXPERIENCE = 2;

export function experienceForLevel(level) {
  return Math.round(20 * Math.pow(level, 1.6));
}

export function createProgression(saved) {
  const state = { level: 1, experience: 0, health: BASE_HEALTH, ...(saved || {}) };

  const maxHealth = () => BASE_HEALTH + HEALTH_PER_LEVEL * (state.level - 1);
  const attackBonus = () => ATTACK_PER_LEVEL * (state.level - 1);
  const experienceToNext = () => (state.level >= MAX_LEVEL ? 0 : experienceForLevel(state.level));
  state.health = Math.min(state.health, maxHealth());

  function gainExperience(amount) {
    let levelsGained = 0;
    if (state.level >= MAX_LEVEL) return 0;
    state.experience += amount;
    while (state.level < MAX_LEVEL && state.experience >= experienceForLevel(state.level)) {
      state.experience -= experienceForLevel(state.level);
      state.level++;
      levelsGained++;
    }
    if (state.level >= MAX_LEVEL) state.experience = 0;
    if (levelsGained) state.health = maxHealth();
    return levelsGained;
  }

  function setLevel(level) {
    state.level = Math.max(1, Math.min(MAX_LEVEL, level));
    state.experience = 0;
    state.health = maxHealth();
  }

  return {
    state,
    maxHealth,
    attackBonus,
    experienceToNext,
    gainExperience,
    setLevel,
    serialize: () => ({ ...state }),
  };
}
