import { ITEM_TYPES, ITEM_CATEGORIES } from './items.js';

const HINTS = {
  sailing: '<span>Tap the sea: sail there</span> · <span>Hold: steer</span> · <span>Pinch: zoom</span>',
  onFoot: '<span>Tap: walk</span> · <span>Tap trees, bushes, rocks: gather</span> · <span>🔨 Craft</span>',
};

export function createHud() {
  const root = document.createElement('div');
  root.id = 'hud';
  root.innerHTML = `
    <div class="compass">
      <svg viewBox="-50 -50 100 100" aria-hidden="true">
        <circle r="44" class="dial"/>
        <g class="wind-arrow"><path d="M -30 0 L 22 0 M 10 -12 L 26 0 L 10 12" /></g>
      </svg>
      <div class="readout"><span class="speed">0.0</span> kn</div>
    </div>
    <button class="quest-chip" type="button"></button>
    <button class="craft-chip" type="button">🔨 Craft</button>
    <button class="bag-chip" type="button">🎒 Bag</button>
    <div class="quest-log bag-log">
      <div class="quest-panel">
        <div class="quest-header"><span>🎒 Bag</span><button class="quest-close" type="button">✕</button></div>
        <div class="hunger-row"><span>Food</span><div class="hunger-bar"><div class="hunger-fill"></div></div><span class="hunger-text"></span></div>
        <div class="bag-list"></div>
      </div>
    </div>
    <div class="quest-log craft-log">
      <div class="quest-panel">
        <div class="quest-header"><span>🔨 Craft</span><button class="quest-close" type="button">✕</button></div>
        <div class="quest-description">Turn raw materials into tools and raft parts. Chop trees 🪵🌴, pull bushes 🌿🥢, pick up stones 🪨, trap boars 🐗.</div>
        <div class="craft-list"></div>
      </div>
    </div>
    <div class="quest-log">
      <div class="quest-panel">
        <div class="quest-header"><span>📜 Quests</span><button class="quest-close" type="button">✕</button></div>
        <div class="quest-list"></div>
      </div>
    </div>
    <div class="guide-arrow"><span class="chevron">➤</span><span class="icon"></span><span class="distance"></span></div>
    <div class="guide-arrow sloop"><span class="chevron">➤</span><span class="icon">🛶</span></div>
    <div class="inventory"></div>
    <div class="tide-chip"></div>
    <div class="navy-chip"></div>
    <div class="crab-chip"></div>
    <div class="hunger-chip"><span>🍗</span><div class="hunger-bar"><div class="hunger-fill"></div></div></div>
    <button class="reset" type="button">↺</button>
    <div class="toast"></div>
    <button class="action" type="button"></button>
    <div class="status"></div>
    <div class="hint"></div>
  `;
  document.body.appendChild(root);
  const compass = root.querySelector('.compass');
  const windArrow = root.querySelector('.wind-arrow');
  const speedText = root.querySelector('.speed');
  const status = root.querySelector('.status');
  const hint = root.querySelector('.hint');
  const inventory = root.querySelector('.inventory');
  const toast = root.querySelector('.toast');
  const actionButton = root.querySelector('.action');
  const resetButton = root.querySelector('.reset');
  const questChip = root.querySelector('.quest-chip');
  const questLog = root.querySelector('.quest-log:not(.craft-log):not(.bag-log)');
  const bagChip = root.querySelector('.bag-chip');
  const bagLog = root.querySelector('.bag-log');
  const bagList = root.querySelector('.bag-list');
  const hungerFills = root.querySelectorAll('.hunger-fill');
  const hungerText = root.querySelector('.hunger-text');
  let eatHandler = null;
  let bagActionHandler = null;
  let bagActionsFor = () => [];
  let lastBagSignature = null;
  let lastHunger = -1;
  const tideChip = root.querySelector('.tide-chip');
  let lastTideText = '';
  const navyChip = root.querySelector('.navy-chip');
  let lastNavyText = undefined;
  const crabChip = root.querySelector('.crab-chip');
  let lastCrabText = undefined;
  const craftChip = root.querySelector('.craft-chip');
  const craftLog = root.querySelector('.craft-log');
  const craftList = root.querySelector('.craft-list');
  let craftHandler = null;
  let lastCraftSignature = null;
  const questList = root.querySelector('.quest-list');
  const guideArrow = root.querySelector('.guide-arrow:not(.sloop)');
  const sloopArrow = root.querySelector('.guide-arrow.sloop');
  let lastQuestSignature = null;
  questChip.addEventListener('click', () => questLog.classList.add('open'));
  questLog.addEventListener('click', (event) => { if (event.target === questLog) questLog.classList.remove('open'); });
  questLog.querySelector('.quest-close').addEventListener('click', () => questLog.classList.remove('open'));
  craftChip.addEventListener('click', () => craftLog.classList.add('open'));
  craftLog.addEventListener('click', (event) => {
    if (event.target === craftLog) craftLog.classList.remove('open');
    const button = event.target.closest('[data-recipe]');
    if (button && !button.disabled) craftHandler?.(button.dataset.recipe);
  });
  craftLog.querySelector('.quest-close').addEventListener('click', () => craftLog.classList.remove('open'));
  bagChip.addEventListener('click', () => bagLog.classList.add('open'));
  bagLog.addEventListener('click', (event) => {
    if (event.target === bagLog) bagLog.classList.remove('open');
    const button = event.target.closest('[data-eat]');
    if (button) eatHandler?.(button.dataset.eat);
    const actionButton = event.target.closest('[data-bag-action]');
    if (actionButton) {
      const [type, action] = actionButton.dataset.bagAction.split('|');
      bagActionHandler?.(type, action);
    }
  });
  bagLog.querySelector('.quest-close').addEventListener('click', () => bagLog.classList.remove('open'));
  let lastSpeedText = '';
  let lastStatus = '';
  let actionHandler = null;
  let lastActionLabel = null;
  let toastTimer = 0;
  let resetArmedUntil = 0;
  let resetHandler = null;

  actionButton.addEventListener('click', () => actionHandler?.());
  resetButton.addEventListener('click', () => {
    const now = performance.now();
    if (now < resetArmedUntil) {
      resetHandler?.();
      return;
    }
    resetArmedUntil = now + 3000;
    resetButton.textContent = 'Start over?';
    resetButton.classList.add('armed');
    setTimeout(() => {
      resetButton.textContent = '↺';
      resetButton.classList.remove('armed');
    }, 3000);
  });
  for (const element of [actionButton, resetButton, questChip, questLog, craftChip, craftLog, bagChip, bagLog]) element.addEventListener('pointerdown', (event) => event.stopPropagation());

  let hintShownAt = performance.now();
  function setMode(mode) {
    compass.style.display = mode === 'sailing' ? '' : 'none';
    craftChip.style.display = mode === 'onFoot' ? '' : 'none';
    bagChip.classList.toggle('shifted', mode !== 'onFoot');
    hint.innerHTML = HINTS[mode];
    hintShownAt = performance.now();
  }

  function setInventory(gold, counts) {
    inventory.innerHTML = `<span class="slot">💰 ${gold}</span>`;
    const signature = JSON.stringify(counts) + JSON.stringify(Object.keys(counts).map((type) => bagActionsFor(type)));
    if (signature === lastBagSignature) return;
    lastBagSignature = signature;
    const sections = ITEM_CATEGORIES.map((category) => {
      const entries = Object.entries(counts).filter(([type, count]) => count > 0 && ITEM_TYPES[type]?.category === category.id);
      if (entries.length === 0) return '';
      return `<div class="bag-section">${category.name}</div><div class="bag-grid">` + entries.map(([type, count]) => {
        const itemType = ITEM_TYPES[type];
        const eat = (itemType.food ? `<button type="button" data-eat="${type}">Eat</button>` : '') + bagActionsFor(type).map((action) => `<button type="button" data-bag-action="${type}|${action.id}">${action.label}</button>`).join('');
        return `<div class="bag-slot"><span class="bag-icon">${itemType.icon}</span><span class="bag-name">${itemType.name}</span><span class="bag-count">${category.id === 'tool' ? '' : '×' + count}</span>${eat}</div>`;
      }).join('') + '</div>';
    }).join('');
    bagList.innerHTML = sections || '<div class="quest-description">Your bag is empty. Gather materials around the island.</div>';
  }

  function setHunger(fullness) {
    const rounded = Math.round(fullness);
    if (rounded === lastHunger) return;
    lastHunger = rounded;
    for (const fill of hungerFills) {
      fill.style.width = `${rounded}%`;
      fill.style.background = rounded > 50 ? '#8ac24a' : rounded > 20 ? '#e0a030' : '#d04a2a';
    }
    hungerText.textContent = rounded > 50 ? 'Fed' : rounded > 20 ? 'Peckish' : 'Hungry';
  }

  function setTide({ rising, secondsToExtreme }) {
    const minutes = Math.floor(secondsToExtreme / 60);
    const seconds = Math.floor(secondsToExtreme % 60).toString().padStart(2, '0');
    const text = `🌊 ${rising ? 'Rising · high' : 'Falling · low'} in ${minutes}:${seconds}`;
    if (text === lastTideText) return;
    lastTideText = text;
    tideChip.textContent = text;
  }

  function setNavy(text) {
    if (text === lastNavyText) return;
    lastNavyText = text;
    navyChip.textContent = text ?? '';
    navyChip.style.display = text ? '' : 'none';
  }

  function setCrabs(text) {
    if (text === lastCrabText) return;
    lastCrabText = text;
    crabChip.textContent = text ?? '';
    crabChip.style.display = text ? '' : 'none';
  }

  function closeMenus() {
    for (const log of [questLog, craftLog, bagLog]) log.classList.remove('open');
  }

  function onBagAction(handler, actionsFor) {
    bagActionHandler = handler;
    bagActionsFor = actionsFor;
    lastBagSignature = null;
  }

  function onEat(handler) {
    eatHandler = handler;
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 1600);
  }

  function setAction(label, handler, { subtitle = null, disabled = false } = {}) {
    actionHandler = handler;
    const signature = `${label}|${subtitle}|${disabled}`;
    if (signature === lastActionLabel) return;
    lastActionLabel = signature;
    actionButton.innerHTML = label ? `${label}${subtitle ? `<small>${subtitle}</small>` : ''}` : '';
    actionButton.classList.toggle('visible', Boolean(label));
    actionButton.classList.toggle('disabled', disabled);
  }

  function setQuests(quests) {
    const signature = JSON.stringify(quests);
    if (signature === lastQuestSignature) return;
    lastQuestSignature = signature;
    const active = quests.find((quest) => !quest.done && !quest.locked);
    if (active) {
      const have = active.steps.reduce((sum, step) => sum + Math.min(step.have, step.need), 0);
      const need = active.steps.reduce((sum, step) => sum + step.need, 0);
      questChip.textContent = `📜 ${active.title} ${have}/${need}`;
    } else {
      questChip.textContent = '📜 Quests';
    }
    questList.innerHTML = quests.filter((quest) => !quest.locked).map((quest) => `
      <div class="quest ${quest.done ? 'done' : ''}">
        <div class="quest-title">${quest.done ? '✔' : '◆'} ${quest.title}</div>
        <div class="quest-description">${quest.description}</div>
        ${quest.done ? '' : quest.steps.map((step) => `<div class="quest-step ${step.have >= step.need ? 'done' : ''}"><span>${step.label}</span><span>${step.have >= step.need ? '✔' : `${step.have}/${step.need}`}</span></div>`).join('')}
      </div>`).join('');
  }

  function placeEdgeArrow(element, screenAngle, icon, distance = null) {
    if (screenAngle === null) {
      element.classList.remove('visible');
      return;
    }
    if (icon) element.querySelector('.icon').textContent = icon;
    const distanceLabel = element.querySelector('.distance');
    if (distanceLabel) distanceLabel.textContent = distance === null ? '' : `${Math.round(distance)} m`;
    const top = 70;
    const bottom = innerHeight - 110;
    const centerY = (top + bottom) / 2;
    const halfWidth = innerWidth / 2 - 40;
    const halfHeight = (bottom - top) / 2;
    const directionX = Math.cos(screenAngle);
    const directionY = -Math.sin(screenAngle);
    const scale = Math.min(halfWidth / Math.max(1e-3, Math.abs(directionX)), halfHeight / Math.max(1e-3, Math.abs(directionY)));
    element.style.transform = `translate(${innerWidth / 2 + directionX * scale - 24}px, ${centerY + directionY * scale - 24}px)`;
    element.querySelector('.chevron').style.transform = `rotate(${-screenAngle}rad)`;
    element.classList.add('visible');
  }

  const setGuideArrow = (screenAngle, icon, distance) => placeEdgeArrow(guideArrow, screenAngle, icon, distance);
  const setSloopArrow = (screenAngle) => placeEdgeArrow(sloopArrow, screenAngle, null);

  function setRecipes(recipes) {
    const signature = JSON.stringify(recipes);
    if (signature === lastCraftSignature) return;
    lastCraftSignature = signature;
    craftList.innerHTML = recipes.map((recipe) => `
      <div class="recipe">
        <div><div class="quest-title">${recipe.icon} ${recipe.name} ${recipe.owned === '' ? '' : `<span class="owned">· have ${recipe.owned}</span>`}</div><div class="quest-description">${recipe.costText}</div></div>
        <button type="button" data-recipe="${recipe.id}" ${recipe.canCraft ? '' : 'disabled'}>Craft</button>
      </div>`).join('');
  }

  function onCraft(handler) {
    craftHandler = handler;
  }

  function onReset(handler) {
    resetHandler = handler;
  }

  function update({ speedKnots, windScreenAngle, aground, showHint, efficiencyAngle, sailing }) {
    if (sailing) {
      windArrow.setAttribute('transform', `rotate(${(windScreenAngle * 180) / Math.PI})`);
      const nextSpeedText = speedKnots.toFixed(1);
      if (nextSpeedText !== lastSpeedText) {
        speedText.textContent = nextSpeedText;
        lastSpeedText = nextSpeedText;
      }
    }
    const nextStatus = !sailing ? '' : aground ? 'Aground!' : efficiencyAngle < 0.56 ? 'Into the wind – turn away' : '';
    if (nextStatus !== lastStatus) {
      status.textContent = nextStatus;
      status.classList.toggle('visible', nextStatus !== '');
      lastStatus = nextStatus;
    }
    hint.classList.toggle('hidden', !showHint || performance.now() - hintShownAt > 8000);
  }

  function setVisible(visible) {
    root.style.display = visible ? '' : 'none';
  }

  return { update, setVisible, setMode, setInventory, showToast, setAction, onReset, setQuests, setGuideArrow, setSloopArrow, setRecipes, onCraft, setHunger, onEat, closeMenus, setTide, onBagAction, setNavy, setCrabs };
}
