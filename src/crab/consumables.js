export const QUICK_SLOT_COUNT = 2;

export const CONSUMABLES = {
  driedKelp: { useLabel: 'Eat · 2× regen 90 s', cooldownSeconds: 1 },
  kelpPoultice: { useLabel: 'Use · heal 40 % HP', healShare: 0.4, cooldownSeconds: 8, recipe: { driedKelp: 2, seaLettuce: 1 }, description: 'Heals 40 % of your HP at once' },
};

export const isConsumable = (type) => Boolean(CONSUMABLES[type]);
