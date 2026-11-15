export function createRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function createNoise2D(seed) {
  const random = createRandom(seed);
  const permutation = new Uint8Array(512);
  const shuffled = new Uint8Array(256);
  for (let i = 0; i < 256; i++) shuffled[i] = i;
  for (let i = 255; i > 0; i--) {
    const swapIndex = Math.floor(random() * (i + 1));
    const held = shuffled[i];
    shuffled[i] = shuffled[swapIndex];
    shuffled[swapIndex] = held;
  }
  for (let i = 0; i < 512; i++) permutation[i] = shuffled[i & 255];

  const gradientX = new Float32Array(256);
  const gradientY = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const angle = random() * Math.PI * 2;
    gradientX[i] = Math.cos(angle);
    gradientY[i] = Math.sin(angle);
  }

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  function gradientDot(cellX, cellY, offsetX, offsetY) {
    const index = permutation[(cellX & 255) + permutation[cellY & 255]];
    return gradientX[index] * offsetX + gradientY[index] * offsetY;
  }

  return function perlin2D(x, y) {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const localX = x - cellX;
    const localY = y - cellY;
    const fadeX = fade(localX);
    const fadeY = fade(localY);
    const bottom = gradientDot(cellX, cellY, localX, localY) * (1 - fadeX) + gradientDot(cellX + 1, cellY, localX - 1, localY) * fadeX;
    const top = gradientDot(cellX, cellY + 1, localX, localY - 1) * (1 - fadeX) + gradientDot(cellX + 1, cellY + 1, localX - 1, localY - 1) * fadeX;
    return (bottom * (1 - fadeY) + top * fadeY) * 1.41;
  };
}

export function fractalNoise(noise2D, x, y, octaves, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let amplitudeTotal = 0;
  for (let octave = 0; octave < octaves; octave++) {
    sum += noise2D(x * frequency, y * frequency) * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return sum / amplitudeTotal;
}

export function ridgedNoise(noise2D, x, y, octaves) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let previousRidge = 1;
  for (let octave = 0; octave < octaves; octave++) {
    let ridge = 1 - Math.abs(noise2D(x * frequency, y * frequency));
    ridge *= ridge;
    sum += ridge * amplitude * previousRidge;
    previousRidge = ridge;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum;
}

export const smoothstep = (edgeLow, edgeHigh, value) => {
  const t = Math.min(1, Math.max(0, (value - edgeLow) / (edgeHigh - edgeLow)));
  return t * t * (3 - 2 * t);
};

export const lerp = (from, to, t) => from + (to - from) * t;
