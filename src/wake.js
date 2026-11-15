import * as THREE from 'three';
import { waveHeightAt } from './ocean.js';

const POINT_COUNT = 90;
const LIFETIME_SECONDS = 11;
const SPAWN_DISTANCE = 1.6;

export function createWake(scene) {
  const pointX = new Float32Array(POINT_COUNT);
  const pointZ = new Float32Array(POINT_COUNT);
  const pointSideX = new Float32Array(POINT_COUNT);
  const pointSideZ = new Float32Array(POINT_COUNT);
  const pointBirth = new Float32Array(POINT_COUNT).fill(-1e9);
  const pointStrength = new Float32Array(POINT_COUNT);
  const pointDistance = new Float32Array(POINT_COUNT);
  const pointSpeed = new Float32Array(POINT_COUNT);
  let newestIndex = 0;
  let travelled = 0;

  const vertexCount = POINT_COUNT * 2;
  const positions = new Float32Array(vertexCount * 3);
  const fade = new Float32Array(vertexCount);
  const trailCoordinate = new Float32Array(vertexCount * 2);
  const halfWidths = new Float32Array(vertexCount);
  const indices = [];
  for (let i = 0; i < POINT_COUNT - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const fadeAttribute = new THREE.BufferAttribute(fade, 1).setUsage(THREE.DynamicDrawUsage);
  const coordinateAttribute = new THREE.BufferAttribute(trailCoordinate, 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('fade', fadeAttribute);
  geometry.setAttribute('trailCoordinate', coordinateAttribute);
  const halfWidthAttribute = new THREE.BufferAttribute(halfWidths, 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('halfWidth', halfWidthAttribute);
  geometry.setIndex(indices);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float fade;
      attribute vec2 trailCoordinate;
      attribute float halfWidth;
      varying float vertexFade;
      varying vec2 coordinate;
      varying float wakeHalfWidth;
      void main() {
        vertexFade = fade;
        wakeHalfWidth = halfWidth;
        coordinate = trailCoordinate;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vertexFade;
      varying vec2 coordinate;
      varying float wakeHalfWidth;
      float hash(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
      float valueNoise(vec2 p) {
        vec2 cell = floor(p); vec2 local = fract(p); vec2 blend = local * local * (3.0 - 2.0 * local);
        return mix(mix(hash(cell), hash(cell + vec2(1, 0)), blend.x), mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), blend.x), blend.y);
      }
      void main() {
        float acrossMeters = abs(coordinate.x * 2.0 - 1.0) * wakeHalfWidth;
        float edgeDistance = wakeHalfWidth - acrossMeters;
        float breakup = valueNoise(vec2(coordinate.x * wakeHalfWidth * 0.9, coordinate.y * 0.45)) * 0.6
                      + valueNoise(vec2(coordinate.x * wakeHalfWidth * 2.3, coordinate.y * 1.3)) * 0.4;
        float armWidth = 0.6 + wakeHalfWidth * 0.06;
        float arm = smoothstep(0.0, armWidth * 0.4, edgeDistance) * (1.0 - smoothstep(armWidth * 0.5, armWidth * 1.6, edgeDistance));
        float turbulentHalfWidth = 2.4 + wakeHalfWidth * 0.12;
        float turbulence = 1.0 - smoothstep(turbulentHalfWidth * 0.5, turbulentHalfWidth, acrossMeters);
        float turbulenceFade = vertexFade * vertexFade;
        float armBreakup = smoothstep(0.25, 0.6, valueNoise(vec2(coordinate.y * 0.25, coordinate.x * 3.0)));
        float intensity = arm * 0.7 * vertexFade * vertexFade * armBreakup + turbulence * turbulenceFade;
        float alpha = intensity * smoothstep(0.3, 0.75, breakup + intensity * 0.2);
        gl_FragColor = vec4(vec3(0.94, 0.97, 0.98), clamp(alpha, 0.0, 0.85));
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);

  let lastX = 0;
  let lastZ = 0;
  let initialized = false;
  let trailStartTime = 0;

  function update(time, sternX, sternZ, heading, speed) {
    material.uniforms.time.value = time;
    if (!initialized) {
      lastX = sternX;
      lastZ = sternZ;
      initialized = true;
      trailStartTime = time;
    }
    const moved = Math.hypot(sternX - lastX, sternZ - lastZ);
    if (moved >= SPAWN_DISTANCE) {
      travelled += moved;
      newestIndex = (newestIndex + 1) % POINT_COUNT;
      pointX[newestIndex] = sternX;
      pointZ[newestIndex] = sternZ;
      pointSideX[newestIndex] = Math.cos(heading);
      pointSideZ[newestIndex] = -Math.sin(heading);
      pointBirth[newestIndex] = time;
      pointStrength[newestIndex] = Math.min(1, speed / 6);
      pointDistance[newestIndex] = travelled;
      pointSpeed[newestIndex] = speed;
      lastX = sternX;
      lastZ = sternZ;
    }

    for (let order = 0; order < POINT_COUNT; order++) {
      const index = (newestIndex - order + POINT_COUNT) % POINT_COUNT;
      const isLiveHead = order === 0;
      const x = isLiveHead ? sternX : pointX[index];
      const z = isLiveHead ? sternZ : pointZ[index];
      const sideX = isLiveHead ? Math.cos(heading) : pointSideX[index];
      const sideZ = isLiveHead ? -Math.sin(heading) : pointSideZ[index];
      const age = isLiveHead ? 0 : time - pointBirth[index];
      const life = Math.max(0, 1 - age / LIFETIME_SECONDS);
      const strength = isLiveHead ? Math.min(1, speed / 6) : pointStrength[index];
      const spawnSpeed = isLiveHead ? speed : pointSpeed[index];
      const halfWidth = 2.2 + age * (0.4 + spawnSpeed * 0.3);
      const surface = waveHeightAt(x, z, time) + 0.12;
      const distanceAlong = isLiveHead ? travelled + Math.hypot(sternX - lastX, sternZ - lastZ) : pointDistance[index];
      const trailStartFade = isLiveHead ? 1 : Math.min(1, Math.max(0, (pointBirth[index] - trailStartTime) / 3));
      const tailFade = Math.min(1, (POINT_COUNT - 1 - order) / 12) * trailStartFade;
      const fadeValue = Math.pow(life, 1.4) * strength * tailFade * (order < 2 ? 0.5 + order * 0.25 : 1);

      const left = order * 2;
      const right = left + 1;
      positions[left * 3] = x - sideX * halfWidth;
      positions[left * 3 + 1] = surface;
      positions[left * 3 + 2] = z - sideZ * halfWidth;
      positions[right * 3] = x + sideX * halfWidth;
      positions[right * 3 + 1] = surface;
      positions[right * 3 + 2] = z + sideZ * halfWidth;
      fade[left] = fadeValue;
      fade[right] = fadeValue;
      halfWidths[left] = halfWidth;
      halfWidths[right] = halfWidth;
      trailCoordinate[left * 2] = 0;
      trailCoordinate[left * 2 + 1] = distanceAlong;
      trailCoordinate[right * 2] = 1;
      trailCoordinate[right * 2 + 1] = distanceAlong;
    }
    positionAttribute.needsUpdate = true;
    fadeAttribute.needsUpdate = true;
    coordinateAttribute.needsUpdate = true;
    halfWidthAttribute.needsUpdate = true;
  }

  return { mesh, update };
}
