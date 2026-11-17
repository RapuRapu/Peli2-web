const STORAGE_KEY = 'seaofcrabs-quality';

export const QUALITY_LEVELS = {
  low: { label: 'Low', multisamples: 0, shadowMapSize: 1024, terrainShadows: false, depthOfField: false, bloomLevels: 4, density: 0.45, terrainCellSize: 1.7, maxPixelRatio: 1.25, chromaticCaustics: false, grassShadows: false, rippleCapacity: 6 },
  medium: { label: 'Medium', multisamples: 2, shadowMapSize: 2048, terrainShadows: false, depthOfField: true, bloomLevels: 5, density: 0.75, terrainCellSize: 1.25, maxPixelRatio: 1.5, chromaticCaustics: true, grassShadows: false, rippleCapacity: 12 },
  high: { label: 'High', multisamples: 4, shadowMapSize: 4096, terrainShadows: false, depthOfField: true, bloomLevels: 6, density: 1, terrainCellSize: 0.95, maxPixelRatio: 2, chromaticCaustics: true, grassShadows: true, rippleCapacity: 12 },
};

function defaultQualityName() {
  const isTouchDevice = matchMedia('(pointer: coarse)').matches;
  if (!isTouchDevice) return 'high';
  return (navigator.deviceMemory || 4) >= 8 ? 'high' : 'medium';
}

export function chosenQualityName(searchParameters) {
  const requested = searchParameters.get('quality');
  if (requested && QUALITY_LEVELS[requested]) return requested;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && QUALITY_LEVELS[stored]) return stored;
  } catch {
    /* storage unavailable: fall through to the device default */
  }
  return defaultQualityName();
}

export function storeQualityName(name) {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
}
