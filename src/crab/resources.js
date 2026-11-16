import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom } from '../noise.js';
import { applySeaside } from './seaside.js';
import { TIDE_MIDDLE, TIDE_AMPLITUDE } from './world.js';

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);

export const RESOURCE_TYPES = {
  shellBits: { label: 'Shell bits', icon: '🐚', count: 16, gatherSeconds: 1.0 },
  driftwood: { label: 'Driftwood', icon: '🪵', count: 12, gatherSeconds: 1.3 },
  seaLettuce: { label: 'Sea lettuce', icon: '🥬', count: 12, gatherSeconds: 0.9 },
};

function paint(geometry, colorAt) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    colorAt(color, positions.getX(index), positions.getY(index), positions.getZ(index));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

function buildShellBitGeometry() {
  const ribs = 22;
  const positions = [0, 0.05, -0.42];
  const pale = linearColor(0.98, 0.9, 0.86);
  const rose = linearColor(0.95, 0.56, 0.52);
  for (const [ringShare, ringLift] of [[0.55, 0.2], [1, 0.03]]) {
    for (let rib = 0; rib <= ribs; rib++) {
      const angle = -1.25 + (rib / ribs) * 2.5;
      const ridge = 1 + 0.07 * Math.cos(rib * Math.PI);
      const radius = 0.95 * ringShare * ridge;
      positions.push(Math.sin(angle) * radius, ringLift * ridge + 0.03, -0.42 + Math.cos(angle) * radius);
    }
  }
  const indices = [];
  for (let rib = 0; rib < ribs; rib++) {
    indices.push(0, 1 + rib, 2 + rib);
    indices.push(1 + rib, ribs + 2 + rib, 2 + rib, 2 + rib, ribs + 2 + rib, ribs + 3 + rib);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return paint(geometry, (color, x, y, z) => color.copy(pale).lerp(rose, 0.5 + 0.5 * Math.sin(Math.hypot(x, z + 0.42) * 16)));
}

function buildDriftwoodGeometry() {
  const bark = linearColor(0.5, 0.36, 0.24);
  const core = linearColor(0.78, 0.62, 0.42);
  const stick = new THREE.CylinderGeometry(0.1, 0.13, 1.9, 8).rotateZ(Math.PI / 2).translate(0, 0.12, 0);
  const branch = new THREE.CylinderGeometry(0.05, 0.08, 0.7, 6).rotateZ(Math.PI / 2).rotateY(0.9).translate(0.3, 0.14, -0.3);
  return paint(mergeGeometries([stick, branch]), (color, x) => color.copy(bark).lerp(core, Math.abs(x) > 0.9 ? 1 : 0.15 + 0.15 * Math.sin(x * 23)));
}

function buildSeaLettuceGeometry() {
  const bright = linearColor(0.5, 0.74, 0.24);
  const deep = linearColor(0.14, 0.36, 0.12);
  const leaves = [
    { reach: 0.85, lift: 0.3, ruffles: 7, turn: 0, shiftX: 0, shiftZ: 0 },
    { reach: 0.62, lift: 0.55, ruffles: 6, turn: 1.1, shiftX: 0.14, shiftZ: 0.08 },
    { reach: 0.42, lift: 0.8, ruffles: 5, turn: 2.3, shiftX: -0.08, shiftZ: 0.12 },
  ].map((leaf) => {
    const sheet = new THREE.RingGeometry(0.03, leaf.reach, 44, 7).rotateX(-Math.PI / 2);
    const positions = sheet.attributes.position;
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const share = Math.hypot(x, z) / leaf.reach;
      const angle = Math.atan2(z, x);
      const ruffle = Math.sin(angle * leaf.ruffles + share * 3) * share * share * 0.22 + Math.sin(angle * leaf.ruffles * 2.3 + 1.7) * share * share * share * 0.07;
      positions.setY(index, 0.05 + share * leaf.lift * 0.5 + ruffle * leaf.reach);
    }
    sheet.computeVertexNormals();
    return paint(sheet.rotateY(leaf.turn).translate(leaf.shiftX, 0, leaf.shiftZ), (color, x, y) => color.copy(deep).lerp(bright, THREE.MathUtils.smoothstep(y, 0.04, 0.42)));
  });
  return mergeGeometries(leaves);
}

const SPARKLE_VERTEX_GLSL = /* glsl */ `
attribute float aPhase;
uniform float uTime;
uniform float uPixelScale;
varying float vTwinkle;
void main() {
  vTwinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 3.1 + aPhase), 3.0);
  vec4 viewPosition = modelViewMatrix * vec4(position + vec3(0.0, 0.25 * sin(uTime * 1.4 + aPhase), 0.0), 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uPixelScale * (0.55 + 0.45 * vTwinkle) / -viewPosition.z * (0.7 + -viewPosition.z / 50.0);
}
`;

const SPARKLE_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uInverseResolution;
varying float vTwinkle;
void main() {
  if (texture2D(tDepth, gl_FragCoord.xy * uInverseResolution).r < gl_FragCoord.z) discard;
  vec2 fromCenter = gl_PointCoord - 0.5;
  float cross = max(0.0, 1.0 - abs(fromCenter.x) * 26.0) * max(0.0, 1.0 - abs(fromCenter.y) * 2.4) + max(0.0, 1.0 - abs(fromCenter.y) * 26.0) * max(0.0, 1.0 - abs(fromCenter.x) * 2.4);
  float core = max(0.0, 1.0 - length(fromCenter) * 5.0);
  float halo = max(0.0, 1.0 - length(fromCenter) * 2.1);
  float glow = cross * 0.9 + core * core * 2.0 + halo * halo * 0.16;
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.36) * glow * vTwinkle * 6.0, 1.0);
}
`;

export function createResources(scene, overlay, world, quality, savedNodes, starterSpots) {
  const random = createRandom(2024);
  const geometries = { shellBits: buildShellBitGeometry(), driftwood: buildDriftwoodGeometry(), seaLettuce: buildSeaLettuceGeometry() };
  const highTideMark = TIDE_MIDDLE + TIDE_AMPLITUDE;
  const accepts = {
    shellBits: (x, z, height) => height > TIDE_MIDDLE - 1.4 && height < highTideMark + 1.6 && world.retained.levelAt(x, z) - height < 0.2,
    driftwood: (x, z, height) => height > highTideMark + 0.4 && height < highTideMark + 3.6,
    seaLettuce: (x, z, height) => world.retained.levelAt(x, z) - height > 0.2 || (height > TIDE_MIDDLE - 1.6 && height < TIDE_MIDDLE + 0.6),
  };
  const transform = new THREE.Object3D();
  const nodes = [];
  const meshes = {};

  const sparklePositions = [];
  const sparklePhases = [];

  for (const [type, definition] of Object.entries(RESOURCE_TYPES)) {
    const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: type === 'shellBits' ? 0.3 : 0.9, side: THREE.DoubleSide }), { wetDarkening: 0.9, wetRoughness: type === 'shellBits' ? 0.15 : 0.8, causticStrength: 1.2, chromaticCaustics: quality.chromaticCaustics, glow: type === 'seaLettuce' ? 0.14 : 0.22, glowPulse: true });
    const mesh = new THREE.InstancedMesh(geometries[type], material, definition.count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    meshes[type] = mesh;
    scene.add(mesh);
    for (let slot = 0; slot < definition.count; slot++) {
      const node = { id: `${type}-${slot}`, type, slot, x: 0, y: 0, z: 0, heading: 0, size: 1, gathered: false, sparkleIndex: nodes.length };
      nodes.push(node);
      sparklePositions.push(0, -999, 0);
      sparklePhases.push(random() * 6.28);
    }
  }

  const sparkleGeometry = new THREE.BufferGeometry();
  sparkleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sparklePositions, 3));
  sparkleGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(sparklePhases, 1));
  const sparkleUniforms = { uTime: { value: 0 }, uPixelScale: { value: 600 }, tDepth: overlay.uniforms.tDepth, uInverseResolution: overlay.uniforms.uInverseResolution };
  const sparkles = new THREE.Points(sparkleGeometry, new THREE.ShaderMaterial({ uniforms: sparkleUniforms, vertexShader: SPARKLE_VERTEX_GLSL, fragmentShader: SPARKLE_FRAGMENT_GLSL, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false }));
  sparkles.frustumCulled = false;
  sparkles.renderOrder = 2;
  overlay.scene.add(sparkles);

  function refresh(node) {
    const mesh = meshes[node.type];
    transform.position.set(node.x, node.gathered ? -999 : node.y, node.z);
    transform.rotation.set(0, node.heading, 0);
    transform.scale.setScalar(node.size);
    transform.updateMatrix();
    mesh.setMatrixAt(node.slot, transform.matrix);
    mesh.instanceMatrix.needsUpdate = true;
    sparkleGeometry.attributes.position.setXYZ(node.sparkleIndex, node.x, node.gathered ? -999 : node.y + (node.type === 'seaLettuce' ? 1.7 : 1.05), node.z);
    sparkleGeometry.attributes.position.needsUpdate = true;
  }

  function relocate(node, avoid) {
    const spot = world.randomSpot(random, (x, z, height) => accepts[node.type](x, z, height) && !nodes.some((other) => other !== node && !other.gathered && Math.hypot(other.x - x, other.z - z) < 5) && (!avoid || Math.hypot(avoid.x - x, avoid.z - z) > 14));
    if (!spot) return false;
    Object.assign(node, { x: spot.x, y: spot.y, z: spot.z, heading: random() * Math.PI * 2, size: (node.type === 'shellBits' ? 0.6 : 0.85) + random() * 0.35, gathered: false });
    return true;
  }

  for (const node of nodes) {
    const saved = savedNodes && savedNodes[node.id];
    const starter = node.slot === 0 ? starterSpots[node.type] : null;
    if (saved) Object.assign(node, saved, { y: world.heightAt(saved.x, saved.z) });
    else if (starter) Object.assign(node, { x: starter.x, y: world.heightAt(starter.x, starter.z), z: starter.z, heading: random() * Math.PI * 2, size: 1.1 });
    else relocate(node, null);
    refresh(node);
  }

  function gather(node) {
    node.gathered = true;
    refresh(node);
  }

  function washAshore(avoid) {
    let returned = 0;
    for (const node of nodes) {
      if (!node.gathered) continue;
      if (relocate(node, avoid)) returned++;
      refresh(node);
    }
    return returned;
  }

  function update(time, pixelScale) {
    sparkleUniforms.uTime.value = time;
    sparkleUniforms.uPixelScale.value = pixelScale;
  }

  function serialize() {
    const saved = {};
    for (const node of nodes) saved[node.id] = { x: node.x, z: node.z, heading: node.heading, size: node.size, gathered: node.gathered };
    return saved;
  }

  return { nodes, gather, washAshore, update, serialize };
}
