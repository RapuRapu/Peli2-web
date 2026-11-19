import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySeaside } from './seaside.js';
import { buildShellGeometry } from './hermit.js';
import { RESOURCE_TYPES } from './resources.js';
import { BURROW_LAYER, BURROW_ORIGIN, cellCenter, SHAFT_CELL } from './burrow.js';
import { RACK_BATCH, RACK_REACH } from './rack.js';

export const HELPER_LIMIT = 3;
export const HELPER_COST = { seaLettuce: 5 };
export const HELPER_JOBS = ['shellBits', 'driftwood', 'seaLettuce', 'rack'];
export const HELPER_SIZE = 0.7;
const HELPER_HEALTH = 10;
const WALK_SPEED = 4.2;
const FLEE_SPEED = 6;
const GATHER_SLOWDOWN = 1.6;
const GATHER_REACH = 1.4;
const ENTRANCE_REACH = 1.6;
const DANGER_DISTANCE = 7;
const BITE_DISTANCE = 1.7;
const REST_SECONDS = 4;
const IDLE_RETRY_SECONDS = 8;
const SEARCH_RADIUS = 70;
const BURROW_REST_SPOTS = [[-3.0, 2.7], [3.0, 2.4], [0.8, 8.8]];

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const BODY_COLOR = linearColor(0.92, 0.42, 0.18);
const SHELL_LOOK = { turns: 2.4, spireShare: 0.86, whorlRadius: 0.5, tubeRadius: 0.6, height: 1.15, bandFrequency: 22, light: [0.9, 0.97, 0.94], band: [0.02, 0.62, 0.6], inside: [0.36, 0.22, 0.2] };
const CARRY_COLORS = { shellBits: new THREE.Color(1.7, 1.55, 1.3), driftwood: new THREE.Color(0.9, 0.5, 0.18), seaLettuce: new THREE.Color(0.35, 1.5, 0.3), driedKelp: new THREE.Color(1.1, 0.62, 0.18) };

function painted(geometry, color) {
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let index = 0; index < geometry.attributes.position.count; index++) colors.set([color.r, color.g, color.b], index * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

function buildHelperGeometry() {
  const shell = buildShellGeometry(SHELL_LOOK);
  const shellGeometry = shell.geometry.clone().rotateY(Math.PI).translate(shell.mouthOffset, 0, 0).rotateX(-0.5).translate(0, 0.64, -0.12);
  const parts = [shellGeometry];
  parts.push(painted(new THREE.SphereGeometry(0.4, 14, 10).scale(0.95, 0.66, 1.2).translate(0, 0.5, 0.24), BODY_COLOR));
  for (const side of [-1, 1]) {
    parts.push(painted(new THREE.SphereGeometry(0.17, 10, 8).scale(1, 0.8, 1.3).translate(side * 0.3, 0.42, 0.72), BODY_COLOR));
    parts.push(painted(new THREE.CylinderGeometry(0.03, 0.04, 0.32, 6).translate(side * 0.14, 0.82, 0.56), BODY_COLOR));
    for (let pair = 0; pair < 2; pair++) {
      parts.push(painted(new THREE.ConeGeometry(0.06, 0.62, 6).rotateZ(side * 0.9).translate(side * 0.42, 0.28, 0.32 - pair * 0.3), BODY_COLOR));
    }
  }
  for (const part of parts) if (part.attributes.uv) part.deleteAttribute('uv');
  return mergeGeometries(parts.map((part) => (part.index ? part : part)));
}

export function createHelpers(scene, { world, navigation, resources, enemies, quality, saved, rack, storage, onDeposit, onLost, onSound }) {
  const list = (saved || []).map((entry) => ({ ...entry, state: 'resting', path: [], pathIndex: 0, restTimer: 1 + Math.random() * 2, carrying: entry.carrying || null, health: HELPER_HEALTH, targetId: null }));
  let nextId = list.reduce((highest, helper) => Math.max(highest, helper.id), 0) + 1;
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.5, wetRoughness: 0.12 });
  const geometry = buildHelperGeometry();
  const surfaceMesh = new THREE.InstancedMesh(geometry, material, HELPER_LIMIT);
  surfaceMesh.castShadow = true;
  surfaceMesh.count = 0;
  surfaceMesh.frustumCulled = false;
  const burrowMesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide }), HELPER_LIMIT);
  burrowMesh.castShadow = true;
  burrowMesh.count = 0;
  burrowMesh.frustumCulled = false;
  burrowMesh.layers.set(BURROW_LAYER);
  const carryMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.3, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), HELPER_LIMIT);
  carryMesh.count = 0;
  carryMesh.frustumCulled = false;
  const carryOutline = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.38, 1), new THREE.MeshBasicMaterial({ color: 0x1a1208, side: THREE.BackSide }), HELPER_LIMIT);
  carryOutline.count = 0;
  carryOutline.frustumCulled = false;
  scene.add(surfaceMesh, burrowMesh, carryMesh, carryOutline);
  const transform = new THREE.Object3D();
  let entrance = null;

  const nodeById = (id) => resources.nodes.find((node) => node.id === id) || null;

  function release(helper) {
    const node = helper.targetId && nodeById(helper.targetId);
    if (node && node.reservedBy === helper.id) delete node.reservedBy;
    helper.targetId = null;
  }

  function walkTo(helper, x, z) {
    const path = navigation.findPath(helper.x, helper.z, x, z);
    helper.path = path;
    helper.pathIndex = 0;
    return path.length > 0;
  }

  function leaveForRack(helper) {
    const start = navigation.nearestWalkable(entrance.x + 1.6, entrance.z - 1.2, 6) || entrance;
    if (!rack.exists) return false;
    const canLoad = rack.freeSlots() > 0 && (storage.inventory.seaLettuce || 0) >= RACK_BATCH;
    if (!canLoad && rack.state.ready === 0) return false;
    Object.assign(helper, { x: start.x, z: start.z });
    if (!walkTo(helper, rack.state.x, rack.state.z)) return false;
    if (canLoad) {
      storage.inventory.seaLettuce -= RACK_BATCH;
      helper.carrying = 'seaLettuce';
      helper.load = RACK_BATCH;
    }
    helper.state = 'toRack';
    return true;
  }

  function leaveBurrow(helper) {
    if (helper.job === 'rack') {
      if (!leaveForRack(helper)) helper.restTimer = IDLE_RETRY_SECONDS;
      return;
    }
    const candidates = resources.nodes.filter((node) => node.type === helper.job && !node.gathered && !node.reservedBy && Math.hypot(node.x - entrance.x, node.z - entrance.z) < SEARCH_RADIUS);
    candidates.sort((first, second) => Math.hypot(first.x - entrance.x, first.z - entrance.z) - Math.hypot(second.x - entrance.x, second.z - entrance.z));
    const start = navigation.nearestWalkable(entrance.x + 1.6, entrance.z - 1.2, 6) || entrance;
    Object.assign(helper, { x: start.x, z: start.z });
    for (const node of candidates.slice(0, 4)) {
      if (walkTo(helper, node.x, node.z)) {
        helper.targetId = node.id;
        node.reservedBy = helper.id;
        helper.state = 'outbound';
        return true;
      }
    }
    helper.restTimer = IDLE_RETRY_SECONDS;
    return false;
  }

  function headHome(helper, fleeing) {
    release(helper);
    helper.state = fleeing ? 'fleeing' : 'returning';
    if (!walkTo(helper, entrance.x, entrance.z)) {
      helper.path = [{ x: entrance.x, z: entrance.z }];
      helper.pathIndex = 0;
    }
  }

  function step(helper, deltaTime, speed) {
    if (helper.pathIndex >= helper.path.length) return true;
    const waypoint = helper.path[helper.pathIndex];
    const offsetX = waypoint.x - helper.x;
    const offsetZ = waypoint.z - helper.z;
    const distance = Math.hypot(offsetX, offsetZ);
    if (distance < 0.2) {
      helper.pathIndex++;
      return helper.pathIndex >= helper.path.length;
    }
    const stride = Math.min(distance, speed * deltaTime);
    helper.x += (offsetX / distance) * stride;
    helper.z += (offsetZ / distance) * stride;
    helper.heading = Math.atan2(offsetX, offsetZ);
    helper.moving = true;
    return false;
  }

  function threatNear(helper) {
    let nearest = null;
    for (const enemy of enemies.list) {
      if (enemy.state === 'dead' || enemy.state === 'dying' || enemy.definition.temperament !== 'aggressive') continue;
      if (enemy.definition.flies && (enemy.altitude || 0) > 2) continue;
      const distance = Math.hypot(enemy.x - helper.x, enemy.z - helper.z);
      if (!nearest || distance < nearest.distance) nearest = { enemy, distance };
    }
    return nearest;
  }

  function updateHelper(helper, deltaTime, time) {
    helper.moving = false;
    if (helper.state === 'resting') {
      helper.restTimer -= deltaTime;
      if (helper.carrying) {
        onDeposit(helper.carrying, helper.load || 1);
        helper.carrying = null;
        helper.load = 0;
      }
      if (helper.restTimer <= 0 && entrance) leaveBurrow(helper);
      return;
    }
    const threat = threatNear(helper);
    if (threat && threat.distance < BITE_DISTANCE + threat.enemy.definition.radius) {
      helper.biteTimer = (helper.biteTimer || 0) - deltaTime;
      if (helper.biteTimer <= 0) {
        helper.biteTimer = threat.enemy.definition.attackInterval;
        helper.health -= threat.enemy.definition.attack;
        onSound('shellClonk', helper);
        if (helper.health <= 0) {
          release(helper);
          list.splice(list.indexOf(helper), 1);
          onLost(helper, threat.enemy);
          return;
        }
      }
    }
    if (threat && threat.distance < DANGER_DISTANCE && helper.state !== 'fleeing') headHome(helper, true);
    if (helper.state === 'toRack') {
      step(helper, deltaTime, WALK_SPEED);
      if (!rack.exists || Math.hypot(rack.state.x - helper.x, rack.state.z - helper.z) <= RACK_REACH || helper.pathIndex >= helper.path.length) {
        if (rack.exists && helper.carrying === 'seaLettuce' && rack.load()) {
          helper.carrying = null;
          helper.load = 0;
          onSound('gatherSeaLettuce', helper);
        }
        if (!helper.carrying && rack.exists && rack.collect(1)) {
          helper.carrying = 'driedKelp';
          helper.load = 1;
        }
        headHome(helper, false);
      }
    } else if (helper.state === 'outbound') {
      const node = nodeById(helper.targetId);
      if (!node || node.gathered) {
        release(helper);
        helper.state = 'resting';
        helper.restTimer = 0;
        headHome(helper, false);
        return;
      }
      step(helper, deltaTime, WALK_SPEED);
      if (Math.hypot(node.x - helper.x, node.z - helper.z) <= GATHER_REACH) {
        helper.state = 'gathering';
        helper.progress = 0;
        helper.heading = Math.atan2(node.x - helper.x, node.z - helper.z);
      }
    } else if (helper.state === 'gathering') {
      const node = nodeById(helper.targetId);
      if (!node || node.gathered) {
        headHome(helper, false);
        return;
      }
      helper.progress += deltaTime;
      if (helper.progress >= RESOURCE_TYPES[node.type].gatherSeconds * GATHER_SLOWDOWN) {
        resources.gather(node);
        helper.carrying = node.type;
        onSound(`gather${node.type[0].toUpperCase()}${node.type.slice(1)}`, helper);
        headHome(helper, false);
      }
    } else if (helper.state === 'returning' || helper.state === 'fleeing') {
      step(helper, deltaTime, helper.state === 'fleeing' ? FLEE_SPEED : WALK_SPEED);
      if (Math.hypot(entrance.x - helper.x, entrance.z - helper.z) <= ENTRANCE_REACH) {
        helper.state = 'resting';
        helper.restTimer = REST_SECONDS + Math.random() * 2;
      }
    }
    helper.y = world.heightAt(helper.x, helper.z);
  }

  function update(deltaTime, time, currentEntrance) {
    entrance = currentEntrance;
    if (!entrance) return;
    for (const helper of [...list]) updateHelper(helper, deltaTime, time);
  }

  function render(time) {
    let surfaceCount = 0;
    let burrowCount = 0;
    let carryCount = 0;
    const shaft = cellCenter(SHAFT_CELL.column, SHAFT_CELL.row);
    for (const [index, helper] of list.entries()) {
      const bob = helper.moving ? Math.abs(Math.sin(time * 14 + index)) * 0.06 : 0;
      if (helper.state === 'resting') {
        const [offsetX, offsetZ] = BURROW_REST_SPOTS[index % BURROW_REST_SPOTS.length];
        transform.position.set(shaft.x + offsetX, BURROW_ORIGIN.y, shaft.z + offsetZ);
        transform.rotation.set(0, time * 0.2 + index * 2.1, 0);
        transform.scale.setScalar(HELPER_SIZE);
        transform.updateMatrix();
        burrowMesh.setMatrixAt(burrowCount++, transform.matrix);
        continue;
      }
      transform.position.set(helper.x, helper.y + bob, helper.z);
      transform.rotation.set(0, helper.heading || 0, 0);
      transform.scale.setScalar(HELPER_SIZE);
      transform.updateMatrix();
      surfaceMesh.setMatrixAt(surfaceCount++, transform.matrix);
      if (helper.carrying) {
        transform.position.set(helper.x, helper.y + 1.45 + bob, helper.z);
        transform.scale.setScalar(1);
        transform.updateMatrix();
        carryMesh.setMatrixAt(carryCount, transform.matrix);
        carryOutline.setMatrixAt(carryCount, transform.matrix);
        carryMesh.setColorAt(carryCount++, CARRY_COLORS[helper.carrying]);
      }
    }
    surfaceMesh.count = surfaceCount;
    burrowMesh.count = burrowCount;
    carryMesh.count = carryCount;
    carryOutline.count = carryCount;
    for (const mesh of [surfaceMesh, burrowMesh, carryMesh, carryOutline]) mesh.instanceMatrix.needsUpdate = true;
    if (carryMesh.instanceColor) carryMesh.instanceColor.needsUpdate = true;
  }

  function recruit(job) {
    if (list.length >= HELPER_LIMIT) return null;
    const helper = { id: nextId++, job, state: 'resting', x: 0, z: 0, y: 0, heading: 0, path: [], pathIndex: 0, restTimer: 1.5, carrying: null, health: HELPER_HEALTH, targetId: null };
    list.push(helper);
    return helper;
  }

  function setJob(id, job) {
    const helper = list.find((candidate) => candidate.id === id);
    if (!helper || !HELPER_JOBS.includes(job)) return false;
    helper.job = job;
    if (helper.state === 'outbound') headHome(helper, false);
    return true;
  }

  const serialize = () => list.map(({ id, job, carrying, load }) => ({ id, job, carrying, load }));

  return { list, update, render, recruit, setJob, serialize, maxHealth: HELPER_HEALTH, meshes: [surfaceMesh, burrowMesh, carryMesh] };
}
