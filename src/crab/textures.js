import * as THREE from 'three';
import { createRandom } from '../noise.js';

const TEXTURE_SIZE = 256;

function createPeriodicGradientNoise(seed) {
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
  const wrap = (value, period) => ((value % period) + period) % period;

  function gradientDot(cellX, cellY, period, offsetX, offsetY) {
    const index = permutation[wrap(cellX, period) + permutation[wrap(cellY, period) + permutation[period & 255]]];
    return gradientX[index] * offsetX + gradientY[index] * offsetY;
  }

  return function periodicNoise(x, y, period) {
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    const localX = x - cellX;
    const localY = y - cellY;
    const fadeX = fade(localX);
    const fadeY = fade(localY);
    const bottom = gradientDot(cellX, cellY, period, localX, localY) * (1 - fadeX) + gradientDot(cellX + 1, cellY, period, localX - 1, localY) * fadeX;
    const top = gradientDot(cellX, cellY + 1, period, localX, localY - 1) * (1 - fadeX) + gradientDot(cellX + 1, cellY + 1, period, localX - 1, localY - 1) * fadeX;
    return (bottom * (1 - fadeY) + top * fadeY) * 1.41;
  };
}

function periodicFractal(noise, u, v, basePeriod, octaves) {
  let sum = 0;
  let amplitude = 1;
  let amplitudeTotal = 0;
  let period = basePeriod;
  for (let octave = 0; octave < octaves; octave++) {
    sum += noise(u * period, v * period, period) * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= 0.5;
    period *= 2;
  }
  return sum / amplitudeTotal;
}

function createPeriodicCells(seed, cellsPerSide) {
  const random = createRandom(seed);
  const pointX = new Float32Array(cellsPerSide * cellsPerSide);
  const pointY = new Float32Array(cellsPerSide * cellsPerSide);
  for (let i = 0; i < pointX.length; i++) {
    pointX[i] = random();
    pointY[i] = random();
  }
  return function nearestTwo(u, v) {
    const x = u * cellsPerSide;
    const y = v * cellsPerSide;
    const cellX = Math.floor(x);
    const cellY = Math.floor(y);
    let nearest = 9;
    let secondNearest = 9;
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const neighborX = cellX + offsetX;
        const neighborY = cellY + offsetY;
        const index = (((neighborY % cellsPerSide) + cellsPerSide) % cellsPerSide) * cellsPerSide + (((neighborX % cellsPerSide) + cellsPerSide) % cellsPerSide);
        const distance = Math.hypot(neighborX + pointX[index] - x, neighborY + pointY[index] - y);
        if (distance < nearest) {
          secondNearest = nearest;
          nearest = distance;
        } else if (distance < secondNearest) {
          secondNearest = distance;
        }
      }
    }
    return [nearest, secondNearest];
  };
}

const clampToByte = (value) => Math.max(0, Math.min(255, Math.round(value * 255)));

function finishTexture(texture) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function createNoiseTexture() {
  const cloudNoise = createPeriodicGradientNoise(11);
  const streakNoise = createPeriodicGradientNoise(29);
  const coarseCells = createPeriodicCells(5, 7);
  const fineCells = createPeriodicCells(17, 15);
  const grainCells = createPeriodicCells(41, 30);
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let row = 0; row < TEXTURE_SIZE; row++) {
    for (let column = 0; column < TEXTURE_SIZE; column++) {
      const u = column / TEXTURE_SIZE;
      const v = row / TEXTURE_SIZE;
      const offset = (row * TEXTURE_SIZE + column) * 4;
      const [coarseNearest, coarseSecond] = coarseCells(u, v);
      const [fineNearest, fineSecond] = fineCells(u, v);
      const coarseEdge = 1 - Math.min(1, (coarseSecond - coarseNearest) / 0.2);
      const fineEdge = 1 - Math.min(1, (fineSecond - fineNearest) / 0.28);
      const causticLines = Math.pow(coarseEdge, 1.6) * 0.85 + Math.pow(fineEdge, 2) * 0.3;
      data[offset] = clampToByte(periodicFractal(cloudNoise, u, v, 4, 5) * 0.62 + 0.5);
      data[offset + 1] = clampToByte(periodicFractal(streakNoise, u, v, 6, 4) * 0.62 + 0.5);
      data[offset + 2] = clampToByte(causticLines);
      data[offset + 3] = clampToByte(1 - grainCells(u, v)[0] / 0.75);
    }
  }
  return finishTexture(new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat));
}

export function createWaveGradientTexture() {
  const swellNoise = createPeriodicGradientNoise(53);
  const rippleNoise = createPeriodicGradientNoise(71);
  const swell = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE);
  const ripple = new Float32Array(TEXTURE_SIZE * TEXTURE_SIZE);
  for (let row = 0; row < TEXTURE_SIZE; row++) {
    for (let column = 0; column < TEXTURE_SIZE; column++) {
      const u = column / TEXTURE_SIZE;
      const v = row / TEXTURE_SIZE;
      swell[row * TEXTURE_SIZE + column] = periodicFractal(swellNoise, u, v, 3, 4);
      ripple[row * TEXTURE_SIZE + column] = periodicFractal(rippleNoise, u, v, 9, 3);
    }
  }
  const wrapIndex = (value) => (value + TEXTURE_SIZE) % TEXTURE_SIZE;
  const gradient = (field, column, row, axisX) => {
    const ahead = field[wrapIndex(row + (axisX ? 0 : 1)) * TEXTURE_SIZE + wrapIndex(column + (axisX ? 1 : 0))];
    const behind = field[wrapIndex(row - (axisX ? 0 : 1)) * TEXTURE_SIZE + wrapIndex(column - (axisX ? 1 : 0))];
    return (ahead - behind) * TEXTURE_SIZE * 0.5;
  };
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let row = 0; row < TEXTURE_SIZE; row++) {
    for (let column = 0; column < TEXTURE_SIZE; column++) {
      const offset = (row * TEXTURE_SIZE + column) * 4;
      data[offset] = clampToByte(gradient(swell, column, row, true) * 0.09 + 0.5);
      data[offset + 1] = clampToByte(gradient(swell, column, row, false) * 0.09 + 0.5);
      data[offset + 2] = clampToByte(gradient(ripple, column, row, true) * 0.035 + 0.5);
      data[offset + 3] = clampToByte(gradient(ripple, column, row, false) * 0.035 + 0.5);
    }
  }
  return finishTexture(new THREE.DataTexture(data, TEXTURE_SIZE, TEXTURE_SIZE, THREE.RGBAFormat));
}
