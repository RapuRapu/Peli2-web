import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySeaside } from './seaside.js';
import { random } from './random.js';

export const PLAYER_BODY_RADIUS = 0.9;
export const LEASH_DISTANCE = 20;
export const WORLD_LABEL_TOP_PIXELS = 128;

export const ENEMY_KINDS = {
  sandHopper: { label: 'Sand hopper', health: 12, attack: 2, defense: 0, attackInterval: 1.2, windup: 0.45, speed: 5.5, radius: 0.45, temperament: 'passive', sightRange: 0, experience: 10, pearlChance: 0, respawnSeconds: 60, barHeight: 1.4 },
  shoreCrab: { label: 'Shore crab', health: 30, attack: 5, defense: 2, attackInterval: 1.5, windup: 0.6, speed: 5.2, radius: 0.95, temperament: 'aggressive', sightRange: 9, experience: 25, pearlChance: 0.1, respawnSeconds: 90, barHeight: 2.0 },
  gull: { label: 'Gull', health: 300, attack: 27, defense: 0, attackInterval: 2.2, windup: 1.0, speed: 5.5, radius: 2.4, temperament: 'aggressive', sightRange: 0, experience: 300, pearlChance: 0, respawnSeconds: 180, barHeight: 11.5, flies: true },
};

const MINIMUM_RESPAWN_DISTANCE = 25;
const WANDER_RADIUS = 6;
const REPATH_SECONDS = 0.5;
const DEATH_SINK_SECONDS = 1.7;
const PACK_ALERT_RANGE = 12;
const STRIKE_SOUNDS = { sandHopper: 'hopperJump', shoreCrab: 'crabClatter', gull: 'wingFlap' };
const IDLE_SOUNDS = { sandHopper: { name: 'hopperChirp', perSecond: 0.12 }, gull: { name: 'gullCall', perSecond: 0.06 } };
const ENEMY_STRIKE_REACH = 1.9;
const OUT_OF_REACH_RESET_SECONDS = 1;
const PACK_SPREAD = 3.5;
const HURT_SECONDS = 0.45;
const KNOCKBACK_BY_KIND = { sandHopper: 0.6, shoreCrab: 0.25, gull: 0.1 };
const FLASH_STRENGTH = 0.3;
const GULL_CIRCLE_RADIUS = 16;
const GULL_CIRCLE_ALTITUDE = 30;
const GULL_FLIGHT_SPEED = 16;
const GULL_LANDING_OFFSET = 6;

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);

function painted(geometry, colorAt) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    colorAt(color, positions.getX(index), positions.getY(index), positions.getZ(index));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

const solid = (geometry, color) => painted(geometry, (target) => target.copy(color));

function buildHopperGeometry() {
  const shell = linearColor(0.78, 0.72, 0.6);
  const stripe = linearColor(0.5, 0.44, 0.36);
  const dark = linearColor(0.06, 0.05, 0.05);
  const parts = [];
  const segments = 7;
  for (let segment = 0; segment < segments; segment++) {
    const share = segment / (segments - 1);
    const angle = -0.9 + share * 1.9;
    const radius = 0.17 * (1 - 0.45 * Math.abs(share - 0.35));
    const sphere = new THREE.SphereGeometry(radius, 10, 7).scale(0.8, 1, 0.75).translate(0, Math.cos(angle) * 0.28 + 0.02, Math.sin(angle) * 0.42 - 0.05);
    parts.push(painted(sphere, (color, x, y) => color.copy(shell).lerp(stripe, segment % 2 ? 0.45 : 0.1).multiplyScalar(0.8 + 0.25 * THREE.MathUtils.smoothstep(y, 0.1, 0.45))));
  }
  for (const side of [-1, 1]) {
    parts.push(solid(new THREE.SphereGeometry(0.045, 6, 5).translate(side * 0.1, 0.32, 0.4), dark));
    parts.push(solid(new THREE.ConeGeometry(0.018, 0.55, 4).rotateX(0.9).rotateZ(-side * 0.35).translate(side * 0.12, 0.42, 0.62), stripe));
    for (let pair = 0; pair < 3; pair++) parts.push(solid(new THREE.ConeGeometry(0.025, 0.32, 4).rotateX(Math.PI).rotateZ(side * 0.5).translate(side * 0.16, 0.08, 0.2 - pair * 0.2), stripe));
  }
  return mergeGeometries(parts);
}

function buildShoreCrabBody() {
  const olive = linearColor(0.36, 0.46, 0.18);
  const mottle = linearColor(0.55, 0.58, 0.26);
  const belly = linearColor(0.78, 0.6, 0.22);
  const dark = linearColor(0.05, 0.05, 0.04);
  const carapace = new THREE.SphereGeometry(1, 28, 14).scale(0.95, 0.34, 0.72).translate(0, 0.62, 0);
  const positions = carapace.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    if (z > 0) positions.setZ(index, z * (1 - 0.18 * Math.pow(Math.abs(x) / 0.95, 2)) - 0.08 * Math.pow(Math.abs(x), 3));
  }
  carapace.computeVertexNormals();
  const parts = [painted(carapace, (color, x, y, z) => color.copy(olive).lerp(mottle, 0.5 + 0.5 * Math.sin(x * 11 + z * 7) * Math.sin(z * 13 - x * 4)).lerp(belly, THREE.MathUtils.smoothstep(0.62 - y, 0.0, 0.2)))];
  for (const side of [-1, 1]) {
    for (let tooth = 0; tooth < 4; tooth++) {
      const angle = 0.55 + tooth * 0.22;
      parts.push(solid(new THREE.ConeGeometry(0.07, 0.2, 5).rotateZ(-side * Math.PI / 2).rotateY(side * (Math.PI / 2 - angle)).translate(side * Math.sin(angle) * 0.92, 0.66, Math.cos(angle) * 0.6), olive));
    }
    parts.push(solid(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 5).translate(side * 0.18, 0.86, 0.6), olive));
    parts.push(solid(new THREE.SphereGeometry(0.07, 8, 6).translate(side * 0.18, 0.98, 0.62), dark));
  }
  return mergeGeometries(parts);
}

function buildShoreCrabLeg() {
  const olive = linearColor(0.4, 0.48, 0.2);
  const tip = linearColor(0.28, 0.32, 0.13);
  const upper = painted(new THREE.CapsuleGeometry(0.075, 0.6, 3, 6).rotateZ(Math.PI / 2).translate(0.35, 0.12, 0), (color) => color.copy(olive));
  const lower = painted(new THREE.ConeGeometry(0.07, 0.75, 6).rotateZ(Math.PI - 0.5).translate(0.82, -0.18, 0), (color, x) => color.copy(olive).lerp(tip, THREE.MathUtils.smoothstep(x, 0.8, 1.05)));
  return mergeGeometries([upper, lower]);
}

function buildShoreCrabClaw() {
  const olive = linearColor(0.38, 0.47, 0.18);
  const dark = linearColor(0.12, 0.1, 0.07);
  const arm = solid(new THREE.CapsuleGeometry(0.1, 0.5, 3, 7).rotateX(Math.PI / 2).translate(0, 0, 0.25), olive);
  const palm = solid(new THREE.SphereGeometry(0.26, 12, 9).scale(0.8, 0.75, 1.3).translate(0, 0.02, 0.72), olive);
  const fixedFinger = painted(new THREE.ConeGeometry(0.09, 0.42, 7).rotateX(Math.PI / 2).translate(0.02, -0.06, 1.12), (color, x, y, z) => color.copy(olive).lerp(dark, THREE.MathUtils.smoothstep(z, 1.0, 1.3)));
  const movingFinger = painted(new THREE.ConeGeometry(0.08, 0.4, 7).rotateX(Math.PI / 2 - 0.35).translate(0.02, 0.12, 1.1), (color, x, y, z) => color.copy(olive).lerp(dark, THREE.MathUtils.smoothstep(z, 1.0, 1.3)));
  return mergeGeometries([arm, palm, fixedFinger, movingFinger]);
}

function buildGullBody() {
  const white = linearColor(0.95, 0.95, 0.93);
  const grey = linearColor(0.6, 0.64, 0.68);
  const black = linearColor(0.05, 0.05, 0.06);
  const beakYellow = linearColor(0.96, 0.78, 0.18);
  const beakRed = linearColor(0.85, 0.15, 0.08);
  const legPink = linearColor(0.92, 0.62, 0.5);
  const bodyShape = new THREE.SphereGeometry(1, 28, 18).scale(1.75, 1.75, 4.4);
  const bodyPositions = bodyShape.attributes.position;
  for (let index = 0; index < bodyPositions.count; index++) {
    const z = bodyPositions.getZ(index);
    const taper = 1 - 0.45 * THREE.MathUtils.smoothstep(-z, 0.5, 4.4);
    bodyPositions.setXYZ(index, bodyPositions.getX(index) * taper, bodyPositions.getY(index) * taper + z * 0.12, z);
  }
  bodyShape.computeVertexNormals();
  const body = painted(bodyShape.translate(0, 1.4, 0), (color, x, y) => color.copy(white).lerp(grey, THREE.MathUtils.smoothstep(y, 2.4, 3.1) * 0.55));
  const neckShape = new THREE.CylinderGeometry(1.15, 1.55, 2.8, 18, 4).rotateX(-0.5).translate(0, 2.95, 3.05);
  const neck = solid(neckShape, white);
  const head = solid(new THREE.SphereGeometry(1.3, 20, 14).scale(0.92, 0.9, 1.3).translate(0, 4.15, 4.05), white);
  const foldedWings = [-1, 1].flatMap((side) => [
    painted(new THREE.SphereGeometry(1, 16, 12).scale(0.42, 0.95, 3.4).rotateX(-0.12).rotateY(side * 0.06).translate(side * 1.32, 2.15, -0.6), (color, x, y, z) => color.copy(grey).multiplyScalar(0.92 + 0.12 * THREE.MathUtils.smoothstep(y, 1.6, 2.9))),
    painted(new THREE.ConeGeometry(0.42, 3.0, 8).rotateX(-Math.PI / 2 - 0.12).scale(1, 0.6, 1).translate(side * 0.9, 2.35, -4.6), (color, x, y, z) => color.copy(black).lerp(white, THREE.MathUtils.smoothstep(-z, 5.4, 5.6) * 0.6)),
  ]);
  const beak = solid(new THREE.ConeGeometry(0.42, 2.3, 10).rotateX(Math.PI / 2).scale(0.75, 1, 1).translate(0, 3.75, 6.0), beakYellow);
  const beakSpot = solid(new THREE.SphereGeometry(0.2, 8, 6).translate(0, 3.45, 6.3), beakRed);
  const eyeRing = linearColor(0.96, 0.82, 0.3);
  const eyes = [-1, 1].flatMap((side) => [solid(new THREE.SphereGeometry(0.27, 10, 8).translate(side * 1.02, 4.4, 4.5), eyeRing), solid(new THREE.SphereGeometry(0.17, 8, 6).translate(side * 1.13, 4.42, 4.55), black)]);
  const tail = painted(new THREE.ConeGeometry(1.25, 3.2, 8).rotateX(-Math.PI / 2).scale(1, 0.35, 1).translate(0, 1.7, -5.4), (color, x, y, z) => color.copy(grey).lerp(black, THREE.MathUtils.smoothstep(-z, 6.0, 6.8)));
  const legs = [-1, 1].flatMap((side) => [
    solid(new THREE.CylinderGeometry(0.24, 0.3, 4.4, 7).translate(side * 0.85, -2.0, 0.4), legPink),
    solid(new THREE.SphereGeometry(0.34, 8, 6).translate(side * 0.85, -2.1, 0.4), legPink),
    solid(new THREE.ConeGeometry(0.85, 0.3, 3).rotateY(Math.PI / 6).scale(1, 1, 1.5).translate(side * 0.85, -4.05, 1.0), legPink),
  ]);
  return mergeGeometries([body, neck, head, beak, beakSpot, ...eyes, tail, ...legs, ...foldedWings]);
}

function wingShape(span, chord) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -chord * 0.5);
  shape.quadraticCurveTo(span * 0.5, -chord * 0.62, span, -chord * 0.1);
  shape.lineTo(span * 0.96, chord * 0.12);
  shape.quadraticCurveTo(span * 0.5, chord * 0.55, 0, chord * 0.5);
  shape.closePath();
  return shape;
}

function buildGullWing(side) {
  const grey = linearColor(0.6, 0.64, 0.68);
  const black = linearColor(0.06, 0.06, 0.07);
  const white = linearColor(0.95, 0.95, 0.93);
  const span = 11;
  const geometry = new THREE.ShapeGeometry(wingShape(span, 3.4), 12).rotateX(Math.PI / 2);
  const flat = painted(geometry, (color, x, y, z) => {
    const tipShare = THREE.MathUtils.smoothstep(x, span * 0.72, span * 0.8);
    const mirror = (0.5 + 0.5 * Math.sin(x * 2.6)) * THREE.MathUtils.smoothstep(x, span * 0.82, span * 0.86);
    color.copy(grey).lerp(black, tipShare).lerp(white, mirror * 0.7 * tipShare);
  });
  const thickness = flat.clone().translate(0, -0.12, 0);
  const wing = mergeGeometries([flat, thickness]);
  if (side < 0) wing.scale(-1, 1, 1);
  return wing;
}

const GULL_SHADOW_SPAN = 30;

function createGullShadowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.filter = 'blur(3px)';
  context.fillStyle = '#fff';
  context.translate(size / 2, size / 2);
  context.beginPath();
  context.ellipse(0, 2, 10, 40, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(0, -40, 9, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(-9, 34);
  context.lineTo(-7, 60);
  context.lineTo(7, 60);
  context.lineTo(9, 34);
  context.fill();
  for (const side of [-1, 1]) {
    context.beginPath();
    context.moveTo(side * 6, -14);
    context.bezierCurveTo(side * 44, -24, side * 80, -14, side * 120, 26);
    context.bezierCurveTo(side * 84, 8, side * 44, 2, side * 6, 8);
    context.closePath();
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function createGullModel(scene, quality) {
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.85 });
  const wingMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, side: THREE.DoubleSide }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.85 });
  const root = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.y = 4.2;
  const body = new THREE.Mesh(buildGullBody(), material);
  torso.add(body);
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.35, 2.5, 1.2);
    const mesh = new THREE.Mesh(buildGullWing(side), wingMaterial);
    pivot.add(mesh);
    torso.add(pivot);
    return { pivot, mesh, side };
  });
  root.add(torso);
  for (const mesh of [body, ...wings.map((wing) => wing.mesh)]) mesh.castShadow = true;
  scene.add(root);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(GULL_SHADOW_SPAN, GULL_SHADOW_SPAN).rotateX(-Math.PI / 2).rotateY(Math.PI), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: createGullShadowTexture(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
  shadow.renderOrder = 1;
  scene.add(shadow);
  return { root, torso, wings, shadow, materials: [material, wingMaterial] };
}

export function createEnemies({ scene, world, navigation, quality, spawnTable, labelParent, onAttackPlayer, onKilled, onAlert = () => {}, onSound = () => {} }) {
  const hopperMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.6, wetRoughness: 0.1, instanceFlash: true });
  const crabMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38 }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.6, wetRoughness: 0.1, instanceFlash: true });
  const counts = Object.fromEntries(Object.keys(ENEMY_KINDS).map((kind) => [kind, spawnTable.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + entry.count, 0)]));
  const hopperMesh = new THREE.InstancedMesh(buildHopperGeometry(), hopperMaterial, Math.max(1, counts.sandHopper));
  const crabBodyMesh = new THREE.InstancedMesh(buildShoreCrabBody(), crabMaterial, Math.max(1, counts.shoreCrab));
  const crabLegMesh = new THREE.InstancedMesh(buildShoreCrabLeg(), crabMaterial, Math.max(1, counts.shoreCrab * 8));
  const crabClawMesh = new THREE.InstancedMesh(buildShoreCrabClaw(), crabMaterial, Math.max(1, counts.shoreCrab * 2));
  for (const mesh of [hopperMesh, crabBodyMesh, crabLegMesh, crabClawMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.geometry.setAttribute('aFlash', new THREE.InstancedBufferAttribute(new Float32Array(mesh.count), 1));
    for (let index = 0; index < mesh.count; index++) mesh.setMatrixAt(index, new THREE.Matrix4().makeScale(0, 0, 0));
    scene.add(mesh);
  }

  const list = [];
  const transform = new THREE.Object3D();
  const parentMatrix = new THREE.Matrix4();
  const partMatrix = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const labelPoint = new THREE.Vector3();
  let nextId = 1;
  let calmUntil = 0;

  function spawnSpot(entry, avoid, near = null) {
    for (let attempt = 0; attempt < 600; attempt++) {
      const x = near ? near.x + (random() * 2 - 1) * PACK_SPREAD : (random() * 2 - 1) * 118;
      const z = near ? near.z + (random() * 2 - 1) * PACK_SPREAD : (random() * 2 - 1) * 118;
      if (!world.isWalkable(x, z)) continue;
      const height = world.heightAt(x, z);
      if (!entry.accept(world, x, z, height)) continue;
      if (avoid && Math.hypot(avoid.x - x, avoid.z - z) < MINIMUM_RESPAWN_DISTANCE) continue;
      if (list.some((other) => other.state !== 'dead' && other.home && Math.hypot(other.home.x - x, other.home.z - z) < (near ? 1.2 : 4))) continue;
      return { x, z };
    }
    return null;
  }

  function createBar(enemy) {
    const box = document.createElement('div');
    box.className = 'enemy-bar hidden';
    const name = document.createElement('div');
    name.className = 'enemy-name';
    name.textContent = enemy.definition.label;
    const track = document.createElement('div');
    track.className = 'enemy-track';
    const fill = document.createElement('div');
    fill.className = 'enemy-fill';
    track.appendChild(fill);
    box.append(name, track);
    labelParent.appendChild(box);
    return { box, fill };
  }

  function place(enemy, spot) {
    const definition = enemy.definition;
    Object.assign(enemy, {
      x: spot.x, z: spot.z, y: world.heightAt(spot.x, spot.z), home: { x: spot.x, z: spot.z }, heading: random() * Math.PI * 2,
      health: definition.health, state: definition.flies ? 'circling' : 'idle', altitude: definition.flies ? GULL_CIRCLE_ALTITUDE : 0,
      path: [], pathIndex: 0, repathTimer: 0, outOfReachSeconds: 0, wanderTimer: 1 + random() * 4, attackTimer: 0, anchor: null, sink: 0, provoked: false,
      lastHurtTime: -100, motion: 0, strike: 0, hurt: 0, circleAngle: random() * Math.PI * 2,
    });
  }

  for (const entry of spawnTable) {
    let pack = null;
    let packLeft = 0;
    for (let index = 0; index < entry.count; index++) {
      const enemy = { id: nextId++, kind: entry.kind, definition: ENEMY_KINDS[entry.kind], entry, slot: list.filter((other) => other.kind === entry.kind).length, respawnTimer: 0, pack: null };
      enemy.bar = createBar(enemy);
      if (entry.kind === 'gull') enemy.model = createGullModel(scene, quality);
      if (entry.packSize && packLeft <= 0) {
        pack = null;
        packLeft = entry.packSize[0] + Math.floor(random() * (entry.packSize[1] - entry.packSize[0] + 1));
      }
      const spot = (pack && spawnSpot(entry, null, pack)) || spawnSpot(entry, entry.avoid);
      if (!spot) continue;
      if (entry.packSize) {
        pack = pack || { x: spot.x, z: spot.z };
        enemy.pack = pack;
        packLeft--;
      }
      place(enemy, spot);
      list.push(enemy);
    }
  }

  const alive = (enemy) => enemy.state !== 'dead' && enemy.state !== 'dying';
  const engaged = (enemy) => enemy.state === 'chase' || enemy.state === 'landing';

  function startChase(enemy) {
    if (enemy.state === 'chase' || enemy.state === 'landing') return;
    enemy.anchor = { x: enemy.x, z: enemy.z };
    enemy.attackTimer = enemy.definition.windup;
    enemy.state = enemy.definition.flies && enemy.altitude > 0.5 ? 'landing' : 'chase';
  }

  function giveUp(enemy) {
    enemy.provoked = false;
    enemy.anchor = null;
    enemy.path = [];
    enemy.state = enemy.definition.flies ? 'takeoff' : 'return';
  }

  function alarm(enemy) {
    if (engaged(enemy) || !alive(enemy)) return;
    enemy.provoked = true;
    startChase(enemy);
    onAlert(enemy);
  }

  function knockBack(enemy, attacker) {
    if (!attacker) return;
    const awayX = enemy.x - attacker.x;
    const awayZ = enemy.z - attacker.z;
    const length = Math.hypot(awayX, awayZ) || 1;
    const distance = KNOCKBACK_BY_KIND[enemy.kind] || 0.3;
    const nextX = enemy.x + (awayX / length) * distance;
    const nextZ = enemy.z + (awayZ / length) * distance;
    if (enemy.altitude < 0.5 && world.isWalkable(nextX, nextZ)) Object.assign(enemy, { x: nextX, z: nextZ });
  }

  function damage(enemy, amount, time, attacker = null) {
    if (!alive(enemy)) return false;
    enemy.health = Math.max(0, enemy.health - amount);
    enemy.lastHurtTime = time;
    enemy.hurt = 1;
    if (enemy.kind === 'gull') onSound('wingFlap', enemy);
    knockBack(enemy, attacker);
    if (enemy.definition.temperament === 'passive') {
      for (const mate of list) {
        if (mate !== enemy && mate.kind === enemy.kind && Math.hypot(mate.x - enemy.x, mate.z - enemy.z) < PACK_ALERT_RANGE) alarm(mate);
      }
    }
    enemy.provoked = true;
    if (enemy.health <= 0) {
      enemy.state = 'dying';
      enemy.sink = 0;
      onKilled(enemy);
      return true;
    }
    startChase(enemy);
    return false;
  }

  function calmAll(seconds, time) {
    calmUntil = time + seconds;
    for (const enemy of list) {
      if (!alive(enemy)) continue;
      enemy.health = enemy.definition.health;
      if (engaged(enemy) || enemy.provoked) giveUp(enemy);
    }
  }

  function moveToward(enemy, targetX, targetZ, speed, deltaTime) {
    enemy.repathTimer -= deltaTime;
    if (enemy.repathTimer <= 0 || enemy.pathIndex >= enemy.path.length) {
      enemy.repathTimer = REPATH_SECONDS;
      enemy.path = navigation.findPath(enemy.x, enemy.z, targetX, targetZ);
      enemy.pathIndex = 0;
    }
    if (enemy.pathIndex >= enemy.path.length) return false;
    const waypoint = enemy.path[enemy.pathIndex];
    const offsetX = waypoint.x - enemy.x;
    const offsetZ = waypoint.z - enemy.z;
    const distance = Math.hypot(offsetX, offsetZ);
    if (distance < 0.3) {
      enemy.pathIndex++;
      return true;
    }
    const stride = Math.min(distance, speed * deltaTime);
    enemy.x += (offsetX / distance) * stride;
    enemy.z += (offsetZ / distance) * stride;
    enemy.moveHeading = Math.atan2(offsetX, offsetZ);
    return true;
  }

  function turnToward(enemy, heading, deltaTime, rate = 8) {
    const difference = Math.atan2(Math.sin(heading - enemy.heading), Math.cos(heading - enemy.heading));
    enemy.heading += difference * Math.min(1, rate * deltaTime);
  }

  function walkingHeading(enemy) {
    return enemy.kind === 'shoreCrab' ? enemy.moveHeading + Math.PI / 2 : enemy.moveHeading;
  }

  function updateGround(enemy, deltaTime, time, player) {
    const definition = enemy.definition;
    const toPlayer = Math.hypot(player.x - enemy.x, player.z - enemy.z);
    const reach = definition.radius + ENEMY_STRIKE_REACH;
    let moving = false;
    if (enemy.state === 'idle') {
      if (definition.temperament === 'aggressive' && toPlayer < definition.sightRange && time > calmUntil && player.alive && navigation.clearLine(enemy.x, enemy.z, player.x, player.z)) {
        startChase(enemy);
        onAlert(enemy);
      }
      enemy.wanderTimer -= deltaTime;
      if (enemy.wanderTimer <= 0) {
        enemy.wanderTimer = 3 + random() * 4;
        const angle = random() * Math.PI * 2;
        const distance = random() * WANDER_RADIUS;
        const targetX = enemy.home.x + Math.cos(angle) * distance;
        const targetZ = enemy.home.z + Math.sin(angle) * distance;
        if (world.isWalkable(targetX, targetZ) && enemy.entry.accept(world, targetX, targetZ, world.heightAt(targetX, targetZ)) && navigation.clearLine(enemy.x, enemy.z, targetX, targetZ)) {
          enemy.path = [{ x: targetX, z: targetZ }];
          enemy.pathIndex = 0;
          enemy.repathTimer = 99;
        }
      }
      if (enemy.pathIndex < enemy.path.length) moving = moveToward(enemy, enemy.path[enemy.path.length - 1].x, enemy.path[enemy.path.length - 1].z, definition.speed * 0.35, deltaTime);
    } else if (enemy.state === 'chase') {
      if (!player.alive || Math.hypot(player.x - enemy.anchor.x, player.z - enemy.anchor.z) > LEASH_DISTANCE || (enemy.entry.territory && !enemy.entry.territory(player.x, player.z) && toPlayer > reach + 2)) {
        giveUp(enemy);
      } else if (toPlayer > reach) {
        moving = moveToward(enemy, player.x, player.z, definition.speed, deltaTime);
        enemy.outOfReachSeconds += deltaTime;
        if (enemy.outOfReachSeconds > OUT_OF_REACH_RESET_SECONDS) enemy.attackTimer = Math.max(enemy.attackTimer, definition.windup);
      } else {
        turnToward(enemy, Math.atan2(player.x - enemy.x, player.z - enemy.z), deltaTime);
        enemy.outOfReachSeconds = 0;
        enemy.attackTimer -= deltaTime;
        if (enemy.attackTimer <= 0) {
          enemy.attackTimer = definition.attackInterval;
          enemy.strike = 1;
          onSound(STRIKE_SOUNDS[enemy.kind], enemy);
          onAttackPlayer(enemy);
        }
      }
    } else if (enemy.state === 'return') {
      moving = moveToward(enemy, enemy.home.x, enemy.home.z, definition.speed * 0.7, deltaTime);
      enemy.health = Math.min(definition.health, enemy.health + definition.health * 0.2 * deltaTime);
      if (Math.hypot(enemy.home.x - enemy.x, enemy.home.z - enemy.z) < 1 || !moving) {
        enemy.state = 'idle';
        enemy.health = definition.health;
      }
    }
    if (moving && enemy.moveHeading !== undefined) turnToward(enemy, enemy.state === 'chase' && enemy.kind !== 'shoreCrab' ? Math.atan2(player.x - enemy.x, player.z - enemy.z) : walkingHeading(enemy), deltaTime, 6);
    enemy.motion += ((moving ? 1 : 0) - enemy.motion) * Math.min(1, deltaTime * 8);
    enemy.y = world.heightAt(enemy.x, enemy.z);
  }

  function updateGull(enemy, deltaTime, time, player) {
    const definition = enemy.definition;
    const territory = enemy.entry.territory;
    const playerInside = player.alive && time > calmUntil && territory(player.x, player.z);
    if (enemy.state === 'circling') {
      enemy.circleAngle += deltaTime * 0.32;
      const targetX = enemy.home.x + Math.cos(enemy.circleAngle) * GULL_CIRCLE_RADIUS;
      const targetZ = enemy.home.z + Math.sin(enemy.circleAngle) * GULL_CIRCLE_RADIUS;
      enemy.x += (targetX - enemy.x) * Math.min(1, deltaTime * 2);
      enemy.z += (targetZ - enemy.z) * Math.min(1, deltaTime * 2);
      enemy.heading = enemy.circleAngle + Math.PI;
      enemy.altitude += (GULL_CIRCLE_ALTITUDE - enemy.altitude) * Math.min(1, deltaTime);
      if (playerInside || enemy.provoked) {
        startChase(enemy);
        onAlert(enemy);
        onSound('gullCall', enemy);
      }
    } else if (enemy.state === 'landing') {
      const awayX = enemy.x - player.x;
      const awayZ = enemy.z - player.z;
      const awayLength = Math.hypot(awayX, awayZ) || 1;
      const spot = navigation.nearestWalkable(player.x + (awayX / awayLength) * GULL_LANDING_OFFSET, player.z + (awayZ / awayLength) * GULL_LANDING_OFFSET, 10) || player;
      const offsetX = spot.x - enemy.x;
      const offsetZ = spot.z - enemy.z;
      const distance = Math.hypot(offsetX, offsetZ);
      const stride = Math.min(distance, GULL_FLIGHT_SPEED * deltaTime);
      if (distance > 0.01) {
        enemy.x += (offsetX / distance) * stride;
        enemy.z += (offsetZ / distance) * stride;
        turnToward(enemy, Math.atan2(offsetX, offsetZ), deltaTime, 4);
      }
      enemy.altitude = Math.max(0, Math.min(enemy.altitude, distance * 1.6) - deltaTime * 6);
      if (enemy.altitude <= 0.01 && distance < 1) {
        enemy.altitude = 0;
        enemy.state = 'chase';
        enemy.anchor = { x: enemy.x, z: enemy.z };
        enemy.attackTimer = definition.windup;
      }
      if (!player.alive) giveUp(enemy);
    } else if (enemy.state === 'chase') {
      updateGround(enemy, deltaTime, time, player);
      return;
    } else if (enemy.state === 'takeoff') {
      const offsetX = enemy.home.x - enemy.x;
      const offsetZ = enemy.home.z - enemy.z;
      const distance = Math.hypot(offsetX, offsetZ);
      enemy.altitude = Math.min(GULL_CIRCLE_ALTITUDE, enemy.altitude + deltaTime * 9);
      if (distance > 0.5) {
        const stride = Math.min(distance, GULL_FLIGHT_SPEED * 0.7 * deltaTime * Math.min(1, enemy.altitude / 4));
        enemy.x += (offsetX / distance) * stride;
        enemy.z += (offsetZ / distance) * stride;
        turnToward(enemy, Math.atan2(offsetX, offsetZ), deltaTime, 3);
      }
      enemy.health = Math.min(definition.health, enemy.health + definition.health * 0.2 * deltaTime);
      if (enemy.altitude > GULL_CIRCLE_ALTITUDE * 0.8 && distance < GULL_CIRCLE_RADIUS + 2) {
        enemy.state = 'circling';
        enemy.health = definition.health;
        enemy.circleAngle = Math.atan2(enemy.z - enemy.home.z, enemy.x - enemy.home.x);
      }
    }
    enemy.y = world.heightAt(enemy.x, enemy.z);
  }

  function update(deltaTime, time, player) {
    for (const enemy of list) {
      if (enemy.state === 'dead') {
        enemy.respawnTimer -= deltaTime;
        if (enemy.respawnTimer <= 0) {
          const spot = (enemy.pack && spawnSpot(enemy.entry, player, enemy.pack)) || spawnSpot(enemy.entry, player);
          if (spot) place(enemy, spot);
          else enemy.respawnTimer = 10;
        }
        continue;
      }
      if (enemy.state === 'dying') {
        enemy.sink += deltaTime / DEATH_SINK_SECONDS;
        if (enemy.sink >= 1) {
          enemy.state = 'dead';
          enemy.respawnTimer = enemy.definition.respawnSeconds;
        }
        continue;
      }
      enemy.strike = Math.max(0, enemy.strike - deltaTime * 3);
      const idleSound = IDLE_SOUNDS[enemy.kind];
      if (idleSound && (enemy.state === 'idle' || enemy.state === 'circling') && random() < idleSound.perSecond * deltaTime) onSound(idleSound.name, enemy);
      enemy.hurt = Math.max(0, enemy.hurt - deltaTime / HURT_SECONDS);
      if (enemy.definition.flies) updateGull(enemy, deltaTime, time, player);
      else updateGround(enemy, deltaTime, time, player);
    }
  }

  const deathFall = (enemy) => (enemy.state === 'dying' ? THREE.MathUtils.smoothstep(enemy.sink, 0, 0.35) : 0);
  const deathSink = (enemy) => (enemy.state === 'dying' ? THREE.MathUtils.smoothstep(enemy.sink, 0.5, 1) : 0);
  const flashFor = (enemy) => enemy.hurt * enemy.hurt * FLASH_STRENGTH;
  const setFlash = (mesh, index, value) => mesh.geometry.attributes.aFlash.setX(index, value);

  function renderHopper(enemy, time) {
    const hop = Math.abs(Math.sin(time * 9 + enemy.id)) * 0.55 * enemy.motion;
    const pounce = Math.sin(enemy.strike * Math.PI);
    const startle = Math.sin(enemy.hurt * Math.PI);
    const fall = deathFall(enemy);
    const forward = pounce * 0.7 - startle * 0.2;
    transform.position.set(enemy.x + Math.sin(enemy.heading) * forward, enemy.y + hop + pounce * 0.6 + startle * 0.7 - deathSink(enemy) * 0.5, enemy.z + Math.cos(enemy.heading) * forward);
    transform.rotation.set(-hop * 0.6 - pounce * 0.5 + startle * 0.6, enemy.heading, fall * Math.PI);
    transform.scale.setScalar(1.15 * (1 - deathSink(enemy) * 0.5));
    transform.updateMatrix();
    hopperMesh.setMatrixAt(enemy.slot, enemy.state === 'dead' ? hidden : transform.matrix);
    setFlash(hopperMesh, enemy.slot, flashFor(enemy));
  }

  function renderShoreCrab(enemy, time) {
    const stride = time * 11 + enemy.id;
    const fall = deathFall(enemy);
    const recoil = Math.sin(enemy.hurt * Math.PI) * 0.35;
    const lunge = Math.sin(enemy.strike * Math.PI) * 0.35;
    const shift = lunge - recoil;
    transform.position.set(enemy.x + Math.sin(enemy.heading) * shift, enemy.y + Math.abs(Math.sin(stride)) * 0.05 * enemy.motion - deathSink(enemy) * 0.6 + fall * 0.5, enemy.z + Math.cos(enemy.heading) * shift);
    transform.rotation.set(-recoil * 0.8, enemy.heading, fall * Math.PI * 0.95);
    transform.scale.setScalar(1);
    transform.updateMatrix();
    parentMatrix.copy(transform.matrix);
    crabBodyMesh.setMatrixAt(enemy.slot, enemy.state === 'dead' ? hidden : parentMatrix);
    const flash = flashFor(enemy);
    setFlash(crabBodyMesh, enemy.slot, flash);
    let legIndex = enemy.slot * 8;
    for (const side of [-1, 1]) {
      for (let pair = 0; pair < 4; pair++) {
        const phase = stride + pair * 1.6 + (side > 0 ? Math.PI : 0);
        transform.position.set(side * 0.62, 0.55, 0.32 - pair * 0.24);
        const curl = fall * 0.9 + recoil * 0.4;
        transform.rotation.set(0, (side > 0 ? 0 : Math.PI) + side * (-0.25 + pair * 0.28) + Math.sin(phase) * 0.3 * enemy.motion, (side > 0 ? 1 : -1) * (0.1 + Math.max(0, Math.cos(phase)) * 0.25 * enemy.motion) - curl * (side > 0 ? 1 : -1));
        transform.scale.setScalar(1);
        transform.updateMatrix();
        partMatrix.multiplyMatrices(parentMatrix, transform.matrix);
        setFlash(crabLegMesh, legIndex, flash);
        crabLegMesh.setMatrixAt(legIndex++, enemy.state === 'dead' ? hidden : partMatrix);
      }
    }
    const windingUp = enemy.state === 'chase' && enemy.attackTimer < 0.45 ? 1 - enemy.attackTimer / 0.45 : 0;
    for (const side of [-1, 1]) {
      const snap = side < 0 ? enemy.strike : Math.max(0, (enemy.strike - 0.35) / 0.65);
      const raised = (enemy.state === 'chase' ? 0.35 : 0.1 + 0.05 * Math.sin(time * 1.3 + enemy.id)) + windingUp * 0.55 + recoil * 3;
      transform.position.set(side * 0.55, 0.62, 0.55);
      transform.rotation.set(-raised + snap * 1.1, side * (0.55 - snap * 0.45), 0);
      transform.scale.setScalar(side < 0 ? 1.15 : 0.95);
      transform.updateMatrix();
      partMatrix.multiplyMatrices(parentMatrix, transform.matrix);
      crabClawMesh.setMatrixAt(enemy.slot * 2 + (side < 0 ? 0 : 1), enemy.state === 'dead' ? hidden : partMatrix);
      setFlash(crabClawMesh, enemy.slot * 2 + (side < 0 ? 0 : 1), flash);
    }
  }

  function renderGull(enemy, time) {
    const { root, torso, wings, shadow } = enemy.model;
    const fall = deathFall(enemy);
    root.visible = enemy.state !== 'dead';
    root.position.set(enemy.x, enemy.y + enemy.altitude - deathSink(enemy) * 4, enemy.z);
    root.rotation.set(0, enemy.heading, fall * 1.45);
    const startle = Math.sin(enemy.hurt * Math.PI);
    const flying = Math.max(THREE.MathUtils.smoothstep(enemy.altitude, 0.2, 3), startle * 0.75);
    const windup = enemy.state === 'chase' && enemy.attackTimer < 0.6 ? 1 - enemy.attackTimer / 0.6 : 0;
    const leaning = enemy.state === 'chase' ? 0.22 : 0;
    torso.rotation.x = leaning + Math.sin(enemy.strike * Math.PI * 0.5) * 0.85 - windup * 0.35 + flying * 0.1 - startle * 0.3;
    torso.position.z = Math.sin(enemy.strike * Math.PI) * 1.4;
    for (const material of enemy.model.materials) material.emissive.setRGB(0.55 * enemy.hurt * enemy.hurt, 0.16 * enemy.hurt * enemy.hurt, 0.04 * enemy.hurt * enemy.hurt);
    const flap = Math.sin(time * (enemy.state === 'circling' ? 2.2 : 7)) * (enemy.state === 'circling' ? 0.18 : 0.55);
    for (const wing of wings) {
      wing.pivot.visible = flying > 0.05;
      wing.pivot.rotation.set(0, wing.side * (1 - flying) * Math.PI * 0.45, wing.side * flying * flap);
      wing.pivot.scale.x = Math.max(0.05, flying);
    }
    const shadowStrength = THREE.MathUtils.smoothstep(enemy.altitude, 2, 6) * (enemy.state === 'dead' ? 0 : 1);
    shadow.visible = shadowStrength > 0.01;
    shadow.position.set(enemy.x, world.heightAt(enemy.x, enemy.z) + 0.25, enemy.z);
    shadow.rotation.y = enemy.heading;
    shadow.scale.setScalar(0.5 + enemy.altitude / 200);
    shadow.material.opacity = 0.62 * shadowStrength;
  }

  function render(time, camera, playerTargetId) {
    for (const enemy of list) {
      if (enemy.kind === 'sandHopper') renderHopper(enemy, time);
      else if (enemy.kind === 'shoreCrab') renderShoreCrab(enemy, time);
      else if (enemy.kind === 'gull') renderGull(enemy, time);
      const barVisible = alive(enemy) && (enemy.health < enemy.definition.health || engaged(enemy) || enemy.id === playerTargetId) && !(enemy.definition.flies && enemy.altitude > 6);
      if (barVisible) labelPoint.set(enemy.x, enemy.y + enemy.altitude + enemy.definition.barHeight, enemy.z).project(camera);
      const onScreen = barVisible && labelPoint.z < 1;
      enemy.bar.box.classList.toggle('hidden', !onScreen);
      if (onScreen) {
        enemy.bar.fill.style.width = `${(enemy.health / enemy.definition.health) * 100}%`;
        enemy.bar.box.style.transform = `translate(-50%, -100%) translate(${(labelPoint.x * 0.5 + 0.5) * innerWidth}px, ${Math.max(WORLD_LABEL_TOP_PIXELS, (-labelPoint.y * 0.5 + 0.5) * innerHeight)}px)`;
      }
    }
    for (const mesh of [hopperMesh, crabBodyMesh, crabLegMesh, crabClawMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.aFlash.needsUpdate = true;
    }
  }

  function pick(clientX, clientY, camera) {
    let best = null;
    for (const enemy of list) {
      if (!alive(enemy) || enemy.altitude > 3) continue;
      labelPoint.set(enemy.x, enemy.y + enemy.definition.radius * 0.8, enemy.z).project(camera);
      if (labelPoint.z > 1) continue;
      const distance = Math.hypot((labelPoint.x * 0.5 + 0.5) * innerWidth - clientX, (-labelPoint.y * 0.5 + 0.5) * innerHeight - clientY);
      const radius = enemy.kind === 'gull' ? 110 : enemy.kind === 'shoreCrab' ? 60 : 48;
      if (distance < radius && (!best || distance < best.distance)) best = { enemy, distance };
    }
    return best ? best.enemy : null;
  }

  function spawn(kind, x, z) {
    const enemy = list.find((candidate) => candidate.kind === kind);
    if (!enemy) return null;
    place(enemy, { x, z });
    return enemy;
  }

  return { list, update, render, pick, damage, calmAll, alive, spawn, startChase, giveUp };
}
