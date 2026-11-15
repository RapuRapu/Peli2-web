const STORAGE_KEY = 'peli2-save';
const SAVE_VERSION = 3;

export function createEmptySave() {
  return {
    version: SAVE_VERSION,
    mode: 'onFoot',
    character: null,
    ship: null,
    gold: 0,
    inventory: {},
    collectedItemIds: [],
    sloopRepaired: false,
    hasSailed: false,
    hasAxe: false,
    harvestedIds: [],
  };
}

export function loadSave() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored && stored.version === SAVE_VERSION) return { ...createEmptySave(), ...stored };
  } catch {
    /* unreadable or blocked storage: start a new game */
  }
  return createEmptySave();
}

export function writeSave(save) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing stored */
  }
}
