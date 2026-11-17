import { QUALITY_LEVELS } from './quality.js';

function element(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

export function createHud(activeQualityName) {
  const root = element('div', '', document.body);
  root.id = 'hud';

  const topLeft = element('div', 'top-left', root);
  const pauseButton = element('button', 'pause-button', topLeft);
  pauseButton.setAttribute('aria-label', 'Pause');
  pauseButton.innerHTML = '<svg viewBox="0 0 14 16"><rect x="1" y="1" width="4" height="14" rx="1" fill="#fff8e8"/><rect x="9" y="1" width="4" height="14" rx="1" fill="#fff8e8"/></svg>';
  const bagButton = element('button', 'bag-button', topLeft, '🎒');
  bagButton.setAttribute('aria-label', 'Backpack');
  const bagDot = element('span', 'bag-dot hidden', bagButton);
  const goal = element('div', 'chip goal', topLeft);

  const topRight = element('div', 'top-right', root);
  const tide = element('div', 'chip tide', topRight);
  const tideLabel = element('span', '', tide, '🌊');
  const tideFill = element('div', 'tide-fill', element('div', 'tide-gauge', tide));

  const toastBox = element('div', 'toast', root);
  const hint = element('div', 'hint hidden', root);

  const pauseMenu = element('div', 'pause-menu', root);
  const pauseCard = element('div', 'pause-card', pauseMenu);
  element('div', 'pause-title', pauseCard, 'Paused');
  const resumeButton = element('button', 'resume', pauseCard, 'Resume');
  element('div', 'pause-note', pauseCard, 'Graphics (reloads the game)');
  const qualityRow = element('div', 'quality-row', pauseCard);
  const qualityButtons = Object.entries(QUALITY_LEVELS).map(([name, level]) => {
    const button = element('button', name === activeQualityName ? 'active' : '', qualityRow, level.label);
    button.dataset.quality = name;
    return button;
  });
  const resetButton = element('button', 'reset', pauseCard, 'Start over');
  element('div', 'pause-note', pauseCard, 'The game saves on its own.');

  let pauseListener = () => {};
  let resetListener = () => {};
  let qualityListener = () => {};
  let goalListener = () => {};
  let bagListener = () => {};
  let toastTimer = 0;
  let resetArmed = false;

  pauseButton.addEventListener('click', () => pauseListener(true));
  bagButton.addEventListener('click', () => bagListener());
  goal.addEventListener('click', () => {
    if (goal.classList.contains('action')) goalListener();
  });
  resumeButton.addEventListener('click', () => pauseListener(false));
  resetButton.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      resetButton.classList.add('armed');
      resetButton.textContent = 'Tap again to erase progress';
      return;
    }
    resetListener();
  });
  for (const button of qualityButtons) button.addEventListener('click', () => qualityListener(button.dataset.quality));

  return {
    onPause: (listener) => { pauseListener = listener; },
    onReset: (listener) => { resetListener = listener; },
    onQuality: (listener) => { qualityListener = listener; },
    onGoalTap: (listener) => { goalListener = listener; },
    onBag: (listener) => { bagListener = listener; },
    setBagDot(visible) {
      bagDot.classList.toggle('hidden', !visible);
    },
    root,
    setPaused(paused) {
      pauseMenu.classList.toggle('visible', paused);
      resetArmed = false;
      resetButton.classList.remove('armed');
      resetButton.textContent = 'Start over';
    },
    bumpBag() {
      bagButton.classList.remove('bump');
      void bagButton.offsetWidth;
      bagButton.classList.add('bump');
    },
    setGoal(text, { done = false, action = false } = {}) {
      goal.classList.toggle('hidden', !text);
      goal.textContent = text || '';
      goal.classList.toggle('done', done && !action);
      goal.classList.toggle('action', action);
    },
    setTide(label, fraction) {
      tideLabel.textContent = `🌊 ${label}`;
      tideFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    toast(text) {
      toastBox.textContent = text;
      toastBox.classList.add('visible');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastBox.classList.remove('visible'), 2600);
    },
    setHint(text) {
      hint.classList.toggle('hidden', !text);
      if (text) hint.textContent = text;
    },
    setVisible(visible) {
      root.style.display = visible ? '' : 'none';
    },
  };
}
