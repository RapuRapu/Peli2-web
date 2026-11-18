import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { applySeaside } from './seaside.js';
import { createNoise2D } from '../noise.js';
import { element } from './workbench.js';

export const BURROW_ORIGIN = { x: 1000, y: 200, z: 0 };
export const BURROW_GRID = 11;
export const BURROW_CELL = 3;
export const BURROW_LAYER = 1;
export const ENTRANCE_REACH = 2.6;
export const ENTRANCE_BLOCK_RADIUS = 1.3;
export const SHAFT_CELL = { column: 5, row: 3 };
export const STATION_REACH = 2.9;
const CENTER = Math.floor(BURROW_GRID / 2);
const WALL_HEIGHT = 1.05;
const BORDER_RING = 2;
const PLAYER_CLEARANCE = 0.55;
const STATION_BLOCK_RADIUS = 1.15;
const PICK_RADIUS_PIXELS = 70;
const DIG_SECONDS = 3;
const DIGGABLE_TINT = 1.4;

export const STATION_KINDS = {
  workshop: { label: 'Workshop', icon: '🔨', cost: { shellBits: 5, driftwood: 3, seaLettuce: 3 }, description: 'Craft shells and claws, improve your gear.' },
  storage: { label: 'Storage', icon: '📦', cost: { driftwood: 4 }, description: 'Keeps materials and gear safe — stored things stay here when you are defeated.' },
  dryingRack: { label: 'Drying rack', icon: '🍂', cost: { driftwood: 4, shellBits: 2 }, description: 'Built in the sun beside your burrow entrance. Dries 3 🥬 into 1 🍂 in 60 s.', surface: true },
};

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const WALL_COLOR = linearColor(0.86, 0.72, 0.5);
const WALL_DARK = linearColor(0.5, 0.38, 0.25);
const FLOOR_COLOR = linearColor(0.44, 0.33, 0.22);
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

function buildWallGeometry() {
  const noise = createNoise2D(91);
  const lumps = [];
  for (const [offsetX, offsetZ, radius] of [[0, 0, 1.55]]) {
    const lump = mergeVertices(new THREE.IcosahedronGeometry(radius, 3).deleteAttribute('normal').deleteAttribute('uv'));
    const positions = lump.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const bulge = 1 + 0.08 * noise(x * 0.7 + offsetX * 3, z * 0.7 + y * 0.4 + offsetZ * 3);
      positions.setXYZ(index, x * bulge * 1.08 + offsetX, Math.max(-0.3, y * bulge * (WALL_HEIGHT / 1.55)), z * bulge * 1.08 + offsetZ);
    }
    lumps.push(lump);
  }
  for (const lump of lumps) lump.computeVertexNormals();
  const geometry = mergeGeometries(lumps);
  return colorize(geometry, (color, x, y, z) => {
    const grain = 0.5 + 0.5 * noise(x * 6.3 + y * 5.1, z * 6.3 - y * 4.7);
    color.copy(WALL_DARK).lerp(WALL_COLOR, THREE.MathUtils.smoothstep(y, -0.3, WALL_HEIGHT * 0.8) * 0.88 + grain * 0.12);
  });
}

function buildFloorGeometry() {
  const noise = createNoise2D(57);
  const size = BURROW_GRID * BURROW_CELL + 12;
  const geometry = new THREE.PlaneGeometry(size, size, 66, 66).rotateX(-Math.PI / 2);
  return colorize(geometry, (color, x, y, z) => {
    const speckle = 0.5 + 0.5 * noise(x * 0.8, z * 0.8);
    color.copy(FLOOR_COLOR).multiplyScalar(0.82 + 0.3 * speckle);
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
  const shell = linearColor(0.95, 0.88, 0.76);
  const parts = [];
  for (let slat = 0; slat < 4; slat++) {
    parts.push(colorize(new THREE.BoxGeometry(1.9, 0.26, 0.34).translate(0, 0.2 + slat * 0.27, -0.55 + (slat % 2) * 0.02), (color) => color.copy(slat % 2 ? plank : plankDark)));
    parts.push(colorize(new THREE.BoxGeometry(1.9, 0.26, 0.34).translate(0, 0.2 + slat * 0.27, 0.55), (color) => color.copy(slat % 2 ? plankDark : plank)));
    parts.push(colorize(new THREE.BoxGeometry(0.34, 0.26, 1.3).translate(-0.8, 0.2 + slat * 0.27, 0), (color) => color.copy(plank)));
    parts.push(colorize(new THREE.BoxGeometry(0.34, 0.26, 1.3).translate(0.8, 0.2 + slat * 0.27, 0), (color) => color.copy(plankDark)));
  }
  parts.push(colorize(new THREE.BoxGeometry(1.5, 0.08, 1.0).translate(0, 0.08, 0), (color) => color.copy(plankDark)));
  for (let pile = 0; pile < 5; pile++) parts.push(colorize(new THREE.SphereGeometry(0.24, 8, 6).scale(1, 0.55, 1.2).rotateY(pile).translate(-0.45 + pile * 0.22, 1.08 + (pile % 2) * 0.06, -0.1 + (pile % 3) * 0.12), (color) => color.copy(shell)));
  return mergeGeometries(parts.map((geometry) => {
    geometry.deleteAttribute('uv');
    return geometry;
  }));
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
    new THREE.CircleGeometry(1.35, 32).rotateX(-Math.PI / 2).translate(0, 0.04, 0),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.25), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  return { beam, pool };
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

  const entranceGroup = new THREE.Group();
  const entranceMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide }), { surface: 'sand', chromaticCaustics: quality.chromaticCaustics });
  const mound = new THREE.Mesh(buildMoundGeometry(), entranceMaterial);
  mound.receiveShadow = true;
  mound.castShadow = true;
  entranceGroup.add(mound);
  entranceGroup.visible = false;
  scene.add(entranceGroup);
  const entranceLabel = element('div', 'world-label surface-label entrance-label hidden', labelParent, '🕳️ Burrow');

  const interior = new THREE.Group();
  interior.position.set(BURROW_ORIGIN.x, BURROW_ORIGIN.y, BURROW_ORIGIN.z);
  const floorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 });
  const floor = new THREE.Mesh(buildFloorGeometry(), floorMaterial);
  floor.receiveShadow = true;
  interior.add(floor);
  const wallMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 });
  const wallSlots = (BURROW_GRID + BORDER_RING * 2) * (BURROW_GRID + BORDER_RING * 2);
  const walls = new THREE.InstancedMesh(buildWallGeometry(), wallMaterial, wallSlots);
  walls.castShadow = true;
  walls.receiveShadow = true;
  interior.add(walls);
  const dugFloor = new THREE.InstancedMesh(
    colorize(new THREE.PlaneGeometry(BURROW_CELL + 0.6, BURROW_CELL + 0.6, 10, 10).rotateX(-Math.PI / 2).translate(0, 0.03, 0).deleteAttribute('uv'), (color, x, y, z) => {
      color.copy(DUG_FLOOR_COLOR).multiplyScalar(0.95 + 0.04 * Math.sin(x * 9.1 + z * 6.7) * Math.cos(z * 8.3 - x * 3));
    }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    BURROW_GRID * BURROW_GRID,
  );
  dugFloor.receiveShadow = true;
  interior.add(dugFloor);
  const digMarkMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 0.8), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const digMarks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.3, 0).scale(0.75, 1.6, 0.75), digMarkMaterial, BURROW_GRID * BURROW_GRID);
  digMarks.count = 0;
  digMarks.renderOrder = 5;
  interior.add(digMarks);
  const shaft = buildShaftBeam();
  const shaftCenter = cellCenter(SHAFT_CELL.column, SHAFT_CELL.row);
  shaft.beam.position.set(shaftCenter.x - BURROW_ORIGIN.x, 0, shaftCenter.z - BURROW_ORIGIN.z);
  shaft.pool.position.copy(shaft.beam.position);
  interior.add(shaft.beam, shaft.pool);
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

  const isDug = (column, row) => column >= 0 && row >= 0 && column < BURROW_GRID && row < BURROW_GRID && dugCells.has(cellIndex(column, row));
  const stationAt = (column, row) => state.stations.find((station) => station.column === column && station.row === row) || null;

  function openDistance(column, row) {
    let best = Infinity;
    for (const index of dugCells) best = Math.min(best, Math.hypot(cellColumn(index) - column, cellRow(index) - row));
    return best;
  }

  function rebuildWalls() {
    let slot = 0;
    const lumpColor = new THREE.Color();
    for (let row = -BORDER_RING; row < BURROW_GRID + BORDER_RING; row++) {
      for (let column = -BORDER_RING; column < BURROW_GRID + BORDER_RING; column++) {
        if (isDug(column, row)) continue;
        const center = cellCenter(column, row);
        const shrink = cellIndex(column, row) === digging.cell && column >= 0 && row >= 0 && column < BURROW_GRID && row < BURROW_GRID ? 1 - 0.75 * digging.progress : 1;
        transform.position.set(center.x - BURROW_ORIGIN.x, 0, center.z - BURROW_ORIGIN.z);
        const hash = Math.abs(Math.sin(column * 12.9898 + row * 78.233) * 43758.5453) % 1;
        const hashB = Math.abs(Math.sin(column * 39.346 + row * 11.135) * 24634.6345) % 1;
        const widthVariation = 1.12 + 0.2 * hash;
        transform.rotation.set(0, hashB * Math.PI * 2, 0);
        transform.position.x += (hashB - 0.5) * 0.5;
        transform.position.z += (hash - 0.5) * 0.5;
        transform.scale.set(shrink * widthVariation, shrink * (0.75 + 0.55 * hashB), shrink * widthVariation * (0.9 + 0.2 * hash));
        transform.updateMatrix();
        walls.setMatrixAt(slot, transform.matrix);
        const distanceToOpen = openDistance(column, row);
        walls.setColorAt(slot++, lumpColor.setScalar(canDig(column, row) ? DIGGABLE_TINT : distanceToOpen <= 1.5 ? 0.7 : Math.max(0.32, 0.7 - 0.16 * (distanceToOpen - 1.5))));
      }
    }
    walls.count = slot;
    let markSlot = 0;
    for (let row = 0; row < BURROW_GRID; row++) {
      for (let column = 0; column < BURROW_GRID; column++) {
        if (!canDig(column, row) || cellIndex(column, row) === digging.cell) continue;
        const center = cellCenter(column, row);
        transform.position.set(center.x - BURROW_ORIGIN.x, WALL_HEIGHT + 0.75, center.z - BURROW_ORIGIN.z);
        transform.rotation.set(0, 0.6, 0);
        transform.scale.set(1, 1, 1);
        transform.updateMatrix();
        digMarks.setMatrixAt(markSlot++, transform.matrix);
      }
    }
    digMarks.count = markSlot;
    digMarks.instanceMatrix.needsUpdate = true;
    let floorSlot = 0;
    for (const index of dugCells) {
      const center = cellCenter(cellColumn(index), cellRow(index));
      transform.position.set(center.x - BURROW_ORIGIN.x, 0, center.z - BURROW_ORIGIN.z);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      dugFloor.setMatrixAt(floorSlot++, transform.matrix);
    }
    dugFloor.count = floorSlot;
    dugFloor.instanceMatrix.needsUpdate = true;
    walls.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
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
    if (column < 0 || row < 0 || column >= BURROW_GRID || row >= BURROW_GRID || isDug(column, row)) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([stepColumn, stepRow]) => isDug(column + stepColumn, row + stepRow));
  }

  function setDigProgress(index, progress) {
    digging.cell = index;
    digging.progress = progress;
    rebuildWalls();
  }

  function finishDig(column, row) {
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
    return [...dugCells].map((index) => ({ column: cellColumn(index), row: cellRow(index) })).filter(({ column, row }) => !stationAt(column, row) && !(column === SHAFT_CELL.column && (row === SHAFT_CELL.row || row === SHAFT_CELL.row + 1)));
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
    digMarkMaterial.opacity = 0.55 + 0.4 * Math.sin(time * 3.2);
    digMarks.rotation.y = 0;
    digMarks.position.y = 0.12 * Math.sin(time * 2.2);
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
