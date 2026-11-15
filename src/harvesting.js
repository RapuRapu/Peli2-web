import * as THREE from 'three';

const WORK_SECONDS = { tree: 2.1, bush: 1.2, rock: 1.0 };
const HITS = { tree: 3, bush: 2, rock: 1 };
const FALL_SECONDS = 0.9;
const STUMP_CAPACITY = 256;
const CHIP_COUNT = 40;
const WORK_REACH = 2.4;
const TAP_RADIUS = { tree: 2.6, bush: 2.2, rock: 2.2 };

function buildStumpGeometry() {
  const stump = new THREE.CylinderGeometry(0.32, 0.42, 0.55, 8);
  stump.translate(0, 0.27, 0);
  return stump;
}

export function createHarvesting(scene, ground, walkGrid, harvestables, harvestedIds) {
  const stumps = new THREE.InstancedMesh(buildStumpGeometry(), new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.9, flatShading: true }), STUMP_CAPACITY);
  stumps.count = 0;
  stumps.castShadow = true;
  stumps.frustumCulled = false;
  scene.add(stumps);

  const chips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.08, 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), CHIP_COUNT);
  chips.frustumCulled = false;
  scene.add(chips);
  const chipState = Array.from({ length: CHIP_COUNT }, () => ({ age: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, color: 0 }));
  let nextChip = 0;

  const matrix = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const tilt = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const chipColors = { tree: new THREE.Color(0x8a5424), bush: new THREE.Color(0x4f7a1a), rock: new THREE.Color(0x8a8278) };

  const byId = new Map(harvestables.map((node) => [node.id, node]));

  function addStump(node) {
    if (stumps.count >= STUMP_CAPACITY) return;
    const size = Math.max(0.8, node.reach / 0.4);
    matrix.compose(position.set(node.x, ground.heightAt(node.x, node.z) - 0.05, node.z), rotation.identity(), scale.set(size, 1, size));
    stumps.setMatrixAt(stumps.count++, matrix);
    stumps.instanceMatrix.needsUpdate = true;
  }

  function removeFromWorld(node) {
    node.mesh.setMatrixAt(node.index, hidden);
    node.mesh.instanceMatrix.needsUpdate = true;
    node.harvested = true;
    if (node.kind === 'tree') addStump(node);
    else walkGrid.removeObstacle(node.obstacle);
  }

  for (const id of harvestedIds) {
    const node = byId.get(id);
    if (node) removeFromWorld(node);
  }

  function setNodeTransform(node, extraRotation, scaleFactor = 1) {
    node.baseMatrix.decompose(position, rotation, scale);
    rotation.premultiply(extraRotation);
    scale.multiplyScalar(scaleFactor);
    matrix.compose(position, rotation, scale);
    node.mesh.setMatrixAt(node.index, matrix);
    node.mesh.instanceMatrix.needsUpdate = true;
  }

  function spawnChips(node, count) {
    for (let i = 0; i < count; i++) {
      const chip = chipState[nextChip];
      nextChip = (nextChip + 1) % CHIP_COUNT;
      const angle = Math.random() * Math.PI * 2;
      chip.age = 0;
      chip.x = node.x;
      chip.z = node.z;
      chip.y = ground.heightAt(node.x, node.z) + (node.kind === 'tree' ? 1.0 : 0.6);
      chip.vx = Math.cos(angle) * (1.5 + Math.random() * 2);
      chip.vz = Math.sin(angle) * (1.5 + Math.random() * 2);
      chip.vy = 2.5 + Math.random() * 2.5;
      chip.spin = Math.random() * 10;
      chips.setColorAt(chipState.indexOf(chip), chipColors[node.kind]);
    }
    if (chips.instanceColor) chips.instanceColor.needsUpdate = true;
  }

  const work = { node: null, phase: 'idle', progress: 0, hitsDone: 0, fallProgress: 0, fallDirectionX: 0, fallDirectionZ: 0 };
  const falling = [];
  const rayPoint = new THREE.Vector3();

  function nodeUnderRay(ray) {
    let best = null;
    let bestScore = Infinity;
    for (const node of harvestables) {
      if (node.harvested) continue;
      const baseY = ground.heightAt(node.x, node.z);
      for (const heightFraction of [0.15, 0.5]) {
        rayPoint.set(node.x, baseY + node.height * heightFraction, node.z);
        const distance = ray.distanceToPoint(rayPoint);
        const allowed = Math.max(TAP_RADIUS[node.kind], node.reach * 2.5);
        if (distance < allowed && distance / allowed < bestScore) {
          bestScore = distance / allowed;
          best = node;
        }
      }
    }
    return best;
  }

  function approachPoint(node, fromX, fromZ) {
    const distance = Math.hypot(fromX - node.x, fromZ - node.z) || 1;
    const standOff = node.reach + 1.3;
    for (let attempt = 0; attempt < 12; attempt++) {
      const angle = Math.atan2(fromZ - node.z, fromX - node.x) + (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * 0.5;
      const x = node.x + Math.cos(angle) * standOff;
      const z = node.z + Math.sin(angle) * standOff;
      if (walkGrid.isPointWalkable(x, z)) return { x, z };
    }
    return { x: node.x + ((fromX - node.x) / distance) * standOff, z: node.z + ((fromZ - node.z) / distance) * standOff };
  }

  function begin(node) {
    work.node = node;
    work.phase = 'approach';
    work.progress = 0;
    work.hitsDone = 0;
  }

  function cancel() {
    if (work.phase === 'working') setNodeTransform(work.node, rotation.identity());
    work.node = null;
    work.phase = 'idle';
  }

  function update(deltaTime, character, onHarvested) {
    for (let i = falling.length - 1; i >= 0; i--) {
      const fall = falling[i];
      fall.progress += deltaTime / FALL_SECONDS;
      const eased = Math.min(1, fall.progress * fall.progress);
      axis.set(fall.directionZ, 0, -fall.directionX).normalize();
      tilt.setFromAxisAngle(axis, eased * Math.PI * 0.48);
      setNodeTransform(fall.node, tilt, 1 - Math.max(0, fall.progress - 0.7) * 3);
      if (fall.progress >= 1) {
        removeFromWorld(fall.node);
        falling.splice(i, 1);
      }
    }

    for (let i = 0; i < CHIP_COUNT; i++) {
      const chip = chipState[i];
      if (chip.age >= 1) {
        chips.setMatrixAt(i, hidden);
        continue;
      }
      chip.age += deltaTime / 0.9;
      chip.vy -= 12 * deltaTime;
      chip.x += chip.vx * deltaTime;
      chip.y += chip.vy * deltaTime;
      chip.z += chip.vz * deltaTime;
      chip.y = Math.max(chip.y, ground.heightAt(chip.x, chip.z) + 0.03);
      rotation.setFromAxisAngle(axis.set(1, 1, 0).normalize(), chip.spin * chip.age);
      matrix.compose(position.set(chip.x, chip.y, chip.z), rotation, scale.setScalar(1 - chip.age * 0.5));
      chips.setMatrixAt(i, matrix);
    }
    chips.instanceMatrix.needsUpdate = true;

    if (work.phase === 'idle') return null;
    const node = work.node;
    const characterState = character.state;
    const distance = Math.hypot(characterState.x - node.x, characterState.z - node.z);
    const stillWalking = characterState.pathIndex < characterState.path.length;

    if (work.phase === 'approach') {
      if (!stillWalking && distance <= node.reach + WORK_REACH) {
        work.phase = 'working';
        character.stop();
      } else if (!stillWalking) {
        cancel();
        return 'unreachable';
      }
      return null;
    }

    characterState.heading = Math.atan2(node.x - characterState.x, node.z - characterState.z);
    work.progress += deltaTime / WORK_SECONDS[node.kind];
    const hitPhase = work.progress * HITS[node.kind];
    const swing = hitPhase - Math.floor(hitPhase);
    character.setWorkPose(node.kind === 'rock' ? 'bush' : node.kind, swing);
    if (Math.floor(hitPhase) > work.hitsDone && work.hitsDone < HITS[node.kind]) {
      work.hitsDone++;
      spawnChips(node, node.kind === 'tree' ? 9 : 6);
      work.shake = 1;
    }
    work.shake = Math.max(0, (work.shake ?? 0) - deltaTime * 5);
    tilt.setFromAxisAngle(axis.set(1, 0, 0.4).normalize(), Math.sin(work.progress * 60) * 0.07 * work.shake);
    setNodeTransform(node, tilt);

    if (work.progress >= 1) {
      character.setWorkPose(null, 0);
      node.harvested = true;
      if (node.kind === 'tree') {
        const directionLength = distance || 1;
        falling.push({ node, progress: 0, directionX: (node.x - characterState.x) / directionLength, directionZ: (node.z - characterState.z) / directionLength });
      } else {
        removeFromWorld(node);
      }
      work.node = null;
      work.phase = 'idle';
      onHarvested(node, node.yields);
    }
    return null;
  }

  return { nodeUnderRay, approachPoint, begin, cancel, update, isBusy: () => work.phase !== 'idle', currentNode: () => work.node };
}
