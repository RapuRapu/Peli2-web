import * as THREE from 'three';
import { createPerformanceMonitor } from '../performance.js';
import { QUALITY_LEVELS, chosenQualityName, storeQualityName } from './quality.js';
import { seaUniforms, SEA_COMMON_GLSL, lighting } from './seaside.js';
import { createNoiseTexture, createWaveGradientTexture } from './textures.js';
import { createWorld, TIDE_MIDDLE, TIDE_AMPLITUDE, TIDE_PERIOD_SECONDS } from './world.js';
import { createPipeline } from './pipeline.js';
import { createWater } from './water.js';
import { createProps } from './props.js';
import { createLife } from './life.js';
import { createHermit } from './hermit.js';
import { createNavigation } from './navigation.js';
import { createResources, RESOURCE_TYPES } from './resources.js';
import { createHud } from './hud.js';
import { createTracks } from './tracks.js';
import { createRipples } from './ripples.js';
import { createGear, SHELLS, CLAWS } from './gear.js';
import { createWorkbenchModel, createWorkbenchPanel, WORKSHOP_REACH, WORKSHOP_BLOCK_RADIUS } from './workbench.js';

const searchParameters = new URLSearchParams(location.search);
const screenshotPose = searchParameters.has('pose') ? Number(searchParameters.get('pose')) : null;
const isScreenshotMode = screenshotPose !== null;
const qualityName = chosenQualityName(searchParameters);
const quality = QUALITY_LEVELS[qualityName];

const SAVE_KEY = 'seaofcrabs-crab-save';
const SAVE_VERSION = 2;
const AUTOSAVE_INTERVAL_SECONDS = 5;
const FIXED_STEP = 1 / 60;
const CAMERA_YAW = 0.3;
const CAMERA_PITCH = 0.74;
const CAMERA_DISTANCE_LIMITS = [13, 85];
const LANDSCAPE_FIELD_OF_VIEW = 28;
const MINIMUM_HORIZONTAL_FIELD_OF_VIEW = 25;
const WALK_SPEED = 7.2;
const WADE_SPEED = 5.2;
const TURN_RATE = 9;
const GATHER_REACH = 1.7;
const PICK_RADIUS_PIXELS = 46;
const STARTING_TIDE_TIME = TIDE_PERIOD_SECONDS * 0.56;
const WET_SAND_DRYING_RATE = 0.006;
const HOME_SPOT = { x: 13, z: -21 };
const WORKSHOP_SPOT = { x: 18, z: -17 };
const WORKSHOP_PICK_RADIUS_PIXELS = 70;
const FIRST_GOAL = { shellBits: 5, driftwood: 3, seaLettuce: 3 };
const STARTER_SPOTS = { shellBits: { x: 11, z: -26.5 }, driftwood: { x: 17.5, z: -23 }, seaLettuce: { x: 12, z: -14 } };
const FAR_ZOOM_RING_DISTANCES = [46, 66];
const STARTING_HEADING = 2.3;
const BODY_WET_MINIMUM_DEPTH = 0.04;
const BODY_WET_MAXIMUM_HEIGHT_PER_SIZE = 2.0;
const BODY_DRYING_SECONDS = 30;

const POSES = {
  1: { x: HOME_SPOT.x, z: HOME_SPOT.z, distance: 32, tideShare: 0.56 },
  2: { x: 36, z: 46, distance: 36, tideShare: 0.5, heading: 0.2 },
  3: { x: 12, z: 4, distance: 22, tideShare: 0.75, heading: 0.9 },
  4: { x: 2, z: -24, distance: 40, tideShare: 0.25, heading: 0.2 },
  5: { x: -30, z: -78, distance: 30, tideShare: 0.5, heading: 3.4 },
  6: { x: HOME_SPOT.x, z: HOME_SPOT.z, distance: 13, tideShare: 0.56, heading: 2.6 },
  7: { x: -30, z: 40, distance: 36, tideShare: 0.75, heading: 0.3 },
  8: { x: HOME_SPOT.x, z: HOME_SPOT.z, distance: 32, tideShare: 0.75 },
  9: { x: 10, z: -6, distance: 85, tideShare: 0.6 },
  10: { x: 21, z: -29, distance: 24, tideShare: 0.56, heading: 0.2 },
  11: { x: 12, z: -8, distance: 14, tideShare: 0.56, walkFrom: { x: -1, z: -8 }, walkSeconds: 1.6 },
  12: { x: 13, z: -17, distance: 13, tideShare: 0.56, walkFrom: { x: 4, z: -7 }, walkSeconds: 1.8, heading: 1.3 },
  13: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true },
  14: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Craft', inventory: { shellBits: 12, driftwood: 3, seaLettuce: 5 } },
  15: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, shell: 'snail' },
  16: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, shell: 'turban' },
  17: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, shell: 'cone' },
  18: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Shells', crafted: ['turban', 'cone'] },
  19: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Craft', inventory: { shellBits: 12, driftwood: 3, seaLettuce: 5 } },
};

function createEmptySave() {
  return { version: SAVE_VERSION, x: HOME_SPOT.x, z: HOME_SPOT.z, heading: STARTING_HEADING, worldTime: STARTING_TIDE_TIME, inventory: {}, nodes: null, goalAnnounced: false, hasMoved: false, wetness: 0, wetHeight: 0, gear: null, workshopBuilt: false };
}

function loadSave() {
  if (isScreenshotMode) return createEmptySave();
  try {
    const stored = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (stored && stored.version === SAVE_VERSION) return { ...createEmptySave(), ...stored };
    if (stored && stored.version === 1) return { ...createEmptySave(), ...stored, version: SAVE_VERSION };
  } catch {
    /* unreadable or blocked storage: start a new game */
  }
  return createEmptySave();
}

const save = loadSave();

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: isScreenshotMode });
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
document.body.appendChild(renderer.domElement);
const canvas = renderer.domElement;

seaUniforms.uNoise.value = createNoiseTexture();
const world = createWorld(quality);
seaUniforms.uRetained.value = world.retained.texture;

const scene = new THREE.Scene();
scene.background = lighting.hazeColor;
scene.fog = new THREE.FogExp2(lighting.hazeColor, lighting.hazeDensity);

function buildSkyEnvironment() {
  const skyScene = new THREE.Scene();
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: seaUniforms,
    side: THREE.BackSide,
    vertexShader: /* glsl */ `varying vec3 vDirection; void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `${SEA_COMMON_GLSL}
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        vec3 color = skyColor(direction);
        vec3 groundBounce = vec3(0.42, 0.34, 0.24);
        color = mix(color, groundBounce, 1.0 - smoothstep(-0.25, 0.02, direction.y));
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial));
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(skyScene, 0.03).texture;
  generator.dispose();
  return environment;
}
scene.environment = buildSkyEnvironment();
scene.environmentIntensity = 0.55;

const sun = new THREE.DirectionalLight(lighting.sunColor, 4.2);
sun.castShadow = true;
sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
sun.shadow.bias = -0.00004;
sun.shadow.normalBias = 0.012;
sun.shadow.camera.near = 60;
sun.shadow.camera.far = 330;
scene.add(sun, sun.target);

scene.add(world.terrainMesh);
createProps(scene, world, quality);
createLife(scene, world, quality);

const pipeline = createPipeline(renderer, quality);
const water = createWater(createWaveGradientTexture(), pipeline.overlayUniforms, quality.rippleCapacity);
pipeline.overlayScene.add(water.mesh);

const navigation = createNavigation(world);
const gear = createGear(save.gear);
const hermit = createHermit(scene, quality, SHELLS[gear.wornShell().kind].look);
const resources = createResources(scene, { scene: pipeline.overlayScene, uniforms: pipeline.overlayUniforms }, world, quality, save.nodes, STARTER_SPOTS);
const hud = createHud(qualityName);
const tracks = createTracks(scene, world);
const ripples = createRipples(water.uniforms);
const workshop = createWorkbenchModel(scene, world, quality, WORKSHOP_SPOT, hud.root);
const workbenchPanel = createWorkbenchPanel(hud.root, {
  gear,
  inventory: () => save.inventory,
  onCraft: craftItem,
  onWear: wearItem,
  onClose: () => workbenchPanel.close(),
});

const destinationMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.55, 0.78, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.0, 1.5), transparent: true, opacity: 0.8, depthWrite: false, fog: false }),
);
destinationMarker.visible = false;
scene.add(destinationMarker);

const playerRing = new THREE.Mesh(
  new THREE.RingGeometry(1.5, 1.85, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 2.6), transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }),
);
playerRing.renderOrder = 5;
scene.add(playerRing);

const camera = new THREE.PerspectiveCamera(LANDSCAPE_FIELD_OF_VIEW, 1, 1.5, 1600);
const cameraFocus = new THREE.Vector3();
let cameraDistance = 32;

const player = { x: save.x, z: save.z, y: 0, heading: save.heading, speed: 0, path: [], pathIndex: 0, gatherTarget: null, gatherProgress: 0, headingToWorkshop: false, groundNormal: new THREE.Vector3(0, 1, 0), size: 1, waterDepth: 0, wetness: save.wetness, wetHeight: save.wetHeight };
const startPoint = navigation.nearestWalkable(player.x, player.z, 40) || HOME_SPOT;
player.x = startPoint.x;
player.z = startPoint.z;

const tideState = { seaLevel: TIDE_MIDDLE, wetLevel: TIDE_MIDDLE + TIDE_AMPLITUDE, rising: false };
let simulationTime = 0;
let autosaveTimer = 0;
let paused = false;
const heldKeys = new Set();

function seaLevelAt(worldTime) {
  return TIDE_MIDDLE + TIDE_AMPLITUDE * Math.sin((worldTime / TIDE_PERIOD_SECONDS) * Math.PI * 2);
}

function updateTide(deltaTime) {
  const previousLevel = seaLevelAt(save.worldTime - deltaTime);
  const level = seaLevelAt(save.worldTime);
  const wasRising = tideState.rising;
  tideState.rising = level > previousLevel;
  const swash = 0.07 * Math.sin(simulationTime * 0.8) + 0.035 * Math.sin(simulationTime * 1.9 + 1);
  tideState.seaLevel = level + swash;
  tideState.wetLevel = Math.max(level + 0.42, tideState.wetLevel - WET_SAND_DRYING_RATE * deltaTime);
  seaUniforms.uSeaLevel.value = tideState.seaLevel;
  seaUniforms.uWetLevel.value = tideState.wetLevel;
  if (wasRising && !tideState.rising && deltaTime > 0) {
    const returned = resources.washAshore(player);
    if (returned > 0) hud.toast('🌊 The tide left new things on the beach');
  }
}

function tideLabel() {
  const share = (seaLevelAt(save.worldTime) - TIDE_MIDDLE) / TIDE_AMPLITUDE;
  if (share > 0.92) return 'High tide';
  if (share < -0.92) return 'Low tide';
  return tideState.rising ? 'Rising' : 'Falling';
}

function persist() {
  if (isScreenshotMode) return;
  Object.assign(save, { x: player.x, z: player.z, heading: player.heading, nodes: resources.serialize(), wetness: player.wetness, wetHeight: player.wetHeight, gear: gear.serialize() });
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: progress lasts for this visit only */
  }
}

function goalText() {
  const parts = Object.entries(FIRST_GOAL).map(([type, wanted]) => `${RESOURCE_TYPES[type].icon} ${Math.min(save.inventory[type] || 0, wanted)}/${wanted}`);
  return `Gather ${parts.join('  ')}`;
}

function goalReached() {
  return Object.entries(FIRST_GOAL).every(([type, wanted]) => (save.inventory[type] || 0) >= wanted);
}

function hasCraftedGear() {
  return gear.state.shells.length + gear.state.claws.length > 2;
}

function refreshHud(bumpedType) {
  hud.setInventory(save.inventory, bumpedType);
  if (!save.workshopBuilt) {
    if (goalReached()) hud.setGoal('🔨 Build workshop', { action: true });
    else hud.setGoal(goalText());
  } else if (!hasCraftedGear()) {
    hud.setGoal('🔨 Tap the workshop to craft', { done: true });
  } else {
    hud.setGoal(null);
  }
}

function placeWorkshop() {
  workshop.build();
  world.blockCircle(WORKSHOP_SPOT.x, WORKSHOP_SPOT.z, WORKSHOP_BLOCK_RADIUS);
  if (!world.isWalkable(player.x, player.z)) {
    const free = navigation.nearestWalkable(player.x, player.z, 10);
    Object.assign(player, { x: free.x, z: free.z });
  }
}

function buildWorkshop() {
  if (save.workshopBuilt || !goalReached()) return false;
  for (const [type, amount] of Object.entries(FIRST_GOAL)) save.inventory[type] -= amount;
  save.workshopBuilt = true;
  placeWorkshop();
  stopWalking();
  hud.toast('🔨 Workshop built — tap it to craft');
  refreshHud(null);
  persist();
  return true;
}

function craftItem(category, kind) {
  const item = gear.craft(category, kind, save.inventory);
  if (!item) return null;
  const label = (category === 'shell' ? SHELLS : CLAWS)[kind].label;
  hud.toast(`🔨 ${label} crafted — wear it under Shells`);
  refreshHud(null);
  workbenchPanel.render();
  persist();
  return item;
}

function wearItem(id) {
  if (!gear.wear(id)) return false;
  hermit.setShell(SHELLS[gear.wornShell().kind].look);
  workbenchPanel.render();
  persist();
  return true;
}

function walkToWorkshop() {
  const awayX = player.x - WORKSHOP_SPOT.x;
  const awayZ = player.z - WORKSHOP_SPOT.z;
  const awayLength = Math.hypot(awayX, awayZ) || 1;
  const standX = WORKSHOP_SPOT.x + (awayX / awayLength) * (WORKSHOP_BLOCK_RADIUS + 0.7);
  const standZ = WORKSHOP_SPOT.z + (awayZ / awayLength) * (WORKSHOP_BLOCK_RADIUS + 0.7);
  const stand = world.isWalkable(standX, standZ) ? { x: standX, z: standZ } : navigation.nearestWalkable(standX, standZ, 6);
  if (!setDestination(stand.x, stand.z)) return false;
  destinationMarker.visible = false;
  player.headingToWorkshop = true;
  return true;
}

function setDestination(x, z, gatherTarget = null) {
  const path = navigation.findPath(player.x, player.z, x, z);
  if (!path.length) return false;
  player.path = path;
  player.pathIndex = 0;
  player.gatherTarget = gatherTarget;
  player.gatherProgress = 0;
  player.headingToWorkshop = false;
  const end = path[path.length - 1];
  destinationMarker.position.set(end.x, world.heightAt(end.x, end.z) + 0.12, end.z);
  destinationMarker.visible = !gatherTarget;
  if (!save.hasMoved) {
    save.hasMoved = true;
    hud.setHint(null);
  }
  return true;
}

function stopWalking() {
  player.headingToWorkshop = false;
  player.path = [];
  player.pathIndex = 0;
  destinationMarker.visible = false;
}

function tryStep(nextX, nextZ) {
  if (world.isWalkable(nextX, nextZ)) {
    player.x = nextX;
    player.z = nextZ;
    return true;
  }
  if (world.isWalkable(nextX, player.z)) {
    player.x = nextX;
    return true;
  }
  if (world.isWalkable(player.x, nextZ)) {
    player.z = nextZ;
    return true;
  }
  return false;
}

function keyboardDirection() {
  const right = (heldKeys.has('d') || heldKeys.has('arrowright') ? 1 : 0) - (heldKeys.has('a') || heldKeys.has('arrowleft') ? 1 : 0);
  const forward = (heldKeys.has('w') || heldKeys.has('arrowup') ? 1 : 0) - (heldKeys.has('s') || heldKeys.has('arrowdown') ? 1 : 0);
  if (!right && !forward) return null;
  const forwardX = -Math.sin(CAMERA_YAW);
  const forwardZ = Math.cos(CAMERA_YAW);
  const x = forwardX * forward - forwardZ * right;
  const z = forwardZ * forward + forwardX * right;
  const length = Math.hypot(x, z);
  return { x: x / length, z: z / length };
}

function turnToward(targetHeading, deltaTime) {
  let difference = targetHeading - player.heading;
  difference = Math.atan2(Math.sin(difference), Math.cos(difference));
  player.heading += difference * Math.min(1, TURN_RATE * deltaTime);
}

function updatePlayer(deltaTime) {
  const waterDepth = world.waterLevelAt(player.x, player.z, tideState.seaLevel) - player.y;
  const topSpeed = (waterDepth > 0.7 ? WADE_SPEED : WALK_SPEED) * gear.stats().speedFactor;
  let targetSpeed = 0;
  const steering = keyboardDirection();
  if (steering) {
    stopWalking();
    player.gatherTarget = null;
    turnToward(Math.atan2(steering.x, steering.z), deltaTime);
    targetSpeed = topSpeed;
    if (!tryStep(player.x + steering.x * player.speed * deltaTime, player.z + steering.z * player.speed * deltaTime)) targetSpeed = 0;
    if (!save.hasMoved) {
      save.hasMoved = true;
      hud.setHint(null);
    }
  } else if (player.pathIndex < player.path.length) {
    const waypoint = player.path[player.pathIndex];
    const offsetX = waypoint.x - player.x;
    const offsetZ = waypoint.z - player.z;
    const distance = Math.hypot(offsetX, offsetZ);
    const isLast = player.pathIndex === player.path.length - 1;
    const arrivalDistance = isLast && player.gatherTarget ? GATHER_REACH * 0.8 : 0.25;
    if (distance <= arrivalDistance) {
      player.pathIndex++;
      if (player.pathIndex >= player.path.length) destinationMarker.visible = false;
    } else {
      turnToward(Math.atan2(offsetX, offsetZ), deltaTime);
      targetSpeed = topSpeed * (isLast ? Math.min(1, 0.35 + distance / 2.5) : 1);
      const stride = Math.min(distance, player.speed * deltaTime);
      player.x += (offsetX / distance) * stride;
      player.z += (offsetZ / distance) * stride;
    }
  }
  player.speed += (targetSpeed - player.speed) * Math.min(1, deltaTime * 10);
  player.y = world.heightAt(player.x, player.z);
  player.waterDepth = world.waterLevelAt(player.x, player.z, tideState.seaLevel) - player.y;
  const sampleReach = 0.5;
  player.groundNormal.set(world.heightAt(player.x - sampleReach, player.z) - world.heightAt(player.x + sampleReach, player.z), 2 * sampleReach, world.heightAt(player.x, player.z - sampleReach) - world.heightAt(player.x, player.z + sampleReach)).normalize();

  if (player.headingToWorkshop && player.pathIndex >= player.path.length) {
    player.headingToWorkshop = false;
    if (Math.hypot(WORKSHOP_SPOT.x - player.x, WORKSHOP_SPOT.z - player.z) <= WORKSHOP_REACH) {
      turnToward(Math.atan2(WORKSHOP_SPOT.x - player.x, WORKSHOP_SPOT.z - player.z), 1);
      workbenchPanel.open();
    }
  }

  const target = player.gatherTarget;
  let working = false;
  if (target && !target.gathered && player.pathIndex >= player.path.length) {
    const distance = Math.hypot(target.x - player.x, target.z - player.z);
    if (distance <= GATHER_REACH) {
      working = true;
      turnToward(Math.atan2(target.x - player.x, target.z - player.z), deltaTime);
      player.gatherProgress += deltaTime;
      if (player.gatherProgress >= RESOURCE_TYPES[target.type].gatherSeconds) {
        resources.gather(target);
        save.inventory[target.type] = (save.inventory[target.type] || 0) + 1;
        hud.toast(`+1 ${RESOURCE_TYPES[target.type].icon} ${RESOURCE_TYPES[target.type].label}`);
        refreshHud(target.type);
        player.gatherTarget = null;
        if (goalReached() && !save.goalAnnounced) {
          save.goalAnnounced = true;
          hud.toast('✓ Enough for a workshop — tap 🔨 Build workshop');
        }
        persist();
      }
    } else {
      player.gatherTarget = null;
    }
  }
  hermit.update(deltaTime, { x: player.x, y: player.y, z: player.z, heading: player.heading, speed: player.speed, working, groundNormal: player.groundNormal });
}

function updateBodyWetness(deltaTime) {
  if (player.waterDepth > BODY_WET_MINIMUM_DEPTH) {
    player.wetness = 1;
    player.wetHeight = Math.max(player.wetHeight, Math.min(player.waterDepth, BODY_WET_MAXIMUM_HEIGHT_PER_SIZE * player.size));
  } else {
    player.wetness = Math.max(0, player.wetness - deltaTime / BODY_DRYING_SECONDS);
    if (player.wetness === 0) player.wetHeight = 0;
  }
  hermit.wetnessUniforms.uBodyWetness.value = player.wetness;
  hermit.wetnessUniforms.uBodyWetTop.value = player.y + player.wetHeight;
}

function simulate(deltaTime) {
  simulationTime += deltaTime;
  save.worldTime += deltaTime;
  seaUniforms.uTime.value = simulationTime;
  updateTide(deltaTime);
  updatePlayer(deltaTime);
  updateBodyWetness(deltaTime);
  tracks.update(deltaTime, simulationTime, player, tideState.seaLevel);
  ripples.update(deltaTime, simulationTime, player);
  autosaveTimer += deltaTime;
  if (autosaveTimer >= AUTOSAVE_INTERVAL_SECONDS) {
    autosaveTimer = 0;
    persist();
  }
}

function updateCamera(deltaTime, snap) {
  const follow = snap ? 1 : Math.min(1, deltaTime * 5);
  cameraFocus.x += (player.x - cameraFocus.x) * follow;
  cameraFocus.z += (player.z - cameraFocus.z) * follow;
  cameraFocus.y += (player.y + 0.6 - cameraFocus.y) * follow;
  const horizontal = Math.cos(CAMERA_PITCH) * cameraDistance;
  camera.position.set(cameraFocus.x + Math.sin(CAMERA_YAW) * horizontal, cameraFocus.y + Math.sin(CAMERA_PITCH) * cameraDistance, cameraFocus.z - Math.cos(CAMERA_YAW) * horizontal);
  const minimumHeight = world.heightAt(camera.position.x, camera.position.z) + 2;
  if (camera.position.y < minimumHeight) camera.position.y = minimumHeight;
  camera.lookAt(cameraFocus);
  camera.updateMatrixWorld();

  const shadowReach = THREE.MathUtils.clamp(cameraDistance * 1.7, 42, 120);
  const shadowTexel = (shadowReach * 2) / quality.shadowMapSize;
  const anchorX = Math.round(cameraFocus.x / (shadowTexel * 8)) * shadowTexel * 8;
  const anchorZ = Math.round((cameraFocus.z + shadowReach * 0.25) / (shadowTexel * 8)) * shadowTexel * 8;
  sun.target.position.set(anchorX, 0, anchorZ);
  sun.position.copy(sun.target.position).addScaledVector(lighting.sunDirection, 200);
  const shadowCamera = sun.shadow.camera;
  if (shadowCamera.right !== shadowReach) {
    shadowCamera.left = -shadowReach;
    shadowCamera.right = shadowReach;
    shadowCamera.top = shadowReach;
    shadowCamera.bottom = -shadowReach;
    shadowCamera.updateProjectionMatrix();
  }
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  const verticalForMinimumWidth = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(MINIMUM_HORIZONTAL_FIELD_OF_VIEW / 2)) / camera.aspect));
  camera.fov = Math.max(LANDSCAPE_FIELD_OF_VIEW, verticalForMinimumWidth);
  camera.updateProjectionMatrix();
  pipeline.resize();
}

const pixelRatioControl = {
  info: renderer.info,
  domElement: canvas,
  setPixelRatio(pixelRatio) {
    renderer.setPixelRatio(Math.min(pixelRatio, quality.maxPixelRatio));
    pipeline.resize();
  },
};
const fixedPixelRatio = searchParameters.has('dpr') ? Number(searchParameters.get('dpr')) : isScreenshotMode ? Math.min(devicePixelRatio, 2) : null;
const performanceMonitor = createPerformanceMonitor(pixelRatioControl, { fixedPixelRatio });
addEventListener('resize', resize);
resize();

function renderScene() {
  renderer.info.reset();
  renderer.getDrawingBufferSize(drawingBufferSize);
  resources.update(simulationTime, Math.min(drawingBufferSize.x, drawingBufferSize.y) * 2.4);
  destinationMarker.scale.setScalar(1 + 0.12 * Math.sin(simulationTime * 5));
  workshop.update(simulationTime, !hasCraftedGear() && !workbenchPanel.isOpen, camera);
  const farZoomShare = THREE.MathUtils.smoothstep(cameraDistance, ...FAR_ZOOM_RING_DISTANCES);
  playerRing.position.set(player.x, player.y + 0.15, player.z);
  playerRing.scale.setScalar(1 + farZoomShare * 0.9);
  playerRing.material.opacity = farZoomShare * 0.75;
  playerRing.visible = farZoomShare > 0.01;
  pipeline.render(scene, camera, { focusDistance: camera.position.distanceTo(cameraFocus), time: simulationTime });
  hud.setTide(tideLabel(), (seaLevelAt(save.worldTime) - TIDE_MIDDLE) / TIDE_AMPLITUDE / 2 + 0.5);
}

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const projected = new THREE.Vector3();
const drawingBufferSize = new THREE.Vector2();

function groundPointUnder(clientX, clientY) {
  pointerNdc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const { origin, direction } = raycaster.ray;
  let previousDistance = 0;
  for (let distance = 2; distance < 400; distance += 0.8) {
    const x = origin.x + direction.x * distance;
    const z = origin.z + direction.z * distance;
    if (origin.y + direction.y * distance <= world.heightAt(x, z)) {
      let near = previousDistance;
      let far = distance;
      for (let refine = 0; refine < 8; refine++) {
        const middle = (near + far) / 2;
        if (origin.y + direction.y * middle <= world.heightAt(origin.x + direction.x * middle, origin.z + direction.z * middle)) far = middle;
        else near = middle;
      }
      return { x: origin.x + direction.x * far, z: origin.z + direction.z * far };
    }
    previousDistance = distance;
  }
  return null;
}

function resourceUnder(clientX, clientY) {
  let best = null;
  for (const node of resources.nodes) {
    if (node.gathered) continue;
    projected.set(node.x, node.y + 0.4, node.z).project(camera);
    if (projected.z > 1) continue;
    const distance = Math.hypot((projected.x * 0.5 + 0.5) * innerWidth - clientX, (-projected.y * 0.5 + 0.5) * innerHeight - clientY);
    if (distance < PICK_RADIUS_PIXELS && (!best || distance < best.distance)) best = { node, distance };
  }
  return best ? best.node : null;
}

function workshopUnder(clientX, clientY) {
  if (!save.workshopBuilt) return false;
  projected.set(WORKSHOP_SPOT.x, workshop.group.position.y + 0.5, WORKSHOP_SPOT.z).project(camera);
  if (projected.z > 1) return false;
  return Math.hypot((projected.x * 0.5 + 0.5) * innerWidth - clientX, (-projected.y * 0.5 + 0.5) * innerHeight - clientY) < WORKSHOP_PICK_RADIUS_PIXELS;
}

function handleTap(clientX, clientY, isNewTouch) {
  if (paused || workbenchPanel.isOpen) return;
  if (isNewTouch && workshopUnder(clientX, clientY)) {
    if (Math.hypot(WORKSHOP_SPOT.x - player.x, WORKSHOP_SPOT.z - player.z) <= WORKSHOP_REACH) workbenchPanel.open();
    else walkToWorkshop();
    return;
  }
  const node = isNewTouch ? resourceUnder(clientX, clientY) : null;
  if (node) {
    setDestination(node.x, node.z, node);
    return;
  }
  const point = groundPointUnder(clientX, clientY);
  if (point) setDestination(point.x, point.z);
}

const activePointers = new Map();
let pinchStartSpan = 0;
let pinchStartDistance = 0;
let lastSteerTime = 0;

function pinchSpan() {
  const [first, second] = [...activePointers.values()];
  return Math.hypot(first.x - second.x, first.y - second.y);
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) {
    pinchStartSpan = pinchSpan();
    pinchStartDistance = cameraDistance;
  } else if (activePointers.size === 1) {
    handleTap(event.clientX, event.clientY, true);
  }
});
canvas.addEventListener('pointermove', (event) => {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) {
    cameraDistance = THREE.MathUtils.clamp((pinchStartDistance * pinchStartSpan) / Math.max(20, pinchSpan()), ...CAMERA_DISTANCE_LIMITS);
  } else if (performance.now() - lastSteerTime > 120 && !player.gatherTarget && !player.headingToWorkshop) {
    lastSteerTime = performance.now();
    handleTap(event.clientX, event.clientY, false);
  }
});
function endPointer(event) {
  activePointers.delete(event.pointerId);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  cameraDistance = THREE.MathUtils.clamp(cameraDistance * Math.exp(event.deltaY * 0.0012), ...CAMERA_DISTANCE_LIMITS);
}, { passive: false });
addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && workbenchPanel.isOpen) workbenchPanel.close();
  heldKeys.add(event.key.toLowerCase());
});
addEventListener('keyup', (event) => heldKeys.delete(event.key.toLowerCase()));
addEventListener('blur', () => heldKeys.clear());

function setPaused(value) {
  if (paused === value) return;
  paused = value;
  hud.setPaused(paused);
  if (paused) persist();
}
hud.onPause(setPaused);
hud.onGoalTap(buildWorkshop);
hud.onReset(() => {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing stored */
  }
  location.reload();
});
hud.onQuality((name) => {
  if (name === qualityName) return;
  persist();
  storeQualityName(name);
  location.reload();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !isScreenshotMode) setPaused(true);
});
addEventListener('pagehide', persist);

if (save.workshopBuilt) placeWorkshop();
refreshHud(null);
if (!save.hasMoved) hud.setHint('Tap to walk · tap a ✦ to gather · pinch to zoom');
tideState.wetLevel = TIDE_MIDDLE + TIDE_AMPLITUDE * 0.9;

let previousFrameTime = performance.now();

if (isScreenshotMode) {
  const pose = POSES[screenshotPose] || POSES[1];
  hud.setVisible(searchParameters.has('hud'));
  performanceMonitor.setVisible(false);
  const spot = navigation.nearestWalkable(pose.x, pose.z, 40);
  Object.assign(player, { x: spot.x, z: spot.z, heading: pose.walkFrom ? STARTING_HEADING : pose.heading ?? STARTING_HEADING });
  cameraDistance = pose.distance;
  save.worldTime = TIDE_PERIOD_SECONDS * (searchParameters.has('tide') ? Number(searchParameters.get('tide')) : pose.tideShare);
  if (pose.workshop) {
    save.workshopBuilt = true;
    placeWorkshop();
  }
  if (pose.inventory) Object.assign(save.inventory, pose.inventory);
  for (const kind of pose.crafted || []) {
    Object.assign(save.inventory, SHELLS[kind].cost);
    craftItem('shell', kind);
  }
  if (pose.shell) hermit.setShell(SHELLS[pose.shell].look);
  refreshHud(null);
  if (pose.panel) workbenchPanel.open(pose.panel);
  if (pose.walkFrom) {
    const walkStart = navigation.nearestWalkable(pose.walkFrom.x, pose.walkFrom.z, 40);
    Object.assign(player, { x: walkStart.x, z: walkStart.z });
    for (let step = 0; step < 30; step++) simulate(FIXED_STEP);
    setDestination(spot.x, spot.z);
    for (let step = 0; step < pose.walkSeconds / FIXED_STEP; step++) simulate(FIXED_STEP);
    destinationMarker.visible = false;
    if (pose.heading !== undefined) {
      stopWalking();
      player.heading = pose.heading;
      for (let step = 0; step < 20; step++) simulate(FIXED_STEP);
    }
  } else {
    for (let step = 0; step < 90; step++) simulate(FIXED_STEP);
  }
  updateCamera(0, true);
  renderScene();
  renderScene();
  window.__frameReady = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
} else {
  updateCamera(0, true);
  renderer.setAnimationLoop((now) => {
    if (!performanceMonitor.shouldRender(now)) return;
    const deltaTime = Math.min(0.05, (now - previousFrameTime) / 1000);
    previousFrameTime = now;
    if (!paused) simulate(deltaTime);
    updateCamera(deltaTime, false);
    renderScene();
    performanceMonitor.recordFrame(now);
  });
}

window.__debug = {
  simulate, player, world, resources, navigation, save, tideState, camera, renderer, scene, pipeline, performanceMonitor, quality, qualityName,
  tracks, ripples, hermit, gear, workshop, workbenchPanel, buildWorkshop, craftItem, wearItem, walkToWorkshop, setDestination, setPaused, handleTap, renderScene, updateCamera, seaLevelAt,
  setCameraDistance: (distance) => { cameraDistance = distance; },
  isPaused: () => paused,
};
