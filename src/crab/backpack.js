import { SHELLS, CLAWS } from './gear.js';
import { RESOURCE_TYPES } from './resources.js';
import { element, percent, shellStatsText } from './workbench.js';

export function createBackpackPanel(root, { gear, inventory, onWear, onClose }) {
  const overlay = element('div', 'workbench backpack', root);
  const card = element('div', 'workbench-card', overlay);
  const header = element('div', 'workbench-header', card);
  element('div', 'workbench-title', header, '🎒 Backpack');
  const closeButton = element('button', 'workbench-close', header, '✕');
  closeButton.setAttribute('aria-label', 'Close');
  const body = element('div', 'workbench-body', card);

  function renderTopRow() {
    const topRow = element('div', 'backpack-top', body);
    const materials = element('div', 'materials', topRow);
    for (const [type, definition] of Object.entries(RESOURCE_TYPES)) {
      const material = element('div', 'material', materials);
      material.dataset.material = type;
      element('div', 'material-count', material, `${definition.icon} ${inventory()[type] || 0}`);
      element('div', 'material-label', material, definition.label);
    }
    const stats = gear.stats();
    element('div', 'summary', topRow, `Total: 🛡 ${stats.defense} · 🏃 ${percent(stats.speedFactor)} · 🗡️ ${stats.attack}`);
  }

  function renderGroup(title, items, definitions, wornId, isShell) {
    element('div', 'section-title', body, title);
    const list = element('div', 'gear-list', body);
    const sorted = [...items].sort((first, second) => Number(second.id === wornId) - Number(first.id === wornId));
    for (const item of sorted) {
      const definition = definitions[item.kind];
      const worn = item.id === wornId;
      const row = element('div', worn ? 'item worn' : 'item', list);
      row.dataset.item = String(item.id);
      const text = element('div', 'item-text', row);
      const name = element('div', 'item-name', text, isShell ? `${definition.label} · ${definition.role}` : definition.label);
      if (item.isNew) element('span', 'new-badge', name, 'NEW');
      element('div', 'item-stats', text, isShell ? shellStatsText(definition) : `🗡️ +${definition.attackBonus} attack`);
      if (isShell && definition.ability) element('div', 'item-ability', text, `${definition.ability.label} — ${definition.ability.description}`);
      if (worn) {
        element('div', 'item-badge', row, '✓ Wearing');
      } else {
        const button = element('button', 'item-action', row, 'Wear');
        button.dataset.wear = String(item.id);
        button.addEventListener('click', () => onWear(item.id));
      }
    }
  }

  function render() {
    body.replaceChildren();
    renderTopRow();
    renderGroup('Shell — one at a time', gear.state.shells, SHELLS, gear.state.wornShellId, true);
    renderGroup('Claws — one at a time', gear.state.claws, CLAWS, gear.state.wornClawsId, false);
  }

  closeButton.addEventListener('click', () => onClose());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) onClose();
  });

  return {
    get isOpen() {
      return overlay.classList.contains('visible');
    },
    open() {
      render();
      overlay.classList.add('visible');
      root.classList.add('panel-open');
    },
    close() {
      if (overlay.classList.contains('visible')) gear.markAllSeen();
      overlay.classList.remove('visible');
      root.classList.remove('panel-open');
    },
    render,
  };
}
