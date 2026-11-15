import * as THREE from 'three';

const CHARACTER_SCALE = 1.5;
const WALK_SPEED = 4.2;
const TURN_RATE = 9;
const ARRIVAL_DISTANCE = 0.4;

const SKIN = new THREE.Color(0.78, 0.56, 0.4);
const SHIRT = new THREE.Color(0.9, 0.86, 0.76);
const COAT = new THREE.Color(0.14, 0.2, 0.38);
const SASH = new THREE.Color(0.62, 0.1, 0.08);
const TROUSERS = new THREE.Color(0.28, 0.2, 0.14);
const BOOTS = new THREE.Color(0.1, 0.07, 0.05);
const HAT = new THREE.Color(0.12, 0.1, 0.09);

function part(geometry, color, x, y, z) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function limb(length, radius, upperColor, lowerColor, footColor) {
  const pivot = new THREE.Group();
  const upper = part(new THREE.CylinderGeometry(radius, radius * 0.9, length * 0.55, 6), upperColor, 0, -length * 0.275, 0);
  const lower = part(new THREE.CylinderGeometry(radius * 0.9, radius * 0.8, length * 0.45, 6), lowerColor, 0, -length * 0.775, 0);
  pivot.add(upper, lower);
  if (footColor) pivot.add(part(new THREE.BoxGeometry(radius * 2.2, radius * 1.4, radius * 3.4), footColor, 0, -length + radius * 0.5, radius * 0.7));
  return pivot;
}

export function createCharacter(scene) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const hipHeight = 0.9;
  const leftLeg = limb(0.9, 0.11, TROUSERS, TROUSERS, BOOTS);
  const rightLeg = limb(0.9, 0.11, TROUSERS, TROUSERS, BOOTS);
  leftLeg.position.set(-0.13, hipHeight, 0);
  rightLeg.position.set(0.13, hipHeight, 0);
  body.add(leftLeg, rightLeg);

  body.add(part(new THREE.BoxGeometry(0.46, 0.14, 0.28), SASH, 0, hipHeight + 0.05, 0));
  body.add(part(new THREE.BoxGeometry(0.46, 0.54, 0.28), COAT, 0, hipHeight + 0.38, 0));
  body.add(part(new THREE.BoxGeometry(0.16, 0.5, 0.06), SHIRT, 0, hipHeight + 0.4, 0.13));
  body.add(part(new THREE.SphereGeometry(0.15, 8, 6), SKIN, 0, hipHeight + 0.82, 0.02));
  const hatBrim = part(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 3), HAT, 0, hipHeight + 0.95, 0);
  hatBrim.rotation.y = Math.PI;
  body.add(hatBrim, part(new THREE.SphereGeometry(0.16, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), HAT, 0, hipHeight + 0.96, 0));

  const shoulderHeight = hipHeight + 0.6;
  const leftArm = limb(0.66, 0.07, COAT, SKIN, null);
  const rightArm = limb(0.66, 0.07, COAT, SKIN, null);
  leftArm.position.set(-0.29, shoulderHeight, 0);
  rightArm.position.set(0.29, shoulderHeight, 0);
  body.add(leftArm, rightArm);

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false }),
  );
  contactShadow.position.y = 0.04;
  contactShadow.visible = false;
  root.add(contactShadow);

  root.scale.setScalar(CHARACTER_SCALE);
  scene.add(root);

  const state = { x: 0, z: 0, heading: 0, path: [], pathIndex: 0, walkPhase: 0, moving: false, time: 0 };

  function place(x, z, heading = state.heading) {
    state.x = x;
    state.z = z;
    state.heading = heading;
    state.path = [];
    state.pathIndex = 0;
  }

  function setPath(path) {
    state.path = path;
    state.pathIndex = 0;
  }

  function stop() {
    state.path = [];
    state.pathIndex = 0;
  }

  function update(deltaTime, ground) {
    state.time += deltaTime;
    let speed = 0;
    while (state.pathIndex < state.path.length) {
      const waypoint = state.path[state.pathIndex];
      const toWaypointX = waypoint.x - state.x;
      const toWaypointZ = waypoint.z - state.z;
      const distance = Math.hypot(toWaypointX, toWaypointZ);
      if (distance < ARRIVAL_DISTANCE) {
        state.pathIndex++;
        continue;
      }
      const desiredHeading = Math.atan2(toWaypointX, toWaypointZ);
      const headingError = Math.atan2(Math.sin(desiredHeading - state.heading), Math.cos(desiredHeading - state.heading));
      state.heading += headingError * Math.min(1, TURN_RATE * deltaTime);
      const isLastWaypoint = state.pathIndex === state.path.length - 1;
      speed = WALK_SPEED * (isLastWaypoint ? Math.min(1, distance / 1.5 + 0.35) : 1);
      const stepLength = Math.min(distance, speed * deltaTime);
      state.x += (toWaypointX / distance) * stepLength;
      state.z += (toWaypointZ / distance) * stepLength;
      break;
    }
    state.moving = speed > 0.1;

    const strideRate = 7.5;
    state.walkPhase += deltaTime * (state.moving ? strideRate * (speed / WALK_SPEED) : 0);
    if (!state.moving) state.walkPhase += (Math.round(state.walkPhase / Math.PI) * Math.PI - state.walkPhase) * Math.min(1, deltaTime * 10);
    const swing = Math.sin(state.walkPhase) * 0.65;
    leftLeg.rotation.x = swing;
    rightLeg.rotation.x = -swing;
    leftArm.rotation.x = -swing * 0.8;
    rightArm.rotation.x = swing * 0.8;
    leftArm.rotation.z = -0.08;
    rightArm.rotation.z = 0.08;
    const breathing = state.moving ? 0 : Math.sin(state.time * 2.2) * 0.012;
    body.position.y = Math.abs(Math.cos(state.walkPhase)) * 0.05 * (state.moving ? 1 : 0) + breathing;

    const groundHeight = ground.heightAt(state.x, state.z);
    root.position.set(state.x, Math.max(groundHeight, -0.5), state.z);
    root.rotation.y = state.heading;
  }

  function setVisible(visible) {
    root.visible = visible;
  }

  return { state, root, place, setPath, stop, update, setVisible };
}
