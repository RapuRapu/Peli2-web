import { CLAWS } from './gear.js';
import { RESOURCE_TYPES } from './resources.js';
import { element } from './workbench.js';
import { definitionOf, itemName, itemStatsText, itemStatsBreakdown, itemAbilityText, tierClass, tierBadge, tierLine, itemTier, enchantGlowCss } from './itemInfo.js';

const DOUBLE_TAP_MILLISECONDS = 360;
const DRAG_START_PIXELS = 8;

export function materialEntries(inventory) {
  return Object.keys(RESOURCE_TYPES).filter((type) => (inventory[type] || 0) > 0).map((type) => ({ key: `material:${type}`, kind: 'material', type, count: inventory[type] }));
}

export function gearEntries(shells, claws) {
  const entries = [
    ...shells.map((item) => ({ key: `item:${item.id}`, kind: 'gear', category: 'shell', item })),
    ...claws.filter((item) => CLAWS[item.kind].cost).map((item) => ({ key: `item:${item.id}`, kind: 'gear', category: 'claws', item })),
  ];
  return entries.sort((first, second) => itemTier(definitionOf(second.category, second.item.kind)) - itemTier(definitionOf(first.category, first.item.kind)) || (second.item.enchant || 0) - (first.item.enchant || 0));
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
  if (entry.item.enchant) element('div', 'slot-enchant', slot, `+${entry.item.enchant}`);
  const glow = enchantGlowCss(entry.item.enchant);
  if (glow) slot.style.boxShadow = `0 0 10px 2px ${glow}`;
  if (entry.item.isNew) element('div', 'new-badge slot-new', slot, 'NEW');
  slot.title = itemName(entry.category, entry.item);
  return slot;
}

export function renderDetails(parent, entry, actions, hint = 'Tap an item to see it. Double-tap or drag gear onto your crab to wear it.', compareWith = null) {
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
    for (const line of itemAbilityText(definition)) element('div', 'item-ability', text, line);
  }
  const buttons = element('div', 'details-actions', details);
  for (const action of actions) {
    const button = element('button', `item-action${action.secondary ? ' take' : ''}`, buttons, action.label);
    for (const [name, value] of Object.entries(action.data || {})) button.dataset[name] = value;
    button.addEventListener('click', action.run);
  }
  return details;
}

export function attachSlotGestures(container, { entryFor, onSelect, onActivate, onDrop }) {
  let press = null;
  let lastTap = { key: null, time: 0 };
  let ghost = null;

  function endDrag() {
    if (ghost) ghost.remove();
    ghost = null;
    for (const zone of container.querySelectorAll('.drop-hover')) zone.classList.remove('drop-hover');
  }

  container.addEventListener('pointerdown', (event) => {
    const slot = event.target.closest('[data-slot-key]');
    if (!slot || !container.contains(slot)) return;
    press = { slot, key: slot.dataset.slotKey, zone: slot.dataset.zone || '', x: event.clientX, y: event.clientY, dragging: false, pointerId: event.pointerId };
  });

  container.addEventListener('pointermove', (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    if (!press.dragging && Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAG_START_PIXELS) {
      press.dragging = true;
      ghost = press.slot.cloneNode(true);
      ghost.classList.add('drag-ghost');
      container.appendChild(ghost);
      try {
        press.slot.setPointerCapture(event.pointerId);
      } catch {
        /* capture is optional */
      }
    }
    if (!press.dragging) return;
    event.preventDefault();
    ghost.style.transform = `translate(${event.clientX - 32}px, ${event.clientY - 32}px)`;
    for (const zone of container.querySelectorAll('.drop-hover')) zone.classList.remove('drop-hover');
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const zone = target && target.closest('[data-drop]');
    if (zone) zone.classList.add('drop-hover');
  });

  container.addEventListener('pointerup', (event) => {
    if (!press || event.pointerId !== press.pointerId) return;
    const finished = press;
    press = null;
    const entry = entryFor(finished.key, finished.zone);
    if (finished.dragging) {
      if (ghost) ghost.style.display = 'none';
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const zone = target && target.closest('[data-drop]');
      endDrag();
      if (entry && zone) onDrop(entry, finished.zone, zone.dataset.drop);
      return;
    }
    if (!entry) return;
    const now = event.timeStamp;
    if (lastTap.key === finished.key && now - lastTap.time < DOUBLE_TAP_MILLISECONDS) {
      lastTap = { key: null, time: 0 };
      onActivate(entry, finished.zone);
      return;
    }
    lastTap = { key: finished.key, time: now };
    onSelect(entry, finished.zone);
  });

  container.addEventListener('pointercancel', () => {
    press = null;
    endDrag();
  });
}
