import { CLAWS } from './gear.js';
import { element, percent } from './workbench.js';
import { materialEntries, gearEntries, renderSlot, renderDetails, attachSlotGestures, salvageAction } from './inventoryView.js';
import { itemName, itemStatsText, definitionOf, shellDefense, clawAttack } from './itemInfo.js';

export function createBackpackPanel(root, { gear, inventory, combatStats, maxHealth, growthText, thumbnails, onWear, onUnequip, onEat, onSalvage, onClose }) {
  const overlay = element('div', 'workbench backpack', root);
  const card = element('div', 'workbench-card', overlay);
  const header = element('div', 'workbench-header', card);
  element('div', 'workbench-title', header, '🎒 Backpack');
  const closeButton = element('button', 'workbench-close', header, '✕');
  closeButton.setAttribute('aria-label', 'Close');
  const body = element('div', 'workbench-body inventory-body', card);
  let selectedKey = null;

  const wornEntry = (category) => {
    const item = category === 'shell' ? gear.wornShell() : gear.wornClaws();
    if (!item || (category === 'claws' && !CLAWS[item.kind].cost)) return null;
    return { key: `item:${item.id}`, kind: 'gear', category, item, worn: true };
  };

  function allEntries() {
    return [...gearEntries(gear.state.shells.filter((item) => item.id !== gear.state.wornShellId), gear.state.claws.filter((item) => item.id !== gear.state.wornClawsId)), ...materialEntries(inventory())];
  }

  function entryFor(key) {
    return [wornEntry('shell'), wornEntry('claws'), ...allEntries()].find((entry) => entry && entry.key === key) || null;
  }

  function wearEntry(entry) {
    if (entry.kind !== 'gear') return;
    selectedKey = entry.key;
    onWear(entry.item.id);
  }

  function unequipEntry(entry) {
    selectedKey = entry.key;
    onUnequip(entry.category);
  }

  function compareWithWorn(entry) {
    if (entry.kind !== 'gear' || entry.worn) return null;
    const definition = definitionOf(entry.category, entry.item.kind);
    if (entry.category === 'shell') {
      const worn = gear.wornShell();
      const wornDefense = worn ? shellDefense(definitionOf('shell', worn.kind), worn) : 0;
      return shellDefense(definition, entry.item) - wornDefense || null;
    }
    const worn = gear.wornClaws();
    return clawAttack(definition, entry.item) - clawAttack(definitionOf('claws', worn.kind), worn) || null;
  }

  function actionsFor(entry) {
    if (!entry) return [];
    if (entry.kind === 'material') return entry.type === 'driedKelp' ? [{ label: 'Eat · 2× regen 90 s', data: { eat: 'driedKelp' }, run: () => onEat() }] : [];
    if (entry.worn) return entry.category === 'shell' || CLAWS[entry.item.kind].cost ? [{ label: 'Take off', secondary: true, data: { unequip: entry.category }, run: () => unequipEntry(entry) }] : [];
    const salvage = salvageAction(entry, () => {
      selectedKey = null;
      onSalvage(entry.item.id);
    });
    return [{ label: 'Wear', data: { wear: String(entry.item.id) }, run: () => wearEntry(entry) }, ...(salvage ? [salvage] : [])];
  }

  function renderEquipSlot(parent, category) {
    const entry = wornEntry(category);
    const holder = element('div', 'equip-slot', parent);
    element('div', 'equip-label', holder, category === 'shell' ? 'Shell' : 'Claws');
    if (entry) {
      renderSlot(holder, entry, thumbnails, { selected: entry.key === selectedKey, zone: 'worn' });
      element('div', 'equip-name', holder, itemName(category, entry.item));
      element('div', 'equip-stats', holder, itemStatsText(category, entry.item));
    } else {
      element('div', 'slot-cell empty-cell', holder, category === 'shell' ? '—' : '🦀');
      element('div', 'equip-name', holder, category === 'shell' ? 'No shell' : 'Bare claws');
      element('div', 'equip-stats', holder, category === 'shell' ? '🛡 0 · exposed!' : '🗡️ +0');
    }
  }

  function render() {
    body.replaceChildren();
    const layout = element('div', 'inventory-layout', body);
    const dollColumn = element('div', 'doll-column', layout);
    const dollFrame = element('div', 'doll-frame', dollColumn);
    const wornShell = gear.wornShell();
    const wornClaws = gear.wornClaws();
    const dollImage = thumbnails.dollImage(wornShell, wornClaws);
    if (dollImage) element('img', 'doll-image', dollFrame).src = dollImage;
    else element('div', 'doll-fallback', dollFrame, '🦀');
    const equipRow = element('div', 'equip-row', dollColumn);
    renderEquipSlot(equipRow, 'shell');
    renderEquipSlot(equipRow, 'claws');
    const stats = combatStats();
    element('div', 'summary doll-summary', dollColumn, `❤ ${maxHealth()} · 🛡 ${stats.defense} · 🏃 ${percent(stats.speedFactor)} · 🗡️ ${stats.attack}`);
    element('div', 'summary doll-summary growth-summary', dollColumn, growthText());
    const gridColumn = element('div', 'grid-column', layout);
    const entries = allEntries();
    element('div', 'section-title grid-title', gridColumn, `🎒 ${entries.length} · double-tap to wear`);
    const grid = element('div', 'slot-grid', gridColumn);
    for (const entry of entries) renderSlot(grid, entry, thumbnails, { selected: entry.key === selectedKey, zone: 'grid' });
    if (!entries.length) element('div', 'details-hint', grid, 'Empty — gather on the beach!');
    const selected = selectedKey ? entryFor(selectedKey) : null;
    if (!selected) selectedKey = null;
    renderDetails(gridColumn, selected, actionsFor(selected), undefined, compareWithWorn);
  }

  attachSlotGestures(card, {
    entryFor,
    onSelect: (entry) => {
      selectedKey = entry.key;
      if (entry.kind === 'gear') delete entry.item.isNew;
      render();
    },
    onActivate: (entry, zone) => {
      if (entry.kind !== 'gear') {
        selectedKey = entry.key;
        render();
        return;
      }
      if (zone === 'worn') unequipEntry(entry);
      else wearEntry(entry);
    },
  });

  closeButton.addEventListener('click', () => onClose());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) onClose();
  });

  return {
    get isOpen() {
      return overlay.classList.contains('visible');
    },
    open() {
      selectedKey = null;
      render();
      overlay.classList.add('visible');
      root.classList.add('panel-open');
    },
    close() {
      if (overlay.classList.contains('visible')) gear.markAllSeen();
      overlay.classList.remove('visible');
      root.classList.remove('panel-open');
    },
    select(key) {
      selectedKey = key;
      render();
    },
    render,
  };
}

