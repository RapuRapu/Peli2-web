import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySeaside } from './seaside.js';
import { buildShellGeometry } from './hermit.js';
import { RESOURCE_TYPES } from './resources.js';
import { BURROW_LAYER, BURROW_ORIGIN } from './burrow.js';
import { RACK_BATCH, RACK_REACH } from './rack.js';

export const HELPER_LIMIT = 6;
export const NEST_CAPACITY = 3;
export const HELPER_SIZE = 0.7;
const CARRY_LOAD = 5;
const NEST_REACH = 1.6;
const STRANDED_BOB_SPEED = 9;
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
const NEST_SLOTS = [[-0.75, 0.25], [-0.15, -0.45], [-0.05, 0.6]];

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const BODY_COLOR = linearColor(0.92, 0.42, 0.18);
const SHELL_LOOK = { turns: 2.4, spireShare: 0.86, whorlRadius: 0.5, tubeRadius: 0.6, height: 1.15, bandFrequency: 22, light: [0.9, 0.97, 0.94], band: [0.02, 0.62, 0.6], inside: [0.36, 0.22, 0.2] };
const CARRY_COLORS = { shellBits: new THREE.Color(1.7, 1.55, 1.3), driftwood: new THREE.Color(0.9, 0.5, 0.18), seaLettuce: new THREE.Color(0.35, 1.5, 0.3), driedKelp: new THREE.Color(1.1, 0.62, 0.18), coral: new THREE.Color(1.8, 0.5, 0.45), seaGlass: new THREE.Color(0.4, 1.2, 1.8), pearls: new THREE.Color(1.9, 1.85, 1.7), scrap: new THREE.Color(0.7, 0.7, 0.75), cloth: new THREE.Color(1.4, 1.2, 0.9), fishBone: new THREE.Color(1.6, 1.6, 1.45), wax: new THREE.Color(1.8, 1.6, 1.1) };
const DEFAULT_CARRY_COLOR = new THREE.Color(1.2, 1.2, 1.2);

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

export function createHelpers(scene, { world, navigation, resources, enemies, quality, saved, rack, burrow, boxOf, strandedSpots, onDeposit, onLost, onSound }) {
  const savedState = Array.isArray(saved) ? { list: saved, rescued: [] } : saved || { list: [], rescued: [] };
  const list = savedState.list.map((entry) => ({ job: null, nestId: null, carryOrder: null, ...entry, state: 'resting', inside: true, path: [], pathIndex: 0, restTimer: 1 + Math.random() * 2, carrying: entry.carrying || null, load: entry.load || 0, health: HELPER_HEALTH, targetId: null }));
  const rescued = new Set(savedState.rescued || []);
  let nextId = list.reduce((highest, helper) => Math.max(highest, helper.id), 0) + 1;
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.5, wetRoughness: 0.12 });
  const geometry = buildHelperGeometry();
  const surfaceCapacity = HELPER_LIMIT + strandedSpots.length;
  const surfaceMesh = new THREE.InstancedMesh(geometry, material, surfaceCapacity);
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
  carryMesh.layers.enable(BURROW_LAYER);
  const carryOutline = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.38, 1), new THREE.MeshBasicMaterial({ color: 0x1a1208, side: THREE.BackSide }), HELPER_LIMIT);
  carryOutline.count = 0;
  carryOutline.frustumCulled = false;
  carryOutline.layers.enable(BURROW_LAYER);
  scene.add(surfaceMesh, burrowMesh, carryMesh, carryOutline);
  const transform = new THREE.Object3D();
  const projected = new THREE.Vector3();

  const nodeById = (id) => resources.nodes.find((node) => node.id === id) || null;
  const nestOf = (helper) => burrow.state.stations.find((station) => station.id === helper.nestId) || null;
  const nestSpot = (helper) => {
    const nest = nestOf(helper);
    return nest ? burrow.stationSpot(nest) : null;
  };

  function homePoint(helper) {
    const home = nestSpot(helper);
    const points = burrow.travelPoints();
    if (!home || !points.length) return points[0] || null;
    return points.reduce((best, point) => (Math.hypot(point.below.x - home.x, point.below.z - home.z) < Math.hypot(best.below.x - home.x, best.below.z - home.z) ? point : best));
  }

  function release(helper) {
    const node = helper.targetId && nodeById(helper.targetId);
    if (node && node.reservedBy === helper.id) delete node.reservedBy;
    helper.targetId = null;
  }

  function walkTo(helper, x, z) {
    const space = helper.inside ? burrow.space : navigation;
    const path = space.findPath(helper.x, helper.z, x, z);
    helper.path = path;
    helper.pathIndex = 0;
    return path.length > 0;
  }

  function placeAtNest(helper) {
    const spot = nestSpot(helper);
    if (!spot) return;
    const slot = NEST_SLOTS[nestMates(helper).indexOf(helper) % NEST_SLOTS.length];
    const free = burrow.space.nearestWalkable(spot.x + slot[0] * 1.6, spot.z + slot[1] * 1.6 + 1.2) || spot;
    Object.assign(helper, { x: free.x, z: free.z, inside: true });
  }

  const nestMates = (helper) => list.filter((other) => other.nestId === helper.nestId);

  function stepOutside(helper) {
    const point = homePoint(helper);
    if (!point) return false;
    const start = navigation.nearestWalkable(point.surface.x + 1.6, point.surface.z - 1.2, 6) || point.surface;
    Object.assign(helper, { x: start.x, z: start.z, inside: false, exitPoint: point });
    return true;
  }

  function leaveForRack(helper) {
    const nest = nestOf(helper);
    if (!rack.exists || !nest || !nest.box) return false;
    const canLoad = rack.freeSlots() > 0 && (nest.box.inventory.seaLettuce || 0) >= RACK_BATCH;
    if (!canLoad && rack.state.ready === 0) return false;
    if (!stepOutside(helper)) return false;
    if (!walkTo(helper, rack.state.x, rack.state.z)) {
      placeAtNest(helper);
      return false;
    }
    if (canLoad) {
      nest.box.inventory.seaLettuce -= RACK_BATCH;
      helper.carrying = 'seaLettuce';
      helper.load = RACK_BATCH;
    }
    helper.state = 'toRack';
    return true;
  }

  function startCarry(helper) {
    const order = helper.carryOrder;
    const source = order && boxOf(order.fromId);
    const target = order && boxOf(order.toId);
    if (!source || !target || order.fromId === order.toId) return false;
    const type = order.material || Object.keys(source.inventory).find((key) => source.inventory[key] > 0);
    if (!type || !(source.inventory[type] > 0)) return false;
    const fromStation = burrow.state.stations.find((station) => station.id === order.fromId);
    if (!fromStation) return false;
    const spot = burrow.stationSpot(fromStation);
    if (!walkTo(helper, spot.x, spot.z)) return false;
    helper.carryType = type;
    helper.state = 'toSource';
    return true;
  }

  function leaveNest(helper) {
    if (!helper.job) return;
    if (helper.job === 'rack') {
      if (!leaveForRack(helper)) helper.restTimer = IDLE_RETRY_SECONDS;
      return;
    }
    if (helper.job === 'carry') {
      if (!startCarry(helper)) helper.restTimer = IDLE_RETRY_SECONDS;
      return;
    }
    const point = homePoint(helper);
    if (!point) return;
    const origin = point.surface;
    const candidates = resources.nodes.filter((node) => node.type === helper.job && !node.gathered && !node.reservedBy);
    candidates.sort((first, second) => Math.hypot(first.x - origin.x, first.z - origin.z) - Math.hypot(second.x - origin.x, second.z - origin.z));
    stepOutside(helper);
    for (const node of candidates.slice(0, 4)) {
      if (walkTo(helper, node.x, node.z)) {
        helper.targetId = node.id;
        node.reservedBy = helper.id;
        helper.state = 'outbound';
        return;
      }
    }
    placeAtNest(helper);
    helper.restTimer = IDLE_RETRY_SECONDS;
  }

  function headHome(helper, fleeing) {
    release(helper);
    helper.state = fleeing ? 'fleeing' : 'returning';
    const target = (helper.exitPoint || homePoint(helper)).surface;
    if (!walkTo(helper, target.x, target.z)) {
      helper.path = [{ x: target.x, z: target.z }];
      helper.pathIndex = 0;
    }
  }

  function arriveHome(helper) {
    helper.exitPoint = null;
    placeAtNest(helper);
    if (helper.carrying) {
      onDeposit(nestOf(helper), helper.carrying, helper.load || 1);
      helper.carrying = null;
      helper.load = 0;
    }
    helper.state = 'resting';
    helper.restTimer = REST_SECONDS + Math.random() * 2;
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

  function knockedOut(helper, enemy) {
    release(helper);
    Object.assign(helper, { job: null, carryOrder: null, carrying: null, load: 0, health: HELPER_HEALTH, state: 'resting', restTimer: REST_SECONDS, exitPoint: null });
    placeAtNest(helper);
    onLost(helper, enemy);
  }

  function updateInside(helper, deltaTime) {
    if (helper.state === 'toSource') {
      if (!step(helper, deltaTime, WALK_SPEED)) return;
      const source = boxOf(helper.carryOrder && helper.carryOrder.fromId);
      const target = boxOf(helper.carryOrder && helper.carryOrder.toId);
      const toStation = target && burrow.state.stations.find((station) => station.id === helper.carryOrder.toId);
      const available = source ? source.inventory[helper.carryType] || 0 : 0;
      if (!toStation || !available) {
        returnToNest(helper);
        return;
      }
      helper.load = Math.min(CARRY_LOAD, available);
      source.inventory[helper.carryType] -= helper.load;
      helper.carrying = helper.carryType;
      const spot = burrow.stationSpot(toStation);
      walkTo(helper, spot.x, spot.z);
      helper.state = 'toTarget';
    } else if (helper.state === 'toTarget') {
      if (!step(helper, deltaTime, WALK_SPEED)) return;
      const target = boxOf(helper.carryOrder && helper.carryOrder.toId) || boxOf(helper.nestId);
      if (target && helper.carrying) target.inventory[helper.carrying] = (target.inventory[helper.carrying] || 0) + helper.load;
      helper.carrying = null;
      helper.load = 0;
      onSound('gatherDriftwood', helper);
      returnToNest(helper);
    } else if (helper.state === 'toNest') {
      if (!step(helper, deltaTime, WALK_SPEED)) return;
      const spot = nestSpot(helper);
      if (!spot || Math.hypot(spot.x - helper.x, spot.z - helper.z) < NEST_REACH + 1.5 || helper.pathIndex >= helper.path.length) {
        helper.state = 'resting';
        helper.restTimer = REST_SECONDS;
      }
    }
  }

  function returnToNest(helper) {
    const spot = nestSpot(helper);
    if (spot && walkTo(helper, spot.x, spot.z + 1.2)) helper.state = 'toNest';
    else {
      placeAtNest(helper);
      helper.state = 'resting';
      helper.restTimer = REST_SECONDS;
    }
  }

  function updateHelper(helper, deltaTime) {
    helper.moving = false;
    if (helper.state === 'resting') {
      helper.restTimer -= deltaTime;
      if (helper.carrying) {
        onDeposit(nestOf(helper), helper.carrying, helper.load || 1);
        helper.carrying = null;
        helper.load = 0;
      }
      if (helper.restTimer <= 0) leaveNest(helper);
      return;
    }
    if (helper.inside) {
      updateInside(helper, deltaTime);
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
          knockedOut(helper, threat.enemy);
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
        headHome(helper, false);
        return;
      }
      step(helper, deltaTime, WALK_SPEED);
      if (Math.hypot(node.x - helper.x, node.z - helper.z) <= GATHER_REACH) {
        helper.state = 'gathering';
        helper.progress = 0;
        helper.heading = Math.atan2(node.x - helper.x, node.z - helper.z);
      } else if (helper.pathIndex >= helper.path.length) headHome(helper, false);
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
        helper.load = 1;
        onSound(`gather${node.type[0].toUpperCase()}${node.type.slice(1)}`, helper);
        headHome(helper, false);
      }
    } else if (helper.state === 'returning' || helper.state === 'fleeing') {
      step(helper, deltaTime, helper.state === 'fleeing' ? FLEE_SPEED : WALK_SPEED);
      const target = (helper.exitPoint || homePoint(helper)).surface;
      if (Math.hypot(target.x - helper.x, target.z - helper.z) <= ENTRANCE_REACH + 0.6 || helper.pathIndex >= helper.path.length) arriveHome(helper);
    }
    helper.y = world.heightAt(helper.x, helper.z);
  }

  function update(deltaTime) {
    if (!burrow.exists) return;
    for (const helper of list) {
      if (!nestOf(helper)) continue;
      updateHelper(helper, deltaTime);
    }
  }

  const strandedVisible = () => strandedSpots.filter((spot) => !rescued.has(spot.id));

  function render(time) {
    let surfaceCount = 0;
    let burrowCount = 0;
    let carryCount = 0;
    for (const [index, helper] of list.entries()) {
      const bob = helper.moving ? Math.abs(Math.sin(time * 14 + index)) * 0.06 : 0;
      if (helper.inside) {
        transform.position.set(helper.x, BURROW_ORIGIN.y + bob, helper.z);
        transform.rotation.set(0, helper.state === 'resting' ? index * 2.1 + Math.sin(time * 0.3 + index) * 0.3 : helper.heading || 0, 0);
        transform.scale.setScalar(HELPER_SIZE);
        transform.updateMatrix();
        burrowMesh.setMatrixAt(burrowCount++, transform.matrix);
      } else {
        transform.position.set(helper.x, helper.y + bob, helper.z);
        transform.rotation.set(0, helper.heading || 0, 0);
        transform.scale.setScalar(HELPER_SIZE);
        transform.updateMatrix();
        surfaceMesh.setMatrixAt(surfaceCount++, transform.matrix);
      }
      if (helper.carrying) {
        transform.position.set(helper.x, (helper.inside ? BURROW_ORIGIN.y : helper.y) + 1.45 + bob, helper.z);
        transform.rotation.set(0, 0, 0);
        transform.scale.setScalar(1);
        transform.updateMatrix();
        carryMesh.setMatrixAt(carryCount, transform.matrix);
        carryOutline.setMatrixAt(carryCount, transform.matrix);
        carryMesh.setColorAt(carryCount++, CARRY_COLORS[helper.carrying] || DEFAULT_CARRY_COLOR);
      }
    }
    for (const [index, spot] of strandedVisible().entries()) {
      const wiggle = Math.sin(time * STRANDED_BOB_SPEED + index * 1.7);
      transform.position.set(spot.x, world.heightAt(spot.x, spot.z) + Math.max(0, wiggle) * 0.08, spot.z);
      transform.rotation.set(0, spot.heading + wiggle * 0.25, wiggle * 0.08);
      transform.scale.setScalar(HELPER_SIZE);
      transform.updateMatrix();
      surfaceMesh.setMatrixAt(surfaceCount++, transform.matrix);
    }
    surfaceMesh.count = surfaceCount;
    burrowMesh.count = burrowCount;
    carryMesh.count = carryCount;
    carryOutline.count = carryCount;
    for (const mesh of [surfaceMesh, burrowMesh, carryMesh, carryOutline]) mesh.instanceMatrix.needsUpdate = true;
    if (carryMesh.instanceColor) carryMesh.instanceColor.needsUpdate = true;
  }

  function strandedUnder(clientX, clientY, camera, radiusPixels) {
    let best = null;
    for (const spot of strandedVisible()) {
      projected.set(spot.x, world.heightAt(spot.x, spot.z) + 0.4, spot.z).project(camera);
      if (projected.z > 1) continue;
      const distance = Math.hypot((projected.x * 0.5 + 0.5) * innerWidth - clientX, (-projected.y * 0.5 + 0.5) * innerHeight - clientY);
      if (distance < radiusPixels && (!best || distance < best.distance)) best = { spot, distance };
    }
    return best ? best.spot : null;
  }

  function freeNest() {
    return burrow.state.stations.find((station) => station.kind === 'helperNest' && list.filter((helper) => helper.nestId === station.id).length < NEST_CAPACITY) || null;
  }

  function rescue(spot) {
    if (rescued.has(spot.id) || list.length >= HELPER_LIMIT) return null;
    const nest = freeNest();
    if (!nest) return null;
    rescued.add(spot.id);
    const helper = { id: nextId++, spotId: spot.id, nestId: nest.id, job: null, carryOrder: null, state: 'resting', inside: true, x: 0, z: 0, y: 0, heading: 0, path: [], pathIndex: 0, restTimer: 1.5, carrying: null, load: 0, health: HELPER_HEALTH, targetId: null };
    list.push(helper);
    placeAtNest(helper);
    return helper;
  }

  function adopt(nest) {
    for (const helper of list) {
      if (nestOf(helper)) continue;
      helper.nestId = nest.id;
      placeAtNest(helper);
    }
  }

  function setJob(id, job, carryOrder = null) {
    const helper = list.find((candidate) => candidate.id === id);
    if (!helper) return false;
    helper.job = job || null;
    helper.carryOrder = job === 'carry' ? carryOrder : null;
    if (!helper.inside && (helper.state === 'outbound' || helper.state === 'gathering')) headHome(helper, false);
    if (helper.inside && helper.state !== 'resting') returnToNest(helper);
    if (helper.state === 'resting') helper.restTimer = Math.min(helper.restTimer, 1);
    return true;
  }

  const serialize = () => ({ list: list.map(({ id, spotId, nestId, job, carryOrder, carrying, load }) => ({ id, spotId, nestId, job, carryOrder, carrying, load })), rescued: [...rescued] });

  for (const helper of list) placeAtNest(helper);

  return { list, update, render, rescue, adopt, freeNest, setJob, serialize, strandedUnder, strandedVisible, isRescued: (spotId) => rescued.has(spotId), markRescued: (spotId) => rescued.add(spotId), maxHealth: HELPER_HEALTH, meshes: [surfaceMesh, burrowMesh, carryMesh] };
}
