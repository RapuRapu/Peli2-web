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
};

const startPose = POSES[screenshotPose] || POSES[1];
const anchorage = findOpenWater(startPose.angle, startPose.clearance);
const wreckSpot = findBeach(BAY_ANGLE, 1);
const wreck = createWreck(scene, ground, { x: wreckSpot.x, z: wreckSpot.z, heading: wreckSpot.tangentHeading + 0.3 });
const walkGrid = createWalkGrid(ground, heightmap.worldSize, [...vegetation.obstacles, ...wreck.obstacles]);

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

const save = isScreenshotMode ? createEmptySave() : loadSave();
if (isScreenshotMode) save.mode = startPose.mode;

const character = createCharacter(scene);
const characterStart = save.character ?? { x: spawnPoint.x, z: spawnPoint.z, heading: wreckSpot.inwardHeading + Math.PI };
character.place(characterStart.x, characterStart.z, characterStart.heading);

const shipStart = save.ship ?? { x: anchorage.x, z: anchorage.z, heading: anchorage.tangentHeading };
shipController.place(shipStart.x, shipStart.z, shipStart.heading, save.mode === 'sailing' && !save.ship ? 5 : 0);

const typicalOnFootPitch = 0.95;
const canopyScreenShift = 1 / Math.tan(typicalOnFootPitch);
const canopiesAsSeenFromCamera = vegetation.obstacles
  .filter((obstacle) => obstacle.canopyRadius)
  .flatMap((obstacle) => [obstacle, {
    x: obstacle.x - Math.sin(CAMERA_YAW) * obstacle.canopyHeight * canopyScreenShift,
    z: obstacle.z - Math.cos(CAMERA_YAW) * obstacle.canopyHeight * canopyScreenShift,
    canopyRadius: obstacle.canopyRadius,
  }]);
const items = createItems(scene, ground, walkGrid, wreckSpot, new Set(save.collectedItemIds), canopiesAsSeenFromCamera);

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
  updateCamera(0, true);
}

function boardShip() {
  enterMode('sailing');
  hud.showToast('Laivaan!');
  persist();
}

function goAshore(landingPoint) {
  const shipState = shipController.state;
  character.place(landingPoint.x, landingPoint.z, Math.atan2(landingPoint.x - shipState.x, landingPoint.z - shipState.z));
  shipState.speed = 0;
  enterMode('onFoot');
  hud.showToast('Maihin!');
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
    const nearShip = Math.hypot(characterState.x - shipState.x, characterState.z - shipState.z) < BOARDING_DISTANCE;
    const atShore = ground.heightAt(characterState.x, characterState.z) < 1.6;
    hud.setAction(nearShip && atShore ? '⚓ Soutaa slooppiin' : null, boardShip);
  } else {
    const landingPoint = shipState.speed < MAX_LANDING_SPEED ? findLandingSpot() : null;
    hud.setAction(landingPoint ? '⚓ Mene maihin' : null, landingPoint ? () => goAshore(landingPoint) : null);
  }
}

function collectItem(item) {
  const itemType = ITEM_TYPES[item.type];
  if (itemType.gold) {
    save.gold += itemType.gold;
    hud.showToast(`+${itemType.gold} kultaa`);
  } else {
    save.inventory[item.type] = (save.inventory[item.type] ?? 0) + 1;
    hud.showToast(`+1 ${itemType.name}`);
  }
  save.collectedItemIds.push(item.id);
  hud.setInventory(save.gold, save.inventory);
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
  shipController.step(deltaTime, simulationTime);
  const state = shipController.state;
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
  items.update(deltaTime, simulationTime, onFoot ? character.state.x : null, character.state.z, collectItem);
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
  performanceMonitor.recordFrame(now);
}

addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});

hud.setInventory(save.gold, save.inventory);
enterMode(mode);

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
  window.__frameReady = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
} else {
  updateCamera(0, true);
  renderer.setAnimationLoop((now) => {
    if (!performanceMonitor.shouldRender(now)) return;
    renderFrame(now);
  });
}

window.__debug = { shipController, heightmap, ground, renderer, scene, camera, dolphins, simulate, character, walkGrid, items, save, enterMode, getMode: () => mode };
