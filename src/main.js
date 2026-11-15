import * as THREE from 'three';
import { generateIslandHeightmap, buildTerrainMesh, createSeaDepthTexture } from './island.js';
import { createOcean } from './ocean.js';
import { createShipController } from './ship.js';
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
import { createHarvesting } from './harvesting.js';
import { createRaft, buildRaftDeck } from './raft.js';
import { createWildlife } from './wildlife.js';
import { createTracks } from './tracks.js';
import { createTreasure } from './treasure.js';
import { createNavy } from './navy.js';
import { createCrabs } from './crabs.js';
import { createTunnels, TUNNEL_FLOOR_Y } from './tunnels.js';
import { tide, setTideTime, tideStatus } from './tide.js';
import { RECIPES, RAFT_PARTS, REARM_FRONDS, HUNGER_DRAIN_PER_SECOND, recipeViews, missingRaftParts, buildQuests, canAfford, spend, hasTool } from './survival.js';
import { loadSave, writeSave, clearSave, createEmptySave } from './save.js';

const searchParameters = new URLSearchParams(location.search);
const screenshotPose = searchParameters.has('pose') ? Number(searchParameters.get('pose')) : null;
const isScreenshotMode = screenshotPose !== null;

const CAMERA_YAW = 0.55;
const ZOOM_LIMITS = { sailing: [75, 380], onFoot: [24, 100], underground: [16, 45] };
const AUTOSAVE_INTERVAL_SECONDS = 5;
const BOARDING_DISTANCE = 70;
const LANDING_SEARCH_RADIUS = 80;
const MAX_LANDING_SPEED = 2.6;
const BUILD_DISTANCE = 16;
const NAVY_ARRIVAL_TIME = 720;
const LAUNCH_SECONDS = 2.5;

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
const skyLight = new THREE.HemisphereLight(new THREE.Color(0.62, 0.76, 0.95), new THREE.Color(0.5, 0.42, 0.3), 1.45);
scene.add(skyLight);
const caveBackground = new THREE.Color(0.03, 0.02, 0.015);

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
const ship = createRaft(scene);
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
  12: { mode: 'onFoot', angle: BAY_ANGLE, clearance: 70, distance: 26, warmup: 0, chopNearestTree: true },
  13: { mode: 'onFoot', angle: BAY_ANGLE, clearance: 70, distance: 30, warmup: 1, trappedBoar: true },
  14: { mode: 'onFoot', angle: BAY_ANGLE, clearance: 70, distance: 40, warmup: 30, nearPasture: true },
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

const raftSite = shorePointNear(
  wreckSpot.x - Math.sin(wreckSpot.tangentHeading) * 34,
  wreckSpot.z - Math.cos(wreckSpot.tangentHeading) * 34,
);
raftSite.heading = wreckSpot.tangentHeading + Math.PI;
const raftLaunchPoint = launchPointFrom(raftSite.x, raftSite.z);

const walkGrid = createWalkGrid(ground, heightmap.worldSize, [...vegetation.obstacles, ...wreck.obstacles, { x: raftSite.x, z: raftSite.z, radius: 2.5 }]);

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


function inlandFrom(point, distance) {
  const length = Math.hypot(point.x, point.z) || 1;
  return { x: point.x - (point.x / length) * distance, z: point.z - (point.z / length) * distance };
}

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

const westBeach = findBeach(BAY_ANGLE + 1.3, 3);
const eastCove = findBeach(BAY_ANGLE - 0.8, 3);
const jungleClearing = findJungleClearing(170);
function findOpenGround(preferredDistance, avoid = []) {
  const canopyCenters = vegetation.obstacles.filter((obstacle) => obstacle.canopyRadius);
  const candidates = [];
  for (let offsetZ = -300; offsetZ <= 300; offsetZ += 12) {
    for (let offsetX = -300; offsetX <= 300; offsetX += 12) {
      const x = spawnPoint.x + offsetX;
      const z = spawnPoint.z + offsetZ;
      const height = ground.heightAt(x, z);
      if (height < 1.6 || height > 7 || ground.slopeAt(x, z) > 0.25 || !walkGrid.isPointWalkable(x, z)) continue;
      if (avoid.some((point) => Math.hypot(point.x - x, point.z - z) < 70)) continue;
      const shade = canopyCenters.filter((canopy) => Math.hypot(canopy.x - x, canopy.z - z) < 10).length;
      candidates.push({ x, z, score: Math.abs(Math.hypot(offsetX, offsetZ) - preferredDistance) + shade * 12 });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates.slice(0, 15).find((candidate) => isReachableFromSpawn(candidate.x, candidate.z)) ?? spawnPoint;
}

const nearPasture = findOpenGround(65);
const farPasture = findOpenGround(150, [nearPasture]);

const itemZones = [
  { id: 'start', ...spawnPoint, minRadius: 4, maxRadius: 14, minHeight: 1.1, maxHeight: 4, types: ['stone', 'stick', 'stone'] },
  { id: 'wreck-beach', ...wreckSpot, minRadius: 9, maxRadius: 30, minHeight: 1.1, maxHeight: 4, types: ['pouch'] },
  { id: 'west-beach', ...westBeach, minRadius: 3, maxRadius: 26, minHeight: 1.1, maxHeight: 5, types: ['pouch', 'stone'] },
  { id: 'east-cove', ...eastCove, minRadius: 3, maxRadius: 26, minHeight: 1.1, maxHeight: 6, types: ['pouch', 'stone'] },
  { id: 'jungle-clearing', ...jungleClearing, minRadius: 2, maxRadius: 22, minHeight: 3, maxHeight: 45, types: ['pouch'] },
];

const save = isScreenshotMode ? createEmptySave() : loadSave();
if (save.mode === 'underground') {
  save.mode = 'onFoot';
  if (save.tunnel) save.character = { x: save.tunnel.x + 1.8, z: save.tunnel.z + 1.8, heading: 0 };
}
if (isScreenshotMode) {
  save.mode = startPose.mode;
  const tideParameter = searchParameters.get('tide');
  save.worldTime = tideParameter === 'high' ? 60 : tideParameter === 'low' ? 180 : 0;
  setTideTime(save.worldTime);
  save.raftBuilt = startPose.mode === 'sailing';
}

const character = createCharacter(scene);
const playerDisc = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255, 200, 80, 0)');
  gradient.addColorStop(0.62, 'rgba(255, 190, 60, 0.05)');
  gradient.addColorStop(0.78, 'rgba(255, 180, 40, 0.75)');
  gradient.addColorStop(0.9, 'rgba(255, 180, 40, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 180, 40, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const disc = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  disc.rotation.x = -Math.PI / 2;
  disc.renderOrder = 1;
  scene.add(disc);
  return disc;
})();

function updatePlayerDisc() {
  playerDisc.visible = mode !== 'sailing';
  if (!playerDisc.visible) return;
  playerDisc.position.set(character.state.x, (mode === 'underground' ? character.root.position.y : ground.heightAt(character.state.x, character.state.z)) + 0.2, character.state.z);
}
const poseSpawn = startPose.nearSloop ? nearestWalkablePoint(raftSite.x + Math.sin(wreckSpot.inwardHeading) * 10, raftSite.z + Math.cos(wreckSpot.inwardHeading) * 10) : startPose.nearPasture ? nearestWalkablePoint(nearPasture.x + 18, nearPasture.z + 12) : spawnPoint;
const characterStart = save.character ?? { x: poseSpawn.x, z: poseSpawn.z, heading: wreckSpot.inwardHeading + Math.PI };
character.place(characterStart.x, characterStart.z, characterStart.heading);

const defaultShipStart = isScreenshotMode && startPose.mode === 'sailing' ? { x: anchorage.x, z: anchorage.z, heading: anchorage.tangentHeading } : { x: raftLaunchPoint.x, z: raftLaunchPoint.z, heading: raftSite.heading };
const shipStart = save.ship ?? defaultShipStart;
shipController.place(shipStart.x, shipStart.z, shipStart.heading, save.mode === 'sailing' && !save.ship ? 5 : 0);
const launch = { active: false, progress: 0 };
ship.root.visible = save.raftBuilt;
const raftSiteLogs = buildRaftDeck(new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.9, flatShading: true }), new THREE.MeshStandardMaterial({ color: 0xd2b47a })).group;
raftSiteLogs.children.slice(4).forEach((child) => { child.visible = false; });
raftSiteLogs.position.set(raftSite.x, ground.heightAt(raftSite.x, raftSite.z) + 0.2, raftSite.z);
raftSiteLogs.rotation.y = raftSite.heading;
raftSiteLogs.visible = !save.raftBuilt;
scene.add(raftSiteLogs);

const raftSiteMarker = (() => {
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
  context.fillText('🛶', 64, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.renderOrder = 5;
  scene.add(sprite);
  return sprite;
})();

function updateRaftSiteMarker(time) {
  raftSiteMarker.visible = !save.raftBuilt && mode === 'onFoot';
  if (!raftSiteMarker.visible) return;
  const ready = missingRaftParts(save).length === 0;
  const pulse = 1 + (ready ? 0.25 : 0.08) * Math.sin(time * (ready ? 6 : 3));
  const size = cameraDistanceByMode.onFoot * 0.065 * pulse;
  raftSiteMarker.scale.set(size, size, 1);
  raftSiteMarker.position.set(raftSite.x, ground.heightAt(raftSite.x, raftSite.z) + 6 + Math.sin(time * 2) * 0.4, raftSite.z);
}

function placeRaftAtSite(progress) {
  const x = raftSite.x + (raftLaunchPoint.x - raftSite.x) * progress;
  const z = raftSite.z + (raftLaunchPoint.z - raftSite.z) * progress;
  const beachedHeight = ground.heightAt(raftSite.x, raftSite.z) + 0.2;
  const easedProgress = progress * progress * (3 - 2 * progress);
  ship.root.position.set(x, beachedHeight * (1 - easedProgress), z);
  ship.root.rotation.set(0, raftSite.heading, 0, 'YXZ');
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
const harvesting = createHarvesting(scene, ground, walkGrid, vegetation.harvestables, save.harvestedIds);
const tracks = createTracks(scene, ground);
const treasure = createTreasure(scene, ground, save.caches);
if (save.navy.state === 'landed') save.navy.state = 'coming';
const tunnels = createTunnels(scene, ground, save.tunnel);
const tunnelGround = { heightAt: () => TUNNEL_FLOOR_Y, floorY: TUNNEL_FLOOR_Y };
const crabs = createCrabs(scene, ground, { isBlocked: walkGrid.isPointBlocked, tracks, items, beaches: [wreckSpot, westBeach, eastCove], savedBurrows: save.burrows, friendCount: save.crabFriends });

function coastPointFrom(x, z) {
  const length = Math.hypot(x, z) || 1;
  const outwardX = x / length;
  const outwardZ = z / length;
  let pointX = x;
  let pointZ = z;
  for (let step = 0; step < 300 && ground.heightAt(pointX, pointZ) > 0.6; step++) {
    pointX += outwardX * 2;
    pointZ += outwardZ * 2;
  }
  return nearestWalkablePoint(pointX - outwardX * 2, pointZ - outwardZ * 2);
}

const wildlife = createWildlife(scene, ground, walkGrid, [nearPasture, farPasture, nearPasture, inlandFrom(westBeach, 30), inlandFrom(eastCove, 30)], save.traps, tracks);

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
const cameraDistanceByMode = { sailing: 150, onFoot: innerWidth < innerHeight ? 32 : 44, underground: innerWidth < innerHeight ? 24 : 30 };
if (isScreenshotMode) cameraDistanceByMode[startPose.mode] = startPose.distance;
const interactedInMode = { sailing: false, onFoot: false, underground: false };

function persist() {
  if (isScreenshotMode) return;
  const shipState = shipController.state;
  const characterState = character.state;
  save.mode = mode;
  save.character = { x: characterState.x, z: characterState.z, heading: characterState.heading };
  save.ship = { x: shipState.x, z: shipState.z, heading: shipState.heading };
  save.traps = wildlife.serializeTraps();
  save.caches = treasure.serialize();
  save.burrows = crabs.serializeBurrows();
  save.crabFriends = crabs.friendCountNow();
  save.tunnel = tunnels.serialize();
  writeSave(save);
}

function enterMode(nextMode) {
  mode = nextMode;
  const onFoot = mode === 'onFoot';
  const inTunnel = mode === 'underground';
  character.setVisible(onFoot || inTunnel);
  tunnels.setActive(inTunnel);
  tunnels.cancelTask();
  sun.intensity = inTunnel ? 0 : 2.7;
  skyLight.intensity = inTunnel ? 0 : 1.45;
  scene.background = inTunnel ? caveBackground : lighting.fogColor;
  scene.fog.color.copy(inTunnel ? caveBackground : lighting.fogColor);
  character.setWorkPose(null, 0);
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
      if (height > tide.level + 0.35 && height < tide.level + 2.5 && walkGrid.isPointWalkable(x, z)) return { x, z };
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
    if (tunnels.exists() && tunnels.nearEntrance(characterState.x, characterState.z) && !groundTask.active) {
      hud.setAction('🪜 Enter tunnel', enterTunnel, { subtitle: tunnels.state.covered ? 'Entrance hidden under fronds' : 'Entrance visible · tap it to hide (2 fronds)' });
      return;
    }
    const patchNearby = treasure.caches.find((cache) => cache.patchVisible && !cache.underground && Math.hypot(cache.x - characterState.x, cache.z - characterState.z) < 3.5);
    if (patchNearby && !groundTask.active) {
      const fronds = save.inventory.fronds ?? 0;
      hud.setAction('🌿 Hide the dig patch', () => coverDigPatch(patchNearby), { subtitle: fronds >= 2 ? 'Uses 2 fronds · brushes away tracks' : 'Needs 2 palm fronds', disabled: fronds < 2 });
      return;
    }
    if (!save.raftBuilt) {
      const nearSite = Math.hypot(characterState.x - raftSite.x, characterState.z - raftSite.z) < BUILD_DISTANCE;
      const missing = missingRaftParts(save);
      const blockaded = save.navy.state !== 'gone';
      const subtitle = missing.length ? 'Missing: ' + missing.map(([type]) => ITEM_TYPES[type].name).join(', ') : blockaded ? 'Navy blockade – wait for them to leave' : 'All parts ready!';
      hud.setAction(nearSite ? '⛵ Build the raft' : null, tryBuildRaft, { subtitle, disabled: missing.length > 0 || blockaded });
      return;
    }
    if (launch.active) {
      hud.setAction(null, null);
      return;
    }
    const distanceToShip = Math.hypot(characterState.x - shipState.x, characterState.z - shipState.z);
    const nearShip = distanceToShip < BOARDING_DISTANCE;
    const atShore = distanceToShip < 40 || ground.heightAt(characterState.x, characterState.z) < 2.5;
    hud.setAction(nearShip && atShore ? '⚓ Board the raft' : null, boardShip);
  } else if (mode === 'underground') {
    const onEntrance = tunnels.onEntranceCell(character.state.x, character.state.z);
    hud.setAction(onEntrance ? '🪜 Climb out' : null, climbOutOfTunnel);
  } else {
    const landingPoint = shipState.speed < MAX_LANDING_SPEED ? findLandingSpot() : null;
    hud.setAction(landingPoint ? '⚓ Go ashore' : null, landingPoint ? () => goAshore(landingPoint) : null);
  }
}

function tryBuildRaft() {
  if (save.navy.state !== 'gone') {
    hud.showToast('⚓ The navy blockades the bay – wait until they leave');
    return;
  }
  const missing = missingRaftParts(save);
  if (missing.length > 0) {
    hud.showToast('Missing: ' + missing.map(([type]) => ITEM_TYPES[type].name).join(', '));
    return;
  }
  spend(save, RAFT_PARTS);
  save.raftBuilt = true;
  launch.active = true;
  launch.progress = 0;
  ship.root.visible = true;
  raftSiteLogs.visible = false;
  hud.showToast('The raft is ready!');
  refreshInventoryViews();
  persist();
}

function updateObjective() {
  hud.setQuests(buildQuests(save, { chestBuried: treasure.caches.some((cache) => cache.contents === 'chest'), navyArrivesIn: navyCountdownText() }));
}

function navyCountdownText() {
  if (save.navy.state !== 'coming') return null;
  const seconds = Math.max(0, NAVY_ARRIVAL_TIME - save.worldTime);
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}

function digSeconds(baseSeconds) {
  return baseSeconds * Math.max(0.55, 1 - 0.15 * crabs.friendCountNow());
}

function canDigAt(x, z) {
  const height = ground.heightAt(x, z);
  if (height < tide.level + 0.15) return 'Too wet to dig here – wait for low tide';
  if (treasure.caches.some((cache) => !cache.underground && Math.hypot(cache.x - x, cache.z - z) < 3.5)) return 'Too close to another hole';
  if (wildlife.traps.some((trap) => Math.hypot(trap.x - x, trap.z - z) < 3)) return 'Too close to a trap';
  return null;
}

function buryHere(contents) {
  if (!hasTool(save, 'diggingStick')) {
    hud.showToast('Craft a digging stick first');
    return;
  }
  const characterState = character.state;
  const x = characterState.x + Math.sin(characterState.heading) * 1.4;
  const z = characterState.z + Math.cos(characterState.heading) * 1.4;
  const problem = canDigAt(x, z);
  if (problem) {
    hud.showToast(problem);
    return;
  }
  hud.closeMenus();
  treasure.setDigPreview(x, z, true);
  startGroundTask(x, z, digSeconds(contents === 'empty' ? 3 : 4.5), 'bush', () => {
    treasure.setDigPreview(x, z, false);
    if (contents === 'chest') save.inventory.treasureChest -= 1;
    if (contents === 'decoy') save.inventory.decoyChest -= 1;
    treasure.addCache({ id: `cache-${Math.round(save.worldTime * 10)}`, x, z, contents, buriedAt: save.worldTime });
    hud.showToast(contents === 'chest' ? '👑 Treasure buried – cover your tracks!' : contents === 'decoy' ? '📦 Decoy buried' : 'Fake hole dug');
    refreshInventoryViews();
    persist();
  });
}

function digUpCache(cache) {
  if (!hasTool(save, 'diggingStick')) {
    hud.showToast('Craft a digging stick first');
    return;
  }
  startGroundTask(cache.x, cache.z, digSeconds(3), 'bush', () => {
    if (cache.contents === 'chest') addToInventory('treasureChest', 1);
    if (cache.contents === 'decoy') addToInventory('decoyChest', 1);
    treasure.removeCache(cache);
    hud.showToast(cache.contents === 'chest' ? '👑 Dug up the treasure' : cache.contents === 'decoy' ? '📦 Dug up the decoy' : 'Filled the hole');
    refreshInventoryViews();
    persist();
  });
}

let navy = null;
function ensureNavy() {
  if (!navy) navy = createNavy(scene, ground, walkGrid, { tracks, treasure, wildlife, landingPointFor: coastPointFrom, seaPointFor: launchPointFrom, tunnelEntrances: () => tunnels.visibleEntrances() });
  return navy;
}

function navyContext() {
  const onFoot = mode === 'onFoot';
  return {
    playerX: onFoot ? character.state.x : null,
    playerZ: character.state.z,
    playerCarriesChest: onFoot && (save.inventory.treasureChest ?? 0) > 0,
    slowdown: crabSlowdown(),
  };
}

function crabSlowdown() {
  return crabs.migrationActive() ? 0.45 : 1;
}

const navyCallbacks = {
  onLanded: () => hud.showToast('⚓ The navy has landed – watch the red circle!'),
  onSpotted: () => hud.showToast('👀 A marine spotted you – they search closer!'),
  onTrapped: () => hud.showToast('🕳️ A marine fell into your trap!'),
  onEmptyHole: () => hud.showToast('Marines dug up an empty hole'),
  onChestTaken: () => {
    save.inventory.treasureChest = 0;
  },
  searchTunnel: () => {
    if (mode === 'underground' && (save.inventory.treasureChest ?? 0) > 0) {
      save.inventory.treasureChest = 0;
      return 'chest';
    }
    const hidden = treasure.caches.find((cache) => cache.underground && cache.contents !== 'empty');
    if (!hidden) return null;
    treasure.removeCache(hidden);
    return hidden.contents;
  },
  onFinished: (found) => {
    save.navy.found = found ?? 'nothing';
    hud.showToast(found === 'chest' ? '💀 The navy found your treasure!' : found === 'decoy' ? '📦 They took the decoy – the real chest is safe!' : 'The marines give up and head back');
    refreshInventoryViews();
    persist();
  },
  onDeparted: () => {
    save.navy.state = 'gone';
    hud.showToast('⚓ The navy has sailed away');
    refreshInventoryViews();
    persist();
  },
};

function updateNavy(deltaTime) {
  if (save.navy.state === 'coming' && save.worldTime >= NAVY_ARRIVAL_TIME) {
    save.navy.state = 'landed';
    ensureNavy().land(navyContext());
    hud.showToast('⚓ A navy longboat is coming ashore!');
    persist();
  }
  if (navy && save.navy.state === 'landed') navy.update(deltaTime, simulationTime, navyContext(), navyCallbacks);
  if (save.navy.state === 'coming') hud.setNavy(`⚓ Navy lands in ${navyCountdownText()}`, `⚓ ${navyCountdownText()}`);
  else if (save.navy.state === 'landed') {
    const remaining = navy?.remainingSearchSeconds();
    const inside = mode === 'onFoot' && navy?.contains(character.state.x, character.state.z);
    const clock = remaining === null || remaining === undefined ? null : `${Math.floor(remaining / 60)}:${Math.floor(remaining % 60).toString().padStart(2, '0')}`;
    hud.setNavy(clock ? `⚓ Searching ${clock}${inside ? ' · inside!' : ''}` : '⚓ Navy ashore', clock ? `⚓ ${inside ? 'inside! ' : '🔍 '}${clock}` : '⚓ ashore');
  } else hud.setNavy(null);
}

function coverDigPatch(cache) {
  if ((save.inventory.fronds ?? 0) < 2) return;
  startGroundTask(cache.x, cache.z, 2, 'bush', () => {
    save.inventory.fronds -= 2;
    treasure.coverPatch(cache);
    tracks.eraseWithin(cache.x, cache.z, 6);
    hud.showToast('🌿 Patch hidden and tracks brushed away');
    refreshInventoryViews();
    persist();
  });
}

function updateCrabs(deltaTime) {
  const onFoot = mode === 'onFoot';
  const playerX = onFoot ? character.state.x : null;
  const events = crabs.update(deltaTime, simulationTime, save.worldTime, playerX, character.state.z, character.state.heading, (save.inventory.coconut ?? 0) > 0);
  for (const loot of events.stashed) {
    save.collectedItemIds.push(loot.id);
    if (playerX !== null && Math.hypot(loot.x - playerX, loot.z - character.state.z) < 70) hud.showToast('🦀 A hermit crab hid a coin pouch in its burrow!');
    persist();
  }
  if (events.grabbed.length && playerX !== null && events.grabbed.some((loot) => Math.hypot(loot.x - playerX, loot.z - character.state.z) < 70)) hud.showToast('🦀 Thief! A crab grabbed a coin pouch – catch it!');
  if (events.migrationStarted) hud.showToast('🦀 Crab migration! Beach tracks are being trampled');
  if (onFoot) {
    for (const thief of crabs.thieves) {
      if (thief.carrying && Math.hypot(thief.x - playerX, thief.z - character.state.z) < 2.6) {
        crabs.scareThief(thief);
        hud.showToast('🦀 The crab dropped the pouch!');
      }
    }
  }
  const untilMigration = crabs.secondsToMigration(save.worldTime);
  if (mode === 'underground') hud.setCrabs(null);
  else if (crabs.migrationActive()) hud.setCrabs('🦀 Crab migration!', '🦀 migration');
  else if (untilMigration < 45) hud.setCrabs(`🦀 Crabs coming ${Math.ceil(untilMigration)}s`, `🦀 ${Math.ceil(untilMigration)}s`);
  else hud.setCrabs(null);
}

function interactWithCrab({ kind, crab }) {
  if (kind === 'thief') {
    if (crab.carrying) {
      character.setPath(walkGrid.findPath(character.state.x, character.state.z, crab.x, crab.z));
      hud.showToast('Catch the crab to get the pouch back!');
    } else {
      crabs.scareThief(crab);
      hud.showToast('🦀 A hermit crab – it steals coin pouches');
    }
    return;
  }
  if ((save.inventory.coconut ?? 0) < 1) {
    hud.showToast('🦀 A digger crab – it looks hungry for a coconut');
    return;
  }
  crab.target = null;
  crab.wanderTimer = 12;
  const feedSpot = nearestWalkablePoint(crab.x, crab.z) ?? { x: crab.x, z: crab.z };
  startGroundTask(feedSpot.x, feedSpot.z, 1.2, 'bush', () => {
    if (!crabs.befriend(crab)) {
      hud.showToast('You already have three crab friends');
      return;
    }
    save.inventory.coconut -= 1;
    hud.showToast('🦀 A digger crab joined you! Faster digging, sweeps tracks');
    refreshInventoryViews();
    persist();
  });
}

function digUpBurrow(burrow) {
  if (!hasTool(save, 'diggingStick')) {
    hud.showToast('Craft a digging stick to dig out the burrow');
    return;
  }
  startGroundTask(burrow.x, burrow.z, digSeconds(2.5), 'bush', () => {
    const gold = crabs.emptyBurrow(burrow);
    save.gold += gold;
    hud.showToast(`🦀 Dug out the burrow: +${gold} gold`);
    refreshInventoryViews();
    persist();
  });
}

function tapUnderground() {
  interactedInMode.underground = true;
  character.setWorkPose(null, 0);
  const cache = treasure.cacheUnderRay(raycaster.ray, true);
  if (cache) {
    tunnels.walkTo(cache.x, cache.z, character);
    tunnels.startWork(digSeconds(2.5), () => {
      if (cache.contents === 'chest') addToInventory('treasureChest', 1);
      if (cache.contents === 'decoy') addToInventory('decoyChest', 1);
      treasure.removeCache(cache);
      hud.showToast(cache.contents === 'chest' ? '👑 Dug up the treasure' : '📦 Dug up the decoy');
      refreshInventoryViews();
      persist();
    });
    return;
  }
  const result = tunnels.tap(raycaster.ray, character);
  if (result.kind === 'bedrock') hud.showToast('Solid bedrock – too hard to dig');
  if (result.kind === 'unreachable') hud.showToast('Dig next to an open tunnel');
}

function digTunnelEntrance() {
  if (tunnels.exists()) return;
  const characterState = character.state;
  const x = characterState.x + Math.sin(characterState.heading) * 1.4;
  const z = characterState.z + Math.cos(characterState.heading) * 1.4;
  if (ground.heightAt(x, z) < 1.8) {
    hud.showToast('Too close to the sea – the tunnel would flood');
    return;
  }
  const problem = canDigAt(x, z);
  if (problem) {
    hud.showToast(problem);
    return;
  }
  hud.closeMenus();
  treasure.setDigPreview(x, z, true);
  startGroundTask(x, z, digSeconds(6), 'tree', () => {
    treasure.setDigPreview(x, z, false);
    tunnels.create(x, z);
    hud.showToast('⛏️ Tunnel dug! Climb in to dig deeper');
    persist();
  });
}

function toggleEntranceCover() {
  const tunnelState = tunnels.state;
  if (tunnelState.covered) {
    tunnels.setCovered(false);
    hud.showToast('Fronds pulled off the entrance');
    persist();
    return;
  }
  if ((save.inventory.fronds ?? 0) < 2) {
    hud.showToast('Hiding the entrance needs 2 palm fronds');
    return;
  }
  startGroundTask(tunnelState.x, tunnelState.z, 1.5, 'bush', () => {
    save.inventory.fronds -= 2;
    tunnels.setCovered(true);
    tracks.eraseWithin(tunnelState.x, tunnelState.z, 5);
    hud.showToast('🌿 Entrance hidden');
    refreshInventoryViews();
    persist();
  });
}

function enterTunnel() {
  const tunnelState = tunnels.state;
  cancelGroundTask();
  character.place(tunnelState.x, tunnelState.z + 0.3, 0);
  enterMode('underground');
  hud.showToast('⛏️ Tap rock walls to dig');
  persist();
}

function climbOutOfTunnel() {
  const tunnelState = tunnels.state;
  const exit = nearestWalkablePoint(tunnelState.x + 1.8, tunnelState.z + 1.8) ?? { x: tunnelState.x + 1.8, z: tunnelState.z + 1.8 };
  character.place(exit.x, exit.z, 0);
  enterMode('onFoot');
  if (!tunnelState.covered) hud.showToast('Tip: tap the entrance to hide it with fronds');
  persist();
}

function buryUnderground(contents) {
  const spot = tunnels.cellCenterAt(character.state.x, character.state.z);
  if (!spot || spot.isEntrance) {
    hud.showToast('Dig a side tunnel first – not under the ladder');
    return;
  }
  if (treasure.caches.some((cache) => cache.underground && Math.hypot(cache.x - spot.x, cache.z - spot.z) < 1)) {
    hud.showToast('Something is already buried here');
    return;
  }
  hud.closeMenus();
  character.setPath([{ x: spot.x, z: spot.z }]);
  tunnels.startWork(digSeconds(3), () => {
    if (contents === 'chest') save.inventory.treasureChest -= 1;
    if (contents === 'decoy') save.inventory.decoyChest -= 1;
    treasure.addCache({ id: `cache-${Math.round(save.worldTime * 10)}`, x: spot.x, z: spot.z, contents, buriedAt: save.worldTime, underground: true, floorY: TUNNEL_FLOOR_Y });
    hud.showToast(contents === 'chest' ? '👑 Treasure buried in the tunnel' : '📦 Decoy buried in the tunnel');
    refreshInventoryViews();
    persist();
  });
}

function bagActionsFor(type) {
  if (mode === 'underground') return type === 'treasureChest' || type === 'decoyChest' ? [{ id: 'buryUnderground', label: 'Bury here' }] : [];
  if (mode !== 'onFoot') return [];
  if (type === 'pickaxe') return tunnels.exists() ? [] : [{ id: 'tunnel', label: 'Dig tunnel here' }];
  if (type === 'treasureChest' || type === 'decoyChest') return [{ id: 'bury', label: 'Bury here' }];
  if (type === 'diggingStick') return [{ id: 'fakeHole', label: 'Dig fake hole' }];
  return [];
}

hud.onBagAction((type, action) => {
  if (action === 'bury') buryHere(type === 'treasureChest' ? 'chest' : 'decoy');
  if (action === 'fakeHole') buryHere('empty');
  if (action === 'tunnel') digTunnelEntrance();
  if (action === 'buryUnderground') buryUnderground(type === 'treasureChest' ? 'chest' : 'decoy');
}, bagActionsFor);

const guideTarget = new THREE.Vector3();
function updateGuideArrow() {
  const hunting = mode === 'onFoot' && hasTool(save, 'axe') && save.stats.hidesGathered < 2;
  const nearestBoar = hunting ? wildlife.boars
    .filter((boar) => boar.state !== 'gone' && boar.state !== 'trapped')
    .reduce((best, boar) => {
      const distance = Math.hypot(boar.x - character.state.x, boar.z - character.state.z);
      return !best || distance < best.distance ? { boar, distance } : best;
    }, null) : null;
  const nearestMarine = mode === 'onFoot' && save.navy.state === 'landed' && navy ? navy.marines
    .filter((marine) => marine.state !== 'gone' && marine.state !== 'boat')
    .reduce((best, marine) => {
      const distance = Math.hypot(marine.body.state.x - character.state.x, marine.body.state.z - character.state.z);
      return !best || distance < best.distance ? { marine, distance } : best;
    }, null) : null;
  if (nearestMarine) hud.setGuideArrow(offScreenAngle(nearestMarine.marine.body.state.x, nearestMarine.marine.body.state.z), '💂', nearestMarine.distance, true);
  else hud.setGuideArrow(nearestBoar ? offScreenAngle(nearestBoar.boar.x, nearestBoar.boar.z) : null, '🐗', nearestBoar?.distance ?? null);
  const partsReady = !save.raftBuilt && missingRaftParts(save).length === 0;
  hud.setSloopArrow(mode === 'onFoot' && partsReady ? offScreenAngle(raftSite.x, raftSite.z) : null);
}

function offScreenAngle(x, z) {
  guideTarget.set(x, ground.heightAt(x, z), z).project(camera);
  const inFront = guideTarget.z < 1;
  const underHudChips = guideTarget.x > 0.6 && guideTarget.y > -0.2;
  const onScreen = inFront && !underHudChips && Math.abs(guideTarget.x) < 0.85 && guideTarget.y < 0.8 && guideTarget.y > -0.6;
  if (onScreen) return null;
  const sign = inFront ? 1 : -1;
  return Math.atan2(guideTarget.y * sign * innerHeight, guideTarget.x * sign * innerWidth);
}

function addToInventory(type, amount) {
  save.inventory[type] = (save.inventory[type] ?? 0) + amount;
}

function collectItem(item) {
  const itemType = ITEM_TYPES[item.type];
  if (itemType.gold) {
    save.gold += itemType.gold;
    hud.showToast(`+${itemType.gold} gold`);
  } else {
    addToInventory(item.type, 1);
    hud.showToast(`+1 ${itemType.icon} ${itemType.name}`);
  }
  save.collectedItemIds.push(item.id);
  refreshInventoryViews();
  persist();
}

function onHarvested(node, yields) {
  for (const { type, amount } of yields) addToInventory(type, amount);
  save.harvestedIds.push(node.id);
  hud.showToast(yields.map(({ type, amount }) => `+${amount} ${ITEM_TYPES[type].icon}`).join('  '));
  refreshInventoryViews();
  persist();
}

function refreshInventoryViews() {
  hud.setInventory(save.gold, save.inventory);
  hud.setRecipes(recipeViews(save));
  character.setHasAxe(hasTool(save, 'axe'));
  updateObjective();
}

hud.onCraft((recipeId) => {
  const recipe = RECIPES.find((candidate) => candidate.id === recipeId);
  if (!recipe || !canAfford(save, recipe.cost) || (recipe.requires && !hasTool(save, recipe.requires))) return;
  if (recipe.placeable) {
    trapPlacement.active = true;
    hud.closeMenus();
    hud.showToast('Tap the ground where to dig the trap');
    return;
  }
  spend(save, recipe.cost);
  addToInventory(recipe.id, 1);
  hud.showToast(`Crafted ${ITEM_TYPES[recipe.id].icon} ${ITEM_TYPES[recipe.id].name}`);
  refreshInventoryViews();
  persist();
});

hud.onEat((type) => {
  const food = ITEM_TYPES[type]?.food;
  if (!food || (save.inventory[type] ?? 0) <= 0) return;
  save.inventory[type] -= 1;
  save.hunger = Math.min(100, save.hunger + food);
  hud.showToast(`Ate ${ITEM_TYPES[type].icon} ${ITEM_TYPES[type].name}`);
  refreshInventoryViews();
  persist();
});

const trapPlacement = { active: false };
const groundTask = { active: false, x: 0, z: 0, reach: 2.2, seconds: 0, progress: 0, pose: 'bush', working: false, onDone: null };

function startGroundTask(x, z, seconds, pose, onDone) {
  const characterState = character.state;
  Object.assign(groundTask, { active: true, x, z, seconds, pose, onDone, progress: 0, working: false });
  let standX = x;
  let standZ = z;
  const distance = Math.hypot(characterState.x - x, characterState.z - z) || 1;
  if (distance > 1.6) {
    standX = x + ((characterState.x - x) / distance) * 1.6;
    standZ = z + ((characterState.z - z) / distance) * 1.6;
  }
  character.setPath(walkGrid.findPath(characterState.x, characterState.z, standX, standZ));
}

function cancelGroundTask() {
  if (groundTask.active) character.setWorkPose(null, 0);
  groundTask.active = false;
}

function updateGroundTask(deltaTime) {
  if (!groundTask.active) return;
  const characterState = character.state;
  const walking = characterState.pathIndex < characterState.path.length;
  if (walking) return;
  if (Math.hypot(characterState.x - groundTask.x, characterState.z - groundTask.z) > groundTask.reach + 0.8) {
    groundTask.active = false;
    hud.showToast("Can't reach that");
    return;
  }
  characterState.heading = Math.atan2(groundTask.x - characterState.x, groundTask.z - characterState.z);
  groundTask.progress += deltaTime / groundTask.seconds;
  character.setWorkPose(groundTask.pose, (groundTask.progress * groundTask.seconds * 1.4) % 1);
  if (groundTask.progress >= 1) {
    groundTask.active = false;
    character.setWorkPose(null, 0);
    groundTask.onDone();
  }
}

function digTrapAt(x, z) {
  const tooCloseToItem = items.items.some((item) => !item.collected && Math.hypot(item.x - x, item.z - z) < 3);
  if (!walkGrid.isPointWalkable(x, z) || ground.heightAt(x, z) < 0.6 || tooCloseToItem) {
    hud.showToast("Can't dig here");
    return;
  }
  trapPlacement.active = false;
  startGroundTask(x, z, 3.5, 'bush', () => {
    const recipe = RECIPES.find((candidate) => candidate.id === 'pitTrap');
    if (!canAfford(save, recipe.cost)) {
      hud.showToast('Not enough palm fronds');
      return;
    }
    spend(save, recipe.cost);
    wildlife.addTrap(x, z);
    save.stats.trapsDug += 1;
    hud.showToast('🕳️ Trap ready – lure a boar into it');
    refreshInventoryViews();
    persist();
  });
}

function interactWithTrap(trap) {
  if (trap.state === 'caught') {
    startGroundTask(trap.x, trap.z, 1.6, 'bush', () => {
      wildlife.butcher(trap);
      addToInventory('hide', 1);
      addToInventory('meat', 2);
      save.stats.hidesGathered += 1;
      hud.showToast('+1 🐗 hide  +2 🍖');
      refreshInventoryViews();
      persist();
    });
  } else if (trap.state === 'open') {
    if ((save.inventory.fronds ?? 0) < REARM_FRONDS) {
      hud.showToast(`Need ${REARM_FRONDS} 🌴 palm fronds to cover the pit`);
      return;
    }
    startGroundTask(trap.x, trap.z, 1.2, 'bush', () => {
      spend(save, { fronds: REARM_FRONDS });
      wildlife.rearm(trap);
      hud.showToast('Trap covered again');
      refreshInventoryViews();
      persist();
    });
  }
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
  if (mode === 'underground') {
    if (isNewTouch) tapUnderground();
    return;
  }
  let targetX;
  let targetZ;
  if (!isNewTouch && (harvesting.isBusy() || groundTask.active)) return;
  const tappedItem = items.itemUnderRay(raycaster.ray);
  const tappedCrab = tappedItem ? null : crabs.crabUnderRay(raycaster.ray);
  const tappedBurrow = tappedItem || tappedCrab ? null : crabs.burrowUnderRay(raycaster.ray);
  const tappedCache = tappedItem || tappedCrab || tappedBurrow ? null : treasure.cacheUnderRay(raycaster.ray);
  const tappedTrap = tappedItem || tappedCache ? null : wildlife.trapUnderRay(raycaster.ray);
  const tappedNode = tappedItem || tappedTrap || tappedCache ? null : harvesting.nodeUnderRay(raycaster.ray);
  harvesting.cancel();
  cancelGroundTask();
  character.setWorkPose(null, 0);
  if (isNewTouch && trapPlacement.active) {
    const hits = raycaster.intersectObject(detailTerrain.frontMesh(), false);
    if (hits.length > 0) digTrapAt(hits[0].point.x, hits[0].point.z);
    interactedInMode.onFoot = true;
    return;
  }
  if (isNewTouch && !tappedItem && !tappedCrab && tunnels.entranceUnderRay(raycaster.ray)) {
    toggleEntranceCover();
    interactedInMode.onFoot = true;
    return;
  }
  if (tappedCrab && isNewTouch) {
    interactWithCrab(tappedCrab);
    interactedInMode.onFoot = true;
    return;
  }
  if (tappedBurrow && isNewTouch) {
    digUpBurrow(tappedBurrow);
    interactedInMode.onFoot = true;
    return;
  }
  if (tappedCache && isNewTouch) {
    digUpCache(tappedCache);
    interactedInMode.onFoot = true;
    return;
  }
  if (tappedTrap && isNewTouch) {
    interactWithTrap(tappedTrap);
    interactedInMode.onFoot = true;
    return;
  }
  if (tappedNode && isNewTouch) {
    if (tappedNode.kind === 'tree' && !hasTool(save, 'axe')) {
      hud.showToast('Craft a stone axe first (🔨 Craft)');
      return;
    }
    const characterState = character.state;
    const standPoint = harvesting.approachPoint(tappedNode, characterState.x, characterState.z);
    walkTarget.x = standPoint.x;
    walkTarget.z = standPoint.z;
    walkTarget.active = true;
    character.setPath(walkGrid.findPath(characterState.x, characterState.z, standPoint.x, standPoint.z));
    harvesting.begin(tappedNode);
    interactedInMode.onFoot = true;
    return;
  }
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
    focusY = mode === 'underground' ? TUNNEL_FLOOR_Y + 1.5 : Math.max(0, ground.heightAt(state.x, state.z)) + 1.5;
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
  scene.fog.near = mode === 'underground' ? cameraDistance * 1.2 : fogNear;
  scene.fog.far = mode === 'underground' ? cameraDistance * 2.8 : fogFar;
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
const footprintState = { distance: 0, side: 1, lastX: 0, lastZ: 0, initialized: false };

function leaveFootprints() {
  const characterState = character.state;
  if (!footprintState.initialized) {
    Object.assign(footprintState, { lastX: characterState.x, lastZ: characterState.z, initialized: true });
    return;
  }
  footprintState.distance += Math.hypot(characterState.x - footprintState.lastX, characterState.z - footprintState.lastZ);
  footprintState.lastX = characterState.x;
  footprintState.lastZ = characterState.z;
  if (footprintState.distance < 0.75) return;
  footprintState.distance = 0;
  footprintState.side = -footprintState.side;
  const heading = characterState.heading;
  tracks.add(characterState.x + Math.cos(heading) * 0.2 * footprintState.side, characterState.z - Math.sin(heading) * 0.2 * footprintState.side, heading, 'player');
}
let previousFrameTime = performance.now();
let autosaveTimer = AUTOSAVE_INTERVAL_SECONDS;
const FIXED_STEP = 1 / 60;

function simulate(deltaTime) {
  simulationTime += deltaTime;
  save.worldTime += deltaTime;
  setTideTime(save.worldTime);
  tracks.update(deltaTime);
  applyKeyboardSteering();
  const state = shipController.state;
  if (!save.raftBuilt) {
    placeRaftAtSite(0);
  } else if (launch.active) {
    launch.progress = Math.min(1, launch.progress + deltaTime / LAUNCH_SECONDS);
    placeRaftAtSite(launch.progress);
    if (launch.progress >= 1) {
      launch.active = false;
      shipController.place(raftLaunchPoint.x, raftLaunchPoint.z, raftSite.heading, 0);
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
    leaveFootprints(deltaTime);
    if (harvesting.update(deltaTime, character, onHarvested) === 'unreachable') hud.showToast("Can't reach that");
    updateGroundTask(deltaTime);
    detailTerrain.update(character.state.x, character.state.z);
  }
  if (mode === 'underground') {
    character.update(deltaTime, tunnelGround);
    const result = tunnels.update(deltaTime, simulationTime, character, digSeconds(1));
    if (result?.dugCell && tunnels.dugCount() % 3 === 0) {
      addToInventory('stone', 1);
      hud.showToast('+1 🪨 Stone');
      refreshInventoryViews();
    }
    if (result?.dugCell) persist();
  }
  items.update(deltaTime, simulationTime, onFoot ? character.state.x : null, character.state.z, collectItem, (type) => ITEM_TYPES[type].category === 'resource');
  wildlife.update(deltaTime, simulationTime, onFoot ? character.state.x : null, character.state.z);
  treasure.update(deltaTime, save.worldTime, onFoot || mode === 'underground' ? character.state.x : null, character.state.z);
  updateNavy(deltaTime);
  updateCrabs(deltaTime);
  save.hunger = Math.max(0, save.hunger - HUNGER_DRAIN_PER_SECOND * deltaTime);
  updateContextAction(deltaTime);

  autosaveTimer -= deltaTime;
  if (autosaveTimer <= 0) {
    autosaveTimer = AUTOSAVE_INTERVAL_SECONDS;
    persist();
  }
}

let paused = false;

function setPaused(value) {
  if (paused === value) return;
  paused = value;
  hud.setPaused(paused);
  if (paused) persist();
}

hud.onPause(setPaused);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !isScreenshotMode) setPaused(true);
});

function renderFrame(now) {
  const deltaTime = Math.min(0.05, (now - previousFrameTime) / 1000);
  previousFrameTime = now;
  if (!paused) simulate(deltaTime);
  updateCamera(deltaTime, false);
  updateTargetMarker(simulationTime);
  updatePlayerDisc();
  renderer.render(scene, camera);
  updateHud();
  updateGuideArrow();
  updateRaftSiteMarker(simulationTime);
  hud.setHunger(save.hunger);
  hud.setTide(tideStatus());
  performanceMonitor.recordFrame(now);
}

addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});

refreshInventoryViews();
enterMode(mode);

if (isScreenshotMode) {
  hud.setVisible(searchParameters.has('hud'));
  performanceMonitor.setVisible(false);
  if (startPose.nearPasture) {
    save.inventory.axe = 1;
    refreshInventoryViews();
  }
  if (startPose.trappedBoar) {
    const trapSpot = nearestWalkablePoint(character.state.x + 6, character.state.z - 3);
    const trap = wildlife.addTrap(trapSpot.x, trapSpot.z);
    const boar = wildlife.boars[0];
    Object.assign(boar, { x: trap.x + 0.5, z: trap.z, state: 'wander', idle: 5 });
    wildlife.update(FIXED_STEP, 0, null, 0);
    save.inventory = { stone: 1, wood: 3, fronds: 2, fiber: 2, axe: 1, diggingStick: 1, coconut: 1 };
    refreshInventoryViews();
  }
  if (startPose.chopNearestTree) {
    save.inventory.axe = 1;
    const tree = vegetation.harvestables.filter((node) => node.kind === 'tree').reduce((best, node) => {
      const distance = Math.hypot(node.x - character.state.x, node.z - character.state.z);
      return !best || distance < best.distance ? { node, distance } : best;
    }, null).node;
    const standPoint = harvesting.approachPoint(tree, tree.x - 4, tree.z + 4);
    character.place(standPoint.x, standPoint.z);
    harvesting.begin(tree);
    refreshInventoryViews();
    for (let i = 0; i < 70; i++) simulate(FIXED_STEP);
  }
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
  updatePlayerDisc();
  renderer.render(scene, camera);
  updateHud();
  updateGuideArrow();
  updateRaftSiteMarker(simulationTime);
  hud.setHunger(save.hunger);
  hud.setTide(tideStatus());
  renderer.render(scene, camera);
  window.__frameReady = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
} else {
  updateCamera(0, true);
  renderer.setAnimationLoop((now) => {
    if (!performanceMonitor.shouldRender(now)) return;
    renderFrame(now);
  });
}

window.__debug = { setPaused, isPaused: () => paused, performanceMonitor, raycaster, tunnels, tapUnderground, digTunnelEntrance, enterTunnel, climbOutOfTunnel, buryUnderground, toggleEntranceCover, crabs, interactWithCrab, digUpBurrow, coverDigPatch, getNavy: () => navy, ensureNavy, treasure, buryHere, digUpCache, tracks, tide, wildlife, groundTask, trapPlacement, digTrapAt, interactWithTrap, harvesting, vegetation, tryBuildRaft, raftSite, launch, boardShip, shipController, heightmap, ground, renderer, scene, camera, dolphins, simulate, character, walkGrid, items, save, enterMode, getMode: () => mode };
