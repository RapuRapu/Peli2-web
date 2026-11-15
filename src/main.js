import * as THREE from 'three';
import { generateIslandHeightmap, buildTerrainMesh, createSeaDepthTexture } from './island.js';
import { createOcean } from './ocean.js';
import { createShip, createShipController } from './ship.js';
import { createVegetation } from './vegetation.js';
import { createWake } from './wake.js';
import { createPerformanceMonitor } from './performance.js';
import { createHud } from './hud.js';
import { createDolphins } from './dolphins.js';

const searchParameters = new URLSearchParams(location.search);
const screenshotPose = searchParameters.has('pose') ? Number(searchParameters.get('pose')) : null;
const isScreenshotMode = screenshotPose !== null;

const CAMERA_YAW = 0.55;
const MIN_CAMERA_DISTANCE = 75;
const MAX_CAMERA_DISTANCE = 380;

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
scene.add(buildTerrainMesh(heightmap));
const ocean = createOcean({ seabedTexture: createSeaDepthTexture(heightmap), terrainWorldSize: heightmap.worldSize, lighting });
scene.add(ocean.mesh);
const swayTime = { value: 0 };
createVegetation(scene, heightmap, swayTime);

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

const camera = new THREE.PerspectiveCamera(32, 1, 4, 3200);
const cameraFocus = new THREE.Vector3();
let cameraDistance = 150;

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

const BAY_ANGLE = Math.atan2(0.45, 0.08);
const POSES = {
  1: { angle: BAY_ANGLE, clearance: 70, distance: 150, warmup: 12 },
  2: { angle: BAY_ANGLE, clearance: 70, distance: 75, warmup: 12 },
  3: { angle: BAY_ANGLE, clearance: 70, distance: 380, warmup: 12 },
  4: { angle: 0.45, clearance: 35, distance: 170, warmup: 12 },
  5: { angle: 1.05, clearance: 30, distance: 110, warmup: 25 },
  6: { angle: BAY_ANGLE, clearance: 70, distance: 150, warmup: 12 },
  7: { angle: BAY_ANGLE + 0.4, clearance: 170, distance: 110, warmup: 16 },
};

const startPose = POSES[screenshotPose] || POSES[1];
const startWater = findOpenWater(startPose.angle, startPose.clearance);
shipController.place(startWater.x, startWater.z, startWater.tangentHeading, 5);
cameraDistance = startPose.distance;

const podHomes = [BAY_ANGLE + 0.4, BAY_ANGLE + 2.4, BAY_ANGLE + 4.2].map((angle) => findOpenWater(angle, 230));
const dolphins = createDolphins(scene, heightmap, podHomes, { waterColor: new THREE.Color(0.05, 0.32, 0.4) });
const shipForDolphins = { x: 0, z: 0, heading: 0, speed: 0, length: ship.length, halfBeam: ship.halfBeam };

const raycaster = new THREE.Raycaster();
const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pointerNdc = new THREE.Vector2();
const pointerHit = new THREE.Vector3();
const activePointers = new Map();
let pinchStartSpan = 0;
let pinchStartDistance = cameraDistance;
let steeringPointerId = null;
let hasSteered = false;

function steerTowardScreenPoint(clientX, clientY, held) {
  pointerNdc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  if (raycaster.ray.intersectPlane(seaPlane, pointerHit)) {
    shipController.setTarget(pointerHit.x, pointerHit.z, held);
    hasSteered = true;
  }
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
    steerTowardScreenPoint(event.clientX, event.clientY, true);
  } else if (activePointers.size === 2) {
    steeringPointerId = null;
    shipController.releaseSteering();
    pinchStartSpan = pinchSpan();
    pinchStartDistance = cameraDistance;
  }
});
canvas.addEventListener('pointermove', (event) => {
  const pointer = activePointers.get(event.pointerId);
  if (!pointer) return;
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  if (activePointers.size === 2 && pinchStartSpan > 0) {
    cameraDistance = THREE.MathUtils.clamp(pinchStartDistance * (pinchStartSpan / Math.max(1, pinchSpan())), MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
  } else if (event.pointerId === steeringPointerId) {
    steerTowardScreenPoint(event.clientX, event.clientY, true);
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
  cameraDistance = THREE.MathUtils.clamp(cameraDistance * Math.exp(event.deltaY * 0.0012), MIN_CAMERA_DISTANCE, MAX_CAMERA_DISTANCE);
}, { passive: false });

const heldKeys = new Set();
addEventListener('keydown', (event) => heldKeys.add(event.key.toLowerCase()));
addEventListener('keyup', (event) => heldKeys.delete(event.key.toLowerCase()));

function applyKeyboardSteering() {
  const turnLeft = heldKeys.has('a') || heldKeys.has('arrowleft');
  const turnRight = heldKeys.has('d') || heldKeys.has('arrowright');
  if (turnLeft === turnRight) return;
  const state = shipController.state;
  const desiredHeading = state.heading + (turnLeft ? 0.6 : -0.6);
  shipController.setTarget(state.x + Math.sin(desiredHeading) * 80, state.z + Math.cos(desiredHeading) * 80, false);
  hasSteered = true;
}

const performanceMonitor = createPerformanceMonitor(renderer, { fixedPixelRatio: isScreenshotMode ? Math.min(devicePixelRatio, 2) : null });
const hud = createHud();

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
  const state = shipController.state;
  const lookAhead = Math.min(cameraDistance * 0.12 * Math.min(1, camera.aspect), state.speed * 3);
  const focusX = state.x + Math.sin(state.heading) * lookAhead;
  const focusZ = state.z + Math.cos(state.heading) * lookAhead;
  const follow = snap ? 1 : 1 - Math.exp(-deltaTime * 2.5);
  cameraFocus.x += (focusX - cameraFocus.x) * follow;
  cameraFocus.z += (focusZ - cameraFocus.z) * follow;
  const zoomFraction = (cameraDistance - MIN_CAMERA_DISTANCE) / (MAX_CAMERA_DISTANCE - MIN_CAMERA_DISTANCE);
  cameraFocus.y = THREE.MathUtils.lerp(9, 1.5, Math.min(1, zoomFraction * 3));
  const pitch = THREE.MathUtils.lerp(0.62, 1.0, Math.sqrt(zoomFraction));
  cameraOffsetDirection.set(Math.sin(CAMERA_YAW) * Math.cos(pitch), Math.sin(pitch), Math.cos(CAMERA_YAW) * Math.cos(pitch));
  camera.position.copy(cameraFocus).addScaledVector(cameraOffsetDirection, cameraDistance);
  camera.lookAt(cameraFocus);

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
  const state = shipController.state;
  targetMarker.visible = state.hasTarget;
  if (!state.hasTarget) return;
  targetMarker.position.set(state.targetX, 0.35, state.targetZ);
  const pulse = 1 + 0.12 * Math.sin(time * 5);
  const markerScale = (cameraDistance / 150) * pulse;
  targetMarker.scale.set(markerScale, 1, markerScale);
}

function updateHud() {
  const state = shipController.state;
  shipScreen.set(state.x, 0, state.z).project(camera);
  windScreen.set(state.x + wind.directionX * 50, 0, state.z + wind.directionZ * 50).project(camera);
  const windScreenAngle = Math.atan2(-(windScreen.y - shipScreen.y) / camera.aspect, windScreen.x - shipScreen.x);
  hud.update({ speedKnots: state.speed * 1.944, windScreenAngle, aground: state.aground, showHint: !hasSteered, efficiencyAngle: state.angleOffWind });
}

let simulationTime = 0;
let previousFrameTime = performance.now();
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

if (isScreenshotMode) {
  hud.setVisible(searchParameters.has('hud'));
  performanceMonitor.setVisible(false);
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

window.__debug = { shipController, heightmap, renderer, scene, camera, dolphins, simulate };
