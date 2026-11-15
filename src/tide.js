export const TIDE_PERIOD_SECONDS = 240;
export const TIDE_AMPLITUDE = 0.9;

export const tide = { level: 0, time: 0 };

export function setTideTime(worldTime) {
  tide.time = worldTime;
  tide.level = TIDE_AMPLITUDE * Math.sin((worldTime / TIDE_PERIOD_SECONDS) * Math.PI * 2);
}

export function tideStatus() {
  const phase = ((tide.time / TIDE_PERIOD_SECONDS) % 1 + 1) % 1;
  const rising = phase < 0.25 || phase > 0.75;
  const nextExtremePhase = phase < 0.25 ? 0.25 : phase < 0.75 ? 0.75 : 1.25;
  const secondsToExtreme = (nextExtremePhase - phase) * TIDE_PERIOD_SECONDS;
  return { rising, secondsToExtreme, fraction: (tide.level / TIDE_AMPLITUDE + 1) / 2 };
}
