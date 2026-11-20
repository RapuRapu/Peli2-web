import { QUALITY_LEVELS } from './quality.js';
import { createGameLog } from './gameLog.js';

function element(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

const SETTINGS_ICON_SVG = '<svg viewBox="0 0 24 24"><path fill="#fff8e8" fill-rule="evenodd" d="M10.3 1.5h3.4l.5 2.8 1.9.8 2.3-1.6 2.4 2.4-1.6 2.3.8 1.9 2.8.5v3.4l-2.8.5-.8 1.9 1.6 2.3-2.4 2.4-2.3-1.6-1.9.8-.5 2.8h-3.4l-.5-2.8-1.9-.8-2.3 1.6-2.4-2.4 1.6-2.3-.8-1.9-2.8-.5v-3.4l2.8-.5.8-1.9-1.6-2.3 2.4-2.4 2.3 1.6 1.9-.8zM12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z"/></svg>';
const TRAVEL_EDGE_PIXELS = 70;
const TRAVEL_TOP_PIXELS = 130;

export function createHud(activeQualityName) {
  const root = element('div', '', document.body);
  root.id = 'hud';

  const topLeft = element('div', 'top-left', root);
  const pauseButton = element('button', 'pause-button', topLeft);
  pauseButton.setAttribute('aria-label', 'Settings');
  pauseButton.innerHTML = SETTINGS_ICON_SVG;
  const bagButton = element('button', 'bag-button', topLeft, '🎒');
  bagButton.setAttribute('aria-label', 'Backpack');
  const bagDot = element('span', 'bag-dot hidden', bagButton);
  const mapButton = element('button', 'bag-button map-button', topLeft, '🗺️');
  mapButton.setAttribute('aria-label', 'Map');
  const burrowButtons = element('div', 'burrow-buttons hidden', root);
  const iconButton = (className, icon, label) => {
    const button = element('button', `build-button icon-button ${className}`, burrowButtons);
    button.innerHTML = icon;
    button.setAttribute('aria-label', label);
    button.title = label;
    return button;
  };
  const moltButton = iconButton('molt-button hidden', '🦞', 'Molt');
  const moltCount = element('span', 'button-count', moltButton);
  const helpersButton = iconButton('helpers-button', '🦀', 'Helpers');
  const BUILD_ICON = '🔨';
  const DIG_BURROW_ICON = '<svg class="dig-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M3 42 Q24 8 45 42 Z" fill="#f4e2b8" stroke="#5a3a18" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="24" cy="36" rx="11" ry="6" fill="#1c120a"/><circle cx="11" cy="15" r="2.6" fill="#f4e2b8" stroke="#5a3a18" stroke-width="1.5"/><circle cx="36" cy="11" r="2.2" fill="#f4e2b8" stroke="#5a3a18" stroke-width="1.5"/><circle cx="29" cy="5" r="1.8" fill="#f4e2b8" stroke="#5a3a18" stroke-width="1.5"/></svg>';
  const buildButton = iconButton('build-open', BUILD_ICON, 'Build');
  const travelButton = element('button', 'travel-button hidden', root);
  const modeBar = element('div', 'mode-bar hidden', root);
  const modeText = element('span', 'mode-text', modeBar);
  const modeCancel = element('button', 'mode-cancel', modeBar, 'Cancel');
  const sceneFade = element('div', 'scene-fade', root);

  const vitals = element('div', 'vitals', root);
  const levelBadge = element('button', 'level-badge', vitals, 'Lv 1');
  levelBadge.setAttribute('aria-label', 'Status');
  const bars = element('div', 'vital-bars', vitals);
  const healthTrack = element('div', 'health-track', bars);
  const healthFill = element('div', 'health-fill', healthTrack);
  const healthText = element('div', 'health-text', healthTrack);
  const experienceTrack = element('div', 'experience-track', bars);
  const experienceFill = element('div', 'experience-fill', experienceTrack);
  const buffChip = element('div', 'buff-chip hidden', root);
  const hurtFlash = element('div', 'hurt-flash', root);
  const deathFade = element('div', 'death-fade', root);
  const floatLayer = element('div', 'float-layer', root);

  const topRight = element('div', 'top-right', root);
  const tide = element('div', 'chip tide', topRight);
  const tideLabel = element('span', '', tide, '🌊');
  const tideFill = element('div', 'tide-fill', element('div', 'tide-gauge', tide));

  const gameLog = createGameLog(root);

  const pauseMenu = element('div', 'pause-menu', root);
  const pauseCard = element('div', 'pause-card', pauseMenu);
  element('div', 'pause-title', pauseCard, 'Settings');
  const resumeButton = element('button', 'resume', pauseCard, 'Back to game');
  element('div', 'pause-note', pauseCard, 'Graphics (reloads the game)');
  const qualityRow = element('div', 'quality-row', pauseCard);
  const qualityButtons = Object.entries(QUALITY_LEVELS).map(([name, level]) => {
    const button = element('button', name === activeQualityName ? 'active' : '', qualityRow, level.label);
    button.dataset.quality = name;
    return button;
  });
  element('div', 'pause-note', pauseCard, 'Sound');
  const volumeInputs = {};
  for (const [key, label] of [['music', 'Music'], ['effects', 'Effects']]) {
    const row = element('label', 'volume-row', pauseCard, label);
    const input = element('input', '', row);
    Object.assign(input, { type: 'range', min: 0, max: 1, step: 0.05 });
    input.addEventListener('input', () => volumeListener(key, Number(input.value)));
    volumeInputs[key] = input;
  }
  element('div', 'pause-note', pauseCard, 'Display');
  const performanceRow = element('label', 'toggle-row', pauseCard, 'Show performance');
  const performanceToggle = element('input', '', performanceRow);
  performanceToggle.type = 'checkbox';
  performanceToggle.addEventListener('change', () => performanceListener(performanceToggle.checked));
  const fullscreenButton = element('button', 'fullscreen-button', pauseCard, 'Fullscreen');
  const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const refreshFullscreenButton = () => {
    fullscreenButton.textContent = fullscreenElement() ? 'Exit fullscreen' : 'Fullscreen';
  };
  fullscreenButton.addEventListener('click', async () => {
    try {
      if (fullscreenElement()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else {
        const page = document.documentElement;
        const request = page.requestFullscreen || page.webkitRequestFullscreen;
        if (!request || !(document.fullscreenEnabled || document.webkitFullscreenEnabled)) throw new Error('unsupported');
        await request.call(page, { navigationUI: 'hide' });
      }
    } catch {
      gameLog.post('notice', 'Fullscreen not available here');
    }
    refreshFullscreenButton();
  });
  document.addEventListener('fullscreenchange', refreshFullscreenButton);
  document.addEventListener('webkitfullscreenchange', refreshFullscreenButton);
  const resetButton = element('button', 'reset', pauseCard, 'Start over');
  element('div', 'pause-note', pauseCard, 'The game saves on its own.');

  let pauseListener = () => {};
  let resetListener = () => {};
  let qualityListener = () => {};
  let statusListener = () => {};
  let mapListener = () => {};
  let bagListener = () => {};
  let volumeListener = () => {};
  let performanceListener = () => {};
  let buildListener = () => {};
  let helpersListener = () => {};
  let moltListener = () => {};
  let modeCancelListener = () => {};
  let travelListener = () => {};
  let travelShown = null;
  let resetArmed = false;

  pauseButton.addEventListener('click', () => pauseListener(true));
  bagButton.addEventListener('click', () => bagListener());
  buildButton.addEventListener('click', () => buildListener());
  helpersButton.addEventListener('click', () => helpersListener());
  moltButton.addEventListener('click', () => moltListener());
  modeCancel.addEventListener('click', () => modeCancelListener());
  travelButton.addEventListener('click', () => travelListener());
  levelBadge.addEventListener('click', () => statusListener());
  mapButton.addEventListener('click', () => mapListener());
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
    onVolume: (listener) => { volumeListener = listener; },
    onPerformanceToggle: (listener) => { performanceListener = listener; },
    setPerformanceToggle(visible) {
      performanceToggle.checked = visible;
    },
    gameLog,
    log(kind, text) {
      gameLog.post(kind, text);
    },
    setVolumes(values) {
      for (const [key, input] of Object.entries(volumeInputs)) input.value = values[key];
    },
    onStatus: (listener) => { statusListener = listener; },
    onMap: (listener) => { mapListener = listener; },
    onBag: (listener) => { bagListener = listener; },
    onBuild: (listener) => { buildListener = listener; },
    onHelpers: (listener) => { helpersListener = listener; },
    onMolt: (listener) => { moltListener = listener; },
    setMoltButton(available) {
      moltButton.classList.toggle('hidden', !available);
      const countText = available ? String(available) : '';
      if (moltCount.textContent !== countText) moltCount.textContent = countText;
    },
    onTravel: (listener) => { travelListener = listener; },
    setTravel(option) {
      if (option === travelShown) return;
      travelShown = option;
      travelButton.classList.toggle('hidden', !option);
      root.classList.toggle('travel-shown', Boolean(option));
      if (option) travelButton.textContent = option === 'enter' ? 'Enter burrow' : 'Go outside';
    },
    placeTravel(screenX, screenY) {
      if (!travelShown) return;
      const x = Math.min(innerWidth - TRAVEL_EDGE_PIXELS, Math.max(TRAVEL_EDGE_PIXELS, screenX));
      const y = Math.min(innerHeight - TRAVEL_EDGE_PIXELS, Math.max(TRAVEL_TOP_PIXELS, screenY));
      travelButton.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    },
    bumpTravel() {
      travelButton.classList.remove('bump');
      void travelButton.offsetWidth;
      travelButton.classList.add('bump');
    },
    setBuildButton(visible, { surface = false } = {}) {
      burrowButtons.classList.toggle('hidden', !visible);
      burrowButtons.classList.toggle('surface', surface);
      const label = surface ? 'Dig a burrow' : 'Build';
      if (buildButton.getAttribute('aria-label') !== label) {
        buildButton.innerHTML = surface ? DIG_BURROW_ICON : BUILD_ICON;
        buildButton.setAttribute('aria-label', label);
        buildButton.title = label;
      }
    },
    setMode(text, onCancel = () => {}) {
      modeBar.classList.toggle('hidden', !text);
      burrowButtons.classList.toggle('dimmed', Boolean(text));
      root.classList.toggle('placing', Boolean(text));
      if (text && text !== modeText.textContent) gameLog.post('notice', text);
      modeText.textContent = text || '';
      modeCancelListener = onCancel;
    },
    fade() {
      sceneFade.classList.remove('visible');
      void sceneFade.offsetWidth;
      sceneFade.classList.add('visible');
    },
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
    setBuff(text) {
      buffChip.classList.toggle('hidden', !text);
      if (text && buffChip.textContent !== text) buffChip.textContent = text;
    },
    setTide(label, fraction) {
      tideLabel.textContent = /tide/i.test(label) ? label : `Tide ${label.toLowerCase()}`;
      tideFill.style.width = `${Math.round(fraction * 100)}%`;
    },
    setVitals(level, health, maxHealth, experience, experienceToNext) {
      const levelText = `Lv ${level}`;
      if (levelBadge.textContent !== levelText) levelBadge.textContent = levelText;
      healthFill.style.width = `${(Math.max(0, health) / maxHealth) * 100}%`;
      const healthLabel = `${Math.ceil(Math.max(0, health))}/${maxHealth}`;
      if (healthText.textContent !== healthLabel) healthText.textContent = healthLabel;
      experienceFill.style.width = experienceToNext ? `${(experience / experienceToNext) * 100}%` : '100%';
    },
    floatText(x, y, text, kind) {
      const label = element('div', `float-text ${kind}`, floatLayer, text);
      label.style.left = `${x + (Math.random() - 0.5) * 18}px`;
      label.style.top = `${y}px`;
      setTimeout(() => label.remove(), 1000);
    },
    flashHurt() {
      hurtFlash.classList.remove('visible');
      void hurtFlash.offsetWidth;
      hurtFlash.classList.add('visible');
    },
    showDeath() {
      deathFade.classList.remove('visible');
      void deathFade.offsetWidth;
      deathFade.classList.add('visible');
    },
    setVisible(visible) {
      root.style.display = visible ? '' : 'none';
    },
  };
}
