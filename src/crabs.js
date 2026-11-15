import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom } from './noise.js';
import { tide } from './tide.js';

const THIEF_SPEED = 1.7;
const CARRY_SPEED = 1.15;
const THIEVES_WAKE_AT = 100;
const THIEF_NOTICE_RADIUS = 34;
const PLAYER_GUARD_RADIUS = 10;
const FRIEND_SPEED = 6.2;
const MAX_FRIENDS = 3;
const MIGRATION_PERIOD = 360;
const MIGRATION_OFFSET = 200;
const MIGRATION_SECONDS = 55;
const MIGRATION_COUNT = 140;
const BEACH_TOP = 2.6;

function colored(geometry, color) {
  const plain = geometry.index ? geometry.toNonIndexed() : geometry;
  plain.deleteAttribute('uv');
  const colors = new Float32Array(plain.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) {
    colors[i] = color.r;
    colors[i + 1] = color.g;
    colors[i + 2] = color.b;
  }
  plain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return plain;
}

function buildCrabGeometry(shellColor, { hermit = false, bigClaws = false } = {}) {
  const bodyColor = new THREE.Color(shellColor);
  const legColor = bodyColor.clone().multiplyScalar(0.7);
  const parts = [];
  const body = new THREE.SphereGeometry(0.5, 10, 6);
  body.scale(1, 0.45, 0.8);
  body.translate(0, 0.32, 0);
  parts.push(colored(body, bodyColor));
  for (const side of [-1, 1]) {
    const claw = new THREE.SphereGeometry(0.2, 8, 5);
    claw.scale(bigClaws ? 1.7 : 1, bigClaws ? 1.1 : 0.7, bigClaws ? 1.9 : 1.3);
    claw.translate(side * (bigClaws ? 0.5 : 0.42), 0.32, bigClaws ? 0.7 : 0.55);
    parts.push(colored(claw, bodyColor));
    const eye = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 5);
    eye.translate(side * 0.14, 0.52, 0.32);
    parts.push(colored(eye, new THREE.Color(0.1, 0.08, 0.06)));
    for (let leg = 0; leg < 3; leg++) {
      const segment = new THREE.BoxGeometry(0.42, 0.06, 0.06);
      segment.rotateZ(side * -0.6);
      segment.translate(side * 0.58, 0.18, -0.25 + leg * 0.22);
      parts.push(colored(segment, legColor));
    }
  }
  if (hermit) {
    const shell = new THREE.ConeGeometry(0.42, 0.75, 9);
    shell.rotateX(-1.15);
    shell.translate(0, 0.62, -0.32);
    parts.push(colored(shell, new THREE.Color(0.86, 0.76, 0.6)));
    const swirl = new THREE.TorusGeometry(0.3, 0.07, 5, 12);
    swirl.rotateY(Math.PI / 2);
    swirl.translate(0, 0.58, -0.2);
    parts.push(colored(swirl, new THREE.Color(0.66, 0.52, 0.38)));
  }
  return mergeGeometries(parts);
}

function buildEmojiSprite(emoji, size, backing = null) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d');
  if (backing) {
    context.fillStyle = backing;
    context.beginPath();
    context.arc(48, 48, 42, 0, Math.PI * 2);
    context.fill();
  }
  context.font = '64px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(emoji, 48, 52);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.renderOrder = 5;
  sprite.scale.set(size, size, 1);
  return sprite;
}

function buildBurrowMesh() {
  const group = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.45, 14), new THREE.MeshBasicMaterial({ color: 0x2a1c10, polygonOffset: true, polygonOffsetFactor: -3 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.05;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 5, 14), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 1 }));
  rim.rotation.x = -Math.PI / 2;
  rim.scale.z = 0.5;
  rim.position.y = 0.04;
  const glint = buildEmojiSprite('✨', 1.1);
  glint.position.y = 1.0;
  group.add(hole, rim, glint);
  return { group, glint };
}

export function createCrabs(scene, ground, { tracks, items, beaches, savedBurrows = [], friendCount = 0 }) {
  const random = createRandom(4242);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const hermitGeometry = buildCrabGeometry(0x7a3fa8, { hermit: true });
  const diggerGeometry = buildCrabGeometry(0x2f78c4, { bigClaws: true });
  const migrantGeometry = buildCrabGeometry(0xe0582a);

  function placeOnGround(object, x, z, lift = 0) {
    object.position.set(x, Math.max(ground.heightAt(x, z), tide.level - 0.2) + lift, z);
  }

  function beachPointNear(centerX, centerZ, radius) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = random() * radius;
      const x = centerX + Math.cos(angle) * distance;
      const z = centerZ + Math.sin(angle) * distance;
      const height = ground.heightAt(x, z);
      if (height > 1.0 && height < BEACH_TOP + 1) return { x, z };
    }
    return { x: centerX, z: centerZ };
  }

  const burrows = savedBurrows.map((saved) => {
    const { group, glint } = buildBurrowMesh();
    placeOnGround(group, saved.x, saved.z);
    scene.add(group);
    return { ...saved, root: group, glint };
  });

  function burrowAt(x, z) {
    let burrow = burrows.find((candidate) => Math.hypot(candidate.x - x, candidate.z - z) < 4);
    if (!burrow) {
      const { group, glint } = buildBurrowMesh();
      placeOnGround(group, x, z);
      scene.add(group);
      burrow = { x, z, gold: 0, itemIds: [], root: group, glint };
      burrows.push(burrow);
    }
    return burrow;
  }

  const thieves = beaches.slice(0, 2).map((beach, index) => {
    const mesh = new THREE.Mesh(hermitGeometry, material);
    mesh.castShadow = true;
    mesh.scale.setScalar(1.25);
    scene.add(mesh);
    const home = beachPointNear(beach.x, beach.z, 18);
    placeOnGround(mesh, home.x, home.z);
    const alert = buildEmojiSprite('💰', 2.0);
    alert.visible = false;
    scene.add(alert);
    return { index, mesh, alert, x: home.x, z: home.z, homeX: home.x, homeZ: home.z, heading: 0, state: 'idle', carrying: null, target: null, wanderTimer: 0, cooldown: 30 + random() * 60, beach };
  });

  const diggers = beaches.map((beach) => {
    const mesh = new THREE.Mesh(diggerGeometry, material);
    mesh.castShadow = true;
    mesh.scale.setScalar(1.1);
    scene.add(mesh);
    const spot = beachPointNear(beach.x, beach.z, 22);
    placeOnGround(mesh, spot.x, spot.z);
    const heart = buildEmojiSprite('🥥', 1.3);
    const friendBadge = buildEmojiSprite('❤️', 1.5, 'rgba(255, 255, 255, 0.92)');
    friendBadge.visible = false;
    scene.add(friendBadge);
    heart.visible = false;
    scene.add(heart);
    return { mesh, heart, friendBadge, x: spot.x, z: spot.z, homeX: spot.x, homeZ: spot.z, heading: 0, friend: false, wanderTimer: 0, eraseTimer: 0, followOffset: 0 };
  });

  function makeFriend(digger, followIndex) {
    digger.friend = true;
    digger.followOffset = followIndex;
    digger.heart.visible = false;
    digger.friendBadge.visible = true;
  }

  for (let i = 0; i < Math.min(friendCount, diggers.length); i++) makeFriend(diggers[i], i);

  const migrants = new THREE.InstancedMesh(migrantGeometry, material, MIGRATION_COUNT);
  migrants.frustumCulled = false;
  migrants.visible = false;
  scene.add(migrants);
  const migrantStates = Array.from({ length: MIGRATION_COUNT }, () => ({ x: 0, z: 0, speed: 0, alive: false, phase: 0 }));
  let migrationWasActive = false;
  const dummy = new THREE.Object3D();

  function migrationActiveAt(worldTime) {
    const phase = (worldTime - MIGRATION_OFFSET) % MIGRATION_PERIOD;
    return worldTime >= MIGRATION_OFFSET && phase >= 0 && phase < MIGRATION_SECONDS;
  }

  let lastWorldTime = 0;
  function migrationActive() {
    return migrationActiveAt(lastWorldTime);
  }

  function secondsToMigration(worldTime) {
    if (worldTime < MIGRATION_OFFSET) return MIGRATION_OFFSET - worldTime;
    const phase = (worldTime - MIGRATION_OFFSET) % MIGRATION_PERIOD;
    return phase < MIGRATION_SECONDS ? 0 : MIGRATION_PERIOD - phase;
  }

  function spawnMigrant(state, playerX, playerZ) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = 6 + random() * 55;
      const x = playerX + Math.cos(angle) * distance;
      const z = playerZ + Math.sin(angle) * distance;
      const height = ground.heightAt(x, z);
      if (height > tide.level - 0.1 && height < BEACH_TOP) {
        Object.assign(state, { x, z, speed: 1.6 + random() * 1.4, alive: true, phase: random() * 10 });
        return;
      }
    }
    state.alive = false;
  }

  function burrowSpotAwayFrom(x, z) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const angle = random() * Math.PI * 2;
      const distance = 16 + random() * 10;
      const candidateX = x + Math.cos(angle) * distance;
      const candidateZ = z + Math.sin(angle) * distance;
      const height = ground.heightAt(candidateX, candidateZ);
      if (height > 1.0 && height < BEACH_TOP + 1) return { x: candidateX, z: candidateZ };
    }
    return { x, z };
  }

  function moveToward(crab, targetX, targetZ, speed, deltaTime) {
    const dx = targetX - crab.x;
    const dz = targetZ - crab.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) return 0;
    const stepLength = Math.min(distance, speed * deltaTime);
    crab.x += (dx / distance) * stepLength;
    crab.z += (dz / distance) * stepLength;
    crab.heading = Math.atan2(dx, dz);
    return distance - stepLength;
  }

  function poseCrab(crab, time, moving) {
    placeOnGround(crab.mesh, crab.x, crab.z, moving ? Math.abs(Math.sin(time * 18 + crab.x)) * 0.06 : 0);
    crab.mesh.rotation.y = crab.heading + Math.PI / 2;
  }

  function updateThief(thief, deltaTime, time, playerX, playerZ) {
    thief.cooldown -= deltaTime;
    let moving = false;
    if (thief.state === 'idle') {
      thief.wanderTimer -= deltaTime;
      if (thief.wanderTimer <= 0) {
        thief.wanderTimer = 3 + random() * 4;
        thief.target = beachPointNear(thief.homeX, thief.homeZ, 8);
      }
      if (thief.target) moving = moveToward(thief, thief.target.x, thief.target.z, 0.9, deltaTime) > 0;
      if (thief.cooldown <= 0 && lastWorldTime > THIEVES_WAKE_AT) {
        const loot = items.items.find((item) => !item.collected && !item.carried && item.type === 'pouch' && Math.hypot(item.x - thief.x, item.z - thief.z) < THIEF_NOTICE_RADIUS && (playerX === null || Math.hypot(item.x - playerX, item.z - playerZ) > PLAYER_GUARD_RADIUS));
        if (loot) {
          thief.state = 'stealing';
          thief.target = loot;
        }
      }
    } else if (thief.state === 'stealing') {
      const loot = thief.target;
      if (loot.collected || loot.carried) {
        thief.state = 'idle';
        thief.target = null;
      } else {
        moving = true;
        if (moveToward(thief, loot.x, loot.z, THIEF_SPEED, deltaTime) < 0.4) {
          loot.carried = true;
          loot.root.children[1].visible = false;
          thief.carrying = loot;
          thief.state = 'fleeing';
          const burrowSpot = burrowSpotAwayFrom(thief.x, thief.z);
          thief.target = burrowSpot;
          thief.alert.visible = true;
        }
      }
    } else if (thief.state === 'fleeing') {
      moving = true;
      const loot = thief.carrying;
      loot.x = thief.x;
      loot.z = thief.z;
      loot.root.position.set(thief.x, thief.mesh.position.y + 0.9, thief.z);
      if (moveToward(thief, thief.target.x, thief.target.z, CARRY_SPEED, deltaTime) < 0.3) {
        const burrow = burrowAt(thief.x, thief.z);
        burrow.itemIds.push(loot.id);
        burrow.gold += 25;
        loot.carried = false;
        loot.collected = true;
        loot.root.visible = false;
        thief.carrying = null;
        thief.alert.visible = false;
        thief.state = 'idle';
        thief.cooldown = 20;
        return { stashed: loot };
      }
    }
    if (thief.alert.visible) thief.alert.position.set(thief.x, thief.mesh.position.y + 3.0 + Math.sin(time * 6) * 0.15, thief.z);
    poseCrab(thief, time, moving);
    return null;
  }

  function updateDigger(digger, deltaTime, time, playerX, playerZ, playerHeading, nearbyCoconut) {
    let moving = false;
    if (digger.friend && playerX !== null) {
      const sideAngle = playerHeading + Math.PI + (digger.followOffset - 1) * 0.7;
      const targetX = playerX + Math.sin(sideAngle) * 2.2;
      const targetZ = playerZ + Math.cos(sideAngle) * 2.2;
      const remaining = Math.hypot(targetX - digger.x, targetZ - digger.z);
      if (remaining > 40) {
        digger.x = targetX;
        digger.z = targetZ;
      } else if (remaining > 0.6) {
        moving = true;
        moveToward(digger, targetX, targetZ, Math.min(FRIEND_SPEED, remaining * 2.5), deltaTime);
      }
      digger.friendBadge.position.set(digger.x, digger.mesh.position.y + 1.9, digger.z);
      digger.eraseTimer -= deltaTime;
      if (digger.eraseTimer <= 0) {
        digger.eraseTimer = 0.4;
        tracks.eraseWithin(digger.x, digger.z, 1.6);
      }
    } else if (!digger.friend) {
      digger.wanderTimer -= deltaTime;
      if (digger.wanderTimer <= 0) {
        digger.wanderTimer = 2 + random() * 5;
        digger.target = beachPointNear(digger.homeX, digger.homeZ, 10);
      }
      if (digger.target) moving = moveToward(digger, digger.target.x, digger.target.z, 1.1, deltaTime) > 0;
      const closeToPlayer = playerX !== null && Math.hypot(playerX - digger.x, playerZ - digger.z) < 14;
      digger.heart.visible = closeToPlayer && nearbyCoconut;
      if (digger.heart.visible) digger.heart.position.set(digger.x, digger.mesh.position.y + 1.6 + Math.sin(time * 4) * 0.12, digger.z);
    }
    poseCrab(digger, time, moving);
  }

  function updateMigration(deltaTime, time, worldTime, playerX, playerZ) {
    const active = migrationActiveAt(worldTime) && playerX !== null;
    let started = false;
    if (active && !migrationWasActive) {
      started = true;
      migrants.visible = true;
      for (const state of migrantStates) spawnMigrant(state, playerX, playerZ);
    }
    if (!active && migrationWasActive) migrants.visible = false;
    migrationWasActive = active;
    if (!active) return started;
    const length = Math.hypot(playerX, playerZ) || 1;
    const tangentX = -playerZ / length;
    const tangentZ = playerX / length;
    for (let i = 0; i < MIGRATION_COUNT; i++) {
      const state = migrantStates[i];
      if (!state.alive || Math.hypot(state.x - playerX, state.z - playerZ) > 70) spawnMigrant(state, playerX, playerZ);
      if (!state.alive) {
        dummy.position.set(0, -500, 0);
        dummy.scale.setScalar(0.001);
      } else {
        state.x += tangentX * state.speed * deltaTime;
        state.z += tangentZ * state.speed * deltaTime;
        const height = ground.heightAt(state.x, state.z);
        if (height > BEACH_TOP + 0.5) state.alive = false;
        dummy.position.set(state.x, Math.max(height, tide.level - 0.15) + Math.abs(Math.sin(time * 16 + state.phase)) * 0.04, state.z);
        dummy.rotation.set(0, Math.atan2(tangentX, tangentZ) + Math.PI / 2 + Math.sin(time * 3 + state.phase) * 0.3, 0);
        dummy.scale.setScalar(0.62);
      }
      dummy.updateMatrix();
      migrants.setMatrixAt(i, dummy.matrix);
    }
    migrants.instanceMatrix.needsUpdate = true;
    tracks.eraseBelowHeight?.(BEACH_TOP, 6);
    return started;
  }

  function update(deltaTime, time, worldTime, playerX, playerZ, playerHeading, hasCoconut) {
    lastWorldTime = worldTime;
    const events = { stashed: [], migrationStarted: false };
    for (const thief of thieves) {
      const result = updateThief(thief, deltaTime, time, playerX, playerZ);
      if (result?.stashed) events.stashed.push(result.stashed);
    }
    for (const digger of diggers) updateDigger(digger, deltaTime, time, playerX, playerZ, playerHeading, hasCoconut);
    for (const burrow of burrows) {
      burrow.glint.visible = burrow.gold > 0;
      burrow.glint.material.opacity = 0.5 + 0.5 * Math.sin(time * 4 + burrow.x);
    }
    events.migrationStarted = updateMigration(deltaTime, time, worldTime, playerX, playerZ);
    return events;
  }

  const ray = new THREE.Ray();
  const point = new THREE.Vector3();
  function crabUnderRay(cameraRay) {
    ray.copy(cameraRay);
    let best = null;
    let bestDistance = 1.8;
    const candidates = [...thieves.map((crab) => ({ kind: 'thief', crab })), ...diggers.filter((crab) => !crab.friend).map((crab) => ({ kind: 'digger', crab }))];
    for (const candidate of candidates) {
      point.set(candidate.crab.x, candidate.crab.mesh.position.y + 0.4, candidate.crab.z);
      const distance = ray.distanceToPoint(point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  }

  function burrowUnderRay(cameraRay) {
    ray.copy(cameraRay);
    let best = null;
    let bestDistance = 1.6;
    for (const burrow of burrows) {
      if (burrow.gold <= 0) continue;
      point.set(burrow.x, burrow.root.position.y + 0.2, burrow.z);
      const distance = ray.distanceToPoint(point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = burrow;
      }
    }
    return best;
  }

  function scareThief(thief) {
    if (!thief.carrying) {
      thief.cooldown = 25;
      thief.state = 'idle';
      thief.target = beachPointNear(thief.homeX, thief.homeZ, 12);
      return null;
    }
    const loot = thief.carrying;
    loot.carried = false;
    loot.root.children[1].visible = true;
    loot.x = thief.x + 0.8;
    loot.z = thief.z + 0.8;
    loot.root.position.set(loot.x, ground.heightAt(loot.x, loot.z), loot.z);
    thief.carrying = null;
    thief.alert.visible = false;
    thief.state = 'idle';
    thief.cooldown = 25;
    thief.target = beachPointNear(thief.homeX, thief.homeZ, 12);
    return loot;
  }

  function befriend(digger) {
    const index = diggers.filter((crab) => crab.friend).length;
    if (index >= MAX_FRIENDS) return false;
    makeFriend(digger, index);
    return true;
  }

  function emptyBurrow(burrow) {
    const gold = burrow.gold;
    burrow.gold = 0;
    return gold;
  }

  function serializeBurrows() {
    return burrows.map(({ x, z, gold, itemIds }) => ({ x, z, gold, itemIds }));
  }

  function friendCountNow() {
    return diggers.filter((crab) => crab.friend).length;
  }

  return { thieves, diggers, burrows, update, crabUnderRay, burrowUnderRay, scareThief, befriend, emptyBurrow, serializeBurrows, migrationActive, secondsToMigration, friendCountNow };
}
