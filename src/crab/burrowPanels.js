import { SHELLS, CLAWS, canAfford } from './gear.js';
import { RESOURCE_TYPES } from './resources.js';
import { STATION_KINDS } from './burrow.js';
import { element } from './workbench.js';

function createPanelShell(root, className, title, onClose) {
  const overlay = element('div', `workbench ${className}`, root);
  const card = element('div', 'workbench-card', overlay);
  const header = element('div', 'workbench-header', card);
  element('div', 'workbench-title', header, title);
  const closeButton = element('button', 'workbench-close', header, '✕');
  closeButton.setAttribute('aria-label', 'Close');
  const body = element('div', 'workbench-body', card);
  closeButton.addEventListener('click', () => onClose());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) onClose();
  });
  return {
    overlay,
    body,
    get isOpen() {
      return overlay.classList.contains('visible');
    },
    show() {
      overlay.classList.add('visible');
      root.classList.add('panel-open');
    },
    hide() {
      overlay.classList.remove('visible');
      root.classList.remove('panel-open');
    },
  };
}

function costText(cost, inventory) {
  return Object.entries(cost).map(([type, amount]) => {
    const have = inventory[type] || 0;
    return have >= amount ? `${RESOURCE_TYPES[type].icon} ${amount} ✓` : `${RESOURCE_TYPES[type].icon} ${amount} (have ${have})`;
  });
}

export function createBuildPanel(root, { inventory, hasStation, onChoose, onClose }) {
  const shell = createPanelShell(root, 'build-panel', '🏗️ Build', onClose);

  function render() {
    shell.body.replaceChildren();
    element('div', 'summary', shell.body, 'Pick a station, then tap a glowing spot in your burrow.');
    for (const [kind, definition] of Object.entries(STATION_KINDS)) {
      const built = hasStation(kind);
      const row = element('div', 'item', shell.body);
      const text = element('div', 'item-text', row);
      element('div', 'item-name', text, `${definition.icon} ${definition.label}`);
      element('div', 'item-ability', text, definition.description);
      const cost = element('div', 'cost', text);
      for (const [index, part] of costText(definition.cost, inventory()).entries()) element('span', part.includes('have') ? 'cost-item short' : 'cost-item', cost, part).dataset.index = String(index);
      const button = element('button', 'item-action', row, built ? 'Built' : definition.surface ? 'Build' : 'Place');
      button.dataset.station = kind;
      button.disabled = built || !canAfford(definition.cost, inventory());
      button.addEventListener('click', () => onChoose(kind));
    }
  }

  return {
    get isOpen() {
      return shell.isOpen;
    },
    open() {
      render();
      shell.show();
    },
    close: () => shell.hide(),
    render,
  };
}

export function createStoragePanel(root, { gear, inventory, storage, onChange, onClose }) {
  const shell = createPanelShell(root, 'storage-panel', '📦 Storage', onClose);

  function moveMaterial(type, toStorage) {
    const from = toStorage ? inventory() : storage.inventory;
    const to = toStorage ? storage.inventory : inventory();
    const amount = from[type] || 0;
    if (!amount) return;
    to[type] = (to[type] || 0) + amount;
    from[type] = 0;
    onChange();
  }

  function storeAll() {
    for (const type of Object.keys(RESOURCE_TYPES)) {
      const amount = inventory()[type] || 0;
      if (amount) {
        storage.inventory[type] = (storage.inventory[type] || 0) + amount;
        inventory()[type] = 0;
      }
    }
    for (const item of gear.state.shells.filter((shellItem) => shellItem.id !== gear.state.wornShellId)) storeItem(item.id, false);
    for (const item of gear.state.claws.filter((clawItem) => clawItem.id !== gear.state.wornClawsId && CLAWS[clawItem.kind].cost)) storeItem(item.id, false);
    onChange();
  }

  function storeItem(id, notify = true) {
    const found = gear.findItem(id);
    if (!found || id === gear.state.wornShellId || id === gear.state.wornClawsId) return;
    if (found.category === 'shell') {
      gear.state.shells = gear.state.shells.filter((item) => item.id !== id);
      storage.shells.push(found.item);
    } else {
      gear.state.claws = gear.state.claws.filter((item) => item.id !== id);
      storage.claws.push(found.item);
    }
    if (notify) onChange();
  }

  function takeItem(id) {
    const shellIndex = storage.shells.findIndex((item) => item.id === id);
    if (shellIndex >= 0) gear.state.shells.push(...storage.shells.splice(shellIndex, 1));
    const clawIndex = storage.claws.findIndex((item) => item.id === id);
    if (clawIndex >= 0) gear.state.claws.push(...storage.claws.splice(clawIndex, 1));
    onChange();
  }

  function itemLabel(item, isShell) {
    const definition = (isShell ? SHELLS : CLAWS)[item.kind];
    return item.enchant ? `${definition.label} +${item.enchant}` : definition.label;
  }

  function render() {
    shell.body.replaceChildren();
    element('div', 'summary', shell.body, 'Stored things stay safe here when you are defeated.');
    const storeAllButton = element('button', 'item-action store-all', shell.body, '⬇ Store everything');
    storeAllButton.addEventListener('click', storeAll);
    element('div', 'section-title', shell.body, 'Materials');
    for (const [type, definition] of Object.entries(RESOURCE_TYPES)) {
      const carried = inventory()[type] || 0;
      const stored = storage.inventory[type] || 0;
      const row = element('div', 'item storage-row', shell.body);
      row.dataset.material = type;
      const text = element('div', 'item-text', row);
      element('div', 'item-name', text, `${definition.icon} ${definition.label}`);
      element('div', 'item-stats', text, `🎒 ${carried} · 📦 ${stored}`);
      const storeButton = element('button', 'item-action small', row, 'Store');
      storeButton.dataset.store = type;
      storeButton.disabled = !carried;
      storeButton.addEventListener('click', () => moveMaterial(type, true));
      const takeButton = element('button', 'item-action small take', row, 'Take');
      takeButton.dataset.take = type;
      takeButton.disabled = !stored;
      takeButton.addEventListener('click', () => moveMaterial(type, false));
    }
    element('div', 'section-title', shell.body, 'Gear in your backpack');
    const carriedGear = [...gear.state.shells.map((item) => [item, true]), ...gear.state.claws.filter((item) => CLAWS[item.kind].cost).map((item) => [item, false])];
    let anyCarried = false;
    for (const [item, isShell] of carriedGear) {
      const worn = item.id === gear.state.wornShellId || item.id === gear.state.wornClawsId;
      const row = element('div', worn ? 'item worn' : 'item', shell.body);
      element('div', 'item-name item-text', row, itemLabel(item, isShell));
      if (worn) {
        element('div', 'item-badge', row, '✓ Wearing');
        continue;
      }
      anyCarried = true;
      const button = element('button', 'item-action small', row, 'Store');
      button.dataset.storeItem = String(item.id);
      button.addEventListener('click', () => storeItem(item.id));
    }
    if (!carriedGear.length) element('div', 'enchant-hint', shell.body, 'Nothing to store.');
    else if (!anyCarried) element('div', 'enchant-hint', shell.body, 'Worn gear stays on you.');
    element('div', 'section-title', shell.body, 'Gear in storage');
    const storedGear = [...storage.shells.map((item) => [item, true]), ...storage.claws.map((item) => [item, false])];
    if (!storedGear.length) element('div', 'enchant-hint', shell.body, 'Empty.');
    for (const [item, isShell] of storedGear) {
      const row = element('div', 'item', shell.body);
      element('div', 'item-name item-text', row, itemLabel(item, isShell));
      const button = element('button', 'item-action small take', row, 'Take');
      button.dataset.takeItem = String(item.id);
      button.addEventListener('click', () => takeItem(item.id));
    }
  }

  return {
    get isOpen() {
      return shell.isOpen;
    },
    open() {
      render();
      shell.show();
    },
    close: () => shell.hide(),
    render,
    storeAll,
  };
}

const JOB_LABELS = { shellBits: '🐚 Shell bits', driftwood: '🪵 Driftwood', seaLettuce: '🥬 Sea lettuce', rack: '🍂 Tend rack', driedKelp: '🍂 Dried kelp' };
function helperStatus(helper) {
  const job = JOB_LABELS[helper.job];
  if (helper.state === 'resting') return helper.job === 'rack' ? '💤 Resting · tends the rack when there is 🥬 in storage or 🍂 to bring' : '💤 Resting in the burrow';
  if (helper.state === 'toRack') return helper.carrying ? '➜ Taking 🥬 to the drying rack' : '➜ Fetching 🍂 from the drying rack';
  if (helper.state === 'outbound') return `➜ Heading out for ${job}`;
  if (helper.state === 'gathering') return `⛏ Gathering ${job}`;
  if (helper.state === 'returning') return helper.carrying ? `⬅ Carrying ${JOB_LABELS[helper.carrying]} home` : '⬅ Coming home';
  if (helper.state === 'fleeing') return '⚠ Fleeing home!';
  return helper.state;
}

export function createHelpersPanel(root, { helpers, inventory, limit, cost, jobs, requirement, onRecruit, onJob, onClose }) {
  const shell = createPanelShell(root, 'helpers-panel', '🦀 Helpers', onClose);

  function render() {
    shell.body.replaceChildren();
    element('div', 'summary', shell.body, `Helpers gather on the beach and bring everything to your storage. ${helpers.list.length}/${limit} helpers.`);
    const missing = requirement();
    const recruitRow = element('div', 'item', shell.body);
    const recruitText = element('div', 'item-text', recruitRow);
    element('div', 'item-name', recruitText, 'Recruit a helper crab');
    if (missing) element('div', 'item-ability', recruitText, missing);
    const costLine = element('div', 'cost', recruitText);
    for (const [type, amount] of Object.entries(cost)) {
      const have = inventory()[type] || 0;
      element('span', have >= amount ? 'cost-item' : 'cost-item short', costLine, `${RESOURCE_TYPES[type].icon} ${amount} ${RESOURCE_TYPES[type].label}${have >= amount ? ' ✓' : ` (have ${have})`}`);
    }
    const recruitButton = element('button', 'item-action', recruitRow, 'Recruit');
    recruitButton.dataset.recruit = '1';
    recruitButton.disabled = Boolean(missing) || helpers.list.length >= limit || !canAfford(cost, inventory());
    recruitButton.addEventListener('click', () => onRecruit());
    for (const [index, helper] of helpers.list.entries()) {
      const row = element('div', 'item helper-row', shell.body);
      row.dataset.helper = String(helper.id);
      const text = element('div', 'item-text', row);
      element('div', 'item-name', text, `Helper ${index + 1} · ❤ ${Math.max(0, Math.ceil(helper.health))}/${helpers.maxHealth}`);
      element('div', helper.state === 'fleeing' ? 'item-ability danger' : 'item-stats', text, helperStatus(helper));
      const jobRow = element('div', 'job-row', text);
      element('span', 'job-label', jobRow, 'Job:');
      for (const job of jobs) {
        const button = element('button', job === helper.job ? 'job-button active' : 'job-button', jobRow, JOB_LABELS[job]);
        button.dataset.job = job;
        button.addEventListener('click', () => onJob(helper.id, job));
      }
    }
  }

  return {
    get isOpen() {
      return shell.isOpen;
    },
    open() {
      render();
      shell.show();
    },
    close: () => shell.hide(),
    render,
  };
}

export function createRackPanel(root, { rack, inventory, batch, drySeconds, onLoad, onCollect, onClose }) {
  const shell = createPanelShell(root, 'rack-panel', '🍂 Drying rack', onClose);

  function render() {
    shell.body.replaceChildren();
    const state = rack.state;
    if (!state) return;
    element('div', 'summary', shell.body, `${batch} 🥬 dry into 1 🍂 dried kelp in ${drySeconds} s. Eat it from 🎒 (Well fed: 2× HP regen for 90 s) or craft Kelp-wrapped claws.`);
    const slots = element('div', 'rack-slots', shell.body);
    state.slots.forEach((progress, index) => {
      const slot = element('div', progress === null ? 'rack-slot empty' : 'rack-slot', slots);
      slot.dataset.slot = String(index);
      if (progress === null) {
        element('div', 'rack-slot-label', slot, 'Empty');
        return;
      }
      element('div', 'rack-slot-label', slot, `Drying · ${Math.ceil((1 - progress) * drySeconds)} s left`);
      const bar = element('div', 'rack-bar', slot);
      element('div', 'rack-fill', bar).style.width = `${Math.round(progress * 100)}%`;
    });
    const have = inventory().seaLettuce || 0;
    const loadRow = element('div', 'item', shell.body);
    const loadText = element('div', 'item-text', loadRow);
    element('div', 'item-name', loadText, `Hang ${batch} 🥬 to dry`);
    element('div', have >= batch ? 'item-stats' : 'item-stats short-text', loadText, `You have 🥬 ${have}`);
    if (have < batch) element('div', 'enchant-hint', loadText, 'Sea lettuce grows at the waterline and in tide pools.');
    const loadButton = element('button', 'item-action', loadRow, 'Hang');
    loadButton.dataset.rackLoad = '1';
    loadButton.disabled = have < batch || rack.freeSlots() === 0;
    loadButton.addEventListener('click', () => onLoad());
    const collectRow = element('div', state.ready ? 'item ready-row' : 'item', shell.body);
    const collectText = element('div', 'item-text', collectRow);
    element('div', 'item-name', collectText, `🍂 Ready: ${state.ready}`);
    const collectButton = element('button', 'item-action take', collectRow, 'Collect');
    collectButton.dataset.rackCollect = '1';
    collectButton.disabled = state.ready === 0;
    collectButton.addEventListener('click', () => onCollect());
  }

  return {
    get isOpen() {
      return shell.isOpen;
    },
    open() {
      render();
      shell.show();
    },
    close: () => shell.hide(),
    render,
  };
}
