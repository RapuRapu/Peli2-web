import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { applySeaside } from './seaside.js';
import { createNoise2D } from '../noise.js';
import { element } from './workbench.js';
import { parseModel } from './rig.js';
import burrowPropBytes from './assets/burrowProps.glb';

export const BURROW_ORIGIN = { x: 1000, y: 200, z: 0 };
export const BURROW_GRID = 11;
export const BURROW_CELL = 3;
export const BURROW_LAYER = 1;
export const ENTRANCE_REACH = 2.6;
export const ENTRANCE_BLOCK_RADIUS = 1.3;
export const SHAFT_CELL = { column: 5, row: 7 };
export const SHAFT_ACCESS_ROW_STEP = -1;
export const STATION_REACH = 2.9;
const CENTER = Math.floor(BURROW_GRID / 2);
const WALL_HEIGHT = 1.05;
const BORDER_RING = 2;
const PLAYER_CLEARANCE = 0.55;
const STATION_BLOCK_RADIUS = 1.15;
const PICK_RADIUS_PIXELS = 70;
const DIG_SECONDS = 3;
const SAND_SAMPLES_PER_CELL = 10;
const SAND_BLUR_CELLS = 0.6;
const SAND_WARP_CELLS = 0.28;
const SAND_SINK = 0.15;
const DIG_CHUNK_STEPS = 3;
const CHUNKS_PER_STEP = 5;
const CHUNK_SECONDS = 0.7;
const EXIT_SAND_HEIGHT = 2.7;
const EXIT_MODEL_SINK = 0.55;
const EXIT_KEEP_CELLS = [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0]];
const ENTRANCE_MODEL_WIDTH = 3.9;
const ENTRANCE_HOLE_SHARE = 0.17;
const ENTRANCE_HOLE_HEIGHT = 0.42;
const EXIT_MODEL_WIDTH = 3.3;
const MODEL_SAND_TINT = [1.32, 1.12, 0.86];

const burrowModels = new Map();

export async function loadBurrowModels() {
  const { scene } = await parseModel(burrowPropBytes);
  scene.traverse((node) => {
    if (node.isMesh) burrowModels.set(node.name, node);
  });
}

function buildPropModel(name, width, material) {
  const source = burrowModels.get(name);
  if (!source) return null;
  material.map = source.material.map;
  material.normalMap = source.material.normalMap;
  material.roughnessMap = source.material.roughnessMap;
  material.color.setRGB(...MODEL_SAND_TINT);
  const mesh = new THREE.Mesh(source.geometry, material);
  source.geometry.computeBoundingBox();
  const bounds = source.geometry.boundingBox;
  const scale = width / (bounds.max.x - bounds.min.x);
  mesh.scale.setScalar(scale);
  mesh.position.y = -bounds.min.y * scale - SAND_SINK;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export const STATION_KINDS = {
  workshop: { label: 'Workshop', icon: '🔨', cost: { shellBits: 5, driftwood: 3, seaLettuce: 3 }, description: 'Craft shells and claws, improve your gear.' },
  storage: { label: 'Storage', icon: '📦', cost: { driftwood: 4 }, description: 'Keeps materials and gear safe — stored things stay here when you are defeated.' },
  dryingRack: { label: 'Drying rack', icon: '🍂', cost: { driftwood: 4, shellBits: 2 }, description: 'Built in the sun beside your burrow entrance. Dries 3 🥬 into 1 🍂 in 60 s.', surface: true },
};

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const WALL_COLOR = linearColor(0.86, 0.72, 0.5);
const WALL_DARK = linearColor(0.5, 0.38, 0.25);
const DUG_FLOOR_COLOR = linearColor(0.82, 0.69, 0.5);
const MOUND_COLOR = linearColor(0.86, 0.73, 0.52);
const HOLE_COLOR = linearColor(0.08, 0.05, 0.03);

const cellIndex = (column, row) => row * BURROW_GRID + column;
const cellColumn = (index) => index % BURROW_GRID;
const cellRow = (index) => Math.floor(index / BURROW_GRID);

export function cellCenter(column, row) {
  return { x: BURROW_ORIGIN.x + (column - CENTER) * BURROW_CELL, z: BURROW_ORIGIN.z + (row - CENTER) * BURROW_CELL };
}

function cellOf(x, z) {
  const column = Math.round((x - BURROW_ORIGIN.x) / BURROW_CELL) + CENTER;
  const row = Math.round((z - BURROW_ORIGIN.z) / BURROW_CELL) + CENTER;
  return { column, row, inside: column >= 0 && row >= 0 && column < BURROW_GRID && row < BURROW_GRID };
}

export function createEmptyBurrow() {
  const dug = [cellIndex(SHAFT_CELL.column, SHAFT_CELL.row)];
  for (let row = CENTER - 1; row <= CENTER + 1; row++) for (let column = CENTER - 1; column <= CENTER + 1; column++) dug.push(cellIndex(column, row));
  return { entrance: null, dug, stations: [] };
}

function colorize(geometry, colorAt) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    colorAt(color, positions.getX(index), positions.getY(index), positions.getZ(index));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function buildFloorGeometry() {
  const noise = createNoise2D(57);
  const size = BURROW_GRID * BURROW_CELL + 12;
  const geometry = new THREE.PlaneGeometry(size, size, 66, 66).rotateX(-Math.PI / 2);
  return colorize(geometry, (color, x, y, z) => {
    const speckle = 0.5 + 0.5 * noise(x * 0.8, z * 0.8);
    color.copy(DUG_FLOOR_COLOR).multiplyScalar(0.86 + 0.14 * speckle);
  });
}

function buildMoundGeometry() {
  const noise = createNoise2D(13);
  const mound = new THREE.TorusGeometry(1.25, 0.62, 10, 28).rotateX(Math.PI / 2).scale(1, 0.55, 1);
  const positions = mound.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, Math.max(-0.05, positions.getY(index) + 0.12 * noise(x * 1.7, z * 1.7)));
  }
  mound.computeVertexNormals();
  colorize(mound, (color, x, y) => color.copy(MOUND_COLOR).multiplyScalar(0.8 + 0.5 * THREE.MathUtils.clamp(y, 0, 0.4)));
  const hole = colorize(new THREE.CircleGeometry(0.95, 24).rotateX(-Math.PI / 2).translate(0, 0.04, 0), (color) => color.copy(HOLE_COLOR));
  const scattered = [];
  for (let pebble = 0; pebble < 7; pebble++) {
    const angle = pebble * 2.4;
    const reach = 2.1 + (pebble % 3) * 0.35;
    scattered.push(colorize(new THREE.SphereGeometry(0.22 + (pebble % 2) * 0.08, 7, 5).scale(1, 0.5, 1).translate(Math.cos(angle) * reach, 0.03, Math.sin(angle) * reach), (color) => color.copy(MOUND_COLOR).multiplyScalar(0.92)));
  }
  return mergeGeometries([mound, hole, ...scattered].map((geometry) => {
    geometry.deleteAttribute('uv');
    return geometry;
  }));
}

function buildStorageGeometry() {
  const plank = linearColor(0.55, 0.38, 0.22);
  const plankDark = linearColor(0.34, 0.22, 0.12);
  const parts = [];
  for (let slat = 0; slat < 4; slat++) {
    parts.push(colorize(new THREE.BoxGeometry(1.9, 0.26, 0.34).translate(0, 0.2 + slat * 0.27, -0.55 + (slat % 2) * 0.02), (color) => color.copy(slat % 2 ? plank : plankDark)));
    parts.push(colorize(new THREE.BoxGeometry(1.9, 0.26, 0.34).translate(0, 0.2 + slat * 0.27, 0.55), (color) => color.copy(slat % 2 ? plankDark : plank)));
    parts.push(colorize(new THREE.BoxGeometry(0.34, 0.26, 1.3).translate(-0.8, 0.2 + slat * 0.27, 0), (color) => color.copy(plank)));
    parts.push(colorize(new THREE.BoxGeometry(0.34, 0.26, 1.3).translate(0.8, 0.2 + slat * 0.27, 0), (color) => color.copy(plankDark)));
  }
  parts.push(colorize(new THREE.BoxGeometry(1.5, 0.08, 1.0).translate(0, 0.08, 0), (color) => color.copy(plankDark)));
  parts.push(colorize(new THREE.BoxGeometry(1.95, 0.12, 1.45).translate(0, 1.16, 0), (color) => color.copy(plank)));
  return mergeGeometries(parts.map((geometry) => {
    geometry.deleteAttribute('uv');
    return geometry;
  }));
}

function softSpotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function buildShaftBeam() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying float vHeightShare;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;
      void main() {
        vHeightShare = uv.y;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -viewPosition.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewPosition;
      }`,
    fragmentShader: /* glsl */ `
      varying float vHeightShare;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;
      void main() {
        float facing = abs(dot(normalize(vNormalView), normalize(vViewPosition)));
        float fade = (1.0 - smoothstep(0.0, 1.0, vHeightShare)) * smoothstep(0.0, 0.08, vHeightShare);
        gl_FragColor = vec4(vec3(0.7, 0.88, 1.0) * fade * facing * facing * 0.2, 1.0);
      }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.15, 7, 24, 1, true).translate(0, 3.5, 0), material);
  beam.renderOrder = 3;
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1.9, 32).rotateX(-Math.PI / 2).translate(0, 0.04, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 0.95, 0.68), map: softSpotTexture(), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  return { beam, pool };
}

const BLUR_TAPS = (() => {
  const taps = [];
  for (let stepX = -2; stepX <= 2; stepX++) for (let stepZ = -2; stepZ <= 2; stepZ++) {
    const distance = Math.hypot(stepX, stepZ) / 2;
    if (distance <= 1) taps.push([stepX / 2, stepZ / 2, 1 - distance * 0.6]);
  }
  return taps;
})();

function buildSandSurface() {
  const cells = BURROW_GRID + BORDER_RING * 2;
  const size = cells * BURROW_CELL;
  const geometry = new THREE.PlaneGeometry(size, size, cells * SAND_SAMPLES_PER_CELL, cells * SAND_SAMPLES_PER_CELL).rotateX(-Math.PI / 2).deleteAttribute('uv');
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
  return geometry;
}

function setLayers(object, layers) {
  object.traverse((child) => {
    child.layers.disableAll();
    for (const layer of layers) child.layers.enable(layer);
  });
}

export function createBurrow(scene, world, quality, labelParent, saved) {
  const state = saved ? structuredClone(saved) : createEmptyBurrow();
  const dugCells = new Set(state.dug);
  dugCells.add(cellIndex(SHAFT_CELL.column, SHAFT_CELL.row));
  dugCells.add(cellIndex(SHAFT_CELL.column, SHAFT_CELL.row + SHAFT_ACCESS_ROW_STEP));
  state.dug = [...dugCells];

  const entranceGroup = new THREE.Group();
  const entranceModel = buildPropModel('burrow_entrance', ENTRANCE_MODEL_WIDTH, applySeaside(new THREE.MeshStandardMaterial({ roughness: 0.95 }), { chromaticCaustics: quality.chromaticCaustics }));
  if (entranceModel) {
    entranceGroup.add(entranceModel);
    const holeShade = new THREE.Mesh(new THREE.CircleGeometry(ENTRANCE_MODEL_WIDTH * ENTRANCE_HOLE_SHARE, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050302, map: softSpotTexture(), transparent: true, depthWrite: false }));
    holeShade.position.y = ENTRANCE_HOLE_HEIGHT;
    holeShade.renderOrder = 2;
    entranceGroup.add(holeShade);
  }
  else {
    const entranceMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }), { surface: 'sand', chromaticCaustics: quality.chromaticCaustics });
    const mound = new THREE.Mesh(buildMoundGeometry(), entranceMaterial);
    mound.receiveShadow = true;
    mound.castShadow = true;
    entranceGroup.add(mound);
  }
  entranceGroup.visible = false;
  scene.add(entranceGroup);
  const entranceLabel = element('div', 'world-label surface-label entrance-label hidden', labelParent, '🕳️ Burrow');

  const interior = new THREE.Group();
  interior.position.set(BURROW_ORIGIN.x, BURROW_ORIGIN.y, BURROW_ORIGIN.z);
  const floorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });
  const floor = new THREE.Mesh(buildFloorGeometry(), floorMaterial);
  floor.receiveShadow = true;
  interior.add(floor);
  const sandMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 });
  const sandGeometry = buildSandSurface();
  const sand = new THREE.Mesh(sandGeometry, sandMaterial);
  sand.castShadow = true;
  sand.receiveShadow = true;
  interior.add(sand);
  const chunkMaterial = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.95, transparent: true });
  const chunkGeometry = new THREE.IcosahedronGeometry(0.3, 1);
  const chunks = new THREE.InstancedMesh(chunkGeometry, chunkMaterial, DIG_CHUNK_STEPS * CHUNKS_PER_STEP * 2);
  chunks.count = 0;
  chunks.castShadow = true;
  interior.add(chunks);
  const flyingChunks = [];
  const shaft = buildShaftBeam();
  const shaftCenter = cellCenter(SHAFT_CELL.column, SHAFT_CELL.row);
  shaft.beam.position.set(shaftCenter.x - BURROW_ORIGIN.x, 0, shaftCenter.z - BURROW_ORIGIN.z);
  shaft.pool.position.copy(shaft.beam.position);
  interior.add(shaft.beam, shaft.pool);
  const exitModel = buildPropModel('burrow_exit', EXIT_MODEL_WIDTH, new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide }));
  if (exitModel) {
    exitModel.position.x = shaftCenter.x - BURROW_ORIGIN.x;
    exitModel.position.z = shaftCenter.z - BURROW_ORIGIN.z + BURROW_CELL * 0.35;
    exitModel.rotation.y = Math.PI;
    exitModel.position.y -= EXIT_MODEL_SINK;
    interior.add(exitModel);
    shaft.beam.visible = false;
  }
  const storageMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  const storageGeometry = buildStorageGeometry();
  const highlightMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 0.8), transparent: true, opacity: 0.5, depthWrite: false });
  const highlights = new THREE.InstancedMesh(new RoundedBoxGeometry(2.2, 0.04, 2.2, 2, 0.4), highlightMaterial, BURROW_GRID * BURROW_GRID);
  highlights.count = 0;
  highlights.renderOrder = 6;
  interior.add(highlights);
  scene.add(interior);
  const exitLabel = element('div', 'world-label burrow-label exit-label hidden', labelParent, '⬆ Exit');
  const stationMeshes = new Map();
  const transform = new THREE.Object3D();
  const projected = new THREE.Vector3();
  const digging = { cell: -1, progress: 0 };
  let lastUpdateTime = null;
  const sandNoise = createNoise2D(91);

  const exitKeep = new Set(EXIT_KEEP_CELLS.map(([column, row]) => cellIndex(SHAFT_CELL.column + column, SHAFT_CELL.row + row)));
  const isDug = (column, row) => column >= 0 && row >= 0 && column < BURROW_GRID && row < BURROW_GRID && dugCells.has(cellIndex(column, row));
  const stationAt = (column, row) => state.stations.find((station) => station.column === column && station.row === row) || null;

  function openDistance(column, row) {
    let best = Infinity;
    for (const index of dugCells) best = Math.min(best, Math.hypot(cellColumn(index) - column, cellRow(index) - row));
    return best;
  }

  function solidity(column, row) {
    if (isDug(column, row)) return 0;
    if (cellIndex(column, row) === digging.cell && column >= 0 && row >= 0 && column < BURROW_GRID && row < BURROW_GRID) return 1 - Math.floor(digging.progress * DIG_CHUNK_STEPS) / DIG_CHUNK_STEPS;
    return 1;
  }

  function smoothSolidity(column, row) {
    const left = Math.floor(column);
    const top = Math.floor(row);
    const across = column - left;
    const down = row - top;
    const upper = solidity(left, top) * (1 - across) + solidity(left + 1, top) * across;
    const lower = solidity(left, top + 1) * (1 - across) + solidity(left + 1, top + 1) * across;
    return upper * (1 - down) + lower * down;
  }

  function sandHeightAt(x, z) {
    const reach = SAND_BLUR_CELLS * BURROW_CELL;
    const warp = SAND_WARP_CELLS * BURROW_CELL;
    x += warp * sandNoise(x * 0.31 + 17, z * 0.31);
    z += warp * sandNoise(x * 0.31, z * 0.31 - 23);
    let total = 0;
    let weight = 0;
    for (const [offsetX, offsetZ, share] of BLUR_TAPS) {
      const sampleX = x + offsetX * reach;
      const sampleZ = z + offsetZ * reach;
      total += smoothSolidity(sampleX / BURROW_CELL + CENTER, sampleZ / BURROW_CELL + CENTER) * share;
      weight += share;
    }
    const filled = total / weight;
    const exitDistance = Math.hypot(x - (shaftCenter.x - BURROW_ORIGIN.x), z - (shaftCenter.z - BURROW_ORIGIN.z) - BURROW_CELL * 0.6);
    const exitRise = (EXIT_SAND_HEIGHT - WALL_HEIGHT) * (1 - THREE.MathUtils.smoothstep(exitDistance, BURROW_CELL * 0.9, BURROW_CELL * 2.3));
    return THREE.MathUtils.smoothstep(filled, 0.38, 0.98) * (WALL_HEIGHT + exitRise) * (1 + 0.1 * sandNoise(x * 0.45, z * 0.45));
  }

  function rebuildWalls() {
    const positions = sandGeometry.attributes.position;
    const colors = sandGeometry.attributes.color;
    const color = new THREE.Color();
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const height = sandHeightAt(x, z);
      positions.setY(index, height - SAND_SINK);
      const { column, row } = cellOf(x + BURROW_ORIGIN.x, z + BURROW_ORIGIN.z);
      const depth = Math.min(4, openDistance(column, row));
      const grain = 0.5 + 0.5 * sandNoise(x * 2.3, z * 2.3);
      color.copy(WALL_DARK).lerp(WALL_COLOR, THREE.MathUtils.clamp(height / WALL_HEIGHT, 0, 1) * 0.85 + grain * 0.15);
      color.multiplyScalar(Math.max(0.45, 1 - 0.13 * Math.max(0, depth - 1)));
      colors.setXYZ(index, color.r, color.g, color.b);
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    sandGeometry.computeVertexNormals();
    sandGeometry.computeBoundingSphere();
  }

  function burstChunks(column, row) {
    const center = cellCenter(column, row);
    for (let piece = 0; piece < CHUNKS_PER_STEP; piece++) {
      const angle = Math.random() * Math.PI * 2;
      flyingChunks.push({
        x: center.x - BURROW_ORIGIN.x + Math.cos(angle) * 0.6, y: WALL_HEIGHT * 0.7, z: center.z - BURROW_ORIGIN.z + Math.sin(angle) * 0.6,
        speedX: Math.cos(angle) * 1.6, speedY: 2.2 + Math.random(), speedZ: Math.sin(angle) * 1.6, age: 0, size: 0.6 + Math.random() * 0.6, spin: Math.random() * 6,
      });
    }
    if (flyingChunks.length > chunks.instanceMatrix.count) flyingChunks.splice(0, flyingChunks.length - chunks.instanceMatrix.count);
  }

  function updateChunks(deltaTime) {
    let slot = 0;
    for (let index = flyingChunks.length - 1; index >= 0; index--) {
      const chunk = flyingChunks[index];
      chunk.age += deltaTime;
      if (chunk.age > CHUNK_SECONDS) {
        flyingChunks.splice(index, 1);
        continue;
      }
      chunk.speedY -= 9 * deltaTime;
      chunk.x += chunk.speedX * deltaTime;
      chunk.y = Math.max(0.1, chunk.y + chunk.speedY * deltaTime);
      chunk.z += chunk.speedZ * deltaTime;
      transform.position.set(chunk.x, chunk.y, chunk.z);
      transform.rotation.set(chunk.spin * chunk.age, chunk.spin, 0);
      transform.scale.setScalar(chunk.size * (1 - THREE.MathUtils.smoothstep(chunk.age, CHUNK_SECONDS * 0.6, CHUNK_SECONDS)));
      transform.updateMatrix();
      chunks.setMatrixAt(slot++, transform.matrix);
    }
    chunks.count = slot;
    chunks.instanceMatrix.needsUpdate = true;
  }

  function stationSpot(station) {
    return cellCenter(station.column, station.row);
  }

  function addStationMesh(station, workshopModel) {
    const spot = stationSpot(station);
    if (station.kind === 'workshop') {
      workshopModel.place(spot, BURROW_ORIGIN.y);
      setLayers(workshopModel.group, [BURROW_LAYER]);
      setLayers(workshopModel.marker, [BURROW_LAYER]);
      stationMeshes.set(station, workshopModel.group);
      return;
    }
    const mesh = new THREE.Mesh(storageGeometry, storageMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(spot.x - BURROW_ORIGIN.x, 0, spot.z - BURROW_ORIGIN.z);
    mesh.rotation.y = 0.35;
    interior.add(mesh);
    setLayers(mesh, [BURROW_LAYER]);
    const label = element('div', 'world-label burrow-label station-label hidden', labelParent, '📦 Storage');
    stationMeshes.set(station, mesh);
    station.label = label;
  }

  function walkableCellAt(x, z) {
    const { column, row, inside } = cellOf(x, z);
    if (!inside || !isDug(column, row)) return false;
    for (const station of state.stations) {
      const spot = stationSpot(station);
      if (Math.hypot(spot.x - x, spot.z - z) < STATION_BLOCK_RADIUS) return false;
    }
    return true;
  }

  function isWalkable(x, z) {
    if (!walkableCellAt(x, z)) return false;
    for (const [offsetX, offsetZ] of [[PLAYER_CLEARANCE, 0], [-PLAYER_CLEARANCE, 0], [0, PLAYER_CLEARANCE], [0, -PLAYER_CLEARANCE]]) {
      const { column, row } = cellOf(x + offsetX, z + offsetZ);
      if (!isDug(column, row)) return false;
    }
    return true;
  }

  function freeCellNear(column, row) {
    let best = null;
    for (const index of dugCells) {
      const candidateColumn = cellColumn(index);
      const candidateRow = cellRow(index);
      if (stationAt(candidateColumn, candidateRow)) continue;
      const distance = Math.hypot(candidateColumn - column, candidateRow - row);
      if (!best || distance < best.distance) best = { column: candidateColumn, row: candidateRow, distance };
    }
    return best;
  }

  function nearestWalkable(x, z) {
    if (isWalkable(x, z)) return { x, z };
    const { column, row } = cellOf(x, z);
    const free = freeCellNear(column, row);
    if (!free) return null;
    const center = cellCenter(free.column, free.row);
    const towardX = x - center.x;
    const towardZ = z - center.z;
    const towardLength = Math.hypot(towardX, towardZ);
    if (towardLength > 0.01) {
      const reach = Math.min(towardLength, BURROW_CELL / 2 - PLAYER_CLEARANCE - 0.05);
      const edge = { x: center.x + (towardX / towardLength) * reach, z: center.z + (towardZ / towardLength) * reach };
      if (isWalkable(edge.x, edge.z)) return edge;
    }
    if (isWalkable(center.x, center.z)) return center;
    for (let ring = 1; ring <= 3; ring++) {
      for (let angle = 0; angle < 8; angle++) {
        const candidate = { x: center.x + Math.cos(angle * Math.PI / 4) * ring * 0.45, z: center.z + Math.sin(angle * Math.PI / 4) * ring * 0.45 };
        if (isWalkable(candidate.x, candidate.z)) return candidate;
      }
    }
    return null;
  }

  function passable(column, row) {
    return isDug(column, row) && !stationAt(column, row);
  }

  function findPath(fromX, fromZ, toX, toZ) {
    const target = nearestWalkable(toX, toZ);
    if (!target) return [];
    const start = cellOf(fromX, fromZ);
    const goal = cellOf(target.x, target.z);
    const startIndex = cellIndex(start.column, start.row);
    const goalIndex = cellIndex(goal.column, goal.row);
    const cameFrom = new Map([[startIndex, -1]]);
    const queue = [startIndex];
    while (queue.length) {
      const current = queue.shift();
      if (current === goalIndex) break;
      const column = cellColumn(current);
      const row = cellRow(current);
      for (const [stepColumn, stepRow] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nextColumn = column + stepColumn;
        const nextRow = row + stepRow;
        const next = cellIndex(nextColumn, nextRow);
        if (cameFrom.has(next) || !isDug(nextColumn, nextRow)) continue;
        if (next !== goalIndex && !passable(nextColumn, nextRow)) continue;
        if (stepColumn && stepRow && !(passable(column + stepColumn, row) && passable(column, row + stepRow))) continue;
        cameFrom.set(next, current);
        queue.push(next);
      }
    }
    if (!cameFrom.has(goalIndex)) return [];
    const cells = [];
    for (let cell = cameFrom.get(goalIndex); cell !== -1 && cell !== startIndex && cell !== undefined; cell = cameFrom.get(cell)) cells.unshift(cell);
    return [...cells.map((cell) => cellCenter(cellColumn(cell), cellRow(cell))), target];
  }

  const space = {
    heightAt: () => BURROW_ORIGIN.y,
    isWalkable,
    waterLevelAt: () => -Infinity,
    findPath,
    nearestWalkable,
  };

  function canDig(column, row) {
    if (column < 0 || row < 0 || column >= BURROW_GRID || row >= BURROW_GRID || isDug(column, row) || exitKeep.has(cellIndex(column, row))) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([stepColumn, stepRow]) => isDug(column + stepColumn, row + stepRow));
  }

  function setDigProgress(index, progress) {
    const step = Math.floor(progress * DIG_CHUNK_STEPS);
    const previousStep = digging.cell === index ? Math.floor(digging.progress * DIG_CHUNK_STEPS) : 0;
    digging.cell = index;
    digging.progress = progress;
    if (step === previousStep && progress > 0) return;
    if (step > previousStep) burstChunks(cellColumn(index), cellRow(index));
    rebuildWalls();
  }

  function finishDig(column, row) {
    burstChunks(column, row);
    dugCells.add(cellIndex(column, row));
    state.dug = [...dugCells];
    digging.cell = -1;
    digging.progress = 0;
    rebuildWalls();
  }

  function setEntrance(x, z, y) {
    state.entrance = { x, z };
    entranceGroup.position.set(x, y, z);
    entranceGroup.visible = true;
  }

  function pointOnFloor(clientX, clientY, camera, raycaster) {
    const pointer = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const { origin, direction } = raycaster.ray;
    if (Math.abs(direction.y) < 1e-4) return null;
    const floorDistance = (BURROW_ORIGIN.y - origin.y) / direction.y;
    for (let distance = Math.max(0, floorDistance - 40); distance <= floorDistance; distance += 0.25) {
      const x = origin.x + direction.x * distance;
      const y = origin.y + direction.y * distance;
      const z = origin.z + direction.z * distance;
      const cell = cellOf(x, z);
      if (cell.inside && !isDug(cell.column, cell.row) && y - BURROW_ORIGIN.y < WALL_HEIGHT - 0.2) return { x, z, ...cell, wall: true };
    }
    const x = origin.x + direction.x * floorDistance;
    const z = origin.z + direction.z * floorDistance;
    return { x, z, ...cellOf(x, z), wall: false };
  }

  function screenDistance(x, y, z, clientX, clientY, camera) {
    projected.set(x, y, z).project(camera);
    if (projected.z > 1) return Infinity;
    return Math.hypot((projected.x * 0.5 + 0.5) * innerWidth - clientX, (-projected.y * 0.5 + 0.5) * innerHeight - clientY);
  }

  function entranceUnder(clientX, clientY, camera, radiusPixels = PICK_RADIUS_PIXELS) {
    if (!state.entrance) return false;
    return screenDistance(state.entrance.x, entranceGroup.position.y + 0.4, state.entrance.z, clientX, clientY, camera) < radiusPixels;
  }

  function shaftUnder(clientX, clientY, camera) {
    return screenDistance(shaftCenter.x, BURROW_ORIGIN.y + 0.5, shaftCenter.z, clientX, clientY, camera) < PICK_RADIUS_PIXELS;
  }

  function stationUnder(clientX, clientY, camera) {
    let best = null;
    for (const station of state.stations) {
      const spot = stationSpot(station);
      const distance = screenDistance(spot.x, BURROW_ORIGIN.y + 0.6, spot.z, clientX, clientY, camera);
      if (distance < PICK_RADIUS_PIXELS && (!best || distance < best.distance)) best = { station, distance };
    }
    return best ? best.station : null;
  }

  function freeCells() {
    return [...dugCells].map((index) => ({ column: cellColumn(index), row: cellRow(index) })).filter(({ column, row }) => !stationAt(column, row) && !(column === SHAFT_CELL.column && (row === SHAFT_CELL.row || row === SHAFT_CELL.row + SHAFT_ACCESS_ROW_STEP)));
  }

  function showPlacementCells(visible) {
    highlights.count = 0;
    if (!visible) return;
    for (const { column, row } of freeCells()) {
      const center = cellCenter(column, row);
      transform.position.set(center.x - BURROW_ORIGIN.x, 0.1, center.z - BURROW_ORIGIN.z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      highlights.setMatrixAt(highlights.count++, transform.matrix);
    }
    highlights.instanceMatrix.needsUpdate = true;
  }

  function addStation(kind, column, row, workshopModel) {
    const station = { kind, column, row };
    state.stations.push(station);
    addStationMesh(station, workshopModel);
    return station;
  }

  function hasStation(kind) {
    return state.stations.some((station) => station.kind === kind);
  }

  function stationOf(kind) {
    return state.stations.find((station) => station.kind === kind) || null;
  }

  function placeLabel(label, x, y, z, camera, visible) {
    projected.set(x, y, z).project(camera);
    const show = visible && projected.z < 1;
    label.classList.toggle('hidden', !show);
    if (show) label.style.transform = `translate(-50%, -100%) translate(${(projected.x * 0.5 + 0.5) * innerWidth}px, ${(-projected.y * 0.5 + 0.5) * innerHeight}px)`;
  }

  function update(time, camera, underground) {
    if (state.entrance) placeLabel(entranceLabel, state.entrance.x, entranceGroup.position.y + 2.4, state.entrance.z, camera, !underground);
    placeLabel(exitLabel, shaftCenter.x, BURROW_ORIGIN.y + 1.4, shaftCenter.z - 0.6, camera, underground);
    for (const station of state.stations) {
      if (!station.label) continue;
      const spot = stationSpot(station);
      placeLabel(station.label, spot.x, BURROW_ORIGIN.y + 2.4, spot.z, camera, underground);
    }
    highlightMaterial.opacity = 0.32 + 0.16 * Math.sin(time * 4);
    updateChunks(Math.min(0.1, Math.max(0, time - (lastUpdateTime ?? time))));
    lastUpdateTime = time;
    shaft.pool.material.opacity = 0.3 + 0.06 * Math.sin(time * 1.3);
  }

  function attachStations(workshopModel) {
    for (const station of state.stations) addStationMesh(station, workshopModel);
  }

  setLayers(interior, [BURROW_LAYER]);
  rebuildWalls();
  if (state.entrance) setEntrance(state.entrance.x, state.entrance.z, world.heightAt(state.entrance.x, state.entrance.z));

  return {
    state,
    interior,
    entranceGroup,
    space,
    shaftCenter,
    isDug,
    canDig,
    cellOf,
    setDigProgress,
    finishDig,
    digSeconds: DIG_SECONDS,
    setEntrance,
    pointOnFloor,
    entranceUnder,
    shaftUnder,
    stationUnder,
    stationSpot,
    stationAt,
    freeCells,
    showPlacementCells,
    addStation,
    attachStations,
    hasStation,
    stationOf,
    update,
    get exists() {
      return Boolean(state.entrance);
    },
    serialize: () => ({ entrance: state.entrance, dug: [...dugCells], stations: state.stations.map(({ kind, column, row }) => ({ kind, column, row })) }),
  };
}
