import { ITEM_TYPES } from './items.js';

const HINTS = {
  sailing: '<span>Kosketa merta: purjehdi sinne</span> · <span>Pidä pohjassa: ohjaa</span> · <span>Nipistä: zoomaa</span>',
  onFoot: '<span>Kosketa: kävele sinne</span> · <span>Kerää rannan tavarat</span> · <span>Nipistä: zoomaa</span>',
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
    resetButton.textContent = 'Aloita alusta?';
    resetButton.classList.add('armed');
    setTimeout(() => {
      resetButton.textContent = '↺';
      resetButton.classList.remove('armed');
    }, 3000);
  });
  for (const element of [actionButton, resetButton]) element.addEventListener('pointerdown', (event) => event.stopPropagation());

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

  function setAction(label, handler) {
    actionHandler = handler;
    if (label === lastActionLabel) return;
    lastActionLabel = label;
    actionButton.textContent = label ?? '';
    actionButton.classList.toggle('visible', Boolean(label));
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
    const nextStatus = !sailing ? '' : aground ? 'Karilla!' : efficiencyAngle < 0.56 ? 'Vastatuuleen – käänny' : '';
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

  return { update, setVisible, setMode, setInventory, showToast, setAction, onReset };
}
