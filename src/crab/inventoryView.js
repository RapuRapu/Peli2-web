import { CLAWS } from './gear.js';
import { RESOURCE_TYPES } from './resources.js';
import { element } from './workbench.js';
import { definitionOf, itemName, itemStatsText, itemStatsBreakdown, itemAbilityText, tierClass, tierBadge, tierLine, itemTier, qualityBadge, masterworkGlowCss } from './itemInfo.js';

const QUALITY_RANK = ['crude', 'fine', 'masterwork'];

const DOUBLE_TAP_MILLISECONDS = 360;
const TAP_SLOP_PIXELS = 10;

export function materialEntries(inventory) {
  return Object.keys(RESOURCE_TYPES).filter((type) => (inventory[type] || 0) > 0).map((type) => ({ key: `material:${type}`, kind: 'material', type, count: inventory[type] }));
}

export function gearEntries(shells, claws) {
  const entries = [
    ...shells.map((item) => ({ key: `item:${item.id}`, kind: 'gear', category: 'shell', item })),
    ...claws.filter((item) => CLAWS[item.kind].cost).map((item) => ({ key: `item:${item.id}`, kind: 'gear', category: 'claws', item })),
  ];
  return entries.sort((first, second) => itemTier(definitionOf(second.category, second.item.kind)) - itemTier(definitionOf(first.category, first.item.kind)) || QUALITY_RANK.indexOf(second.item.quality) - QUALITY_RANK.indexOf(first.item.quality));
}

export function entryTitle(entry) {
  if (entry.kind === 'material') return `${RESOURCE_TYPES[entry.type].icon} ${RESOURCE_TYPES[entry.type].label}`;
  return itemName(entry.category, entry.item);
}

export function renderSlot(parent, entry, thumbnails, { selected = false, zone = '' } = {}) {
  const definition = entry.kind === 'gear' ? definitionOf(entry.category, entry.item.kind) : null;
  const slot = element('div', `slot-cell ${definition ? tierClass(definition) : 'material-cell'}${selected ? ' selected' : ''}`, parent);
  slot.dataset.slotKey = entry.key;
  if (zone) slot.dataset.zone = zone;
  if (entry.kind === 'material') {
    slot.dataset.material = entry.type;
    element('div', 'slot-emoji', slot, RESOURCE_TYPES[entry.type].icon);
    element('div', 'slot-count', slot, `×${entry.count}`);
    slot.title = RESOURCE_TYPES[entry.type].label;
    return slot;
  }
  slot.dataset.slotItem = String(entry.item.id);
  const image = thumbnails.itemImage(entry.category, entry.item.kind);
  if (image) element('img', 'slot-image', slot).src = image;
  else element('div', 'slot-emoji', slot, entry.category === 'shell' ? '🐚' : '🦀');
  element('div', 'slot-tier', slot, tierBadge(definition));
  const badge = qualityBadge(entry.item);
  if (badge) element('div', `slot-quality quality-${entry.item.quality}`, slot, badge);
  const glow = masterworkGlowCss(entry.item);
  if (glow) slot.style.boxShadow = `0 0 10px 2px ${glow}`;
  if (entry.item.isNew) element('div', 'new-badge slot-new', slot, 'NEW');
  slot.title = itemName(entry.category, entry.item);
  return slot;
}

export function renderDetails(parent, entry, actions, hint = 'Tap an item to see it. Double-tap gear to wear it.', compareWith = null) {
  const details = element('div', 'item-details', parent);
  if (!entry) {
    element('div', 'details-hint', details, hint);
    return details;
  }
  const text = element('div', 'item-text', details);
  element('div', 'item-name', text, entryTitle(entry));
  if (entry.kind === 'material') {
    element('div', 'item-stats', text, `×${entry.count}`);
  } else {
    const definition = definitionOf(entry.category, entry.item.kind);
    element('div', `item-tier ${tierClass(definition)}`, text, tierLine(entry.category, definition));
    const stats = element('div', 'item-stats', text, itemStatsText(entry.category, entry.item));
    const delta = compareWith ? compareWith(entry) : null;
    if (delta) element('span', delta > 0 ? 'stat-delta better' : 'stat-delta worse', stats, ` ${delta > 0 ? '▲' : '▼'}${Math.abs(delta)} vs worn`);
    const breakdown = itemStatsBreakdown(entry.category, entry.item);
    if (breakdown) element('div', 'item-owned', text, breakdown);
    for (const line of itemAbilityText(definition, entry.category, entry.item)) element('div', 'item-ability', text, line);
  }
  const buttons = element('div', 'details-actions', details);
  for (const action of actions) {
    const button = element('button', `item-action${action.secondary ? ' take' : ''}`, buttons, action.label);
    for (const [name, value] of Object.entries(action.data || {})) button.dataset[name] = value;
    button.addEventListener('click', action.run);
  }
  return details;
}

export function attachSlotGestures(container, { entryFor, onSelect, onActivate }) {
  let press = null;
  let lastTap = { key: null, time: 0 };

  container.addEventListener('pointerdown', (event) => {
    const slot = event.target.closest('[data-slot-key]');
    if (!slot || !container.contains(slot)) return;
    press = { key: slot.dataset.slotKey, zone: slot.dataset.zone || '', x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  });

  container.addEventListener('pointermove', (event) => {
    if (press && event.pointerId === press.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_SLOP_PIXELS) press = null;
  });

  container.addEventListener('pointerup', (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const finished = press;
    press = null;
    const entry = entryFor(finished.key, finished.zone);
    if (!entry) return;
    if (lastTap.key === finished.key && event.timeStamp - lastTap.time < DOUBLE_TAP_MILLISECONDS) {
      lastTap = { key: null, time: 0 };
      onActivate(entry, finished.zone);
      return;
    }
    lastTap = { key: finished.key, time: event.timeStamp };
    onSelect(entry, finished.zone);
  });

  container.addEventListener('pointercancel', () => {
    press = null;
  });
}
