import * as THREE from 'three';
import { generateIslandHeightmap, buildTerrainMesh, createSeaDepthTexture } from './island.js';
import { createOcean } from './ocean.js';
import { createShip, createShipController } from './ship.js';
import { createVegetation, vegetationOcclusion } from './vegetation.js';
import { createWake } from './wake.js';
import { createPerformanceMonitor } from './performance.js';
import { createHud } from './hud.js';
import { createDolphins } from './dolphins.js';
import { createDetailedGround, createDetailTerrain } from './detailTerrain.js';
import { createWalkGrid } from './pathfinding.js';
import { createCharacter } from './character.js';
import { createWreck } from './wreck.js';
import { createItems, ITEM_TYPES } from './items.js';
import { loadSave, writeSave, clearSave, createEmptySave } from './save.js';

const searchParameters = new URLSearchParams(location.search);
const screenshotPose = searchParameters.has('pose') ? Number(searchParameters.get('pose')) : null;
const isScreenshotMode = screenshotPose !== null;

const CAMERA_YAW = 0.55;
const ZOOM_LIMITS = { sailing: [75, 380], onFoot: [24, 100] };
const AUTOSAVE_INTERVAL_SECONDS = 5;
const BOARDING_DISTANCE = 70;
const LANDING_SEARCH_RADIUS = 80;
const MAX_LANDING_SPEED = 2.6;
const REPAIR_REQUIREMENTS = { plank: 4, rope: 2, barrel: 1, sailcloth: 1 };
const REPAIR_LABELS = { plank: 'Planks', rope: 'Ropes', barrel: 'Barrel', sailcloth: 'Sailcloth' };
const REPAIR_DISTANCE = 16;
const LAUNCH_SECONDS = 2.5;
const BEACHED_ROLL = -0.7;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: isScreenshotMode });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const lighting = {
  sunDirection: new THREE.Vector3(-0.51, 0.62, 0.58).normalize(),
  sunColor: new THREE.Color(1.0, 0.93, 0.8),
  skyHorizonColor: new THREE.Color(0.68, 0.82, 0.92),
  skyZenithColor: new THREE.Color(0.3, 0.52, 0.85),
  fogColor: new THREE.Color(0.62, 0.78, 0.86),
  fogNear: 400,
  fogFar: 1600,
};
scene.background = lighting.fogColor;
scene.fog = new THREE.Fog(lighting.fogColor, lighting.fogNear, lighting.fogFar);

const sun = new THREE.DirectionalLight(lighting.sunColor, 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.5;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(new THREE.Color(0.62, 0.76, 0.95), new THREE.Color(0.5, 0.42, 0.3), 1.45));

const heightmap = generateIslandHeightmap();
const baseHiddenRectangle = new THREE.Vector4(1e9, 1e9, -1e9, -1e9);
scene.add(buildTerrainMesh(heightmap, baseHiddenRectangle));
const ground = createDetailedGround(heightmap);
const detailTerrain = createDetailTerrain(scene, ground, baseHiddenRectangle);
const ocean = createOcean({ seabedTexture: createSeaDepthTexture(heightmap), terrainWorldSize: heightmap.worldSize, lighting });
scene.add(ocean.mesh);
const swayTime = { value: 0 };
const vegetation = createVegetation(scene, heightmap, swayTime);

const wind = { directionX: -Math.cos(0.35), directionZ: Math.sin(0.35), strength: 1 };
const ship = createShip(scene, lighting.sunDirection);
const shipController = createShipController(ship, heightmap, wind);
const wake = createWake(scene);

const targetMarker = new THREE.Mesh(
  new THREE.RingGeometry(3.2, 4.2, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }),
);
targetMarker.renderOrder = 3;
scene.add(targetMarker);

const camera = new THREE.PerspectiveCamera(32, 1, 2, 3200);
const cameraFocus = new THREE.Vector3();

function findOpenWater(angle, clearance) {
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  let coastRadius = 0;
  for (let radius = 0; radius < heightmap.worldSize / 2; radius += 4) {
    if (heightmap.heightAt(directionX * radius, directionZ * radius) > 0) coastRadius = radius;
  }
  let radius = coastRadius + clearance;
  while (heightmap.heightAt(directionX * radius, directionZ * radius) > -4.5 && radius < heightmap.worldSize / 2) radius += 4;
  return { x: directionX * radius, z: directionZ * radius, tangentHeading: Math.atan2(-directionZ, directionX) };
}

function findBeach(angle, inland) {
  const directionX = Math.cos(angle);
  const directionZ = Math.sin(angle);
  for (let radius = heightmap.worldSize / 2; radius > 0; radius -= 2) {
    if (ground.heightAt(directionX * radius, directionZ * radius) > 0.9) {
      const beachRadius = radius - inland;
      return { x: directionX * beachRadius, z: directionZ * beachRadius, tangentHeading: Math.atan2(-directionZ, directionX), inwardHeading: Math.atan2(-directionX, -directionZ) };
    }
  }
  return { x: 0, z: 0, tangentHeading: 0, inwardHeading: 0 };
}

const BAY_ANGLE = Math.atan2(0.45, 0.08);
const POSES = {
  1: { mode: 'sailing', angle: BAY_ANGLE, clearance: 70, distance: 150, warmup: 12 },
  2: { mode: 'sailing', angle: BAY_ANGLE, clearance: 70, distance: 75, warmup: 12 },
  3: { mode: 'sailing', angle: BAY_ANGLE, clearance: 70, distance: 380, warmup: 12 },
  4: { mode: 'sailing', angle: 0.45, clearance: 35, distance: 170, warmup: 12 },
  5: { mode: 'sailing', angle: 1.05, clearance: 30, distance: 110, warmup: 25 },
  6: { mode: 'sailing', angle: BAY_ANGLE, clearance: 70, distance: 150, warmup: 12 },
  7: { mode: 'sailing', angle: BAY_ANGLE + 0.4, clearance: 170, distance: 110, warmup: 16 },
  8: { mode: 'onFoot', angle: BAY_ANGLE, clearance: 70, distance: 44, warmup: 2 },
  9: { mode: 'onFoot', angle: BAY_ANGLE, clearance: 70, distance: 28, warmup: 3, walkToItem: true },
  10: { mode: 'onFoot', angle: BAY_ANGLE, clearance: 70, distance: 32, warmup: 2 },
  11: { mode: 'onFoot', angle: BAY_ANGLE, clearance: 70, distance: 44, warmup: 2, nearSloop: true },
};

const startPose = POSES[screenshotPose] || POSES[1];
const anchorage = findOpenWater(startPose.angle, startPose.clearance);
const wreckSpot = findBeach(BAY_ANGLE, 1);
const wreck = createWreck(scene, ground, { x: wreckSpot.x, z: wreckSpot.z, heading: wreckSpot.tangentHeading + 0.3 });
function shorePointNear(x, z) {
  const outwardLength = Math.hypot(x, z) || 1;
  const outwardX = x / outwardLength;
  const outwardZ = z / outwardLength;
  let best = { x, z };
  let bestOffset = Infinity;
  for (let offset = -30; offset <= 30; offset += 0.5) {
    const candidateX = x + outwardX * offset;
    const candidateZ = z + outwardZ * offset;
    const height = ground.heightAt(candidateX, candidateZ);
    if (height > 0.3 && height < 0.8 && Math.abs(offset) < Math.abs(bestOffset)) {
      bestOffset = offset;
      best = { x: candidateX, z: candidateZ };
    }
  }
  return best;
}

function launchPointFrom(x, z) {
  const outwardLength = Math.hypot(x, z) || 1;
  let pointX = x;
  let pointZ = z;
  for (let step = 0; step < 200 && heightmap.heightAt(pointX, pointZ) > -3.2; step++) {
    pointX += (x / outwardLength) * 2;
    pointZ += (z / outwardLength) * 2;
  }
  return { x: pointX + (x / outwardLength) * 8, z: pointZ + (z / outwardLength) * 8 };
}

const beachedSloop = shorePointNear(
  wreckSpot.x - Math.sin(wreckSpot.tangentHeading) * 34,
  wreckSpot.z - Math.cos(wreckSpot.tangentHeading) * 34,
);
beachedSloop.heading = wreckSpot.tangentHeading + Math.PI;
const sloopLaunchPoint = launchPointFrom(beachedSloop.x, beachedSloop.z);

const walkGrid = createWalkGrid(ground, heightmap.worldSize, [...vegetation.obstacles, ...wreck.obstacles, { x: beachedSloop.x, z: beachedSloop.z, radius: 7 }]);

function nearestWalkablePoint(x, z) {
  for (let radius = 0; radius < 30; radius += 1.5) {
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * Math.PI * 2;
      const candidateX = x + Math.cos(angle) * radius;
      const candidateZ = z + Math.sin(angle) * radius;
      if (walkGrid.isPointWalkable(candidateX, candidateZ) && ground.heightAt(candidateX, candidateZ) > 0.3) return { x: candidateX, z: candidateZ };
      if (radius === 0) break;
    }
  }
  return { x, z };
}

const spawnPoint = nearestWalkablePoint(
  wreckSpot.x + Math.sin(wreckSpot.inwardHeading) * 2 + Math.sin(wreckSpot.tangentHeading) * 11,
  wreckSpot.z + Math.cos(wreckSpot.inwardHeading) * 2 + Math.cos(wreckSpot.tangentHeading) * 11,
);


function isReachableFromSpawn(x, z) {
  const path = walkGrid.findPath(spawnPoint.x, spawnPoint.z, x, z);
  const end = path[path.length - 1];
  return Boolean(end) && Math.hypot(end.x - x, end.z - z) < 3;
}

function findJungleClearing(preferredDistance) {
  const candidates = [];
  for (let offsetZ = -320; offsetZ <= 320; offsetZ += 16) {
    for (let offsetX = -320; offsetX <= 320; offsetX += 16) {
      const x = spawnPoint.x + offsetX;
      const z = spawnPoint.z + offsetZ;
      const height = ground.heightAt(x, z);
      if (height < 5 || height > 35 || ground.slopeAt(x, z) > 0.3 || !walkGrid.isPointWalkable(x, z)) continue;
      candidates.push({ x, z, score: Math.abs(Math.hypot(offsetX, offsetZ) - preferredDistance) });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, 12).find((candidate) => isReachableFromSpawn(candidate.x, candidate.z)) ?? spawnPoint;
}

const itemZones = [
  { id: 'wreck-beach', ...wreckSpot, minRadius: 9, maxRadius: 30, minHeight: 0.3, maxHeight: 4, types: ['plank', 'rope', 'pouch'] },
  { id: 'west-beach', ...findBeach(BAY_ANGLE + 1.3, 3), minRadius: 3, maxRadius: 26, minHeight: 0.3, maxHeight: 5, types: ['plank', 'barrel', 'crate'] },
  { id: 'east-cove', ...findBeach(BAY_ANGLE - 0.8, 3), minRadius: 3, maxRadius: 26, minHeight: 0.3, maxHeight: 6, types: ['plank', 'rope', 'pouch'] },
  { id: 'jungle-clearing', ...findJungleClearing(170), minRadius: 2, maxRadius: 22, minHeight: 3, maxHeight: 45, types: ['plank', 'sailcloth', 'pouch'] },
];

const save = isScreenshotMode ? createEmptySave() : loadSave();
if (isScreenshotMode) {
  save.mode = startPose.mode;
  save.sloopRepaired = startPose.mode === 'sailing';
}

const character = createCharacter(scene);
const poseSpawn = startPose.nearSloop ? nearestWalkablePoint(beachedSloop.x + Math.sin(wreckSpot.inwardHeading) * 10, beachedSloop.z + Math.cos(wreckSpot.inwardHeading) * 10) : spawnPoint;
const characterStart = save.character ?? { x: poseSpawn.x, z: poseSpawn.z, heading: wreckSpot.inwardHeading + Math.PI };
character.place(characterStart.x, characterStart.z, characterStart.heading);

const defaultShipStart = isScreenshotMode && startPose.mode === 'sailing' ? { x: anchorage.x, z: anchorage.z, heading: anchorage.tangentHeading } : { x: sloopLaunchPoint.x, z: sloopLaunchPoint.z, heading: beachedSloop.heading };
const shipStart = save.ship ?? defaultShipStart;
shipController.place(shipStart.x, shipStart.z, shipStart.heading, save.mode === 'sailing' && !save.ship ? 5 : 0);
const launch = { active: false, progress: 0 };
ship.setDamaged(!save.sloopRepaired);

const sloopMarker = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(40, 22, 8, 0.85)';
  context.beginPath();
  context.arc(64, 64, 56, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = '#ffb030';
  context.stroke();
  context.font = '64px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('🔨', 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.renderOrder = 5;
  scene.add(sprite);
  return sprite;
})();

function updateSloopMarker(time) {
  sloopMarker.visible = !save.sloopRepaired && mode === 'onFoot';
  if (!sloopMarker.visible) return;
  const ready = missingRepairMaterials().length === 0;
  const pulse = 1 + (ready ? 0.25 : 0.08) * Math.sin(time * (ready ? 6 : 3));
  const size = cameraDistanceByMode.onFoot * 0.09 * pulse;
  sloopMarker.scale.set(size, size, 1);
  sloopMarker.position.set(beachedSloop.x, ground.heightAt(beachedSloop.x, beachedSloop.z) + 6 + Math.sin(time * 2) * 0.4, beachedSloop.z);
}

function placeBeachedSloop(progress) {
  const x = beachedSloop.x + (sloopLaunchPoint.x - beachedSloop.x) * progress;
  const z = beachedSloop.z + (sloopLaunchPoint.z - beachedSloop.z) * progress;
  const beachedHeight = ground.heightAt(beachedSloop.x, beachedSloop.z) - 0.75;
  const easedProgress = progress * progress * (3 - 2 * progress);
  ship.root.position.set(x, beachedHeight * (1 - easedProgress), z);
  ship.root.rotation.set(0, beachedSloop.heading, BEACHED_ROLL * (1 - easedProgress), 'YXZ');
}

const typicalOnFootPitch = 0.95;
const canopyScreenShift = 1 / Math.tan(typicalOnFootPitch);
const canopiesAsSeenFromCamera = vegetation.obstacles
  .filter((obstacle) => obstacle.canopyRadius)
  .flatMap((obstacle) => [obstacle, {
    x: obstacle.x - Math.sin(CAMERA_YAW) * obstacle.canopyHeight * canopyScreenShift,
    z: obstacle.z - Math.cos(CAMERA_YAW) * obstacle.canopyHeight * canopyScreenShift,
    canopyRadius: obstacle.canopyRadius,
  }]);
const items = createItems(scene, ground, walkGrid, itemZones, new Set(save.collectedItemIds), canopiesAsSeenFromCamera, isReachableFromSpawn);

function deepWaterAhead(x, z, heading, distance) {
  let pointX = x + Math.sin(heading) * distance;
  let pointZ = z + Math.cos(heading) * distance;
  const outwardLength = Math.hypot(pointX, pointZ) || 1;
  for (let step = 0; step < 60 && heightmap.heightAt(pointX, pointZ) > -9; step++) {
    pointX += (pointX / outwardLength) * 5;
    pointZ += (pointZ / outwardLength) * 5;
  }
  return { x: pointX, z: pointZ };
}

const firstPodHome = isScreenshotMode && screenshotPose === 7 ? findOpenWater(BAY_ANGLE + 0.4, 230) : deepWaterAhead(anchorage.x, anchorage.z, Math.atan2(anchorage.x, anchorage.z), 160);
const podHomes = [firstPodHome, ...[BAY_ANGLE + 2.4, BAY_ANGLE + 4.2].map((angle) => findOpenWater(angle, 230))];
const dolphins = createDolphins(scene, heightmap, podHomes, { waterColor: new THREE.Color(0.05, 0.32, 0.4) });
const shipForDolphins = { x: 0, z: 0, heading: 0, speed: 0, length: ship.length, halfBeam: ship.halfBeam };

const performanceMonitor = createPerformanceMonitor(renderer, { fixedPixelRatio: isScreenshotMode ? Math.min(devicePixelRatio, 2) : null });
const hud = createHud();

let mode = save.mode;
const cameraDistanceByMode = { sailing: 150, onFoot: innerWidth < innerHeight ? 32 : 44 };
if (isScreenshotMode) cameraDistanceByMode[startPose.mode] = startPose.distance;
const interactedInMode = { sailing: false, onFoot: false };

function persist() {
  if (isScreenshotMode) return;
  const shipState = shipController.state;
  const characterState = character.state;
  save.mode = mode;
  save.character = { x: characterState.x, z: characterState.z, heading: characterState.heading };
  save.ship = { x: shipState.x, z: shipState.z, heading: shipState.heading };
  writeSave(save);
}

function enterMode(nextMode) {
  mode = nextMode;
  const onFoot = mode === 'onFoot';
  character.setVisible(onFoot);
  shipController.state.anchored = onFoot;
  shipController.state.hasTarget = false;
  character.stop();
  detailTerrain.setEnabled(onFoot, character.state.x, character.state.z);
  hud.setMode(mode);
  hud.setAction(null, null);
  updateObjective();
  updateCamera(0, true);
}

function boardShip() {
  save.hasSailed = true;
  enterMode('sailing');
  hud.showToast('All aboard!');
  persist();
}

function goAshore(landingPoint) {
  const shipState = shipController.state;
  character.place(landingPoint.x, landingPoint.z, Math.atan2(landingPoint.x - shipState.x, landingPoint.z - shipState.z));
  shipState.speed = 0;
  enterMode('onFoot');
  hud.showToast('Ashore!');
  persist();
}

function findLandingSpot() {
  const shipState = shipController.state;
  for (let radius = 8; radius <= LANDING_SEARCH_RADIUS; radius += 4) {
    for (let step = 0; step < 24; step++) {
      const angle = (step / 24) * Math.PI * 2;
      const x = shipState.x + Math.cos(angle) * radius;
      const z = shipState.z + Math.sin(angle) * radius;
      const height = ground.heightAt(x, z);
      if (height > 0.35 && height < 2.5 && walkGrid.isPointWalkable(x, z)) return { x, z };
    }
  }
  return null;
}

let actionCheckTimer = 0;
function updateContextAction(deltaTime) {
  actionCheckTimer -= deltaTime;
  if (actionCheckTimer > 0) return;
  actionCheckTimer = 0.25;
  const shipState = shipController.state;
  if (mode === 'onFoot') {
    const characterState = character.state;
    if (!save.sloopRepaired) {
      const nearSloop = Math.hypot(characterState.x - beachedSloop.x, characterState.z - beachedSloop.z) < REPAIR_DISTANCE;
      const missing = missingRepairMaterials();
      const subtitle = missing.length ? 'Missing: ' + missing.map(([type, count]) => `${REPAIR_LABELS[type]} ${count}`).join(', ') : 'All materials ready!';
      hud.setAction(nearSloop ? '🔨 Repair the sloop' : null, tryRepairSloop, { subtitle, disabled: missing.length > 0 });
      return;
    }
    if (launch.active) {
      hud.setAction(null, null);
      return;
    }
    const distanceToShip = Math.hypot(characterState.x - shipState.x, characterState.z - shipState.z);
    const nearShip = distanceToShip < BOARDING_DISTANCE;
    const atShore = distanceToShip < 40 || ground.heightAt(characterState.x, characterState.z) < 2.5;
    hud.setAction(nearShip && atShore ? '⚓ Row to the sloop' : null, boardShip);
  } else {
    const landingPoint = shipState.speed < MAX_LANDING_SPEED ? findLandingSpot() : null;
    hud.setAction(landingPoint ? '⚓ Go ashore' : null, landingPoint ? () => goAshore(landingPoint) : null);
  }
}

function missingRepairMaterials() {
  return Object.entries(REPAIR_REQUIREMENTS)
    .map(([type, required]) => [type, required - (save.inventory[type] ?? 0)])
    .filter(([, missing]) => missing > 0);
}

function tryRepairSloop() {
  const missing = missingRepairMaterials();
  if (missing.length > 0) {
    hud.showToast('Missing: ' + missing.map(([type, count]) => `${REPAIR_LABELS[type]} ${count}`).join(', '));
    return;
  }
  for (const [type, required] of Object.entries(REPAIR_REQUIREMENTS)) save.inventory[type] -= required;
  save.sloopRepaired = true;
  launch.active = true;
  launch.progress = 0;
  ship.setDamaged(false);
  hud.setInventory(save.gold, save.inventory);
  hud.showToast('Sloop repaired!');
  updateObjective();
  persist();
}

function buildQuests() {
  const repairSteps = Object.entries(REPAIR_REQUIREMENTS).map(([type, need]) => ({
    label: `${ITEM_TYPES[type].icon} ${REPAIR_LABELS[type]}`,
    have: save.sloopRepaired ? need : Math.min(need, save.inventory[type] ?? 0),
    need,
  }));
  repairSteps.push({ label: '🔨 Repair the sloop on the beach', have: save.sloopRepaired ? 1 : 0, need: 1 });
  return [
    {
      title: 'Repair the sloop',
      description: 'The shipwreck left you stranded on this island. A damaged sloop lies on the beach. Find materials around the island and repair it.',
      steps: repairSteps,
      done: save.sloopRepaired,
    },
    {
      title: 'Set sail',
      description: 'The sloop is afloat. Climb aboard and set sail.',
      steps: [{ label: '⚓ Board the sloop', have: save.hasSailed ? 1 : 0, need: 1 }],
      done: Boolean(save.hasSailed),
      locked: !save.sloopRepaired,
    },
  ];
}

function updateObjective() {
  hud.setQuests(buildQuests());
}

const guideTarget = new THREE.Vector3();
function updateGuideArrow() {
  if (mode !== 'onFoot' || save.sloopRepaired) {
    hud.setGuideArrow(null);
    hud.setSloopArrow(null);
    return;
  }
  const characterState = character.state;
  const stillNeeded = (type) => (save.inventory[type] ?? 0) < (REPAIR_REQUIREMENTS[type] ?? 0);
  let nearest = null;
  let nearestDistance = Infinity;
  for (const item of items.items) {
    if (item.collected || !stillNeeded(item.type)) continue;
    const distance = Math.hypot(item.x - characterState.x, item.z - characterState.z);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = item;
    }
  }
  hud.setGuideArrow(offScreenAngle(nearest ? nearest.x : beachedSloop.x, nearest ? nearest.z : beachedSloop.z), nearest ? ITEM_TYPES[nearest.type].icon : '🔨');
  hud.setSloopArrow(nearest ? offScreenAngle(beachedSloop.x, beachedSloop.z) : null);
}

function offScreenAngle(x, z) {
  guideTarget.set(x, ground.heightAt(x, z), z).project(camera);
  const inFront = guideTarget.z < 1;
  const onScreen = inFront && Math.abs(guideTarget.x) < 0.85 && guideTarget.y < 0.8 && guideTarget.y > -0.6;
  if (onScreen) return null;
  const sign = inFront ? 1 : -1;
  return Math.atan2(guideTarget.y * sign * innerHeight, guideTarget.x * sign * innerWidth);
}

function collectItem(item) {
  const itemType = ITEM_TYPES[item.type];
  if (itemType.gold) {
    save.gold += itemType.gold;
    hud.showToast(`+${itemType.gold} gold`);
  } else {
    save.inventory[item.type] = (save.inventory[item.type] ?? 0) + 1;
    hud.showToast(`+1 ${itemType.name}`);
  }
  save.collectedItemIds.push(item.id);
  hud.setInventory(save.gold, save.inventory);
  updateObjective();
  persist();
}

hud.onReset(() => {
  clearSave();
  location.reload();
});

const raycaster = new THREE.Raycaster();
const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pointerNdc = new THREE.Vector2();
const pointerHit = new THREE.Vector3();
const activePointers = new Map();
let pinchStartSpan = 0;
let pinchStartDistance = 0;
let steeringPointerId = null;
const walkTarget = { x: 0, z: 0, active: false };
let lastPathTime = -1;

function aimRayAt(clientX, clientY) {
  pointerNdc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
}

function steerTowardScreenPoint(clientX, clientY, held) {
  aimRayAt(clientX, clientY);
  if (raycaster.ray.intersectPlane(seaPlane, pointerHit)) {
    shipController.setTarget(pointerHit.x, pointerHit.z, held);
    interactedInMode.sailing = true;
  }
}

function walkTowardScreenPoint(clientX, clientY, isNewTouch) {
  aimRayAt(clientX, clientY);
  let targetX;
  let targetZ;
  const tappedItem = items.itemUnderRay(raycaster.ray);
  if (tappedItem) {
    targetX = tappedItem.x;
    targetZ = tappedItem.z;
  } else {
    const hits = raycaster.intersectObject(detailTerrain.frontMesh(), false);
    if (hits.length > 0) {
      targetX = hits[0].point.x;
      targetZ = hits[0].point.z;
    } else if (raycaster.ray.intersectPlane(seaPlane, pointerHit)) {
      targetX = pointerHit.x;
      targetZ = pointerHit.z;
    } else {
      return;
    }
  }
  const movedEnough = Math.hypot(targetX - walkTarget.x, targetZ - walkTarget.z) > 2;
  if (!isNewTouch && (!movedEnough || simulationTime - lastPathTime < 0.25)) return;
  walkTarget.x = targetX;
  walkTarget.z = targetZ;
  walkTarget.active = true;
  lastPathTime = simulationTime;
  const characterState = character.state;
  const distanceToTarget = Math.hypot(targetX - characterState.x, targetZ - characterState.z);
  for (let pulledBack = 0; pulledBack < distanceToTarget && !walkGrid.isPointWalkable(targetX, targetZ); pulledBack += 2) {
    targetX += ((characterState.x - targetX) / Math.max(1, distanceToTarget - pulledBack)) * 2;
    targetZ += ((characterState.z - targetZ) / Math.max(1, distanceToTarget - pulledBack)) * 2;
  }
  walkTarget.x = targetX;
  walkTarget.z = targetZ;
  character.setPath(walkGrid.findPath(characterState.x, characterState.z, targetX, targetZ));
  interactedInMode.onFoot = true;
}

function handlePointerAim(clientX, clientY, isNewTouch) {
  if (mode === 'sailing') steerTowardScreenPoint(clientX, clientY, true);
  else walkTowardScreenPoint(clientX, clientY, isNewTouch);
}

function zoomLimits() {
  return ZOOM_LIMITS[mode];
}

function setCameraDistance(distance) {
  const [minimum, maximum] = zoomLimits();
  cameraDistanceByMode[mode] = THREE.MathUtils.clamp(distance, minimum, maximum);
}

function pinchSpan() {
  const [first, second] = activePointers.values();
  return Math.hypot(first.x - second.x, first.y - second.y);
}

const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 1) {
    steeringPointerId = event.pointerId;
    handlePointerAim(event.clientX, event.clientY, true);
  } else if (activePointers.size === 2) {
    steeringPointerId = null;
    shipController.releaseSteering();
    pinchStartSpan = pinchSpan();
    pinchStartDistance = cameraDistanceByMode[mode];
  }
});
canvas.addEventListener('pointermove', (event) => {
  const pointer = activePointers.get(event.pointerId);
  if (!pointer) return;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  if (activePointers.size === 2 && pinchStartSpan > 0) {
    setCameraDistance(pinchStartDistance * (pinchStartSpan / Math.max(1, pinchSpan())));
  } else if (event.pointerId === steeringPointerId) {
    handlePointerAim(event.clientX, event.clientY, false);
  }
});
function endPointer(event) {
  activePointers.delete(event.pointerId);
  if (event.pointerId === steeringPointerId) {
    steeringPointerId = null;
    shipController.releaseSteering();
  }
  if (activePointers.size < 2) pinchStartSpan = 0;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  setCameraDistance(cameraDistanceByMode[mode] * Math.exp(event.deltaY * 0.0012));
}, { passive: false });

const heldKeys = new Set();
addEventListener('keydown', (event) => heldKeys.add(event.key.toLowerCase()));
addEventListener('keyup', (event) => heldKeys.delete(event.key.toLowerCase()));

function applyKeyboardSteering() {
  if (mode !== 'sailing') return;
  const turnLeft = heldKeys.has('a') || heldKeys.has('arrowleft');
  const turnRight = heldKeys.has('d') || heldKeys.has('arrowright');
  if (turnLeft === turnRight) return;
  const state = shipController.state;
  const desiredHeading = state.heading + (turnLeft ? 0.6 : -0.6);
  shipController.setTarget(state.x + Math.sin(desiredHeading) * 80, state.z + Math.cos(desiredHeading) * 80, false);
  interactedInMode.sailing = true;
}

function resize() {
  const aspect = innerWidth / innerHeight;
  const horizontalFov = THREE.MathUtils.degToRad(54);
  const verticalFov = 2 * Math.atan(Math.tan(horizontalFov / 2) / aspect);
  camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(verticalFov), 30, 62);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

const cameraOffsetDirection = new THREE.Vector3();
const shipScreen = new THREE.Vector3();
const windScreen = new THREE.Vector3();

function updateCamera(deltaTime, snap) {
  const cameraDistance = cameraDistanceByMode[mode];
  const [minimumDistance, maximumDistance] = zoomLimits();
  const zoomFraction = (cameraDistance - minimumDistance) / (maximumDistance - minimumDistance);
  let focusX;
  let focusZ;
  let focusY;
  let pitch;
  if (mode === 'sailing') {
    const state = shipController.state;
    const lookAhead = Math.min(cameraDistance * 0.12 * Math.min(1, camera.aspect), state.speed * 3);
    focusX = state.x + Math.sin(state.heading) * lookAhead;
    focusZ = state.z + Math.cos(state.heading) * lookAhead;
    focusY = THREE.MathUtils.lerp(9, 1.5, Math.min(1, zoomFraction * 3));
    pitch = THREE.MathUtils.lerp(0.62, 1.0, Math.sqrt(zoomFraction));
  } else {
    const state = character.state;
    focusX = state.x;
    focusZ = state.z;
    focusY = Math.max(0, ground.heightAt(state.x, state.z)) + 1.5;
    pitch = THREE.MathUtils.lerp(0.92, 1.08, Math.sqrt(zoomFraction));
  }
  const follow = snap ? 1 : 1 - Math.exp(-deltaTime * (mode === 'sailing' ? 2.5 : 5));
  cameraFocus.x += (focusX - cameraFocus.x) * follow;
  cameraFocus.z += (focusZ - cameraFocus.z) * follow;
  cameraFocus.y += (focusY - cameraFocus.y) * follow;
  cameraOffsetDirection.set(Math.sin(CAMERA_YAW) * Math.cos(pitch), Math.sin(pitch), Math.cos(CAMERA_YAW) * Math.cos(pitch));
  camera.position.copy(cameraFocus).addScaledVector(cameraOffsetDirection, cameraDistance);
  camera.lookAt(cameraFocus);
  vegetationOcclusion.enabled.value = mode === 'onFoot' ? 1 : 0;
  vegetationOcclusion.camera.value.copy(camera.position);
  vegetationOcclusion.focus.value.copy(cameraFocus);

  const fogNear = cameraDistance * 2.4 + 120;
  const fogFar = cameraDistance * 6.5 + 600;
  scene.fog.near = fogNear;
  scene.fog.far = fogFar;
  ocean.uniforms.fogNear.value = fogNear;
  ocean.uniforms.fogFar.value = fogFar;

  const shadowExtent = Math.min(420, cameraDistance * 1.25 + 40);
  const shadowCamera = sun.shadow.camera;
  shadowCamera.left = -shadowExtent;
  shadowCamera.right = shadowExtent;
  shadowCamera.top = shadowExtent;
  shadowCamera.bottom = -shadowExtent;
  shadowCamera.near = 10;
  shadowCamera.far = 900;
  shadowCamera.updateProjectionMatrix();
  sun.target.position.copy(cameraFocus);
  sun.position.copy(cameraFocus).addScaledVector(lighting.sunDirection, 450);
}

function updateTargetMarker(time) {
  const pulse = 1 + 0.12 * Math.sin(time * 5);
  if (mode === 'sailing') {
    const state = shipController.state;
    targetMarker.visible = state.hasTarget;
    if (!state.hasTarget) return;
    targetMarker.position.set(state.targetX, 0.35, state.targetZ);
    const markerScale = (cameraDistanceByMode.sailing / 150) * pulse;
    targetMarker.scale.set(markerScale, 1, markerScale);
  } else {
    const walking = character.state.pathIndex < character.state.path.length;
    targetMarker.visible = walking && walkTarget.active;
    if (!targetMarker.visible) return;
    targetMarker.position.set(walkTarget.x, Math.max(0.1, ground.heightAt(walkTarget.x, walkTarget.z)) + 0.12, walkTarget.z);
    const markerScale = 0.3 * pulse;
    targetMarker.scale.set(markerScale, 1, markerScale);
  }
}

function updateHud() {
  const state = shipController.state;
  shipScreen.set(state.x, 0, state.z).project(camera);
  windScreen.set(state.x + wind.directionX * 50, 0, state.z + wind.directionZ * 50).project(camera);
  const windScreenAngle = Math.atan2(-(windScreen.y - shipScreen.y) / camera.aspect, windScreen.x - shipScreen.x);
  hud.update({
    speedKnots: state.speed * 1.944, windScreenAngle, aground: state.aground,
    showHint: !interactedInMode[mode], efficiencyAngle: state.angleOffWind, sailing: mode === 'sailing',
  });
}

let simulationTime = 0;
let previousFrameTime = performance.now();
let autosaveTimer = AUTOSAVE_INTERVAL_SECONDS;
const FIXED_STEP = 1 / 60;

function simulate(deltaTime) {
  simulationTime += deltaTime;
  applyKeyboardSteering();
  const state = shipController.state;
  if (!save.sloopRepaired) {
    placeBeachedSloop(0);
  } else if (launch.active) {
    launch.progress = Math.min(1, launch.progress + deltaTime / LAUNCH_SECONDS);
    placeBeachedSloop(launch.progress);
    if (launch.progress >= 1) {
      launch.active = false;
      shipController.place(sloopLaunchPoint.x, sloopLaunchPoint.z, beachedSloop.heading, 0);
      state.anchored = mode === 'onFoot';
    }
  } else {
    shipController.step(deltaTime, simulationTime);
  }
  const sternOffset = ship.length * 0.48;
  wake.update(simulationTime, state.x - Math.sin(state.heading) * sternOffset, state.z - Math.cos(state.heading) * sternOffset, state.heading, state.speed);
  ocean.update(simulationTime, cameraFocus.x, cameraFocus.z);
  swayTime.value = simulationTime;
  shipForDolphins.x = state.x;
  shipForDolphins.z = state.z;
  shipForDolphins.heading = state.heading;
  shipForDolphins.speed = state.speed;
  dolphins.update(deltaTime, simulationTime, shipForDolphins);

  const onFoot = mode === 'onFoot';
  if (onFoot) {
    character.update(deltaTime, ground);
    detailTerrain.update(character.state.x, character.state.z);
  }
  items.update(deltaTime, simulationTime, onFoot ? character.state.x : null, character.state.z, collectItem, (type) => !save.sloopRepaired && (save.inventory[type] ?? 0) < (REPAIR_REQUIREMENTS[type] ?? 0));
  updateContextAction(deltaTime);

  autosaveTimer -= deltaTime;
  if (autosaveTimer <= 0) {
    autosaveTimer = AUTOSAVE_INTERVAL_SECONDS;
    persist();
  }
}

function renderFrame(now) {
  const deltaTime = Math.min(0.05, (now - previousFrameTime) / 1000);
  previousFrameTime = now;
  simulate(deltaTime);
  updateCamera(deltaTime, false);
  updateTargetMarker(simulationTime);
  renderer.render(scene, camera);
  updateHud();
  updateGuideArrow();
  updateSloopMarker(simulationTime);
  performanceMonitor.recordFrame(now);
}

addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});

hud.setInventory(save.gold, save.inventory);
enterMode(mode);
updateObjective();

if (isScreenshotMode) {
  hud.setVisible(searchParameters.has('hud'));
  performanceMonitor.setVisible(false);
  if (startPose.walkToItem) {
    const nearestItem = items.items.reduce((best, item) => {
      const distance = Math.hypot(item.x - character.state.x, item.z - character.state.z);
      return !best || distance < best.distance ? { item, distance } : best;
    }, null);
    if (nearestItem) {
      walkTarget.x = nearestItem.item.x;
      walkTarget.z = nearestItem.item.z;
      walkTarget.active = true;
      character.setPath(walkGrid.findPath(character.state.x, character.state.z, walkTarget.x, walkTarget.z));
    }
  }
  updateCamera(0, true);
  const warmupSeconds = searchParameters.has('warmup') ? Number(searchParameters.get('warmup')) : startPose.warmup;
  const warmupSteps = Math.round(warmupSeconds / FIXED_STEP);
  for (let i = 0; i < warmupSteps; i++) {
    simulate(FIXED_STEP);
    updateCamera(FIXED_STEP, i === 0);
  }
  updateCamera(0, true);
  updateTargetMarker(simulationTime);
  renderer.render(scene, camera);
  updateHud();
  updateGuideArrow();
  updateSloopMarker(simulationTime);
  renderer.render(scene, camera);
  window.__frameReady = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
} else {
  updateCamera(0, true);
  renderer.setAnimationLoop((now) => {
    if (!performanceMonitor.shouldRender(now)) return;
    renderFrame(now);
  });
}

window.__debug = { tryRepairSloop, beachedSloop, launch, boardShip, shipController, heightmap, ground, renderer, scene, camera, dolphins, simulate, character, walkGrid, items, save, enterMode, getMode: () => mode };
