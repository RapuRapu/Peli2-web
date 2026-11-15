import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { waveHeightAt } from './ocean.js';
import { tide } from './tide.js';
import { createRandom, smoothstep } from './noise.js';

const BODY_LENGTH = 3.2;
const DOLPHIN_SCALE = 2.0;
const SCALED_HALF_LENGTH = (BODY_LENGTH * DOLPHIN_SCALE) / 2;
const DOLPHINS_PER_POD = 4;
const TRIGGER_DISTANCE = 180;
const MIN_SHIP_SPEED_TO_TRIGGER = 1.55;
const MIN_SHIP_SPEED_TO_STAY = 1.0;
const COOLDOWN_SECONDS = 60;
const MIN_SAFE_DEPTH = -3.0;
const SHIP_TOO_SHALLOW_DEPTH = -2.4;
const MAX_DOLPHIN_SPEED = 12;
const LEAP_DURATION = 1.15;
const SPLASH_POOL_SIZE = 48;

const BACK_COLOR = new THREE.Color(0.09, 0.11, 0.14);
const BELLY_COLOR = new THREE.Color(0.55, 0.58, 0.6);

function bodyRadius(t) {
  const tailStock = 0.07 + 0.25 * smoothstep(0.0, 0.5, t);
  const headTaper = 1 - 0.45 * smoothstep(0.7, 0.9, t);
  const beak = t > 0.9 ? 1 - smoothstep(0.9, 1.0, t) * 0.75 : 1;
  return tailStock * headTaper * beak;
}

function buildDolphinGeometry() {
  const lengthSteps = 20;
  const ringSteps = 10;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= lengthSteps; i++) {
    const t = i / lengthSteps;
    const radius = bodyRadius(t);
    const z = (t - 0.5) * BODY_LENGTH;
    for (let j = 0; j <= ringSteps; j++) {
      const angle = (j / ringSteps) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius * 0.95, Math.sin(angle) * radius * 1.1, z);
    }
  }
  for (let i = 0; i < lengthSteps; i++) {
    for (let j = 0; j < ringSteps; j++) {
      const a = i * (ringSteps + 1) + j;
      const b = a + ringSteps + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  body.setIndex(indices);

  const finVertices = (points) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
    geometry.setIndex([0, 1, 2]);
    return geometry;
  };
  const dorsalBaseY = bodyRadius(0.5) * 1.05;
  const dorsalFin = finVertices([[0, dorsalBaseY, 0.35], [0, dorsalBaseY, -0.35], [0, dorsalBaseY + 0.42, -0.42]]);
  const tailZ = -BODY_LENGTH / 2;
  const flukes = finVertices([[0, 0, tailZ + 0.18], [-0.52, 0, tailZ - 0.22], [0.52, 0, tailZ - 0.22]]);
  const leftFlipper = finVertices([[-0.2, -0.12, 0.55], [-0.2, -0.12, 0.25], [-0.55, -0.32, 0.12]]);
  const rightFlipper = finVertices([[0.2, -0.12, 0.55], [0.2, -0.12, 0.25], [0.55, -0.32, 0.12]]);

  const merged = mergeGeometries([body, dorsalFin, flukes, leftFlipper, rightFlipper]);
  merged.scale(DOLPHIN_SCALE, DOLPHIN_SCALE, DOLPHIN_SCALE);
  merged.computeVertexNormals();

  const vertexCount = merged.attributes.position.count;
  const colors = new Float32Array(vertexCount * 3);
  const shade = new THREE.Color();
  for (let i = 0; i < vertexCount; i++) {
    const bellyness = smoothstep(-0.1, -0.3, merged.attributes.position.getY(i));
    shade.copy(BACK_COLOR).lerp(BELLY_COLOR, bellyness);
    colors[i * 3] = shade.r;
    colors[i * 3 + 1] = shade.g;
    colors[i * 3 + 2] = shade.b;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

const SWIM_BEND_GLSL = /* glsl */ `
  float tailWeight = smoothstep(0.3, -${SCALED_HALF_LENGTH.toFixed(2)}, position.z);
  float headWeight = smoothstep(0.8, ${SCALED_HALF_LENGTH.toFixed(2)}, position.z) * 0.25;
  float swimWave = sin(instanceSwimPhase - position.z * 1.0);
  vec3 swimmingPosition = position;
  swimmingPosition.y += swimWave * (tailWeight * 0.42 + headWeight * 0.08);
`;

function createSwimmingMaterial(waterColor) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, transparent: true });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.dolphinWaterColor = { value: waterColor };
    shader.vertexShader = 'attribute float instanceSwimPhase;\nattribute float instanceSurfaceHeight;\nvarying float depthBelowSurface;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', `${SWIM_BEND_GLSL}
       vec3 transformed = swimmingPosition;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
       depthBelowSurface = instanceSurfaceHeight - (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;`);
    shader.fragmentShader = 'uniform vec3 dolphinWaterColor;\nvarying float depthBelowSurface;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       float submerged = smoothstep(0.0, 0.9, depthBelowSurface);
       diffuseColor.rgb = mix(diffuseColor.rgb, dolphinWaterColor, submerged * 0.85);
       diffuseColor.a *= 1.0 - smoothstep(0.1, 2.2, depthBelowSurface) * 0.8;
       float waterline = 1.0 - smoothstep(0.0, 0.14, abs(depthBelowSurface));
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 0.96), waterline * 0.3);`,
    );
  };
  return material;
}

function createSplashPool(scene) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {},
    vertexShader: /* glsl */ `
      attribute float splashAge;
      varying vec2 splashUv;
      varying float age;
      void main() {
        splashUv = uv;
        age = splashAge;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 splashUv;
      varying float age;
      void main() {
        vec2 centered = splashUv * 2.0 - 1.0;
        float radius = length(centered);
        vec2 cell = floor(centered * 5.0 + age * 3.0);
        float speckle = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float foamPatch = 1.0 - smoothstep(0.35, 1.0, radius);
        float alpha = foamPatch * mix(0.55, 1.0, speckle) * (1.0 - age) * (1.0 - age) * 0.85;
        gl_FragColor = vec4(vec3(0.95, 0.97, 0.98), alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const ages = new Float32Array(SPLASH_POOL_SIZE).fill(1);
  const ageAttribute = new THREE.InstancedBufferAttribute(ages, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('splashAge', ageAttribute);
  const splashes = new THREE.InstancedMesh(geometry, material, SPLASH_POOL_SIZE);
  splashes.frustumCulled = false;
  splashes.renderOrder = 3;
  scene.add(splashes);

  const splashX = new Float32Array(SPLASH_POOL_SIZE);
  const splashZ = new Float32Array(SPLASH_POOL_SIZE);
  const splashSize = new Float32Array(SPLASH_POOL_SIZE);
  let nextSplash = 0;
  const matrix = new THREE.Matrix4();
  const SPLASH_LIFETIME = 1.3;

  function spawn(x, z, size) {
    splashX[nextSplash] = x;
    splashZ[nextSplash] = z;
    splashSize[nextSplash] = size;
    ages[nextSplash] = 0;
    nextSplash = (nextSplash + 1) % SPLASH_POOL_SIZE;
  }

  function update(deltaTime, time) {
    for (let i = 0; i < SPLASH_POOL_SIZE; i++) {
      ages[i] = Math.min(1, ages[i] + deltaTime / SPLASH_LIFETIME);
      const size = splashSize[i] * (0.6 + ages[i] * 0.8);
      matrix.makeScale(size, 1, size);
      matrix.setPosition(splashX[i], waveHeightAt(splashX[i], splashZ[i], time) + 0.15, splashZ[i]);
      splashes.setMatrixAt(i, matrix);
    }
    splashes.instanceMatrix.needsUpdate = true;
    ageAttribute.needsUpdate = true;
  }

  return { spawn, update };
}

const POD_ROAMING = 0;
const POD_APPROACHING = 1;
const POD_ESCORTING = 2;
const POD_LEAVING = 3;

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function createDolphins(scene, heightmap, podHomes, { waterColor, seed = 5 }) {
  const random = createRandom(seed);
  const dolphinCount = podHomes.length * DOLPHINS_PER_POD;
  const geometry = buildDolphinGeometry();
  const swimPhases = new Float32Array(dolphinCount);
  const surfaceHeights = new Float32Array(dolphinCount);
  const swimPhaseAttribute = new THREE.InstancedBufferAttribute(swimPhases, 1).setUsage(THREE.DynamicDrawUsage);
  const surfaceHeightAttribute = new THREE.InstancedBufferAttribute(surfaceHeights, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('instanceSwimPhase', swimPhaseAttribute);
  geometry.setAttribute('instanceSurfaceHeight', surfaceHeightAttribute);

  const bodies = new THREE.InstancedMesh(geometry, createSwimmingMaterial(waterColor), dolphinCount);
  bodies.castShadow = true;
  bodies.frustumCulled = false;
  bodies.renderOrder = 2;
  scene.add(bodies);
  const splashes = createSplashPool(scene);

  const pods = podHomes.map((home, podIndex) => ({
    homeX: home.x, homeZ: home.z, state: POD_ROAMING, stateTimer: 0, escortDuration: 0, cooldown: 0,
    roamPhase: random() * Math.PI * 2, firstDolphin: podIndex * DOLPHINS_PER_POD,
  }));

  const dolphins = [];
  for (let i = 0; i < dolphinCount; i++) {
    const pod = pods[Math.floor(i / DOLPHINS_PER_POD)];
    const indexInPod = i % DOLPHINS_PER_POD;
    const side = indexInPod % 2 === 0 ? 1 : -1;
    dolphins.push({
      x: pod.homeX + (random() - 0.5) * 30, z: pod.homeZ + (random() - 0.5) * 30, y: -0.5,
      heading: random() * Math.PI * 2, speed: 2, swimPhase: random() * 10,
      escortSide: side, escortForward: 12 + Math.floor(indexInPod / 2) * 7 + random() * 3, escortLateral: 3.5 + Math.floor(indexInPod / 2) * 4 + random() * 1.5,
      roamOffsetAngle: (indexInPod / DOLPHINS_PER_POD) * Math.PI * 2, breathPhase: random() * Math.PI * 2,
      leapTimer: 2 + random() * 6, leapProgress: -1, pitch: 0, surfaceSplashTimer: random(),
    });
  }

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const unitScale = new THREE.Vector3(1, 1, 1);

  function podCenter(pod) {
    let sumX = 0;
    let sumZ = 0;
    for (let i = 0; i < DOLPHINS_PER_POD; i++) {
      sumX += dolphins[pod.firstDolphin + i].x;
      sumZ += dolphins[pod.firstDolphin + i].z;
    }
    return [sumX / DOLPHINS_PER_POD, sumZ / DOLPHINS_PER_POD];
  }

  function updatePod(pod, deltaTime, ship) {
    pod.stateTimer += deltaTime;
    pod.cooldown = Math.max(0, pod.cooldown - deltaTime);
    pod.roamPhase += deltaTime * 0.04;
    const [centerX, centerZ] = podCenter(pod);
    const distanceToShip = Math.hypot(ship.x - centerX, ship.z - centerZ);
    const shipInDeepWater = heightmap.heightAt(ship.x, ship.z) - tide.level < SHIP_TOO_SHALLOW_DEPTH;

    if (pod.state === POD_ROAMING && pod.cooldown === 0 && distanceToShip < TRIGGER_DISTANCE && ship.speed > MIN_SHIP_SPEED_TO_TRIGGER && shipInDeepWater) {
      pod.state = POD_APPROACHING;
      pod.stateTimer = 0;
      pod.escortDuration = 20 + random() * 20;
    } else if (pod.state === POD_APPROACHING || pod.state === POD_ESCORTING) {
      if (pod.state === POD_APPROACHING && distanceToShip < 30) {
        pod.state = POD_ESCORTING;
        pod.stateTimer = 0;
      }
      const escortOver = pod.state === POD_ESCORTING && pod.stateTimer > pod.escortDuration;
      const gaveUp = pod.state === POD_APPROACHING && pod.stateTimer > 40;
      if (escortOver || gaveUp || ship.speed < MIN_SHIP_SPEED_TO_STAY || !shipInDeepWater) {
        pod.state = POD_LEAVING;
        pod.stateTimer = 0;
        pod.cooldown = COOLDOWN_SECONDS;
      }
    } else if (pod.state === POD_LEAVING && (Math.hypot(pod.homeX - centerX, pod.homeZ - centerZ) < 35 || pod.stateTimer > 45)) {
      pod.state = POD_ROAMING;
      pod.stateTimer = 0;
    }
  }

  function updateDolphin(dolphin, pod, index, deltaTime, time, ship) {
    let targetX;
    let targetZ;
    let desiredSpeed;
    const shipForwardX = Math.sin(ship.heading);
    const shipForwardZ = Math.cos(ship.heading);

    if (pod.state === POD_APPROACHING || pod.state === POD_ESCORTING) {
      const lateral = (ship.halfBeam + dolphin.escortLateral) * dolphin.escortSide;
      const forward = ship.length * 0.5 + dolphin.escortForward - 8 + Math.sin(time * 0.6 + index) * 2;
      targetX = ship.x + shipForwardX * forward + shipForwardZ * lateral;
      targetZ = ship.z + shipForwardZ * forward - shipForwardX * lateral;
      const distance = Math.hypot(targetX - dolphin.x, targetZ - dolphin.z);
      const alongTrackError = (targetX - dolphin.x) * shipForwardX + (targetZ - dolphin.z) * shipForwardZ;
      desiredSpeed = (Math.sin(time * 0.9 + index * 2.3) * 0.6) + (distance > 40 ? MAX_DOLPHIN_SPEED : Math.max(1.5, Math.min(MAX_DOLPHIN_SPEED, ship.speed + Math.max(-2.5, Math.min(6, alongTrackError * 0.5)))));
      const pursuitLead = Math.min(14, distance * 0.5 + 6);
      targetX += shipForwardX * pursuitLead;
      targetZ += shipForwardZ * pursuitLead;
    } else {
      const homeX = pod.state === POD_LEAVING ? pod.homeX : pod.homeX + Math.cos(pod.roamPhase) * 25;
      const homeZ = pod.state === POD_LEAVING ? pod.homeZ : pod.homeZ + Math.sin(pod.roamPhase) * 25;
      targetX = homeX + Math.cos(dolphin.roamOffsetAngle + pod.roamPhase * 3) * 9;
      targetZ = homeZ + Math.sin(dolphin.roamOffsetAngle + pod.roamPhase * 3) * 9;
      desiredSpeed = pod.state === POD_LEAVING ? 7 : 2.2;
    }

    const towardTarget = Math.atan2(targetX - dolphin.x, targetZ - dolphin.z);
    let desiredHeading = towardTarget + Math.sin(time * 0.7 + index * 1.9) * 0.12;
    const lookAheadX = dolphin.x + Math.sin(dolphin.heading) * 10;
    const lookAheadZ = dolphin.z + Math.cos(dolphin.heading) * 10;
    if (heightmap.heightAt(lookAheadX, lookAheadZ) - tide.level > MIN_SAFE_DEPTH) {
      const leftDepth = heightmap.heightAt(dolphin.x + Math.sin(dolphin.heading + 0.9) * 10, dolphin.z + Math.cos(dolphin.heading + 0.9) * 10);
      const rightDepth = heightmap.heightAt(dolphin.x + Math.sin(dolphin.heading - 0.9) * 10, dolphin.z + Math.cos(dolphin.heading - 0.9) * 10);
      desiredHeading = dolphin.heading + (leftDepth < rightDepth ? 1.2 : -1.2);
    }

    const maxTurn = 1.6 * deltaTime;
    dolphin.heading = wrapAngle(dolphin.heading + Math.max(-maxTurn, Math.min(maxTurn, wrapAngle(desiredHeading - dolphin.heading))));
    dolphin.speed += (desiredSpeed - dolphin.speed) * Math.min(1, deltaTime * 1.2);
    dolphin.x += Math.sin(dolphin.heading) * dolphin.speed * deltaTime;
    dolphin.z += Math.cos(dolphin.heading) * dolphin.speed * deltaTime;
    dolphin.swimPhase += deltaTime * (3 + dolphin.speed * 0.9);

    const surface = waveHeightAt(dolphin.x, dolphin.z, time);
    const previousY = dolphin.y;
    dolphin.breathPhase += deltaTime * (0.9 + dolphin.speed * 0.04);
    let depthOffset = -1.5 + Math.max(0, Math.sin(dolphin.breathPhase)) * 1.05;

    const escorting = pod.state === POD_ESCORTING;
    if (dolphin.leapProgress >= 0) {
      dolphin.leapProgress += deltaTime / LEAP_DURATION;
      if (dolphin.leapProgress >= 1) {
        dolphin.leapProgress = -1;
        splashes.spawn(dolphin.x, dolphin.z, 3.2);
      } else {
        depthOffset = -0.4 + 2.4 * 4 * dolphin.leapProgress * (1 - dolphin.leapProgress);
      }
    } else {
      dolphin.leapTimer -= deltaTime;
      if (dolphin.leapTimer <= 0) {
        dolphin.leapProgress = 0;
        dolphin.leapTimer = escorting ? 4 + random() * 6 : 6 + random() * 8;
        splashes.spawn(dolphin.x, dolphin.z, 2.4);
      }
    }

    dolphin.surfaceSplashTimer -= deltaTime;
    if (dolphin.leapProgress < 0 && depthOffset > -0.75 && dolphin.speed > 3 && dolphin.surfaceSplashTimer <= 0) {
      splashes.spawn(dolphin.x - Math.sin(dolphin.heading) * 1.2, dolphin.z - Math.cos(dolphin.heading) * 1.2, 1.8);
      dolphin.surfaceSplashTimer = 0.28;
    }
    dolphin.y = surface + depthOffset;
    const verticalSpeed = deltaTime > 0 ? (dolphin.y - previousY) / deltaTime : 0;
    const targetPitch = -Math.atan2(verticalSpeed, Math.max(1, dolphin.speed));
    dolphin.pitch += (targetPitch - dolphin.pitch) * Math.min(1, deltaTime * 6);

    euler.set(dolphin.pitch, dolphin.heading, 0, 'YXZ');
    rotation.setFromEuler(euler);
    position.set(dolphin.x, dolphin.y, dolphin.z);
    matrix.compose(position, rotation, unitScale);
    bodies.setMatrixAt(index, matrix);
    swimPhases[index] = dolphin.swimPhase;
    surfaceHeights[index] = surface;
  }

  function update(deltaTime, time, ship) {
    for (const pod of pods) updatePod(pod, deltaTime, ship);
    for (let i = 0; i < dolphinCount; i++) updateDolphin(dolphins[i], pods[Math.floor(i / DOLPHINS_PER_POD)], i, deltaTime, time, ship);
    bodies.instanceMatrix.needsUpdate = true;
    swimPhaseAttribute.needsUpdate = true;
    surfaceHeightAttribute.needsUpdate = true;
    splashes.update(deltaTime, time);
  }

  return { update, pods, dolphins };
}
