const SAMPLE_CAPACITY = 240;
const TARGET_FRAME_INTERVAL_MS = 1000 / 60;
const SLOW_FRAME_MS = 20;
const PIXEL_RATIO_STEPS = [2, 1.75, 1.5, 1.25, 1, 0.8, 0.6];
const SLOW_WINDOWS_BEFORE_DROP = 2;
const CALM_WINDOWS_BEFORE_RISE = 2;
const CALM_SLOW_SHARE = 0.03;
const STORAGE_KEY = 'pirate-spike-pixel-ratio';

function readStoredPixelRatio() {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

function storePixelRatio(pixelRatio) {
  try {
    localStorage.setItem(STORAGE_KEY, String(pixelRatio));
  } catch {
    /* storage unavailable: start from the default next time */
  }
}

export function createPerformanceMonitor(renderer, { fixedPixelRatio }) {
  const maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const minPixelRatio = Math.min(0.6, maxPixelRatio);
  let pixelRatio = fixedPixelRatio ?? Math.min(maxPixelRatio, readStoredPixelRatio() ?? Math.min(maxPixelRatio, 1.5));
  renderer.setPixelRatio(pixelRatio);

  const frameIntervals = new Float32Array(SAMPLE_CAPACITY);
  const sortedIntervals = new Float32Array(SAMPLE_CAPACITY);
  let sampleCount = 0;
  let writeIndex = 0;
  let lastRenderTime = 0;
  let windowStart = 0;
  let windowFrames = 0;
  let windowSlowFrames = 0;
  let windowIntervalSum = 0;
  let calmWindows = 0;
  let slowWindows = 0;
  let pendingPixelRatio = null;
  const uncapped = new URLSearchParams(location.search).has('uncapped');

  const overlay = document.createElement('div');
  overlay.id = 'perf';
  document.body.appendChild(overlay);
  let overlayVisible = true;
  overlay.addEventListener('click', () => overlay.classList.toggle('compact'));

  function shouldRender(now) {
    const due = uncapped || now - lastRenderTime >= TARGET_FRAME_INTERVAL_MS - 2;
    if (due) applyPendingResolution();
    return due;
  }

  function stepFrom(ratio, direction) {
    const steps = PIXEL_RATIO_STEPS.filter((step) => step >= minPixelRatio - 1e-3 && step <= maxPixelRatio + 1e-3);
    if (direction < 0) return steps.find((step) => step < ratio - 1e-3) ?? minPixelRatio;
    return [...steps].reverse().find((step) => step > ratio + 1e-3) ?? maxPixelRatio;
  }

  function adaptResolution() {
    if (fixedPixelRatio) return;
    const slowShare = windowSlowFrames / Math.max(1, windowFrames);
    const averageInterval = windowIntervalSum / Math.max(1, windowFrames);
    let nextPixelRatio = pixelRatio;
    if (slowShare > 0.1 || averageInterval > 18.5) {
      calmWindows = 0;
      slowWindows++;
      if (slowWindows >= SLOW_WINDOWS_BEFORE_DROP) {
        nextPixelRatio = stepFrom(pixelRatio, -1);
        slowWindows = 0;
      }
    } else if (slowShare <= CALM_SLOW_SHARE && averageInterval < 17.6) {
      slowWindows = 0;
      calmWindows++;
      if (calmWindows >= CALM_WINDOWS_BEFORE_RISE) {
        nextPixelRatio = stepFrom(pixelRatio, 1);
        calmWindows = 0;
      }
    } else {
      calmWindows = 0;
      slowWindows = 0;
    }
    if (Math.abs(nextPixelRatio - pixelRatio) > 0.01) pendingPixelRatio = nextPixelRatio;
  }

  function applyPendingResolution() {
    if (pendingPixelRatio === null) return;
    pixelRatio = pendingPixelRatio;
    pendingPixelRatio = null;
    renderer.setPixelRatio(pixelRatio);
    storePixelRatio(pixelRatio);
    lastRenderTime = 0;
  }

  function refreshOverlay(now) {
    if (!overlayVisible || sampleCount === 0) return;
    sortedIntervals.set(frameIntervals);
    const live = sortedIntervals.subarray(0, sampleCount).sort();
    let sum = 0;
    for (let i = 0; i < sampleCount; i++) sum += live[i];
    const average = sum / sampleCount;
    const percentile99 = live[Math.min(sampleCount - 1, Math.floor(sampleCount * 0.99))];
    const maximum = live[sampleCount - 1];
    const info = renderer.info.render;
    const canvas = renderer.domElement;
    overlay.textContent =
      `${(1000 / average).toFixed(0)} fps  ${average.toFixed(1)} ms\n` +
      `p99 ${percentile99.toFixed(1)}  max ${maximum.toFixed(1)}\n` +
      `res ${pixelRatio.toFixed(2)}x ${canvas.width}×${canvas.height}\n` +
      `draws ${info.calls}  tris ${(info.triangles / 1000).toFixed(0)}k`;
  }

  function recordFrame(now) {
    if (lastRenderTime > 0) {
      const interval = now - lastRenderTime;
      frameIntervals[writeIndex] = interval;
      writeIndex = (writeIndex + 1) % SAMPLE_CAPACITY;
      sampleCount = Math.min(SAMPLE_CAPACITY, sampleCount + 1);
      windowFrames++;
      windowIntervalSum += interval;
      if (interval > SLOW_FRAME_MS) windowSlowFrames++;
    }
    lastRenderTime = now;
    if (now - windowStart >= 1000) {
      adaptResolution();
      refreshOverlay(now);
      windowStart = now;
      windowFrames = 0;
      windowSlowFrames = 0;
      windowIntervalSum = 0;
    }
  }

  function setVisible(visible) {
    overlayVisible = visible;
    overlay.style.display = visible ? '' : 'none';
  }

  return { shouldRender, recordFrame, setVisible };
}
