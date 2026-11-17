import * as THREE from 'three';
import { seaUniforms } from './seaside.js';

const TRACK_CAPACITY = 420;
const TRACK_LIFETIME_SECONDS = 75;
const STEP_LENGTH = 0.62;
const FOOT_SPREAD = 0.42;
const WET_TRACK_STRENGTH = 1.8;
const WET_TRACK_THRESHOLD = 0.3;

const TRACK_VERTEX_GLSL = /* glsl */ `
attribute vec4 aTrack;
attribute float aHeading;
attribute float aStrength;
uniform float uTime;
varying float vFade;
varying vec2 vLocal;
void main() {
  float age = uTime - aTrack.w;
  vFade = aStrength * (1.0 - smoothstep(${(TRACK_LIFETIME_SECONDS * 0.55).toFixed(1)}, ${TRACK_LIFETIME_SECONDS.toFixed(1)}, age)) * step(0.0, age);
  vLocal = position.xz;
  vec2 turned = vec2(position.x * cos(aHeading) + position.z * sin(aHeading), -position.x * sin(aHeading) + position.z * cos(aHeading));
  gl_Position = projectionMatrix * viewMatrix * vec4(aTrack.x + turned.x, aTrack.y, aTrack.z + turned.y, 1.0);
}
`;

const TRACK_FRAGMENT_GLSL = /* glsl */ `
varying float vFade;
varying vec2 vLocal;
void main() {
  float dent = 1.0 - smoothstep(0.35, 1.0, length(vLocal * vec2(9.0, 5.0)));
  if (dent * vFade < 0.01) discard;
  gl_FragColor = vec4(vec3(0.2, 0.14, 0.08), min(1.0, dent * vFade * 0.42));
}
`;

export function createTracks(scene, world) {
  const footprint = new THREE.PlaneGeometry(0.24, 0.42).rotateX(-Math.PI / 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = footprint.index;
  geometry.setAttribute('position', footprint.attributes.position);
  const trackData = new Float32Array(TRACK_CAPACITY * 4).fill(-9999);
  const headings = new Float32Array(TRACK_CAPACITY);
  const trackAttribute = new THREE.InstancedBufferAttribute(trackData, 4);
  const headingAttribute = new THREE.InstancedBufferAttribute(headings, 1);
  const strengths = new Float32Array(TRACK_CAPACITY).fill(1);
  const strengthAttribute = new THREE.InstancedBufferAttribute(strengths, 1);
  geometry.setAttribute('aStrength', strengthAttribute);
  geometry.setAttribute('aTrack', trackAttribute);
  geometry.setAttribute('aHeading', headingAttribute);
  geometry.instanceCount = TRACK_CAPACITY;
  const material = new THREE.ShaderMaterial({ uniforms: { uTime: seaUniforms.uTime }, vertexShader: TRACK_VERTEX_GLSL, fragmentShader: TRACK_FRAGMENT_GLSL, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let nextSlot = 0;
  let distanceSinceStep = 0;
  let leftSide = false;
  let previousX = null;
  let previousZ = null;
  let wipeTimer = 0;

  function stamp(x, z, heading, time, strength) {
    trackData.set([x, world.heightAt(x, z) + 0.03, z, time], nextSlot * 4);
    headings[nextSlot] = heading;
    strengths[nextSlot] = strength;
    nextSlot = (nextSlot + 1) % TRACK_CAPACITY;
    trackAttribute.needsUpdate = true;
    headingAttribute.needsUpdate = true;
    strengthAttribute.needsUpdate = true;
  }

  function update(deltaTime, time, player, seaLevel) {
    if (previousX !== null) distanceSinceStep += Math.hypot(player.x - previousX, player.z - previousZ);
    previousX = player.x;
    previousZ = player.z;
    const standsInWater = world.waterLevelAt(player.x, player.z, seaLevel) > player.y + 0.02;
    if (distanceSinceStep >= STEP_LENGTH) {
      distanceSinceStep = 0;
      leftSide = !leftSide;
      if (!standsInWater) {
        const side = leftSide ? -1 : 1;
        const strength = player.wetness > WET_TRACK_THRESHOLD ? WET_TRACK_STRENGTH : 1;
        const sideX = Math.cos(player.heading) * FOOT_SPREAD * side;
        const sideZ = -Math.sin(player.heading) * FOOT_SPREAD * side;
        stamp(player.x + sideX, player.z + sideZ, player.heading, time, strength);
        stamp(player.x + sideX * 1.5 - Math.sin(player.heading) * 0.45, player.z + sideZ * 1.5 - Math.cos(player.heading) * 0.45, player.heading + side * 0.5, time, strength);
      }
    }
    wipeTimer += deltaTime;
    if (wipeTimer < 0.5) return;
    wipeTimer = 0;
    let wiped = false;
    for (let slot = 0; slot < TRACK_CAPACITY; slot++) {
      const birth = trackData[slot * 4 + 3];
      if (birth < -9000) continue;
      if (time - birth > TRACK_LIFETIME_SECONDS || world.waterLevelAt(trackData[slot * 4], trackData[slot * 4 + 2], seaLevel) > trackData[slot * 4 + 1] - 0.03) {
        trackData[slot * 4 + 3] = -9999;
        wiped = true;
      }
    }
    if (wiped) trackAttribute.needsUpdate = true;
  }

  function activeCount() {
    let count = 0;
    for (let slot = 0; slot < TRACK_CAPACITY; slot++) if (trackData[slot * 4 + 3] > -9000) count++;
    return count;
  }

  return { update, activeCount };
}
