import * as THREE from 'three';
import { createNoise2D, createRandom, fractalNoise, ridgedNoise, smoothstep, lerp } from './noise.js';

export const SEA_LEVEL = 0;

export function createHeightmap(resolution, worldSize, heights) {
  const cellSize = worldSize / (resolution - 1);
  const halfWorld = worldSize / 2;

  function heightAt(worldX, worldZ) {
    const gridX = (worldX + halfWorld) / cellSize;
    const gridZ = (worldZ + halfWorld) / cellSize;
    if (gridX < 0 || gridZ < 0 || gridX >= resolution - 1 || gridZ >= resolution - 1) return -60;
    const cellX = Math.floor(gridX);
    const cellZ = Math.floor(gridZ);
    const fractionX = gridX - cellX;
    const fractionZ = gridZ - cellZ;
    const rowStart = cellZ * resolution + cellX;
    const near = lerp(heights[rowStart], heights[rowStart + 1], fractionX);
    const far = lerp(heights[rowStart + resolution], heights[rowStart + resolution + 1], fractionX);
    return lerp(near, far, fractionZ);
  }

  return { resolution, worldSize, cellSize, heights, heightAt };
}

export function generateIslandHeightmap({ seed = 7, resolution = 257, worldSize = 2048 } = {}) {
  const baseNoise = createNoise2D(seed);
  const warpNoise = createNoise2D(seed + 1);
  const detailNoise = createNoise2D(seed + 2);
  const reefNoise = createNoise2D(seed + 3);
  const heights = new Float32Array(resolution * resolution);

  const bayCenterX = 0.08;
  const bayCenterZ = 0.45;
  const cliffDirectionX = 0.97;
  const cliffDirectionZ = 0.22;

  for (let row = 0; row < resolution; row++) {
    for (let column = 0; column < resolution; column++) {
      const normalizedX = (column / (resolution - 1)) * 2 - 1;
      const normalizedZ = (row / (resolution - 1)) * 2 - 1;

      const warpedX = normalizedX + fractalNoise(warpNoise, normalizedX * 1.6, normalizedZ * 1.6, 3) * 0.16;
      const warpedZ = normalizedZ + fractalNoise(warpNoise, normalizedX * 1.6 + 9.1, normalizedZ * 1.6 - 3.7, 3) * 0.16;
      const radius = Math.hypot(warpedX * 1.05, warpedZ * 0.85);
      const bayDistance = Math.hypot(normalizedX - bayCenterX, normalizedZ - bayCenterZ);

      let landField = (0.52 - radius) * 2.2;
      landField += fractalNoise(baseNoise, normalizedX * 3, normalizedZ * 3, 4) * 0.28;
      landField -= Math.max(0, 0.3 + fractalNoise(baseNoise, normalizedX * 4 + 5.3, normalizedZ * 4 - 2.1, 3) * 0.09 - bayDistance) * 2.6;

      const directionLength = Math.hypot(normalizedX, normalizedZ) + 1e-5;
      const cliffAlignment = (normalizedX * cliffDirectionX + normalizedZ * cliffDirectionZ) / directionLength;
      const cliffWeight = smoothstep(0.45, 0.85, cliffAlignment);

      let height;
      if (landField > 0) {
        const beachWidth = lerp(0.09, 0.012, cliffWeight);
        const beach = smoothstep(0, beachWidth, landField) * lerp(2.4, 1.2, cliffWeight);
        const cliffRise = smoothstep(0.004, 0.07, landField) * cliffWeight * 26;
        const hillWeight = Math.pow(smoothstep(0.04, 0.75, landField), 1.4);
        const ridge = ridgedNoise(detailNoise, normalizedX * 2.4 + 4.3, normalizedZ * 2.4 - 1.2, 5);
        const hills = hillWeight * (28 + ridge * 120);
        const roughness = fractalNoise(detailNoise, normalizedX * 18, normalizedZ * 18, 3) * 2.2 * smoothstep(0.03, 0.2, landField);
        height = Math.max(beach + Math.max(cliffRise, hills * 0.6) + hills * 0.4 + roughness, smoothstep(0, 0.04, landField) * 1.15);
      } else {
        const depth01 = -landField;
        height = -smoothstep(0, 0.12, depth01) * 7 - smoothstep(0.1, 0.7, depth01) * 55;
        const reefBand = Math.exp(-Math.pow((depth01 - 0.2) / 0.035, 2));
        const reefPresence = smoothstep(-0.1, 0.35, fractalNoise(reefNoise, normalizedX * 5, normalizedZ * 5, 3));
        height += reefBand * reefPresence * (1 - cliffWeight) * 6.2;
        height += fractalNoise(detailNoise, normalizedX * 22, normalizedZ * 22, 2) * 0.6;
      }
      heights[row * resolution + column] = height;
    }
  }
  return createHeightmap(resolution, worldSize, heights);
}

const SAND_DRY = new THREE.Color(0.8, 0.69, 0.49);
const SAND_WET = new THREE.Color(0.72, 0.61, 0.43);
const SEABED_SAND = new THREE.Color(0.88, 0.82, 0.64);
const SEABED_DEEP = new THREE.Color(0.32, 0.42, 0.42);
const REEF_TINT = new THREE.Color(0.62, 0.5, 0.42);
const GRASS = new THREE.Color(0.4, 0.58, 0.16);
const JUNGLE = new THREE.Color(0.14, 0.33, 0.1);
const JUNGLE_DARK = new THREE.Color(0.09, 0.22, 0.08);
const ROCK = new THREE.Color(0.4, 0.32, 0.24);
const ROCK_DARK = new THREE.Color(0.27, 0.21, 0.16);

const terrainColorNoise = createNoise2D(99);
const secondaryColor = new THREE.Color();

export function terrainColorAt(worldX, worldZ, height, slope, outColor) {
  const variation = terrainColorNoise(worldX * 0.02, worldZ * 0.02) * 0.5 + terrainColorNoise(worldX * 0.11, worldZ * 0.11) * 0.25;
  if (height < -0.4) {
    outColor.copy(SEABED_SAND).lerp(SEABED_DEEP, smoothstep(1, 14, -height));
    if (height > -4 && variation > 0.05) outColor.lerp(REEF_TINT, 0.5);
  } else if (height < 0.7) {
    outColor.copy(SAND_WET).lerp(SAND_DRY, smoothstep(-0.4, 0.7, height));
  } else {
    const sandToGreen = smoothstep(2.0 + variation * 1.5, 2.6 + variation * 1.5, height);
    secondaryColor.copy(GRASS).lerp(JUNGLE, smoothstep(-0.15, 0.25, variation + height * 0.004));
    secondaryColor.lerp(JUNGLE_DARK, smoothstep(30, 90, height) * 0.75);
    outColor.copy(SAND_DRY).lerp(secondaryColor, sandToGreen);
    const rockiness = smoothstep(0.95, 1.1, slope) + smoothstep(140, 155, height) * 0.6;
    secondaryColor.copy(ROCK).lerp(ROCK_DARK, smoothstep(-0.2, 0.3, variation));
    outColor.lerp(secondaryColor, Math.min(1, rockiness));
  }
  return outColor;
}

export function createGridIndices(resolution) {
  const indices = new Uint32Array((resolution - 1) * (resolution - 1) * 6);
  let writeIndex = 0;
  for (let row = 0; row < resolution - 1; row++) {
    for (let column = 0; column < resolution - 1; column++) {
      const topLeft = row * resolution + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + resolution;
      const bottomRight = bottomLeft + 1;
      indices[writeIndex++] = topLeft;
      indices[writeIndex++] = bottomLeft;
      indices[writeIndex++] = topRight;
      indices[writeIndex++] = topRight;
      indices[writeIndex++] = bottomLeft;
      indices[writeIndex++] = bottomRight;
    }
  }
  return indices;
}

export function createTerrainMaterial({ hiddenRectangle = null } = {}) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.hiddenRectangle = { value: hiddenRectangle ?? new THREE.Vector4(1e9, 1e9, -1e9, -1e9) };
    shader.vertexShader = 'varying vec3 terrainWorldPosition;\n' + shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nterrainWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = `varying vec3 terrainWorldPosition;
      uniform vec4 hiddenRectangle;
      float terrainHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float terrainNoise(vec2 p) {
        vec2 cell = floor(p); vec2 local = fract(p); vec2 blend = local * local * (3.0 - 2.0 * local);
        return mix(mix(terrainHash(cell), terrainHash(cell + vec2(1, 0)), blend.x), mix(terrainHash(cell + vec2(0, 1)), terrainHash(cell + vec2(1, 1)), blend.x), blend.y);
      }
      ` + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `if (all(greaterThan(terrainWorldPosition.xz, hiddenRectangle.xy)) && all(lessThan(terrainWorldPosition.xz, hiddenRectangle.zw))) discard;
       #include <color_fragment>
       float terrainDetail = terrainNoise(terrainWorldPosition.xz * 0.35) * 0.6 + terrainNoise(terrainWorldPosition.xz * 1.1) * 0.4;
       diffuseColor.rgb *= 0.86 + 0.28 * terrainDetail;
       float tideWetness = (1.0 - smoothstep(0.8, 1.0, terrainWorldPosition.y)) * smoothstep(-1.2, -0.9, terrainWorldPosition.y);
       diffuseColor.rgb *= 1.0 - 0.3 * tideWetness;
       float wrackLine = smoothstep(0.84, 0.9, terrainWorldPosition.y) * (1.0 - smoothstep(0.96, 1.04, terrainWorldPosition.y));
       float wrackClumps = smoothstep(0.45, 0.75, terrainNoise(terrainWorldPosition.xz * 0.9));
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.24, 0.12), wrackLine * wrackClumps * 0.75);`,
    );
  };
  return material;
}

export function buildTerrainMesh(heightmap, hiddenRectangle) {
  const { resolution, worldSize, heights, cellSize } = heightmap;
  const vertexCount = resolution * resolution;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const halfWorld = worldSize / 2;
  const color = new THREE.Color();

  for (let row = 0; row < resolution; row++) {
    for (let column = 0; column < resolution; column++) {
      const index = row * resolution + column;
      const worldX = column * cellSize - halfWorld;
      const worldZ = row * cellSize - halfWorld;
      const height = heights[index];
      positions[index * 3] = worldX;
      positions[index * 3 + 1] = height;
      positions[index * 3 + 2] = worldZ;

      const left = heights[row * resolution + Math.max(0, column - 1)];
      const right = heights[row * resolution + Math.min(resolution - 1, column + 1)];
      const back = heights[Math.max(0, row - 1) * resolution + column];
      const front = heights[Math.min(resolution - 1, row + 1) * resolution + column];
      const slope = Math.hypot(right - left, front - back) / (2 * cellSize);
      terrainColorAt(worldX, worldZ, height, slope, color);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(createGridIndices(resolution), 1));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, createTerrainMaterial({ hiddenRectangle }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export function createSeaDepthTexture(heightmap) {
  const { resolution, heights } = heightmap;
  const halfFloats = new Uint16Array(resolution * resolution);
  for (let i = 0; i < halfFloats.length; i++) halfFloats[i] = THREE.DataUtils.toHalfFloat(heights[i]);
  const texture = new THREE.DataTexture(halfFloats, resolution, resolution, THREE.RedFormat, THREE.HalfFloatType);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export function scatterOnIsland(heightmap, { seed, count, minHeight, maxHeight, maxSlope, accept }) {
  const random = createRandom(seed);
  const { worldSize, heightAt } = heightmap;
  const placements = [];
  const islandExtent = worldSize * 0.42;
  let attempts = 0;
  while (placements.length < count && attempts < count * 60) {
    attempts++;
    const worldX = (random() * 2 - 1) * islandExtent;
    const worldZ = (random() * 2 - 1) * islandExtent;
    const height = heightAt(worldX, worldZ);
    if (height < minHeight || height > maxHeight) continue;
    const slope = Math.hypot(heightAt(worldX + 2, worldZ) - heightAt(worldX - 2, worldZ), heightAt(worldX, worldZ + 2) - heightAt(worldX, worldZ - 2)) / 4;
    if (slope > maxSlope) continue;
    if (accept && !accept(worldX, worldZ, height, slope, random)) continue;
    placements.push({ x: worldX, y: height, z: worldZ, random: random(), slope });
  }
  return placements;
}
