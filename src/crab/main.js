import * as THREE from 'three';
import { createPerformanceMonitor } from '../performance.js';
import { QUALITY_LEVELS, chosenQualityName, storeQualityName } from './quality.js';
import { seaUniforms, SEA_COMMON_GLSL, lighting } from './seaside.js';
import { createNoiseTexture, createWaveGradientTexture } from './textures.js';
import { createWorld, TIDE_MIDDLE, TIDE_AMPLITUDE, TIDE_PERIOD_SECONDS, HOME_BEACH_ENEMIES } from './world.js';
import { createPipeline } from './pipeline.js';
import { createWater } from './water.js';
import { createProps } from './props.js';
import { createReefProps } from './reef.js';
import { createLife } from './life.js';
import { createHermit } from './hermit.js';
import { createNavigation } from './navigation.js';
import { createResources, RESOURCE_TYPES } from './resources.js';
import { createHud } from './hud.js';
import { createTracks } from './tracks.js';
import { createRipples } from './ripples.js';
import { createGear, SHELLS, CLAWS, ENCHANT_LEVELS, canAfford } from './gear.js';
import { createWorkbenchModel, createWorkbenchPanel } from './workbench.js';
import { createBackpackPanel } from './backpack.js';
import { createProgression, GATHER_EXPERIENCE } from './progression.js';
import { createEnemies } from './enemies.js';
import { createRemains, REMAINS_REACH } from './remains.js';
import { random, randomSource } from './random.js';
import { createAudio } from './audio.js';
import { createBurrow, createEmptyBurrow, BURROW_GRID, BURROW_LAYER, BURROW_ORIGIN, ENTRANCE_REACH, ENTRANCE_BLOCK_RADIUS, STATION_KINDS, STATION_REACH, SHAFT_CELL, cellCenter } from './burrow.js';
import { createBuildPanel, createStoragePanel, createHelpersPanel, createRackPanel } from './burrowPanels.js';
import { createRack, RACK_BATCH, RACK_DRY_SECONDS, RACK_REACH, RACK_BLOCK_RADIUS } from './rack.js';
import { createHelpers, HELPER_LIMIT, HELPER_COST, HELPER_JOBS } from './helpers.js';

const searchParameters = new URLSearchParams(location.search);
const screenshotPose = searchParameters.has('pose') ? Number(searchParameters.get('pose')) : null;
const isScreenshotMode = screenshotPose !== null;
const qualityName = chosenQualityName(searchParameters);
const quality = QUALITY_LEVELS[qualityName];

const SAVE_KEY = 'seaofcrabs-crab-save';
const SAVE_VERSION = 4;
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
const GATHER_REACH = 2.5;
const PICK_RADIUS_PIXELS = 46;
const ENTRANCE_PICK_RADIUS_PIXELS = 30;
const DRAG_START_PIXELS = 14;
const SURFACE_CAMERA_DISTANCE = 32;
const BURROW_FRAMED_WIDTH = 11;
const BURROW_FRAMED_DEPTH = 17;
const TRAVEL_REACH_SURFACE = ENTRANCE_REACH + 0.6;
const STARTING_TIDE_TIME = TIDE_PERIOD_SECONDS * 0.56;
const WET_SAND_DRYING_RATE = 0.006;
const HOME_SPOT = { x: 13, z: -21 };
const WORKSHOP_SPOT = { x: 18, z: -17 };
const FIRST_GOAL = { shellBits: 5, driftwood: 3, seaLettuce: 3 };
const REEF_FALLBACK_SPOT = { x: 14, z: 62 };
const REEF_VIEW_THRESHOLD_Z = 42;
const REEF_VIEW_REACH_PER_DISTANCE = 1.6;
const STARTER_SPOTS = { shellBits: { x: 11, z: -26.5 }, driftwood: { x: 17.5, z: -23 }, seaLettuce: { x: 12, z: -14 }, coral: { x: 14, z: 57 } };
const FAR_ZOOM_RING_DISTANCES = [46, 66];
const STARTING_HEADING = 2.3;
const BODY_WET_MINIMUM_DEPTH = 0.04;
const BODY_WET_MAXIMUM_HEIGHT_PER_SIZE = 2.0;
const BODY_DRYING_SECONDS = 30;
const PLAYER_ATTACK_REACH = 1.25;
const PLAYER_ATTACK_INTERVAL = 0.9;
const PLAYER_FIRST_STRIKE_SECONDS = 0.3;
const COMBAT_REPATH_SECONDS = 0.4;
const DAMAGE_SPREAD = 0.15;
const HEALTH_REGEN_DELAY_SECONDS = 5;
const HEALTH_REGEN_PER_SECOND = 1;
const BRACE_DAMAGE_FACTOR = 0.7;
const BRACE_MAXIMUM_SPEED = 0.5;
const STING_EVERY_HITS = 4;
const RESPAWN_CALM_SECONDS = 4;
const DEATH_ANIMATION_SECONDS = 1.1;
const KNOCKBACK_DISTANCE = 0.3;
const STRIKING_RANGE_TOLERANCE = 0.45;
const ITEM_LIFT_START_SHARE = 0.55;
const AUDIO_SETTINGS_KEY = 'seaofcrabs-audio';
const STEP_LENGTH = 0.6;
const HEAD_UNDERWATER_DEPTH = 1.9;
const AMBIENCE_UPDATE_SECONDS = 0.3;
const GULL_MOOD_EDGE_Z = -85;
const FISH_PLOP_PER_SECOND = 0.15;
const ENTRANCE_DIG_SECONDS = 2.5;
const WELL_FED_SECONDS = 90;
const WELL_FED_REGEN_FACTOR = 2;
const BURROW_DIG_REACH = 2.4;
const ENTRANCE_CONFIRM_RADIUS = 2.2;
const ENTRANCE_CLEARANCE = 3;
const ENTRANCE_HIGH_TIDE_MARGIN = 0.35;
const DEFAULT_WORKSHOP_CELL = { column: 6, row: 5 };
const DEFAULT_STORAGE_CELL = { column: 4, row: 5 };
const BURROW_BACKGROUND = new THREE.Color(0.05, 0.035, 0.025);
const BURROW_FOG_DENSITY = 0.026;
const BURROW_SUN_INTENSITY = 1.5;
const BURROW_ENVIRONMENT_INTENSITY = 0.34;
const SURFACE_SUN_INTENSITY = 4.2;
const SURFACE_ENVIRONMENT_INTENSITY = 0.55;

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
  18: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, backpack: true, crafted: ['turban', 'cone'] },
  20: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.9, workshop: true, backpack: true, crafted: ['turban', 'cone'] },
  21: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, crafted: ['turban'] },
  19: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Craft', inventory: { shellBits: 12, driftwood: 3, seaLettuce: 5 } },
  22: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, naked: true },
  23: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.9, workshop: true, naked: true, remainsAt: { x: 24, z: -12 } },
  29: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, naked: true, remainsAt: { x: -20, z: -40 } },
  31: { x: 11, z: -24, distance: 11, tideShare: 0.56, heading: 2.6, gather: { type: 'shellBits', share: 0.8 } },
  32: { x: -1, z: -6, distance: 13, tideShare: 0.75, heading: 0.4, enemy: { kind: 'shoreCrab', offsetX: -2.8, offsetZ: 0.6 }, fightSeconds: 1.2, moment: 'strike' },
  33: { x: -1, z: -6, distance: 13, tideShare: 0.75, heading: 0.4, enemy: { kind: 'shoreCrab', offsetX: -2.8, offsetZ: 0.6 }, fightSeconds: 1.2, moment: 'hurt' },
  34: { x: -1, z: -6, distance: 13, tideShare: 0.75, heading: 0.4, enemy: { kind: 'shoreCrab', offsetX: -2.8, offsetZ: 0.6 }, fightSeconds: 1.2, moment: 'enemyHurt' },
  35: { x: 6, z: 2, distance: 14, tideShare: 0.75, heading: 0.6, nearAnemone: true },
  36: { x: 30, z: -40, distance: 13, tideShare: 0.56, heading: 0.5, enemy: { kind: 'sandHopper', offsetX: -2.4, offsetZ: 0.8 }, fightSeconds: 0.6, moment: 'dying' },
  37: { x: 12, z: -14, distance: 11, tideShare: 0.56, heading: 2.6, gather: { type: 'seaLettuce', share: 0.5 } },
  38: { x: 0, z: -104, distance: 34, tideShare: 0.56, heading: 3.2, level: 6, enemy: { kind: 'gull', offsetX: -2, offsetZ: -5.5 }, fightSeconds: 2.2, moment: 'enemyHurt' },
  39: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, enchanted: { shell: 'cone', claws: 'shellEdged', level: 3 } },
  40: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, enchanted: { shell: 'turban', claws: 'shellEdged', level: 6 } },
  41: { x: 24, z: -27, distance: 12, tideShare: 0.56, heading: 1.75, enchanted: { shell: 'cone', claws: 'shellEdged', level: 9 } },
  42: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Enchant', enchanted: { shell: 'turban', claws: 'shellEdged', level: 3 }, inventory: { pearls: 2, shellBits: 9 }, armEnchant: true },
  43: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Enchant', enchanted: { shell: 'turban', claws: 'shellEdged', level: 3 }, inventory: { pearls: 2, shellBits: 9 }, armEnchant: true },
  44: { x: 22, z: -14, distance: 14, tideShare: 0.56, heading: 1.2, naked: true, remainsAt: { x: 24, z: -12 }, remainsEnchant: 6 },
  45: { x: 21, z: -24, distance: 22, tideShare: 0.56, heading: 0.9, burrowAt: { x: 24, z: -21 } },
  46: { x: 15, z: -20, distance: 24, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], dug: [[5, 7], [6, 7], [7, 5]], inBurrow: true },
  47: { x: 15, z: -20, distance: 24, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop'], dug: [[5, 7]], inBurrow: true, placingStation: 'storage' },
  48: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], inBurrow: true, crafted: ['turban', 'cone'], inventory: { shellBits: 7, driftwood: 2, pearls: 1 }, stored: { seaLettuce: 6, shellBits: 12 }, storagePanel: true },
  49: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], dug: [[5, 7], [6, 7]], inBurrow: true },
  50: { x: 21, z: -24, distance: 26, tideShare: 0.56, heading: 0.9, placingEntrance: true, previewEntrance: { x: 25, z: -19 } },
  51: { x: 20, z: -26, distance: 30, tideShare: 0.56, heading: 0.9, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], helpers: ['shellBits', 'driftwood', 'seaLettuce'], simulateSeconds: 5 },
  52: { x: 15, z: -20, distance: 30, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], helpers: ['shellBits', 'seaLettuce'], inBurrow: true, simulateSeconds: 2, inventory: { seaLettuce: 6 }, helpersPanel: true },
  53: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.4, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], helpers: ['shellBits', 'driftwood', 'seaLettuce'], helpersResting: true, inBurrow: true },
  54: { x: 22, z: -24, distance: 24, tideShare: 0.56, heading: 0.9, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], rack: { slots: [0.25, 0.75, null], ready: 1 } },
  55: { x: 22, z: -24, distance: 24, tideShare: 0.56, heading: 0.9, burrowAt: { x: 24, z: -21 }, stations: ['workshop', 'storage'], rack: { slots: [0.25, 0.75, null], ready: 2 }, inventory: { seaLettuce: 4 }, rackPanel: true },
  56: { x: 22, z: -24, distance: 24, tideShare: 0.56, heading: 0.9, inventory: { driedKelp: 3, seaLettuce: 2 }, wellFed: true, backpack: true },
  57: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, panel: 'Craft', inventory: { shellBits: 10, driedKelp: 4, driftwood: 4 }, scrollPanel: true },
  58: { x: 14, z: 44, distance: 75, tideShare: 0.75, heading: 0 },
  59: { x: 8, z: 72, distance: 28, tideShare: 0.75, heading: 0.5 },
  60: { x: 8, z: 72, distance: 28, tideShare: 0.56, heading: 0.5 },
  61: { x: 12, z: 90, distance: 26, tideShare: 0.75, heading: 1 },
  62: { x: 10, z: 53, distance: 18, tideShare: 0.75, heading: 0.6 },
  63: { x: HOME_SPOT.x, z: HOME_SPOT.z, distance: 32, tideShare: 0.75, workshop: true, crafted: ['snail'] },
  64: { x: -30, z: 98, distance: 30, tideShare: 0.75, heading: 0.3 },
  65: { x: 8, z: 72, distance: 30, tideShare: 0.75, heading: 0.5 },
  30: { x: 15, z: -20, distance: 22, tideShare: 0.56, heading: 0.9, workshop: true, naked: true, backpack: true, remainsAt: { x: -20, z: -40 } },
  24: { x: -1, z: -6, distance: 16, tideShare: 0.75, heading: 0.4, enemy: { kind: 'shoreCrab', offsetX: -2.8, offsetZ: 0.6 }, fightSeconds: 3.2 },
  25: { x: 30, z: -40, distance: 13, tideShare: 0.56, heading: 0.5, enemy: { kind: 'sandHopper', offsetX: 1.4, offsetZ: 2.6 }, fightSeconds: 0 },
  26: { x: 0, z: -104, distance: 40, tideShare: 0.56, heading: 3.2, level: 6, enemy: { kind: 'gull', offsetX: -2, offsetZ: -5.5 }, fightSeconds: 3.4 },
  27: { x: 4, z: -80, distance: 50, tideShare: 0.56, heading: 3.4, gullCircling: true },
  28: { x: 30, z: -40, distance: 30, tideShare: 0.56, heading: 0.5, enemy: { kind: 'sandHopper', offsetX: 1.4, offsetZ: 2.6 }, fightSeconds: 2.5 },
};

function createEmptySave() {
  return { version: SAVE_VERSION, x: HOME_SPOT.x, z: HOME_SPOT.z, heading: STARTING_HEADING, worldTime: STARTING_TIDE_TIME, inventory: {}, nodes: null, goalAnnounced: false, hasMoved: false, wetness: 0, wetHeight: 0, gear: null, workshopBuilt: false, craftedOnce: false, progression: null, remains: [], burrow: null, storage: { inventory: {}, shells: [], claws: [] }, underground: false, helpers: [], rack: null, wellFedSeconds: 0, reefFound: false };
}

function migrateSave(stored) {
  const gearItemCount = stored.gear ? stored.gear.shells.length + stored.gear.claws.length : 0;
  const migrated = { ...createEmptySave(), ...stored, version: SAVE_VERSION };
  if (stored.version < 3) migrated.craftedOnce = gearItemCount > 2;
  if (stored.workshopBuilt && !stored.burrow) {
    migrated.burrow = { ...createEmptyBurrow(), entrance: { ...WORKSHOP_SPOT }, stations: [{ kind: 'workshop', ...DEFAULT_WORKSHOP_CELL }] };
  }
  return migrated;
}

function loadSave() {
  if (isScreenshotMode) return createEmptySave();
  try {
    const stored = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (stored && stored.version === SAVE_VERSION) return { ...createEmptySave(), ...stored };
    if (stored && stored.version >= 1 && stored.version < SAVE_VERSION) return migrateSave(stored);
  } catch {
    /* unreadable or blocked storage: start a new game */
  }
  return createEmptySave();
}

const save = loadSave();

function loadAudioSettings() {
  try {
    return { music: 0.55, effects: 0.8, ...JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY)) };
  } catch {
    return { music: 0.55, effects: 0.8 };
  }
}

const audioSettings = loadAudioSettings();
const audio = isScreenshotMode ? null : createAudio();
let audioUnlocked = false;
let ambienceTimer = 0;

function unlockAudio() {
  if (!audio || audioUnlocked) return;
  audioUnlocked = true;
  audio.unlock();
  audio.setVolumes(audioSettings);
  audio.startAmbience();
  audio.startMusic();
}

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
sun.layers.enable(BURROW_LAYER);
scene.add(sun, sun.target);

scene.add(world.terrainMesh);
createProps(scene, world, quality);
const reefProps = createReefProps(scene, world, quality);
const life = createLife(scene, world, quality);

const pipeline = createPipeline(renderer, quality);
const water = createWater(createWaveGradientTexture(), pipeline.overlayUniforms, quality.rippleCapacity);
pipeline.overlayScene.add(water.mesh);

const navigation = createNavigation(world);
const gear = createGear(save.gear);
const progression = createProgression(save.progression);
const hermit = createHermit(scene, quality, gear.wornLook());
hermit.root.traverse((child) => child.layers.enable(BURROW_LAYER));

function applyWornLook() {
  hermit.setShell(gear.wornLook());
  hermit.setEnchant(gear.wornShell() ? gear.wornShell().enchant || 0 : 0, gear.wornClaws().enchant || 0);
}
applyWornLook();
const resources = createResources(scene, { scene: pipeline.overlayScene, uniforms: pipeline.overlayUniforms }, world, quality, save.nodes, STARTER_SPOTS);
const hud = createHud(qualityName);
const tracks = createTracks(scene, world);
const ripples = createRipples(water.uniforms);
const workshop = createWorkbenchModel(scene, world, quality, WORKSHOP_SPOT, hud.root);
const burrow = createBurrow(scene, world, quality, hud.root, save.burrow);
burrow.attachStations(workshop);
if (burrow.hasStation('workshop')) workshop.build();
const storage = save.storage;
let underground = Boolean(save.underground && burrow.exists);
const surfaceSpace = {
  heightAt: (x, z) => world.heightAt(x, z),
  isWalkable: (x, z) => world.isWalkable(x, z),
  waterLevelAt: (x, z, seaLevel) => world.waterLevelAt(x, z, seaLevel),
  findPath: (fromX, fromZ, toX, toZ) => navigation.findPath(fromX, fromZ, toX, toZ),
  nearestWalkable: (x, z) => navigation.nearestWalkable(x, z, 10),
};
const space = () => (underground ? burrow.space : surfaceSpace);
const surfaceProbe = { x: 0, z: 0, alive: false };
const placement = { entrance: false, station: null };
const remains = createRemains(scene, world, quality, hud.root, save.remains);
const enemies = createEnemies({
  scene,
  world,
  navigation,
  quality,
  spawnTable: HOME_BEACH_ENEMIES.map((entry) => ({ ...entry, avoid: HOME_SPOT })),
  labelParent: hud.root,
  onAttackPlayer: hitPlayer,
  onKilled: enemyKilled,
  onAlert: (enemy) => {
    floatAt(enemy.x, enemy.y + enemy.altitude + enemy.definition.barHeight, enemy.z, '!', 'alert');
    soundAt('alert', enemy.x, enemy.z);
  },
  onSound: (name, enemy) => soundAt(name, enemy.x, enemy.z),
});
const buildPanel = createBuildPanel(hud.root, {
  inventory: () => save.inventory,
  hasStation: (kind) => (STATION_KINDS[kind].surface ? rack.exists : burrow.hasStation(kind)),
  onChoose: chooseStation,
  onClose: () => buildPanel.close(),
});
const storagePanel = createStoragePanel(hud.root, {
  gear,
  inventory: () => save.inventory,
  storage,
  onChange: () => {
    soundAt('gatherDriftwood', player.x, player.z, 0.6);
    applyWornLook();
    storagePanel.render();
    refreshHud(null);
    persist();
  },
  onClose: () => storagePanel.close(),
});
const rack = createRack(scene, world, quality, hud.root, save.rack);
if (rack.exists) world.blockCircle(rack.state.x, rack.state.z, RACK_BLOCK_RADIUS);
const rackPanel = createRackPanel(hud.root, {
  rack,
  inventory: () => save.inventory,
  batch: RACK_BATCH,
  drySeconds: RACK_DRY_SECONDS,
  onLoad: () => {
    if ((save.inventory.seaLettuce || 0) < RACK_BATCH || !rack.load()) return;
    save.inventory.seaLettuce -= RACK_BATCH;
    soundAt('gatherSeaLettuce');
    rackPanel.render();
    persist();
  },
  onCollect: () => {
    const taken = rack.collect();
    if (!taken) return;
    save.inventory.driedKelp = (save.inventory.driedKelp || 0) + taken;
    soundAt('gatherDriftwood');
    hud.toast(`+${taken} 🍂 Dried kelp`);
    refreshHud('driedKelp');
    rackPanel.render();
    persist();
  },
  onClose: () => rackPanel.close(),
});
const helpers = createHelpers(scene, {
  world,
  navigation,
  resources,
  enemies,
  quality,
  saved: save.helpers,
  rack,
  storage,
  onDeposit: (type, amount) => {
    storage.inventory[type] = (storage.inventory[type] || 0) + amount;
    if (storagePanel.isOpen) storagePanel.render();
  },
  onLost: (helper, enemy) => {
    hud.toast(`🦀 A helper was caught by a ${enemy.definition.label.toLowerCase()}`);
    persist();
  },
  onSound: (name, helper) => {
    if (!underground) soundAt(name, helper.x, helper.z, 0.45);
  },
});
const helpersPanel = createHelpersPanel(hud.root, {
  helpers,
  inventory: () => save.inventory,
  limit: HELPER_LIMIT,
  cost: HELPER_COST,
  jobs: HELPER_JOBS,
  requirement: () => (burrow.hasStation('storage') ? null : 'Build a 📦 storage first — helpers bring their finds there.'),
  onRecruit: recruitHelper,
  onJob: (id, job) => {
    helpers.setJob(id, job);
    helpersPanel.render();
    persist();
  },
  onClose: () => helpersPanel.close(),
});

function recruitHelper(job = 'shellBits') {
  if (!burrow.hasStation('storage') || helpers.list.length >= HELPER_LIMIT || !canAfford(HELPER_COST, save.inventory)) return null;
  for (const [type, amount] of Object.entries(HELPER_COST)) save.inventory[type] -= amount;
  const helper = helpers.recruit(job);
  soundAt('recoverRemains');
  hud.toast('🦀 A helper joined your burrow');
  if (helpersPanel.isOpen) helpersPanel.render();
  refreshHud(null);
  persist();
  return helper;
}

const workbenchPanel = createWorkbenchPanel(hud.root, {
  gear,
  inventory: () => save.inventory,
  onCraft: craftItem,
  onEnchant: enchantItem,
  onClose: () => workbenchPanel.close(),
});
const backpack = createBackpackPanel(hud.root, {
  gear,
  inventory: () => save.inventory,
  combatStats: () => playerStats(),
  maxHealth: () => progression.maxHealth(),
  onWear: wearItem,
  onEat: eatKelp,
  onClose: () => {
    backpack.close();
    hud.setBagDot(false);
    persist();
  },
});

function openBackpack() {
  workbenchPanel.close();
  backpack.open();
}

function anyPanelOpen() {
  return workbenchPanel.isOpen || backpack.isOpen || buildPanel.isOpen || storagePanel.isOpen || helpersPanel.isOpen || rackPanel.isOpen;
}

function closePanels() {
  workbenchPanel.close();
  if (backpack.isOpen) backpack.close();
  buildPanel.close();
  storagePanel.close();
  helpersPanel.close();
  rackPanel.close();
}

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
for (const marker of [destinationMarker, playerRing]) marker.layers.enable(BURROW_LAYER);

const camera = new THREE.PerspectiveCamera(LANDSCAPE_FIELD_OF_VIEW, 1, 1.5, 1600);
const cameraFocus = new THREE.Vector3();
const cameraDistances = { surface: save.cameraDistances?.surface ?? SURFACE_CAMERA_DISTANCE, burrow: save.cameraDistances?.burrow ?? null };
let cameraDistance = cameraDistances.surface;

function framedBurrowCameraDistance() {
  const aspect = innerWidth / innerHeight;
  const verticalHalfTangent = Math.max(Math.tan(THREE.MathUtils.degToRad(LANDSCAPE_FIELD_OF_VIEW / 2)), Math.tan(THREE.MathUtils.degToRad(MINIMUM_HORIZONTAL_FIELD_OF_VIEW / 2)) / aspect);
  const forWidth = BURROW_FRAMED_WIDTH / (2 * verticalHalfTangent * aspect);
  const forDepth = (BURROW_FRAMED_DEPTH * Math.sin(CAMERA_PITCH)) / (2 * verticalHalfTangent);
  return THREE.MathUtils.clamp(Math.max(forWidth, forDepth), ...CAMERA_DISTANCE_LIMITS);
}

function cameraDistanceFor(isUnderground) {
  return isUnderground ? cameraDistances.burrow ?? framedBurrowCameraDistance() : cameraDistances.surface;
}

const player = { wellFedUntil: save.wellFedSeconds || 0, x: save.x, z: save.z, y: 0, heading: save.heading, speed: 0, path: [], pathIndex: 0, gatherTarget: null, gatherProgress: 0, headingToWorkshop: false, groundNormal: new THREE.Vector3(0, 1, 0), size: 1, waterDepth: 0, wetness: save.wetness, wetHeight: save.wetHeight, alive: true, dyingTimer: 0, heldNode: null, combatTarget: null, attackTimer: 0, combatRepathTimer: 0, hitCount: 0, lastCombatTime: -100 };
const startPoint = (underground ? burrow.space.nearestWalkable(player.x, player.z) : navigation.nearestWalkable(player.x, player.z, 40)) || HOME_SPOT;
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

let startingOver = false;

function persist() {
  if (isScreenshotMode || startingOver) return;
  Object.assign(save, { x: player.x, z: player.z, heading: player.heading, nodes: resources.serialize(), wetness: player.wetness, wetHeight: player.wetHeight, gear: gear.serialize(), progression: progression.serialize(), remains: remains.serialize(), burrow: burrow.serialize(), storage, underground, cameraDistances: { ...cameraDistances, [underground ? 'burrow' : 'surface']: cameraDistance }, helpers: helpers.serialize(), rack: rack.serialize(), wellFedSeconds: Math.max(0, (player.wellFedUntil || 0) - simulationTime) });
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable: progress lasts for this visit only */
  }
}

function goalText() {
  const parts = Object.entries(FIRST_GOAL).map(([type, wanted]) => `${RESOURCE_TYPES[type].icon} ${Math.min(save.inventory[type] || 0, wanted)}/${wanted}`);
  return `Workshop: ${parts.join('  ')}`;
}

function goalReached() {
  return Object.entries(FIRST_GOAL).every(([type, wanted]) => (save.inventory[type] || 0) >= wanted);
}

function hasCraftedGear() {
  return save.craftedOnce;
}

function refreshHud(bumpedType) {
  if (bumpedType) hud.bumpBag();
  if (backpack.isOpen) backpack.render();
  hud.setBuildButton(underground);
  if (placement.entrance) {
    hud.setGoal(null);
  } else if (remains.list.length) {
    hud.setGoal('💀 Recover your remains');
  } else if (!burrow.exists) {
    hud.setGoal('🕳️ Dig a burrow', { action: true });
  } else if (!burrow.hasStation('workshop')) {
    if (goalReached()) hud.setGoal('🔨 Build the workshop in your burrow', { action: true });
    else hud.setGoal(goalText());
  } else if (!hasCraftedGear()) {
    hud.setGoal('🔨 Tap the workshop to craft', { done: true, action: !underground });
  } else if (!save.reefFound) {
    hud.setGoal('🪸 Explore the reef', { action: !underground });
  } else {
    hud.setGoal(null);
  }
}

function blockEntrance() {
  const { x, z } = burrow.state.entrance;
  world.blockCircle(x, z, ENTRANCE_BLOCK_RADIUS);
  if (!underground && !world.isWalkable(player.x, player.z)) {
    const free = navigation.nearestWalkable(player.x, player.z, 10);
    if (free) Object.assign(player, { x: free.x, z: free.z });
  }
}

function entranceSpotProblem(x, z) {
  if (!world.isWalkable(x, z)) return 'blocked';
  if (world.heightAt(x, z) < TIDE_MIDDLE + TIDE_AMPLITUDE + ENTRANCE_HIGH_TIDE_MARGIN || world.retained.levelAt(x, z) > world.heightAt(x, z) - 0.05) return 'wet';
  for (let step = 0; step < 12; step++) {
    const angle = (step / 12) * Math.PI * 2;
    if (!world.isWalkable(x + Math.cos(angle) * ENTRANCE_CLEARANCE, z + Math.sin(angle) * ENTRANCE_CLEARANCE)) return 'blocked';
  }
  return null;
}

const spotFeedback = new THREE.Mesh(
  new THREE.RingGeometry(1.0, 1.35, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.5, 0.4), transparent: true, opacity: 0.9, depthWrite: false, depthTest: false, fog: false }),
);
spotFeedback.renderOrder = 6;
spotFeedback.visible = false;
scene.add(spotFeedback);
let spotFeedbackUntil = 0;

function showSpotFeedback(x, z, valid, lasting = false) {
  spotFeedback.position.set(x, world.heightAt(x, z) + 0.15, z);
  spotFeedback.material.color.set(valid ? new THREE.Color(0.6, 2.4, 0.8) : new THREE.Color(2.4, 0.5, 0.4));
  spotFeedback.visible = true;
  spotFeedbackUntil = lasting ? Infinity : simulationTime + 1.2;
}

function startEntrancePlacement() {
  if (burrow.exists || player.dyingTimer > 0) return;
  closePanels();
  stopWalking();
  placement.entrance = true;
  hud.setMode('Tap dry sand above the tide line', cancelPlacement);
  refreshHud(null);
}

function cancelPlacement() {
  placement.entrance = false;
  placement.preview = null;
  spotFeedbackUntil = 0;
  placement.station = null;
  burrow.showPlacementCells(false);
  hud.setMode(null);
  refreshHud(null);
}

function digEntranceAt(x, z) {
  burrow.setEntrance(x, z, world.heightAt(x, z));
  blockEntrance();
  save.burrow = burrow.serialize();
  soundAt('craft');
  hud.toast('🕳️ Burrow dug — walk to it, then tap ⬇ Enter burrow');
  refreshHud(null);
  persist();
}

function previewEntranceSpot(x, z) {
  const preview = placement.preview;
  if (preview && preview.valid && Math.hypot(preview.x - x, preview.z - z) < ENTRANCE_CONFIRM_RADIUS) return chooseEntranceSpot(preview.x, preview.z);
  const problem = entranceSpotProblem(x, z);
  placement.preview = { x, z, valid: !problem };
  showSpotFeedback(x, z, !problem, true);
  if (problem) hud.setMode(problem === 'wet' ? '🌊 Too wet here — try higher up the beach' : '🪨 No room here — pick open sand', cancelPlacement);
  else hud.setMode('Tap the green ring again to dig here', cancelPlacement);
  return false;
}

function chooseEntranceSpot(x, z) {
  const problem = entranceSpotProblem(x, z);
  showSpotFeedback(x, z, !problem);
  if (problem) {
    hud.toast(problem === 'wet' ? '🌊 Too wet — pick sand above the high-tide line' : '🪨 No room — pick open sand away from rocks');
    return false;
  }
  placement.entrance = false;
  placement.preview = null;
  spotFeedbackUntil = simulationTime + 1.2;
  hud.setMode(null);
  if (!setDestination(x, z)) return false;
  destinationMarker.visible = true;
  player.digTarget = { kind: 'entrance', x, z, progress: 0 };
  refreshHud(null);
  return true;
}

function buildStation(kind, column, row) {
  const definition = STATION_KINDS[kind];
  if (!definition || burrow.hasStation(kind) || !canAfford(definition.cost, save.inventory)) return false;
  if (!burrow.freeCells().some((cell) => cell.column === column && cell.row === row)) return false;
  for (const [type, amount] of Object.entries(definition.cost)) save.inventory[type] -= amount;
  burrow.addStation(kind, column, row, workshop);
  if (kind === 'workshop') workshop.build();
  save.burrow = burrow.serialize();
  const spot = burrow.stationSpot({ column, row });
  if (underground && !burrow.space.isWalkable(player.x, player.z)) {
    const free = burrow.space.nearestWalkable(spot.x, spot.z);
    if (free) Object.assign(player, { x: free.x, z: free.z });
  }
  soundAt('craft');
  hud.toast(kind === 'workshop' ? '🔨 Workshop built — tap it to craft' : `${definition.icon} ${definition.label} built — tap it to open`);
  refreshHud(null);
  persist();
  return true;
}

function buildRackStation() {
  const definition = STATION_KINDS.dryingRack;
  if (rack.exists || !burrow.exists || !canAfford(definition.cost, save.inventory)) return false;
  const built = rack.build(burrow.state.entrance);
  if (!built) {
    hud.toast('🪨 No room beside the entrance for a drying rack');
    return false;
  }
  for (const [type, amount] of Object.entries(definition.cost)) save.inventory[type] -= amount;
  world.blockCircle(built.x, built.z, RACK_BLOCK_RADIUS);
  soundAt('craft');
  hud.toast('🍂 Drying rack built beside your burrow entrance');
  refreshHud(null);
  persist();
  return true;
}

function eatKelp() {
  if (!(save.inventory.driedKelp > 0)) return false;
  save.inventory.driedKelp -= 1;
  player.wellFedUntil = simulationTime + WELL_FED_SECONDS;
  soundAt('gatherSeaLettuce');
  hud.toast('🍂 Well fed — HP comes back twice as fast for 90 s');
  if (backpack.isOpen) backpack.render();
  persist();
  return true;
}

function isWellFed() {
  return simulationTime < (player.wellFedUntil || 0);
}

function walkToRack() {
  if (!rack.exists || underground) return false;
  const { x, z } = rack.state;
  if (Math.hypot(x - player.x, z - player.z) <= RACK_REACH + 0.4) {
    stopWalking();
    rackPanel.open();
    return true;
  }
  const stand = navigation.nearestWalkable(x - 1.8, z - 1.2, 6);
  if (!stand || !setDestination(stand.x, stand.z)) return false;
  player.walkGoal = 'rack';
  return true;
}

function chooseStation(kind) {
  buildPanel.close();
  if (STATION_KINDS[kind].surface) {
    buildRackStation();
    return;
  }
  placement.station = kind;
  burrow.showPlacementCells(true);
  hud.setMode(`Tap a glowing spot to place the ${STATION_KINDS[kind].label.toLowerCase()}`, cancelPlacement);
}

function buildWorkshop() {
  if (!burrow.exists) {
    digEntranceAt(WORKSHOP_SPOT.x, WORKSHOP_SPOT.z);
  }
  if (burrow.hasStation('workshop') || !goalReached()) return false;
  const cell = burrow.freeCells().find((candidate) => candidate.column === DEFAULT_WORKSHOP_CELL.column && candidate.row === DEFAULT_WORKSHOP_CELL.row) || burrow.freeCells()[0];
  return buildStation('workshop', cell.column, cell.row);
}

function goalTapped() {
  if (!burrow.exists) {
    startEntrancePlacement();
    return;
  }
  if (!underground && burrow.hasStation('workshop') && hasCraftedGear() && !save.reefFound) {
    walkTowardReef();
    return;
  }
  if (!underground) {
    walkToEntrance({ enter: true });
    return;
  }
  if (!burrow.hasStation('workshop') && goalReached()) {
    buildPanel.open();
  }
}

function walkTowardReef() {
  const corals = resources.nodes.filter((node) => node.type === 'coral' && !node.gathered);
  const nearest = corals.sort((first, second) => Math.hypot(first.x - player.x, first.z - player.z) - Math.hypot(second.x - player.x, second.z - player.z))[0];
  if (nearest) return setDestination(nearest.x, nearest.z, nearest);
  return setDestination(REEF_FALLBACK_SPOT.x, REEF_FALLBACK_SPOT.z);
}

function noticeReef() {
  if (save.reefFound || underground || !world.isOnReef(player.x, player.z)) return;
  save.reefFound = true;
  hud.toast('🪸 You found the reef — coral and sea glass wash up here');
  refreshHud(null);
  persist();
}

function workshopSpot() {
  const station = burrow.stationOf('workshop');
  return station && underground ? burrow.stationSpot(station) : null;
}

function setUnderground(value) {
  if (value !== underground) {
    cameraDistances[underground ? 'burrow' : 'surface'] = cameraDistance;
    cameraDistance = cameraDistanceFor(value);
  }
  underground = value;
  save.underground = value;
  camera.layers.set(value ? BURROW_LAYER : 0);
  scene.background = value ? BURROW_BACKGROUND : lighting.hazeColor;
  scene.fog.color.copy(value ? BURROW_BACKGROUND : lighting.hazeColor);
  scene.fog.density = value ? BURROW_FOG_DENSITY : lighting.hazeDensity;
  sun.intensity = value ? BURROW_SUN_INTENSITY : SURFACE_SUN_INTENSITY;
  scene.environmentIntensity = value ? BURROW_ENVIRONMENT_INTENSITY : SURFACE_ENVIRONMENT_INTENSITY;
  hud.root.classList.toggle('underground', value);
  if (!value) burrow.showPlacementCells(false);
}

function enterBurrow() {
  if (!burrow.exists) return false;
  closePanels();
  stopWalking();
  player.gatherTarget = null;
  player.combatTarget = null;
  setUnderground(true);
  const arrival = burrow.space.nearestWalkable(burrow.shaftCenter.x, burrow.shaftCenter.z + 3.2);
  Object.assign(player, { x: arrival.x, z: arrival.z, y: BURROW_ORIGIN.y, speed: 0, heading: 0 });
  hud.fade();
  updateCamera(0, true);
  if (!save.burrowDug) hud.setHint('Tap the floor to walk · tap sand marked ✦ to dig · walk into the light, then tap ⬆\u00a0Go outside');
  else hud.setHint(null);
  refreshHud(null);
  persist();
  return true;
}

function exitBurrow() {
  if (!underground) return false;
  closePanels();
  cancelPlacement();
  stopWalking();
  setUnderground(false);
  const { x, z } = burrow.state.entrance;
  const outside = navigation.nearestWalkable(x - 2.2, z - 1.6, 10) || HOME_SPOT;
  Object.assign(player, { x: outside.x, z: outside.z, y: world.heightAt(outside.x, outside.z), speed: 0, heading: Math.PI + 0.4 });
  hud.fade();
  hud.setHint(null);
  updateCamera(0, true);
  refreshHud(null);
  persist();
  return true;
}

function walkToEntrance({ enter = false } = {}) {
  if (!burrow.exists || underground) return false;
  const { x, z } = burrow.state.entrance;
  if (Math.hypot(x - player.x, z - player.z) <= ENTRANCE_REACH + 0.3) {
    if (enter) return enterBurrow();
    stopWalking();
    hud.bumpTravel();
    return true;
  }
  const awayX = player.x - x;
  const awayZ = player.z - z;
  const awayLength = Math.hypot(awayX, awayZ) || 1;
  const stand = navigation.nearestWalkable(x + (awayX / awayLength) * (ENTRANCE_BLOCK_RADIUS + 0.8), z + (awayZ / awayLength) * (ENTRANCE_BLOCK_RADIUS + 0.8), 6);
  if (!stand || !setDestination(stand.x, stand.z)) return false;
  player.walkGoal = enter ? 'enterBurrow' : 'entrance';
  return true;
}

function travelOption() {
  if (!burrow.exists || placement.entrance || placement.station || player.dyingTimer > 0) return null;
  if (player.pathIndex < player.path.length || player.digTarget) return null;
  if (underground) return Math.hypot(burrow.shaftCenter.x - player.x, burrow.shaftCenter.z - player.z) <= ENTRANCE_REACH ? 'exit' : null;
  return Math.hypot(burrow.state.entrance.x - player.x, burrow.state.entrance.z - player.z) <= TRAVEL_REACH_SURFACE ? 'enter' : null;
}

function travel() {
  const option = travelOption();
  if (option === 'enter') return enterBurrow();
  if (option === 'exit') return exitBurrow();
  return false;
}

function walkToShaft() {
  if (!underground) return false;
  if (Math.hypot(burrow.shaftCenter.x - player.x, burrow.shaftCenter.z - player.z) <= ENTRANCE_REACH) {
    stopWalking();
    hud.bumpTravel();
    return true;
  }
  return setDestination(burrow.shaftCenter.x, burrow.shaftCenter.z);
}

function walkToStation(station) {
  const spot = burrow.stationSpot(station);
  if (Math.hypot(spot.x - player.x, spot.z - player.z) <= STATION_REACH) {
    openStation(station);
    return true;
  }
  if (!setDestination(spot.x, spot.z)) return false;
  player.walkGoal = station;
  return true;
}

function openStation(station) {
  stopWalking();
  const spot = burrow.stationSpot(station);
  turnToward(Math.atan2(spot.x - player.x, spot.z - player.z), 1);
  if (station.kind === 'workshop') workbenchPanel.open();
  else storagePanel.open();
}

function startDigCell(column, row) {
  if (!burrow.canDig(column, row)) return false;
  const center = cellCenter(column, row);
  if (!setDestination(center.x, center.z)) return false;
  destinationMarker.visible = false;
  player.digTarget = { kind: 'cell', column, row, x: center.x, z: center.z, progress: 0 };
  return true;
}

function craftItem(category, kind) {
  const item = gear.craft(category, kind, save.inventory);
  if (!item) return null;
  const label = (category === 'shell' ? SHELLS : CLAWS)[kind].label;
  save.craftedOnce = true;
  soundAt('craft');
  hud.toast(`🔨 New ${label.toLowerCase()}! Open 🎒 to wear it`);
  hud.setBagDot(true);
  refreshHud(null);
  workbenchPanel.render();
  persist();
  return item;
}

function enchantItem(id) {
  const result = gear.enchant(id, save.inventory, random);
  if (!result) return null;
  const label = (result.category === 'shell' ? SHELLS : CLAWS)[result.item.kind].label;
  if (result.success) {
    soundAt('enchantSuccess');
    hud.toast(`✨ ${label} +${result.level}!`);
  } else {
    soundAt('enchantBreak');
    hud.toast(result.wasWorn ? `💥 Your ${label.toLowerCase()} broke` : `💥 ${label} broke`);
  }
  applyWornLook();
  refreshHud(null);
  persist();
  return result;
}

function wearItem(id) {
  if (!gear.wear(id)) return false;
  applyWornLook();
  backpack.render();
  persist();
  return true;
}

function walkToWorkshop() {
  const station = burrow.stationOf('workshop');
  if (!station) return false;
  if (!underground) return walkToEntrance({ enter: true });
  return walkToStation(station);
}

function setDestination(x, z, gatherTarget = null) {
  const path = space().findPath(player.x, player.z, x, z);
  if (!path.length) return false;
  player.path = path;
  player.pathIndex = 0;
  player.gatherTarget = gatherTarget;
  player.gatherProgress = 0;
  player.headingToWorkshop = false;
  player.walkGoal = null;
  player.digTarget = null;
  player.combatTarget = null;
  const end = path[path.length - 1];
  destinationMarker.position.set(end.x, space().heightAt(end.x, end.z) + 0.12, end.z);
  destinationMarker.visible = !gatherTarget;
  if (!save.hasMoved) {
    save.hasMoved = true;
    hud.setHint(null);
  }
  return true;
}

function stopWalking() {
  player.headingToWorkshop = false;
  player.walkGoal = null;
  player.digTarget = null;
  player.path = [];
  player.pathIndex = 0;
  destinationMarker.visible = false;
}

function soundAt(name, x = player.x, z = player.z, volume = 1) {
  if (!audioUnlocked) return;
  audio.play(name, { distance: Math.hypot(x - player.x, z - player.z), volume });
}

function updateAudio(deltaTime) {
  if (!audioUnlocked) return;
  player.stepDistance = (player.stepDistance || 0) + player.speed * deltaTime;
  if (player.stepDistance >= STEP_LENGTH) {
    player.stepDistance = 0;
    const surface = player.waterDepth > HEAD_UNDERWATER_DEPTH ? null : player.waterDepth > 0.04 ? 'stepSplash' : player.y < tideState.wetLevel ? 'stepWetSand' : 'stepSand';
    if (surface) soundAt(surface, player.x, player.z, 0.8);
    const inPool = !underground && world.retained.levelAt(player.x, player.z) > player.y;
    if (inPool && random() < FISH_PLOP_PER_SECOND * 3) soundAt('fishPlop', player.x + 3, player.z + 2, 0.7);
  }
  ambienceTimer -= deltaTime;
  if (ambienceTimer > 0) return;
  ambienceTimer = AMBIENCE_UPDATE_SECONDS;
  const heightAboveSea = player.y - tideState.seaLevel;
  audio.setAmbience({
    waveIntensity: underground ? 0.06 : Math.max(0.15, 1 - THREE.MathUtils.smoothstep(heightAboveSea, 0.5, 9)),
    wind: underground ? 0 : THREE.MathUtils.smoothstep(-player.z, 65, 95),
    underwater: player.waterDepth > HEAD_UNDERWATER_DEPTH,
  });
  const fighting = !underground && enemies.list.some((enemy) => enemy.state === 'chase' || enemy.state === 'landing');
  audio.setMusicMood(fighting ? 'combat' : !underground && player.z < GULL_MOOD_EDGE_Z ? 'gull' : 'calm');
}

function playerStats() {
  return gear.stats(progression.attackBonus());
}

function rollDamage(attack, defense) {
  const spread = 1 - DAMAGE_SPREAD + 2 * DAMAGE_SPREAD * random();
  return Math.max(1, Math.round(Math.max(1, attack - defense / 2) * spread));
}

function floatAt(x, y, z, text, kind) {
  projected.set(x, y, z).project(camera);
  if (projected.z > 1) return;
  hud.floatText((projected.x * 0.5 + 0.5) * innerWidth, (-projected.y * 0.5 + 0.5) * innerHeight, text, kind);
}

function engage(enemy) {
  if (!enemies.alive(enemy)) return false;
  stopWalking();
  player.gatherTarget = null;
  player.combatTarget = enemy;
  player.attackTimer = PLAYER_FIRST_STRIKE_SECONDS;
  player.combatRepathTimer = 0;
  if (!save.hasMoved) {
    save.hasMoved = true;
    hud.setHint(null);
  }
  return true;
}

function strike(enemy) {
  const stats = playerStats();
  player.hitCount++;
  const isSting = stats.ability && stats.ability.id === 'sting' && player.hitCount % STING_EVERY_HITS === 0;
  const damage = rollDamage(stats.attack, enemy.definition.defense) * (isSting ? 2 : 1);
  player.lastCombatTime = simulationTime;
  floatAt(enemy.x, enemy.y + enemy.altitude + enemy.definition.barHeight * 0.7, enemy.z, isSting ? `${damage}!` : String(damage), isSting ? 'sting' : 'dealt');
  hermit.playAttack(isSting ? 'both' : player.hitCount % 2 ? 'big' : 'small');
  soundAt('clawSnap', enemy.x, enemy.z);
  soundAt(isSting ? 'stingHit' : 'hitThud', enemy.x, enemy.z);
  enemies.damage(enemy, damage, simulationTime, player);
  if (stats.healOnHit && progression.state.health < progression.maxHealth()) {
    progression.state.health = Math.min(progression.maxHealth(), progression.state.health + stats.healOnHit);
    floatAt(player.x, player.y + 2.2, player.z, `+${stats.healOnHit} ❤`, 'experience');
  }
}

function hitPlayer(enemy) {
  if (player.dyingTimer > 0) return;
  const stats = playerStats();
  let damage = rollDamage(enemy.definition.attack, stats.defense);
  const braced = stats.ability && stats.ability.id === 'brace' && player.speed < BRACE_MAXIMUM_SPEED;
  if (braced) damage = Math.max(1, Math.round(damage * BRACE_DAMAGE_FACTOR));
  progression.state.health -= damage;
  player.lastCombatTime = simulationTime;
  floatAt(player.x, player.y + 2.4, player.z, `−${damage}`, 'taken');
  hud.flashHurt();
  const awayX = player.x - enemy.x;
  const awayZ = player.z - enemy.z;
  const awayLength = Math.hypot(awayX, awayZ) || 1;
  const strength = THREE.MathUtils.clamp(damage / (progression.maxHealth() * 0.2), 0.4, 1.6);
  tryStep(player.x + (awayX / awayLength) * KNOCKBACK_DISTANCE * strength, player.z + (awayZ / awayLength) * KNOCKBACK_DISTANCE * strength);
  const sideways = Math.sign(Math.sin(Math.atan2(-awayX, -awayZ) - player.heading)) || 1;
  hermit.playHurt(strength, sideways);
  soundAt('shellClonk');
  const idle = !player.combatTarget && !player.gatherTarget && player.pathIndex >= player.path.length && !keyboardDirection();
  if (idle) engage(enemy);
  if (progression.state.health <= 0) die();
}

function enemyKilled(enemy) {
  if (player.combatTarget === enemy) player.combatTarget = null;
  const levelsGained = progression.gainExperience(enemy.definition.experience);
  floatAt(enemy.x, enemy.y + enemy.altitude + enemy.definition.barHeight, enemy.z, `+${enemy.definition.experience} XP`, 'experience');
  if (enemy.definition.pearlChance && random() < enemy.definition.pearlChance) {
    save.inventory.pearls = (save.inventory.pearls || 0) + 1;
    hud.toast('🦪 The shore crab dropped a pearl!');
    refreshHud('pearls');
  }
  if (levelsGained) announceLevel();
  persist();
}

function announceLevel() {
  soundAt('levelUp');
  hud.toast(`⬆ Level ${progression.state.level}! Max HP +8 · attack +1`);
}

function wakeSpot() {
  if (burrow.exists) return burrow.space.nearestWalkable(burrow.shaftCenter.x, burrow.shaftCenter.z + 2.2);
  return navigation.nearestWalkable(HOME_SPOT.x, HOME_SPOT.z, 10) || HOME_SPOT;
}

function die() {
  stopWalking();
  player.gatherTarget = null;
  player.combatTarget = null;
  player.dyingTimer = DEATH_ANIMATION_SECONDS;
  hermit.playDeath();
  soundAt('death');
  enemies.calmAll(RESPAWN_CALM_SECONDS + DEATH_ANIMATION_SECONDS, simulationTime);
  workbenchPanel.close();
  if (backpack.isOpen) backpack.close();
  hud.showDeath();
}

function finishDeath() {
  const dropped = gear.dropAll();
  const carried = Object.fromEntries(Object.entries(save.inventory).filter(([, amount]) => amount > 0));
  if (dropped.shells.length || dropped.claws.length || Object.keys(carried).length) remains.add({ x: player.x, z: player.z, inventory: carried, gear: dropped });
  save.inventory = {};
  applyWornLook();
  hermit.resetPose();
  progression.state.health = progression.maxHealth();
  player.lastCombatTime = -100;
  const spot = wakeSpot();
  setUnderground(burrow.exists);
  Object.assign(player, { x: spot.x, z: spot.z, y: space().heightAt(spot.x, spot.z), speed: 0 });
  updateCamera(0, true);
  hud.toast('💀 You were defeated — your things wait in your remains');
  refreshHud(null);
  persist();
}

function recoverRemains(entry) {
  for (const [type, amount] of Object.entries(entry.inventory)) save.inventory[type] = (save.inventory[type] || 0) + amount;
  gear.restore(entry.gear);
  applyWornLook();
  remains.remove(entry);
  soundAt('recoverRemains');
  hud.toast('🎒 You recovered your things');
  refreshHud('remains');
  persist();
}

function tryStep(nextX, nextZ) {
  if (space().isWalkable(nextX, nextZ)) {
    player.x = nextX;
    player.z = nextZ;
    return true;
  }
  if (space().isWalkable(nextX, player.z)) {
    player.x = nextX;
    return true;
  }
  if (space().isWalkable(player.x, nextZ)) {
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
  if (player.dyingTimer > 0) {
    player.dyingTimer -= deltaTime;
    player.speed = 0;
    if (player.dyingTimer <= 0) finishDeath();
    hermit.update(deltaTime, { x: player.x, y: player.y, z: player.z, heading: player.heading, speed: 0, working: false, groundNormal: player.groundNormal });
    return;
  }
  const waterDepth = space().waterLevelAt(player.x, player.z, tideState.seaLevel) - player.y;
  const topSpeed = (waterDepth > 0.7 ? WADE_SPEED : WALK_SPEED) * gear.stats().speedFactor;
  let targetSpeed = 0;
  const steering = keyboardDirection();
  const combatTarget = player.combatTarget && enemies.alive(player.combatTarget) ? player.combatTarget : null;
  if (!combatTarget) player.combatTarget = null;
  let inStrikingRange = false;
  if (combatTarget && !steering) {
    const reach = PLAYER_ATTACK_REACH + combatTarget.definition.radius + (player.wasInStrikingRange ? STRIKING_RANGE_TOLERANCE : 0);
    const distance = Math.hypot(combatTarget.x - player.x, combatTarget.z - player.z);
    if (distance <= reach) {
      inStrikingRange = true;
      player.path = [];
      player.pathIndex = 0;
    } else {
      player.combatRepathTimer -= deltaTime;
      if (player.combatRepathTimer <= 0 || player.pathIndex >= player.path.length) {
        player.combatRepathTimer = COMBAT_REPATH_SECONDS;
        player.path = space().findPath(player.x, player.z, combatTarget.x, combatTarget.z);
        player.pathIndex = 0;
      }
    }
  }
  if (steering) {
    stopWalking();
    player.gatherTarget = null;
    player.combatTarget = null;
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
    const arrivalDistance = isLast && player.gatherTarget ? RESOURCE_TYPES[player.gatherTarget.type].standOff : 0.25;
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
  const ground = space();
  player.y = ground.heightAt(player.x, player.z);
  player.waterDepth = ground.waterLevelAt(player.x, player.z, tideState.seaLevel) - player.y;
  const sampleReach = 0.5;
  player.groundNormal.set(ground.heightAt(player.x - sampleReach, player.z) - ground.heightAt(player.x + sampleReach, player.z), 2 * sampleReach, ground.heightAt(player.x, player.z - sampleReach) - ground.heightAt(player.x, player.z + sampleReach)).normalize();

  const arrived = player.pathIndex >= player.path.length;
  if (player.walkGoal && arrived) {
    const goal = player.walkGoal;
    player.walkGoal = null;
    if (goal === 'enterBurrow' && !underground && Math.hypot(burrow.state.entrance.x - player.x, burrow.state.entrance.z - player.z) <= TRAVEL_REACH_SURFACE) enterBurrow();
    else if (goal === 'rack' && !underground && Math.hypot(rack.state.x - player.x, rack.state.z - player.z) <= RACK_REACH + 0.8) {
      stopWalking();
      rackPanel.open();
    } else if (typeof goal === 'object' && underground) {
      const spot = burrow.stationSpot(goal);
      if (Math.hypot(spot.x - player.x, spot.z - player.z) <= STATION_REACH) openStation(goal);
    }
  }
  let digging = false;
  if (player.digTarget) {
    const dig = player.digTarget;
    const reach = dig.kind === 'entrance' ? 0.8 : BURROW_DIG_REACH;
    const distance = Math.hypot(dig.x - player.x, dig.z - player.z);
    if (distance <= reach || (arrived && distance <= reach + 1.4)) {
      player.path = [];
      player.pathIndex = 0;
      digging = true;
      turnToward(Math.atan2(dig.x - player.x, dig.z - player.z), deltaTime);
      dig.progress += deltaTime;
      const total = dig.kind === 'entrance' ? ENTRANCE_DIG_SECONDS : burrow.digSeconds;
      if (dig.kind === 'cell') burrow.setDigProgress(dig.row * BURROW_GRID + dig.column, Math.min(1, dig.progress / total));
      player.digSoundTimer = (player.digSoundTimer || 0) - deltaTime;
      if (player.digSoundTimer <= 0) {
        player.digSoundTimer = 0.45;
        soundAt('gatherSeaLettuce', player.x, player.z, 0.8);
      }
      if (dig.progress >= total) {
        player.digTarget = null;
        if (dig.kind === 'entrance') digEntranceAt(dig.x, dig.z);
        else {
          if (!save.burrowDug) {
            save.burrowDug = true;
            hud.setHint(null);
          }
          burrow.finishDig(dig.column, dig.row);
          save.burrow = burrow.serialize();
          persist();
        }
      }
    } else if (arrived) {
      if (dig.kind === 'cell') burrow.setDigProgress(-1, 0);
      player.digTarget = null;
    }
  }

  player.wasInStrikingRange = inStrikingRange;
  const target = player.gatherTarget;
  let working = false;
  let gatherType = null;
  let gatherShare = 0;
  if (player.heldNode && player.heldNode !== target) {
    if (!player.heldNode.gathered) resources.release(player.heldNode);
    player.heldNode = null;
  }
  if (inStrikingRange) {
    working = true;
    turnToward(Math.atan2(combatTarget.x - player.x, combatTarget.z - player.z), deltaTime);
    player.attackTimer -= deltaTime;
    if (player.attackTimer <= 0) {
      player.attackTimer = PLAYER_ATTACK_INTERVAL;
      strike(combatTarget);
    }
  } else if (combatTarget) {
    player.attackTimer = Math.max(player.attackTimer, PLAYER_FIRST_STRIKE_SECONDS);
  }
  const nearbyRemains = remains.list.find((entry) => Math.hypot(entry.x - player.x, entry.z - player.z) <= REMAINS_REACH);
  if (nearbyRemains) recoverRemains(nearbyRemains);
  if (target && !target.gathered && player.pathIndex >= player.path.length) {
    const distance = Math.hypot(target.x - player.x, target.z - player.z);
    if (distance <= GATHER_REACH) {
      working = true;
      gatherType = target.type;
      turnToward(Math.atan2(target.x - player.x, target.z - player.z), deltaTime);
      player.gatherProgress += deltaTime;
      gatherShare = Math.min(1, player.gatherProgress / RESOURCE_TYPES[target.type].gatherSeconds);
      const lift = THREE.MathUtils.smoothstep(gatherShare, ITEM_LIFT_START_SHARE, 1);
      if (lift > 0) {
        const claw = hermit.clawPosition(target.type === 'shellBits' ? 'small' : 'big', projected);
        player.heldNode = target;
        resources.hold(target, THREE.MathUtils.lerp(target.x, claw.x, lift), THREE.MathUtils.lerp(target.y, claw.y, lift), THREE.MathUtils.lerp(target.z, claw.z, lift), 1 - 0.65 * lift);
      }
      if (player.gatherProgress >= RESOURCE_TYPES[target.type].gatherSeconds) {
        resources.gather(target);
        soundAt(`gather${target.type[0].toUpperCase()}${target.type.slice(1)}`);
        save.inventory[target.type] = (save.inventory[target.type] || 0) + 1;
        hud.toast(`+1 ${RESOURCE_TYPES[target.type].icon} ${RESOURCE_TYPES[target.type].label}`);
        floatAt(target.x, target.y + 1.4, target.z, `+${GATHER_EXPERIENCE} XP`, 'experience');
        if (progression.gainExperience(GATHER_EXPERIENCE)) announceLevel();
        refreshHud(target.type);
        player.gatherTarget = null;
        if (goalReached() && !save.goalAnnounced) {
          save.goalAnnounced = true;
          hud.toast(burrow.exists ? '✓ Enough for a workshop — build it in your burrow' : '✓ Enough for a workshop — dig a burrow first');
        }
        persist();
      }
    } else {
      resources.release(target);
      player.gatherTarget = null;
    }
  }
  if (digging) {
    working = true;
    gatherType = 'seaLettuce';
    gatherShare = (player.digTarget ? player.digTarget.progress : 0) % 1;
  }
  hermit.update(deltaTime, { x: player.x, y: player.y, z: player.z, heading: player.heading, speed: player.speed, working, gatherType, gatherProgress: gatherShare, groundNormal: player.groundNormal });
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

function updateHealth(deltaTime) {
  const fed = isWellFed();
  if (fed || simulationTime - player.lastCombatTime > HEALTH_REGEN_DELAY_SECONDS) progression.state.health = Math.min(progression.maxHealth(), progression.state.health + HEALTH_REGEN_PER_SECOND * (fed ? WELL_FED_REGEN_FACTOR : 1) * deltaTime);
}

function simulate(deltaTime) {
  simulationTime += deltaTime;
  save.worldTime += deltaTime;
  seaUniforms.uTime.value = simulationTime;
  updateTide(deltaTime);
  updatePlayer(deltaTime);
  if (underground) Object.assign(surfaceProbe, { x: burrow.state.entrance.x, z: burrow.state.entrance.z });
  enemies.update(deltaTime, simulationTime, underground ? surfaceProbe : player);
  rack.update(deltaTime);
  helpers.update(deltaTime, simulationTime, burrow.state.entrance);
  updateHealth(deltaTime);
  updateBodyWetness(deltaTime);
  noticeReef();
  seaUniforms.uCrabPosition.value.set(player.x, player.y, player.z);
  updateAudio(deltaTime);
  if (!underground) {
    tracks.update(deltaTime, simulationTime, player, tideState.seaLevel);
    ripples.update(deltaTime, simulationTime, player);
  }
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
  const minimumHeight = space().heightAt(camera.position.x, camera.position.z) + 2;
  if (camera.position.y < minimumHeight) camera.position.y = minimumHeight;
  camera.lookAt(cameraFocus);
  camera.updateMatrixWorld();
  const reefInView = !underground && cameraFocus.z + cameraDistance * REEF_VIEW_REACH_PER_DISTANCE > REEF_VIEW_THRESHOLD_Z;
  reefProps.setVisible(reefInView);
  resources.setReefVisible(reefInView);

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
  workshop.update(simulationTime, underground && !hasCraftedGear() && !anyPanelOpen() && !placement.station, camera, underground);
  burrow.update(simulationTime, camera, underground);
  helpers.render(simulationTime);
  rack.render(simulationTime, camera, !underground);
  hud.setBuff(isWellFed() ? `🍂 Well fed · ${Math.ceil(player.wellFedUntil - simulationTime)} s` : null);
  if (rackPanel.isOpen && Math.floor(simulationTime) !== Math.floor(simulationTime - 1 / 60)) rackPanel.render();
  if (helpersPanel.isOpen && Math.floor(simulationTime * 2) !== Math.floor((simulationTime - 1 / 60) * 2)) helpersPanel.render();
  hud.setTravel(travelOption());
  spotFeedback.visible = spotFeedback.visible && simulationTime < spotFeedbackUntil && !underground;
  spotFeedback.scale.setScalar(1 + 0.08 * Math.sin(simulationTime * 5));
  enemies.render(simulationTime, camera, player.combatTarget ? player.combatTarget.id : null);
  remains.update(simulationTime, camera, player);
  hud.setVitals(progression.state.level, progression.state.health, progression.maxHealth(), progression.state.experience, progression.experienceToNext());
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

function handleBurrowTap(clientX, clientY, isNewTouch) {
  if (placement.station) {
    if (!isNewTouch) return;
    const point = burrow.pointOnFloor(clientX, clientY, camera, raycaster);
    const free = point && burrow.freeCells().find((cell) => cell.column === point.column && cell.row === point.row);
    if (free && buildStation(placement.station, free.column, free.row)) cancelPlacement();
    else if (point) hud.toast('Pick one of the glowing spots');
    return;
  }
  if (isNewTouch) {
    const station = burrow.stationUnder(clientX, clientY, camera);
    if (station) {
      walkToStation(station);
      return;
    }
    if (burrow.shaftUnder(clientX, clientY, camera)) {
      walkToShaft();
      return;
    }
  }
  const point = burrow.pointOnFloor(clientX, clientY, camera, raycaster);
  if (!point) return;
  if (point.wall) {
    if (!isNewTouch) return;
    if (!startDigCell(point.column, point.row)) hud.toast('Dig next to an open part of your burrow');
    return;
  }
  setDestination(point.x, point.z);
}

function handleTap(clientX, clientY, isNewTouch) {
  if (paused || anyPanelOpen() || player.dyingTimer > 0) return;
  if (underground) {
    handleBurrowTap(clientX, clientY, isNewTouch);
    return;
  }
  if (placement.entrance) {
    if (!isNewTouch) return;
    const spot = groundPointUnder(clientX, clientY);
    if (spot) previewEntranceSpot(spot.x, spot.z);
    return;
  }
  if (isNewTouch && rack.under(clientX, clientY, camera)) {
    walkToRack();
    return;
  }
  if (isNewTouch && burrow.entranceUnder(clientX, clientY, camera, ENTRANCE_PICK_RADIUS_PIXELS)) {
    walkToEntrance();
    return;
  }
  const enemy = isNewTouch ? enemies.pick(clientX, clientY, camera) : null;
  if (enemy) {
    engage(enemy);
    return;
  }
  const remainsEntry = isNewTouch ? remains.pick(clientX, clientY, camera) : null;
  if (remainsEntry) {
    setDestination(remainsEntry.x, remainsEntry.z);
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
const gesture = { pointerId: null, startX: 0, startY: 0, dragging: false, pinched: false };
let pinchStartSpan = 0;
let pinchStartDistance = 0;
let lastSteerTime = 0;

function pinchSpan() {
  const [first, second] = [...activePointers.values()];
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function canSteer() {
  return !player.gatherTarget && !player.headingToWorkshop && !player.combatTarget && !player.walkGoal && !player.digTarget && !placement.entrance && !placement.station;
}

addEventListener('pointerdown', unlockAudio, { capture: true });
addEventListener('keydown', unlockAudio, { capture: true });
canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 1) {
    Object.assign(gesture, { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false, pinched: false });
  } else if (activePointers.size === 2) {
    if (gesture.dragging) stopWalking();
    gesture.pinched = true;
    pinchStartSpan = pinchSpan();
    pinchStartDistance = cameraDistance;
  }
});
canvas.addEventListener('pointermove', (event) => {
  if (!activePointers.has(event.pointerId)) return;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) {
    cameraDistance = THREE.MathUtils.clamp((pinchStartDistance * pinchStartSpan) / Math.max(20, pinchSpan()), ...CAMERA_DISTANCE_LIMITS);
    return;
  }
  if (gesture.pinched || event.pointerId !== gesture.pointerId || placement.entrance || placement.station) return;
  if (!gesture.dragging) {
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < DRAG_START_PIXELS) return;
    gesture.dragging = true;
    lastSteerTime = performance.now();
    handleTap(event.clientX, event.clientY, false);
  } else if (performance.now() - lastSteerTime > 120 && canSteer()) {
    lastSteerTime = performance.now();
    handleTap(event.clientX, event.clientY, false);
  }
});
function endPointer(event) {
  if (!activePointers.delete(event.pointerId)) return;
  const isTap = event.type === 'pointerup' && event.pointerId === gesture.pointerId && !gesture.pinched && !gesture.dragging && activePointers.size === 0;
  if (event.pointerId === gesture.pointerId) gesture.pointerId = null;
  if (isTap) handleTap(event.clientX, event.clientY, true);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  cameraDistance = THREE.MathUtils.clamp(cameraDistance * Math.exp(event.deltaY * 0.0012), ...CAMERA_DISTANCE_LIMITS);
}, { passive: false });
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closePanels();
    if (placement.entrance || placement.station) cancelPlacement();
    hud.setBagDot(gear.hasNewItems());
  }
  heldKeys.add(event.key.toLowerCase());
});
addEventListener('keyup', (event) => heldKeys.delete(event.key.toLowerCase()));
addEventListener('blur', () => heldKeys.clear());

function setPaused(value) {
  if (paused === value) return;
  paused = value;
  hud.setPaused(paused);
  if (paused) persist();
  if (audioUnlocked) {
    if (paused) audio.context.suspend();
    else audio.context.resume();
  }
}
hud.onPause(setPaused);
hud.setVolumes(audioSettings);
hud.onVolume((key, value) => {
  audioSettings[key] = value;
  if (audioUnlocked) audio.setVolumes(audioSettings);
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(audioSettings));
  } catch {
    /* storage unavailable: setting lasts for this visit */
  }
});
hud.onGoalTap(goalTapped);
hud.onTravel(travel);
hud.onBuild(() => {
  if (underground && !anyPanelOpen()) buildPanel.open();
});
hud.onHelpers(() => {
  if (underground && !anyPanelOpen()) helpersPanel.open();
});
hud.onBag(openBackpack);
hud.setBagDot(gear.hasNewItems());
function startOver() {
  startingOver = true;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing stored */
  }
  location.reload();
}
hud.onReset(startOver);
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

if (burrow.exists) blockEntrance();
setUnderground(underground);
cameraDistance = cameraDistanceFor(underground);
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
    if (!burrow.exists) digEntranceAt(WORKSHOP_SPOT.x, WORKSHOP_SPOT.z);
    Object.assign(save.inventory, FIRST_GOAL);
    buildWorkshop();
  }
  if (pose.inventory) Object.assign(save.inventory, pose.inventory);
  for (const kind of pose.crafted || []) {
    Object.assign(save.inventory, SHELLS[kind].cost);
    craftItem('shell', kind);
  }
  if (pose.shell) hermit.setShell(SHELLS[pose.shell].look);
  if (pose.level) progression.setLevel(pose.level);
  if (pose.naked) {
    gear.dropAll();
    applyWornLook();
  }
  if (pose.enchanted) {
    for (const [category, kind] of [['shell', pose.enchanted.shell], ['claws', pose.enchanted.claws]]) {
      for (const [type, amount] of Object.entries((category === 'shell' ? SHELLS : CLAWS)[kind].cost)) save.inventory[type] = (save.inventory[type] || 0) + amount;
      const item = gear.craft(category, kind, save.inventory);
      item.enchant = pose.enchanted.level;
      gear.wear(item.id);
    }
    gear.markAllSeen();
    applyWornLook();
  }
  if (pose.remainsAt) remains.add({ x: pose.remainsAt.x, z: pose.remainsAt.z, inventory: { shellBits: 4 }, gear: { shells: [{ id: 90, kind: 'cone', enchant: pose.remainsEnchant || 0 }], claws: [], wornShellId: 90, wornClawsId: null } });
  if (pose.burrowAt) digEntranceAt(pose.burrowAt.x, pose.burrowAt.z);
  for (const [column, row] of pose.dug || []) burrow.finishDig(column, row);
  for (const kind of pose.stations || []) {
    Object.assign(save.inventory, STATION_KINDS[kind].cost);
    const cell = kind === 'workshop' ? DEFAULT_WORKSHOP_CELL : DEFAULT_STORAGE_CELL;
    buildStation(kind, cell.column, cell.row);
  }
  if (pose.stored) Object.assign(storage.inventory, pose.stored);
  if (pose.rack) {
    Object.assign(save.inventory, STATION_KINDS.dryingRack.cost);
    buildRackStation();
    rack.state.slots = [...pose.rack.slots];
    rack.state.ready = pose.rack.ready;
  }
  if (pose.wellFed) player.wellFedUntil = simulationTime + 64;
  for (const job of pose.helpers || []) {
    Object.assign(save.inventory, HELPER_COST);
    recruitHelper(job);
  }
  if (pose.helpersResting) for (const helper of helpers.list) helper.restTimer = 600;
  for (let step = 0; step < (pose.simulateSeconds || 0) / FIXED_STEP; step++) simulate(FIXED_STEP);
  if (pose.inBurrow) {
    enterBurrow();
    cameraDistance = pose.distance;
    player.heading = pose.heading ?? 0;
    for (let step = 0; step < 20; step++) simulate(FIXED_STEP);
  }
  if (pose.placingStation) {
    Object.assign(save.inventory, STATION_KINDS[pose.placingStation].cost);
    chooseStation(pose.placingStation);
  }
  if (pose.placingEntrance) startEntrancePlacement();
  if (pose.previewEntrance) previewEntranceSpot(pose.previewEntrance.x, pose.previewEntrance.z);
  if (pose.storagePanel) storagePanel.open();
  if (pose.helpersPanel) helpersPanel.open();
  if (pose.rackPanel) rackPanel.open();
  refreshHud(null);
  if (pose.panel) workbenchPanel.open(pose.panel);
  if (pose.scrollPanel) for (const body of hud.root.querySelectorAll('.workbench.visible .workbench-body')) body.scrollTop = body.scrollHeight;
  if (pose.armEnchant) hud.root.querySelector('.workbench .enchant-odds.risky')?.closest('.item').querySelector('[data-enchant]').click();
  if (pose.backpack) openBackpack();
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
  } else if (pose.enemy) {
    const enemySpot = navigation.nearestWalkable(spot.x + pose.enemy.offsetX, spot.z + pose.enemy.offsetZ, 10);
    const enemy = enemies.spawn(pose.enemy.kind, enemySpot.x, enemySpot.z);
    for (const other of enemies.list.filter((candidate) => candidate !== enemy)) Object.assign(other, { state: 'dead', respawnTimer: 999 });
    enemy.heading = Math.atan2(spot.x - enemySpot.x, spot.z - enemySpot.z);
    if (enemy.definition.flies) {
      enemy.altitude = 0;
      enemy.state = 'chase';
      enemy.anchor = { x: enemy.x, z: enemy.z };
      enemy.attackTimer = enemy.definition.windup;
    }
    if (pose.fightSeconds) engage(enemy);
    for (let step = 0; step < Math.max(30, pose.fightSeconds / FIXED_STEP); step++) simulate(FIXED_STEP);
    const momentSteps = { strike: 12, hurt: 6, enemyHurt: 5, dying: 40 }[pose.moment] || 0;
    if (pose.moment === 'strike') hermit.playAttack('big');
    if (pose.moment === 'hurt') hitPlayer(enemy);
    if (pose.moment === 'enemyHurt') enemies.damage(enemy, 1, simulationTime, player);
    if (pose.moment === 'dying') {
      progression.state.health = 1;
      hitPlayer(enemy);
    }
    for (let step = 0; step < momentSteps; step++) simulate(FIXED_STEP);
  } else if (pose.nearAnemone) {
    const anemone = life.anemoneSpots.filter((candidate) => world.retained.levelAt(candidate.x, candidate.z) > -0.5).sort((first, second) => Math.hypot(first.x - spot.x, first.z - spot.z) - Math.hypot(second.x - spot.x, second.z - spot.z))[0];
    const beside = navigation.nearestWalkable(anemone.x - 1.6, anemone.z - 0.4, 6);
    Object.assign(player, { x: beside.x, z: beside.z, heading: 1.3 });
    for (let step = 0; step < 30; step++) simulate(FIXED_STEP);
  } else if (pose.gather) {
    const node = resources.nodes.filter((candidate) => candidate.type === pose.gather.type && !candidate.gathered).sort((first, second) => Math.hypot(first.x - spot.x, first.z - spot.z) - Math.hypot(second.x - spot.x, second.z - spot.z))[0];
    const stand = navigation.nearestWalkable(node.x - 3.5, node.z - 1.5, 6);
    Object.assign(player, { x: stand.x, z: stand.z });
    setDestination(node.x, node.z, node);
    for (let step = 0; step < 600 && !(player.gatherTarget && player.gatherProgress / RESOURCE_TYPES[node.type].gatherSeconds >= pose.gather.share); step++) simulate(FIXED_STEP);
  } else {
    for (let step = 0; step < (pose.gullCircling ? 240 : 90); step++) simulate(FIXED_STEP);
    const gull = pose.gullCircling && enemies.list.find((enemy) => enemy.kind === 'gull');
    if (gull) {
      const watchSpot = navigation.nearestWalkable(gull.x + 6, gull.z + 7, 20);
      Object.assign(player, { x: watchSpot.x, z: watchSpot.z });
      simulate(FIXED_STEP);
    }
  }
  updateCamera(0, true);
  renderScene();
  renderScene();
  window.__frameReady = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
} else {
  updateCamera(0, true);
  renderer.setAnimationLoop((now) => {
    if (!performanceMonitor.shouldRender(now)) return;
    const deltaTime = Math.max(0, Math.min(0.05, (now - previousFrameTime) / 1000));
    previousFrameTime = now;
    if (!paused) simulate(deltaTime);
    updateCamera(deltaTime, false);
    renderScene();
    performanceMonitor.recordFrame(now);
  });
}

window.__debug = {
  simulate, player, world, resources, navigation, save, tideState, camera, renderer, scene, pipeline, performanceMonitor, quality, qualityName,
  tracks, ripples, hermit, gear, workshop, workbenchPanel, backpack, openBackpack, buildWorkshop, craftItem, wearItem, walkToWorkshop, setDestination, setPaused, handleTap, renderScene, updateCamera, seaLevelAt,
  audio, isAudioUnlocked: () => audioUnlocked, progression, enemies, remains, engage, die, recoverRemains, playerStats, randomSource, enchantItem, rack, rackPanel, buildRackStation, eatKelp, isWellFed, walkToRack, helpers, helpersPanel, recruitHelper, burrow, storage, storagePanel, buildPanel, enterBurrow, exitBurrow, travel, travelOption, walkToShaft, cameraDistanceFor, getCameraDistance: () => cameraDistance, digEntranceAt, chooseEntranceSpot, startEntrancePlacement, buildStation, startDigCell, previewEntranceSpot, walkToEntrance, walkToStation, isUnderground: () => underground, entranceSpotProblem, enchantLevels: ENCHANT_LEVELS, wakeSpot, persist, startOver,
  setCameraDistance: (distance) => { cameraDistance = distance; },
  isPaused: () => paused,
};
