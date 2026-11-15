import { ITEM_TYPES } from './items.js';

const HINTS = {
  sailing: '<span>Tap the sea: sail there</span> · <span>Hold: steer</span> · <span>Pinch: zoom</span>',
  onFoot: '<span>Tap: walk there</span> · <span>Gather repair materials</span> · <span>Pinch: zoom</span>',
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
    <div class="quest-log">
      <div class="quest-panel">
        <div class="quest-header"><span>📜 Quests</span><button class="quest-close" type="button">✕</button></div>
        <div class="quest-list"></div>
      </div>
    </div>
    <div class="guide-arrow"><span class="chevron">➤</span><span class="icon"></span></div>
    <div class="guide-arrow sloop"><span class="chevron">➤</span><span class="icon">🔨</span></div>
    <div class="inventory"></div>
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
  const questLog = root.querySelector('.quest-log');
  const questList = root.querySelector('.quest-list');
  const guideArrow = root.querySelector('.guide-arrow:not(.sloop)');
  const sloopArrow = root.querySelector('.guide-arrow.sloop');
  let lastQuestSignature = null;
  questChip.addEventListener('click', () => questLog.classList.add('open'));
  questLog.addEventListener('click', (event) => { if (event.target === questLog) questLog.classList.remove('open'); });
  root.querySelector('.quest-close').addEventListener('click', () => questLog.classList.remove('open'));
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
  for (const element of [actionButton, resetButton, questChip, questLog]) element.addEventListener('pointerdown', (event) => event.stopPropagation());

  let hintShownAt = performance.now();
  function setMode(mode) {
    compass.style.display = mode === 'sailing' ? '' : 'none';
    hint.innerHTML = HINTS[mode];
    hintShownAt = performance.now();
  }

  function setInventory(gold, counts) {
    const entries = Object.entries(counts).filter(([, count]) => count > 0);
    inventory.innerHTML = `<span class="slot">💰 ${gold}</span>` + entries.map(([type, count]) => `<span class="slot">${ITEM_TYPES[type].icon} ${count}</span>`).join('');
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

  function placeEdgeArrow(element, screenAngle, icon) {
    if (screenAngle === null) {
      element.classList.remove('visible');
      return;
    }
    if (icon) element.querySelector('.icon').textContent = icon;
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

  const setGuideArrow = (screenAngle, icon) => placeEdgeArrow(guideArrow, screenAngle, icon);
  const setSloopArrow = (screenAngle) => placeEdgeArrow(sloopArrow, screenAngle, null);

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

  return { update, setVisible, setMode, setInventory, showToast, setAction, onReset, setQuests, setGuideArrow, setSloopArrow };
}
