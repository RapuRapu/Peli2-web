export const SHELLS = {
  snail: {
    label: 'Snail shell',
    role: 'Starter',
    defense: 2,
    speedFactor: 1,
    attackFactor: 1,
    ability: null,
    cost: null,
    breakable: false,
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
};

export const CLAWS = {
  bare: { label: 'Bare claws', attackBonus: 0, cost: null, breakable: false },
  shellEdged: { label: 'Shell-edged claws', attackBonus: 4, cost: { shellBits: 6, driftwood: 4 }, breakable: true },
};

export const BASE_ATTACK = 4;

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

  function stats() {
    const shell = SHELLS[wornShell().kind];
    const claws = CLAWS[wornClaws().kind];
    return {
      defense: shell.defense,
      speedFactor: shell.speedFactor,
      attack: Math.round((BASE_ATTACK + claws.attackBonus) * shell.attackFactor),
      ability: shell.ability,
    };
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
    stats,
    wornShell,
    wornClaws,
    serialize: () => structuredClone(state),
  };
}
