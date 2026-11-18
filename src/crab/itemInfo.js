import { SHELLS, CLAWS, enchantBonus, enchantLook } from './gear.js';

export const definitionOf = (category, kind) => (category === 'shell' ? SHELLS : CLAWS)[kind];

const percentText = (value) => `${Math.round(value * 100)}%`;

export function itemTier(definition) {
  return definition.tier || 1;
}

export function tierClass(definition) {
  return `tier-${itemTier(definition)}${definition.trophy ? ' tier-trophy' : ''}`;
}

export function tierBadge(definition) {
  return definition.trophy ? `👑 T${itemTier(definition)}` : `T${itemTier(definition)}`;
}

export function tierLine(category, definition) {
  const role = category === 'shell' ? definition.role : 'Claws';
  return `${definition.trophy ? '👑 Boss trophy · ' : ''}Tier ${itemTier(definition)} · ${role}`;
}

export function itemName(category, item) {
  const definition = definitionOf(category, item.kind);
  return item.enchant ? `${definition.label} +${item.enchant}` : definition.label;
}

export function shellDefense(definition, enchant = 0) {
  return definition.defense + enchantBonus(definition.defense, enchant);
}

export function clawAttack(definition, enchant = 0) {
  return definition.attackBonus + enchantBonus(definition.attackBonus, enchant);
}

export function itemStatsText(category, item) {
  const definition = definitionOf(category, item.kind);
  const enchant = item.enchant || 0;
  if (category === 'shell') return `🛡 ${shellDefense(definition, enchant)} · 🏃 ${percentText(definition.speedFactor)} · 🗡️ ×${definition.attackFactor.toFixed(2)}`;
  return `🗡️ +${clawAttack(definition, enchant)}`;
}

export function itemStatsBreakdown(category, item) {
  const definition = definitionOf(category, item.kind);
  const enchant = item.enchant || 0;
  if (!enchant) return null;
  if (category === 'shell') return `🛡 ${definition.defense} + ${enchantBonus(definition.defense, enchant)} from +${enchant}`;
  return `🗡️ ${definition.attackBonus} + ${enchantBonus(definition.attackBonus, enchant)} from +${enchant}`;
}

export function itemAbilityText(definition) {
  const lines = [];
  if (definition.ability) lines.push(`${definition.ability.label} — ${definition.ability.description}`);
  if (definition.healOnHit) lines.push(`Mend — every hit heals ${definition.healOnHit} HP`);
  return lines;
}

export function enchantGlowCss(enchant) {
  const look = enchantLook(enchant || 0);
  if (!look.glow) return null;
  const [red, green, blue] = look.rainbow ? [1, 0.4, 0.9] : look.color;
  const toByte = (value) => Math.round(Math.min(1, value) * 255);
  return `rgba(${toByte(red)}, ${toByte(green)}, ${toByte(blue)}, ${Math.min(0.95, 0.35 + look.glow * 0.3).toFixed(2)})`;
}
