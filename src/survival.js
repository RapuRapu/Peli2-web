import { ITEM_TYPES } from './items.js';

export const HUNGER_DRAIN_PER_SECOND = 100 / 600;
export const TRAP_FRONDS = 4;
export const REARM_FRONDS = 2;
export const RAFT_PARTS = { raftFrame: 1, hideSail: 1, paddle: 1 };

export const RECIPES = [
  { id: 'axe', cost: { stick: 1, stone: 1, fiber: 1 }, tool: true, note: 'Chop trees for wood and palm fronds' },
  { id: 'rope', cost: { fiber: 3 } },
  { id: 'diggingStick', cost: { wood: 2 }, tool: true, note: 'Needed to dig pit traps' },
  { id: 'pitTrap', name: 'Pit trap', icon: '🕳️', cost: { fronds: TRAP_FRONDS }, requires: 'diggingStick', placeable: true, note: 'Craft, then tap the ground to dig it.' },
  { id: 'decoyChest', cost: { wood: 3, rope: 1 }, note: 'Bury it to fool treasure hunters' },
  { id: 'pickaxe', cost: { wood: 2, stone: 3, rope: 1 }, tool: true, note: 'Dig tunnels underground' },
  { id: 'paddle', cost: { wood: 1 } },
  { id: 'raftFrame', cost: { wood: 8, rope: 4 } },
  { id: 'hideSail', cost: { hide: 2, fronds: 4, rope: 1 } },
];

const count = (save, type) => save.inventory[type] ?? 0;
export const hasTool = (save, tool) => count(save, tool) > 0;

export function canAfford(save, cost) {
  return Object.entries(cost).every(([type, amount]) => count(save, type) >= amount);
}

export function spend(save, cost) {
  for (const [type, amount] of Object.entries(cost)) save.inventory[type] -= amount;
}

export function recipeViews(save) {
  return RECIPES.filter((recipe) => !(recipe.tool && hasTool(save, recipe.id))).map((recipe) => {
    const itemType = ITEM_TYPES[recipe.id];
    const missingTool = recipe.requires && !hasTool(save, recipe.requires);
    const costText = Object.entries(recipe.cost).map(([type, amount]) => `${ITEM_TYPES[type].icon} ${ITEM_TYPES[type].name} ${Math.min(count(save, type), amount)}/${amount}`).join(', ');
    return {
      id: recipe.id,
      name: recipe.name ?? itemType.name,
      icon: recipe.icon ?? itemType.icon,
      owned: recipe.placeable ? '' : count(save, recipe.id),
      costText: (missingTool ? `Needs ${ITEM_TYPES[recipe.requires].icon} ${ITEM_TYPES[recipe.requires].name}. ` : '') + costText + (recipe.note ? `<br><i>${recipe.note}</i>` : ''),
      canCraft: !missingTool && canAfford(save, recipe.cost),
    };
  });
}

export function missingRaftParts(save) {
  return Object.entries(RAFT_PARTS)
    .map(([type, required]) => [type, required - count(save, type)])
    .filter(([, missing]) => missing > 0);
}

function step(label, have, need) {
  return { label, have: Math.min(have, need), need };
}

export function buildQuests(save, { chestBuried = false, navyArrivesIn = null } = {}) {
  const hasAxe = hasTool(save, 'axe');
  const navy = save.navy;
  const trapsDug = save.stats.trapsDug;
  const hides = save.stats.hidesGathered;
  return [
    {
      title: 'Make a tool',
      description: 'The shipwreck left you stranded with nothing. Pick up stones and sticks, pull palm fiber from bushes, and craft a stone axe (🔨 Craft).',
      steps: hasAxe ? [step('🪓 Craft a stone axe', 1, 1)] : [
        step('🪨 Stone', count(save, 'stone'), 1),
        step('🥢 Stick', count(save, 'stick'), 1),
        step('🌿 Palm fiber', count(save, 'fiber'), 1),
        step('🪓 Craft a stone axe', 0, 1),
      ],
      done: hasAxe,
    },
    {
      title: 'Hide the treasure',
      description: `A navy landing party is coming for the chest you saved from the wreck${navyArrivesIn ? ` – they land in ${navyArrivesIn}` : ''}. Craft a digging stick, then open the 🎒 Bag and bury the chest somewhere clever. Fresh digging and footprints give you away – high tide washes them off the beach.`,
      steps: [
        step('🪏 Craft a digging stick', hasTool(save, 'diggingStick') ? 1 : 0, 1),
        step('👑 Bury the treasure chest', chestBuried || navy.state === 'gone' ? 1 : 0, 1),
      ],
      done: chestBuried || navy.state !== 'coming',
      locked: !hasAxe,
    },
    {
      title: 'Outlast the navy',
      description: navy.state === 'gone'
        ? (navy.found === 'chest' ? 'They found the treasure. It is gone.' : navy.found === 'decoy' ? 'They dug up your decoy and sailed away happy. The real chest is safe!' : 'They searched and found nothing. The treasure is safe!')
        : 'Marines search inside their map circle (red ring). They dig where they see fresh digging or footprints. Pit traps stop them, decoy chests fool them. Keep your distance – if they spot you, they search closer to you.',
      steps: [step(navy.state === 'gone' ? (navy.found === 'chest' ? '✗ Treasure lost' : '⚓ The navy has left') : '⚓ The navy leaves the island', navy.state === 'gone' ? 1 : 0, 1)],
      done: navy.state === 'gone',
      locked: navy.state === 'coming',
    },
    {
      title: 'Set a trap',
      description: 'Wild boars roam the island. Chop palms for fronds, craft a digging stick, then craft a pit trap and dig it where boars walk.',
      steps: [
        step('🪏 Craft a digging stick', hasTool(save, 'diggingStick') ? 1 : 0, 1),
        step('🌴 Palm fronds', trapsDug > 0 ? TRAP_FRONDS : count(save, 'fronds'), TRAP_FRONDS),
        step('🕳️ Dig a pit trap', trapsDug, 1),
      ],
      done: trapsDug > 0,
      locked: !hasAxe,
    },
    {
      title: 'Hunt wild boars',
      description: 'Boars wander into traps on their own, or you can chase them in – they run away from you. Tap a caught boar to butcher it for hide and meat.',
      steps: [step('🟫 Hides', hides, 2)],
      done: hides >= 2,
      locked: trapsDug === 0,
    },
    {
      title: 'Build a raft',
      description: 'Craft a raft frame, a hide sail and a paddle, then build the raft at the marked spot on the beach.',
      steps: [
        ...Object.keys(RAFT_PARTS).map((type) => step(`${ITEM_TYPES[type].icon} ${ITEM_TYPES[type].name}`, save.raftBuilt ? 1 : count(save, type), 1)),
        step('⛵ Build the raft', save.raftBuilt ? 1 : 0, 1),
      ],
      done: save.raftBuilt,
      locked: hides < 2 && !save.raftBuilt,
    },
    {
      title: 'Set sail',
      description: 'The raft is afloat. Climb aboard and leave the island.',
      steps: [step('⚓ Board the raft', save.hasSailed ? 1 : 0, 1)],
      done: Boolean(save.hasSailed),
      locked: !save.raftBuilt,
    },
  ];
}
