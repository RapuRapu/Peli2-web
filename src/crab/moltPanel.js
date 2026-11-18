import { element } from './workbench.js';
import { MOLT_KINDS, MOLT_SECONDS, SOFT_SECONDS, MAX_MOLTS } from './progression.js';

export function createMoltPanel(root, { progression, onMolt, onClose }) {
  const overlay = element('div', 'workbench molt-panel', root);
  const card = element('div', 'workbench-card', overlay);
  const header = element('div', 'workbench-header', card);
  element('div', 'workbench-title', header, '🦀 Molt');
  const closeButton = element('button', 'workbench-close', header, '✕');
  closeButton.setAttribute('aria-label', 'Close');
  const body = element('div', 'workbench-body', card);

  function render() {
    body.replaceChildren();
    const available = progression.moltsAvailable();
    element('div', 'summary', body, `Molts: ${progression.state.molts.length}/${MAX_MOLTS} · ready: ${available}`);
    element('div', 'panel-hint', body, `You shed your old skin here in the burrow (${MOLT_SECONDS} s). Your new skin stays soft for ${SOFT_SECONDS / 60} min: 🛡 −50%. Choose which claw grows.`);
    for (const [kind, definition] of Object.entries(MOLT_KINDS)) {
      const row = element('div', 'item', body);
      const text = element('div', 'item-text', row);
      element('div', 'item-name', text, `${definition.icon} ${definition.label} · ×${progression.moltCount(kind)}`);
      element('div', 'item-ability', text, definition.description);
      const button = element('button', 'item-action', row, 'Molt');
      button.dataset.molt = kind;
      button.disabled = !available;
      button.addEventListener('click', () => onMolt(kind));
    }
    if (!available) element('div', 'panel-hint', body, 'You can molt again at levels 3, 6 and 9, and after that every 1500 XP.');
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
      overlay.classList.remove('visible');
      root.classList.remove('panel-open');
    },
    render,
  };
}
