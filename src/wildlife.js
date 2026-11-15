import * as THREE from 'three';
import { createRandom } from './noise.js';

const BOAR_COUNT = 8;
const WANDER_SPEED = 1.4;
const FLEE_SPEED = 5.0;
const FLEE_TRIGGER_DISTANCE = 9;
const MAX_WANDER_HEIGHT = 10;
const PRINT_SPACING = 1.4;
const FLEE_RELEASE_DISTANCE = 24;
const HOME_RADIUS = 45;
const TRAP_ATTRACTION_RADIUS = 55;
const TRAP_CATCH_RADIUS = 1.3;
const RESPAWN_SECONDS = 60;
const BOAR_SCALE = 1.45;

const BRISTLE = new THREE.Color(0.46, 0.28, 0.17);
const SNOUT = new THREE.Color(0.85, 0.55, 0.5);
const TUSK = new THREE.Color(0.92, 0.88, 0.78);

function boarPart(geometry, color, x, y, z) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function buildBoar() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const torso = boarPart(new THREE.SphereGeometry(0.42, 8, 6), BRISTLE, 0, 0.55, 0);
  torso.scale.set(0.85, 0.8, 1.45);
  const mane = boarPart(new THREE.BoxGeometry(0.16, 0.16, 0.75), new THREE.Color(0.14, 0.1, 0.07), 0, 0.88, 0.15);
  const head = boarPart(new THREE.BoxGeometry(0.36, 0.34, 0.42), BRISTLE, 0, 0.58, 0.68);
  head.rotation.x = 0.25;
  const snout = boarPart(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 7).rotateX(Math.PI / 2), SNOUT, 0, 0.48, 0.93);
  const leftTusk = boarPart(new THREE.ConeGeometry(0.03, 0.14, 4), TUSK, -0.1, 0.5, 0.92);
  const rightTusk = leftTusk.clone();
  rightTusk.position.x = 0.1;
  const leftEar = boarPart(new THREE.ConeGeometry(0.07, 0.14, 4), BRISTLE, -0.12, 0.8, 0.6);
  const rightEar = leftEar.clone();
  rightEar.position.x = 0.12;
  const tail = boarPart(new THREE.CylinderGeometry(0.02, 0.015, 0.22, 4), BRISTLE, 0, 0.62, -0.62);
  tail.rotation.x = -0.6;
  body.add(torso, mane, head, snout, leftTusk, rightTusk, leftEar, rightEar, tail);
  const legs = [];
  for (const [x, z] of [[-0.18, 0.35], [0.18, 0.35], [-0.18, -0.35], [0.18, -0.35]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, z);
    pivot.add(boarPart(new THREE.CylinderGeometry(0.06, 0.05, 0.42, 5), new THREE.Color(0.18, 0.13, 0.1), 0, -0.21, 0));
    body.add(pivot);
    legs.push(pivot);
  }
  root.scale.setScalar(BOAR_SCALE);
  return { root, body, legs };
}

function buildTrapMesh() {
  const group = new THREE.Group();
  const pit = new THREE.Mesh(new THREE.CircleGeometry(1.1, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a2614 }));
  pit.position.y = 0.04;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.28, 3, 9).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb89a6c, roughness: 1, flatShading: true }));
  rim.position.y = 0.06;
  const cover = new THREE.Group();
  const frondMaterial = new THREE.MeshStandardMaterial({ color: 0x5c8a2a, roughness: 1, side: THREE.DoubleSide, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.3, 1, 3).rotateX(-Math.PI / 2), frondMaterial);
    frond.rotation.y = (i / 7) * Math.PI + (i % 2) * 0.2;
    frond.position.y = 0.1 + i * 0.012;
    cover.add(frond);
  }
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(0.5, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 1 }));
  dirt.position.set(1.6, 0.05, 0.4);
  dirt.scale.set(1.2, 1, 0.7);
  group.add(pit, rim, cover);
  group.traverse((child) => { child.receiveShadow = true; });
  const markerCanvas = document.createElement('canvas');
  markerCanvas.width = markerCanvas.height = 128;
  const context = markerCanvas.getContext('2d');
  context.fillStyle = 'rgba(120, 20, 10, 0.9)';
  context.beginPath();
  context.arc(64, 64, 56, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 7;
  context.strokeStyle = '#fff2d8';
  context.stroke();
  context.font = '64px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('🔪', 64, 68);
  const markerTexture = new THREE.CanvasTexture(markerCanvas);
  markerTexture.colorSpace = THREE.SRGBColorSpace;
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture, depthTest: false, transparent: true }));
  marker.renderOrder = 5;
  marker.position.y = 3.8;
  marker.scale.set(1.8, 1.8, 1);
  marker.visible = false;
  group.add(marker);
  return { group, cover, marker };
}

export function createWildlife(scene, ground, walkGrid, homeAreas, savedTraps, tracks) {
  const random = createRandom(4242);
  const traps = [];
  const boars = [];

  function addTrap(x, z, state = 'armed') {
    const { group, cover, marker } = buildTrapMesh();
    group.position.set(x, ground.heightAt(x, z), z);
    scene.add(group);
    const trap = { x, z, state, group, cover, marker, boar: null };
    traps.push(trap);
    setTrapState(trap, state);
    return trap;
  }

  function setTrapState(trap, state) {
    trap.state = state;
    trap.cover.visible = state === 'armed';
    trap.marker.visible = state === 'caught';
  }

  for (const saved of savedTraps) addTrap(saved.x, saved.z, saved.state);

  function spawnBoar(boar) {
    const home = boar.home;
    for (let attempt = 0; attempt < 60; attempt++) {
      const x = home.x + (random() - 0.5) * HOME_RADIUS;
      const z = home.z + (random() - 0.5) * HOME_RADIUS;
      if (walkGrid.isPointWalkable(x, z) && ground.heightAt(x, z) > 0.8) {
        Object.assign(boar, { x, z, homeX: home.x, homeZ: home.z, heading: random() * Math.PI * 2, state: 'wander', targetX: x, targetZ: z, idle: random() * 3, gait: 0, trap: null, respawnTimer: 0 });
        boar.mesh.root.visible = true;
        return;
      }
    }
  }

  for (let i = 0; i < BOAR_COUNT; i++) {
    const mesh = buildBoar();
    scene.add(mesh.root);
    const boar = { id: i, mesh, home: homeAreas[i % homeAreas.length] };
    spawnBoar(boar);
    boars.push(boar);
  }
  for (const trap of traps) {
    if (trap.state !== 'caught') continue;
    const boar = boars.find((candidate) => candidate.state === 'wander');
    if (!boar) {
      setTrapState(trap, 'open');
      continue;
    }
    Object.assign(boar, { state: 'trapped', trap, x: trap.x, z: trap.z });
    trap.boar = boar;
  }

  function chooseWanderTarget(boar) {
    const armedNearby = traps.filter((trap) => trap.state === 'armed' && Math.hypot(trap.x - boar.x, trap.z - boar.z) < TRAP_ATTRACTION_RADIUS);
    if (armedNearby.length > 0 && random() < 0.6) {
      const trap = armedNearby[Math.floor(random() * armedNearby.length)];
      boar.targetX = trap.x;
      boar.targetZ = trap.z;
      return;
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      const x = boar.homeX + (random() - 0.5) * HOME_RADIUS * 2;
      const z = boar.homeZ + (random() - 0.5) * HOME_RADIUS * 2;
      if (walkGrid.isPointWalkable(x, z) && ground.heightAt(x, z) < MAX_WANDER_HEIGHT) {
        boar.targetX = x;
        boar.targetZ = z;
        return;
      }
    }
  }

  function stepToward(boar, directionX, directionZ, speed, deltaTime) {
    const length = Math.hypot(directionX, directionZ) || 1;
    let heading = Math.atan2(directionX / length, directionZ / length);
    for (let attempt = 0; attempt < 7; attempt++) {
      const tryHeading = heading + (attempt % 2 ? 1 : -1) * Math.ceil(attempt / 2) * 0.45;
      const nextX = boar.x + Math.sin(tryHeading) * Math.max(1, speed * deltaTime);
      const nextZ = boar.z + Math.cos(tryHeading) * Math.max(1, speed * deltaTime);
      if (walkGrid.isPointWalkable(nextX, nextZ)) {
        heading = tryHeading;
        const turn = Math.atan2(Math.sin(heading - boar.heading), Math.cos(heading - boar.heading));
        boar.heading += turn * Math.min(1, deltaTime * 8);
        boar.x += Math.sin(boar.heading) * speed * deltaTime;
        boar.z += Math.cos(boar.heading) * speed * deltaTime;
        boar.printDistance = (boar.printDistance ?? 0) + speed * deltaTime;
        if (tracks && boar.printDistance > PRINT_SPACING) {
          boar.printDistance = 0;
          boar.printSide = -(boar.printSide ?? 1);
          tracks.add(boar.x + Math.cos(boar.heading) * 0.18 * boar.printSide, boar.z - Math.sin(boar.heading) * 0.18 * boar.printSide, boar.heading, 'boar');
        }
        return true;
      }
    }
    return false;
  }

  function update(deltaTime, time, playerX, playerZ) {
    for (const boar of boars) {
      const visual = boar.mesh;
      if (boar.state === 'gone') {
        boar.respawnTimer -= deltaTime;
        if (boar.respawnTimer <= 0) spawnBoar(boar);
        continue;
      }
      if (boar.state === 'trapped') {
        visual.body.rotation.z = Math.sin(time * 14) * 0.12;
        visual.body.rotation.x = -0.45;
        visual.body.position.y = -0.12 + Math.abs(Math.sin(time * 7)) * 0.12;
        if (boar.trap) boar.trap.marker.position.y = 3.8 + Math.sin(time * 4) * 0.25;
        for (const leg of visual.legs) leg.rotation.x = Math.sin(time * 16 + leg.position.x * 10) * 0.8;
        continue;
      }

      const distanceToPlayer = playerX === null ? Infinity : Math.hypot(boar.x - playerX, boar.z - playerZ);
      if (distanceToPlayer < FLEE_TRIGGER_DISTANCE) boar.state = 'flee';
      else if (boar.state === 'flee' && distanceToPlayer > FLEE_RELEASE_DISTANCE) {
        boar.state = 'wander';
        boar.idle = 1 + random() * 2;
        chooseWanderTarget(boar);
      }

      let speed = 0;
      if (boar.state === 'flee') {
        speed = FLEE_SPEED;
        if (!stepToward(boar, boar.x - playerX, boar.z - playerZ, speed, deltaTime)) speed = 0;
      } else if (boar.idle > 0) {
        boar.idle -= deltaTime;
        if (boar.idle <= 0) chooseWanderTarget(boar);
      } else {
        const toTargetX = boar.targetX - boar.x;
        const toTargetZ = boar.targetZ - boar.z;
        if (Math.hypot(toTargetX, toTargetZ) < 1) {
          boar.idle = 2 + random() * 5;
        } else {
          speed = WANDER_SPEED;
          if (!stepToward(boar, toTargetX, toTargetZ, speed, deltaTime)) {
            boar.idle = 1;
            speed = 0;
          }
        }
      }

      for (const trap of traps) {
        if (trap.state === 'armed' && Math.hypot(trap.x - boar.x, trap.z - boar.z) < TRAP_CATCH_RADIUS) {
          setTrapState(trap, 'caught');
          trap.boar = boar;
          boar.state = 'trapped';
          boar.trap = trap;
          boar.x = trap.x;
          boar.z = trap.z;
          break;
        }
      }

      boar.gait += deltaTime * speed * 4.5;
      const stride = speed > 0 ? Math.sin(boar.gait) * (speed > 3 ? 0.9 : 0.5) : 0;
      visual.legs[0].rotation.x = stride;
      visual.legs[3].rotation.x = stride;
      visual.legs[1].rotation.x = -stride;
      visual.legs[2].rotation.x = -stride;
      visual.body.position.y = speed > 3 ? Math.abs(Math.sin(boar.gait)) * 0.08 : 0;
      visual.body.rotation.x = boar.idle > 0 && boar.state === 'wander' ? 0.25 + Math.sin(time * 3 + boar.id) * 0.05 : 0;
      visual.body.rotation.z = 0;
    }

    for (const boar of boars) {
      if (boar.state === 'gone') continue;
      boar.mesh.root.position.set(boar.x, ground.heightAt(boar.x, boar.z), boar.z);
      boar.mesh.root.rotation.y = boar.heading;
    }
  }

  const rayPoint = new THREE.Vector3();
  function trapUnderRay(ray) {
    let best = null;
    let bestDistance = 2.2;
    for (const trap of traps) {
      if (trap.state === 'armed') continue;
      rayPoint.set(trap.x, ground.heightAt(trap.x, trap.z) + 0.4, trap.z);
      const distance = ray.distanceToPoint(rayPoint);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = trap;
      }
    }
    return best;
  }

  function butcher(trap) {
    const boar = trap.boar;
    if (boar) {
      boar.state = 'gone';
      boar.respawnTimer = RESPAWN_SECONDS;
      boar.mesh.root.visible = false;
      boar.mesh.body.position.y = 0;
      boar.mesh.body.rotation.z = 0;
    }
    trap.boar = null;
    setTrapState(trap, 'open');
  }

  function rearm(trap) {
    setTrapState(trap, 'armed');
  }

  function serializeTraps() {
    return traps.map((trap) => ({ x: trap.x, z: trap.z, state: trap.state }));
  }

  return { boars, traps, update, addTrap, trapUnderRay, butcher, rearm, serializeTraps };
}
