export const SHELLS = {
  snail: {
    label: 'Snail shell',
    role: 'Starter',
    defense: 2,
    speedFactor: 1,
    attackFactor: 1,
    ability: null,
    cost: { shellBits: 3 },
    breakable: true,
    look: { turns: 2.7, spireShare: 0.86, whorlRadius: 0.5, tubeRadius: 0.6, height: 1.25, bandFrequency: 26, light: [0.98, 0.94, 0.86], band: [0.86, 0.3, 0.1], inside: [0.36, 0.22, 0.2] },
  },
  turban: {
    label: 'Turban shell',
    role: 'Tank',
    defense: 7,
    speedFactor: 0.88,
    attackFactor: 1,
    ability: { id: 'brace', label: 'Brace', description: '−30% damage taken while standing still' },
    cost: { shellBits: 10, seaLettuce: 4 },
    breakable: true,
    look: { turns: 2.1, spireShare: 0.9, whorlRadius: 0.66, tubeRadius: 0.72, height: 0.78, bandFrequency: 24, light: [0.74, 0.68, 0.5], band: [0.3, 0.36, 0.2], inside: [0.88, 0.86, 0.8] },
  },
  cone: {
    label: 'Cone shell',
    role: 'Striker',
    defense: 3,
    speedFactor: 1.05,
    attackFactor: 1.25,
    ability: { id: 'sting', label: 'Sting', description: 'every 4th hit deals double damage' },
    cost: { shellBits: 8, driftwood: 4 },
    breakable: true,
    look: { turns: 3.4, spireShare: 0.92, whorlRadius: 0.24, tubeRadius: 0.5, height: 1.9, bandFrequency: 40, light: [0.96, 0.84, 0.6], band: [0.42, 0.2, 0.08], inside: [0.94, 0.72, 0.62] },
  },
  coral: {
    label: 'Coral shell',
    tier: 2,
    role: 'Reef tank',
    defense: 12,
    speedFactor: 0.85,
    attackFactor: 1,
    ability: { id: 'brace', label: 'Brace+ · Spikes', description: '−40% damage taken while standing still; attackers take 3 damage', damageFactor: 0.6, thorns: 3 },
    cost: { coral: 6, seaGlass: 2, shellBits: 6 },
    breakable: true,
    look: { turns: 2.3, spireShare: 0.88, whorlRadius: 0.62, tubeRadius: 0.82, height: 0.95, bandFrequency: 30, knobs: 34, light: [0.96, 0.42, 0.4], band: [0.62, 0.12, 0.2], inside: [0.98, 0.88, 0.82] },
  },
  whelk: {
    label: 'Spiral whelk',
    tier: 2,
    role: 'Reef striker',
    defense: 5,
    speedFactor: 1.1,
    attackFactor: 1.35,
    ability: { id: 'sting', label: 'Sting+', description: 'every 3rd hit deals double damage', everyHits: 3 },
    cost: { seaGlass: 4, coral: 3, shellBits: 6 },
    breakable: true,
    look: { turns: 4.2, spireShare: 0.94, whorlRadius: 0.32, tubeRadius: 0.56, height: 1.75, bandFrequency: 52, light: [0.86, 0.9, 0.94], band: [0.2, 0.42, 0.62], inside: [0.96, 0.82, 0.72] },
  },
  tinCan: {
    label: 'Tin can',
    tier: 3,
    role: 'Camp tank',
    defense: 20,
    speedFactor: 0.8,
    attackFactor: 1,
    ability: { id: 'brace', label: 'Brace+ · Clang', description: '−40% damage taken while standing still; attackers take 5 damage', damageFactor: 0.6, thorns: 5 },
    cost: { scrap: 6, cloth: 3, coral: 4 },
    breakable: true,
    look: { form: 'can', radius: 0.78, length: 1.8, whorlRadius: 0.78, light: [0.78, 0.79, 0.82], band: [0.78, 0.14, 0.1], inside: [0.5, 0.5, 0.52] },
  },
  bottle: {
    label: 'Glass bottle',
    tier: 3,
    role: 'Camp striker',
    defense: 9,
    speedFactor: 1.05,
    attackFactor: 1.4,
    ability: { id: 'pierce', label: 'Pierce', description: 'hits ignore enemy armour', pierce: true },
    cost: { seaGlass: 6, scrap: 3, cloth: 3 },
    breakable: true,
    look: { form: 'bottle', radius: 0.7, length: 2.2, neckRadius: 0.44, whorlRadius: 0.7, light: [0.2, 0.5, 0.28], band: [0.9, 0.84, 0.64], inside: [0.1, 0.22, 0.12] },
  },
  skull: {
    label: 'Bird skull',
    tier: 4,
    role: 'Hold tank',
    defense: 28,
    speedFactor: 0.75,
    attackFactor: 1,
    ability: { id: 'brace', label: 'Brace+ · Dread', description: '−40% damage taken while standing still; enemies hit 20% softer', damageFactor: 0.6, dreadFactor: 0.8 },
    cost: { fishBone: 8, wax: 4, scrap: 6 },
    breakable: true,
    look: { form: 'skull', radius: 0.82, length: 2.0, whorlRadius: 0.82, light: [0.93, 0.9, 0.8], band: [0.45, 0.38, 0.3], inside: [0.2, 0.17, 0.14] },
  },
  thimble: {
    label: 'Silver thimble',
    tier: 4,
    role: 'Hold striker',
    defense: 12,
    speedFactor: 1.1,
    attackFactor: 1.6,
    ability: { id: 'sting', label: 'Sting++', description: 'every 2nd hit deals double damage', everyHits: 2 },
    cost: { scrap: 6, wax: 4, seaGlass: 3 },
    breakable: true,
    look: { form: 'thimble', radius: 0.74, length: 1.7, whorlRadius: 0.74, light: [0.86, 0.87, 0.9], band: [0.5, 0.52, 0.56], inside: [0.3, 0.3, 0.33] },
  },

};

export const NAKED = {
  label: 'No shell',
  defense: 0,
  speedFactor: 1,
  attackFactor: 1,
  ability: null,
  look: { soft: true, tubeRadius: 0.34, light: [0.96, 0.72, 0.62], band: [0.66, 0.36, 0.34] },
};

export const CLAWS = {
  bare: { label: 'Bare claws', attackBonus: 0, cost: null, breakable: false, enchantable: false },
  shellEdged: { label: 'Shell-edged claws', attackBonus: 4, cost: { shellBits: 6, driftwood: 4 }, breakable: true },
  kelpWrapped: { label: 'Kelp-wrapped claws', attackBonus: 2, cost: { driedKelp: 4, shellBits: 4 }, breakable: true, healOnHit: 1 },
  coralTipped: { label: 'Coral-tipped claws', tier: 2, attackBonus: 8, cost: { coral: 5, seaGlass: 2, driftwood: 2 }, breakable: true, tint: [1.7, 1.25, 1.6] },
  fishhook: { label: 'Fishhook claws', tier: 3, attackBonus: 13, cost: { scrap: 5, cloth: 2, coral: 2 }, breakable: true, tint: [0.85, 2.3, 4.2] },
  fork: { label: 'Fork-tine claws', tier: 4, attackBonus: 19, cost: { scrap: 6, fishBone: 4, cloth: 2 }, breakable: true, tint: [1.35, 1.4, 1.5], tines: true },
};

export const BASE_ATTACK = 4;
export const ENCHANT_SHARE_PER_LEVEL = 0.12;

export function enchantBonus(baseValue, enchantLevel) {
  return enchantLevel * Math.max(1, Math.round(baseValue * ENCHANT_SHARE_PER_LEVEL));
}

export const ENCHANT_LEVELS = [
  null,
  { chance: 1, glow: 0, color: [1, 1, 1], pulse: false },
  { chance: 1, glow: 0, color: [1, 1, 1], pulse: false },
  { chance: 1, glow: 0.35, color: [1, 0.97, 0.9], pulse: false },
  { chance: 0.7, glow: 0.55, color: [0.12, 0.42, 1], pulse: false },
  { chance: 0.55, glow: 0.75, color: [0.12, 0.42, 1], pulse: false },
  { chance: 0.4, glow: 0.85, color: [0.12, 0.42, 1], pulse: true },
  { chance: 0.3, glow: 0.9, color: [0.6, 0.22, 1], pulse: false },
  { chance: 0.2, glow: 1.05, color: [0.6, 0.22, 1], pulse: true },
  { chance: 0.15, glow: 1.6, color: [1, 0.5, 0.06], pulse: true, groundGlow: true },
];
export const MAX_ENCHANT = ENCHANT_LEVELS.length - 1;
export const ENCHANT_PEARL_COST = 1;
export const ENCHANT_SHELL_BITS_PER_LEVEL = 2;

export function enchantCost(targetLevel) {
  return { pearls: ENCHANT_PEARL_COST, shellBits: ENCHANT_SHELL_BITS_PER_LEVEL * targetLevel };
}

export function enchantLook(enchantLevel) {
  return ENCHANT_LEVELS[enchantLevel] || { glow: 0, color: [1, 1, 1], pulse: false };
}

export function canAfford(cost, inventory) {
  return Object.entries(cost).every(([type, amount]) => (inventory[type] || 0) >= amount);
}

function createEmptyGear() {
  return {
    nextId: 3,
    shells: [{ id: 1, kind: 'snail', enchant: 0 }],
    claws: [{ id: 2, kind: 'bare', enchant: 0 }],
    wornShellId: 1,
    wornClawsId: 2,
  };
}

export function createGear(saved) {
  const state = saved ? structuredClone(saved) : createEmptyGear();

  const wornShell = () => state.shells.find((item) => item.id === state.wornShellId);
  const wornClaws = () => state.claws.find((item) => item.id === state.wornClawsId);

  function craft(category, kind, inventory) {
    const definition = (category === 'shell' ? SHELLS : CLAWS)[kind];
    if (!definition || !definition.cost || !canAfford(definition.cost, inventory)) return null;
    for (const [type, amount] of Object.entries(definition.cost)) inventory[type] -= amount;
    const item = { id: state.nextId++, kind, enchant: 0, isNew: true };
    (category === 'shell' ? state.shells : state.claws).push(item);
    return item;
  }

  function wear(id) {
    if (state.shells.some((item) => item.id === id)) state.wornShellId = id;
    else if (state.claws.some((item) => item.id === id)) state.wornClawsId = id;
    else return false;
    return true;
  }

  function findItem(id) {
    const shell = state.shells.find((item) => item.id === id);
    if (shell) return { category: 'shell', item: shell, definition: SHELLS[shell.kind] };
    const claws = state.claws.find((item) => item.id === id);
    if (claws) return { category: 'claws', item: claws, definition: CLAWS[claws.kind] };
    return null;
  }

  function enchantableItems() {
    return [...state.shells, ...state.claws].map((item) => findItem(item.id)).filter(({ definition }) => definition.enchantable !== false);
  }

  function enchant(id, inventory, random) {
    const found = findItem(id);
    if (!found || found.definition.enchantable === false) return null;
    const targetLevel = (found.item.enchant || 0) + 1;
    if (targetLevel > MAX_ENCHANT) return null;
    const cost = enchantCost(targetLevel);
    if (!canAfford(cost, inventory)) return null;
    for (const [type, amount] of Object.entries(cost)) inventory[type] -= amount;
    if (random() < ENCHANT_LEVELS[targetLevel].chance) {
      found.item.enchant = targetLevel;
      return { success: true, item: found.item, category: found.category, level: targetLevel };
    }
    const wasWorn = id === state.wornShellId || id === state.wornClawsId;
    if (found.category === 'shell') {
      state.shells = state.shells.filter((item) => item.id !== id);
      if (state.wornShellId === id) state.wornShellId = null;
    } else {
      state.claws = state.claws.filter((item) => item.id !== id);
      if (state.wornClawsId === id) state.wornClawsId = state.claws.find((item) => !CLAWS[item.kind].cost).id;
    }
    return { success: false, item: found.item, category: found.category, level: targetLevel, wasWorn };
  }

  const wornShellDefinition = () => (wornShell() ? SHELLS[wornShell().kind] : NAKED);
  const wornLook = () => wornShellDefinition().look;

  function stats(levelAttackBonus = 0) {
    const shellItem = wornShell();
    const shell = wornShellDefinition();
    const clawsItem = wornClaws();
    const claws = CLAWS[clawsItem.kind];
    return {
      defense: shell.defense + (shellItem ? enchantBonus(shell.defense, shellItem.enchant || 0) : 0),
      speedFactor: shell.speedFactor,
      attack: Math.round((BASE_ATTACK + levelAttackBonus + claws.attackBonus + enchantBonus(claws.attackBonus, clawsItem.enchant || 0)) * shell.attackFactor),
      ability: shell.ability,
      healOnHit: claws.healOnHit || 0,
    };
  }

  function dropAll() {
    const dropped = {
      shells: state.shells,
      claws: state.claws.filter((item) => CLAWS[item.kind].cost),
      wornShellId: state.wornShellId,
      wornClawsId: state.wornClawsId,
    };
    state.shells = [];
    state.claws = state.claws.filter((item) => !CLAWS[item.kind].cost);
    state.wornShellId = null;
    state.wornClawsId = state.claws[0].id;
    return dropped;
  }

  function restore(dropped) {
    state.shells.push(...dropped.shells);
    state.claws.push(...dropped.claws);
    if (!wornShell() && dropped.shells.some((item) => item.id === dropped.wornShellId)) state.wornShellId = dropped.wornShellId;
    if (!CLAWS[wornClaws().kind].cost && dropped.claws.some((item) => item.id === dropped.wornClawsId)) state.wornClawsId = dropped.wornClawsId;
  }

  function hasNewItems() {
    return [...state.shells, ...state.claws].some((item) => item.isNew);
  }

  function markAllSeen() {
    for (const item of [...state.shells, ...state.claws]) delete item.isNew;
  }

  return {
    state,
    hasNewItems,
    markAllSeen,
    craft,
    wear,
    findItem,
    enchantableItems,
    enchant,
    stats,
    dropAll,
    restore,
    wornLook,
    wornShellDefinition,
    wornShell,
    wornClaws,
    serialize: () => structuredClone(state),
  };
}
