import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom, smoothstep } from '../noise.js';
import { applySeaside } from './seaside.js';

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const WOOD = linearColor(0.5, 0.32, 0.17);
const WOOD_DARK = linearColor(0.3, 0.18, 0.09);
const IRON = linearColor(0.2, 0.2, 0.22);
const BRASS = linearColor(0.86, 0.64, 0.24);
const GOLD = linearColor(1, 0.78, 0.22);
const STEEL = linearColor(0.78, 0.8, 0.84);
const LEATHER = linearColor(0.3, 0.17, 0.09);
const CANVAS = linearColor(0.86, 0.8, 0.66);
const ROPE = linearColor(0.74, 0.6, 0.38);
const STONE = linearColor(0.46, 0.43, 0.4);
const CHAR = linearColor(0.08, 0.07, 0.06);
const ASH = linearColor(0.36, 0.34, 0.32);
const GLASS = linearColor(0.16, 0.38, 0.2);
const HAT = linearColor(0.07, 0.06, 0.07);

export function paint(geometry, colorAt) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    colorAt(color, positions.getX(index), positions.getY(index), positions.getZ(index));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  return geometry.index ? geometry : mergeVertices(geometry, 1e-5);
}

export const solid = (geometry, color) => paint(geometry, (target) => target.copy(color));

function lathe(profile, segments) {
  return new THREE.LatheGeometry(profile.map(([radius, height]) => new THREE.Vector2(radius, height)), segments);
}

export function buildBarrel(radius, height) {
  const profile = [];
  for (let step = 0; step <= 10; step++) {
    const share = step / 10;
    profile.push([radius * (0.84 + 0.16 * Math.sin(share * Math.PI)), share * height]);
  }
  const body = paint(lathe([[0, 0], ...profile, [0, height]], 28), (color, x, y, z) => {
    const stave = Math.sin(Math.atan2(z, x) * 14) > 0.85 ? 0.7 : 1;
    const hoop = [0.12, 0.3, 0.7, 0.88].some((at) => Math.abs(y / height - at) < 0.025);
    color.copy(hoop ? IRON : WOOD).multiplyScalar(hoop ? 1 : stave * (0.85 + 0.2 * Math.sin(y * 0.7 + x)));
  });
  return body;
}

export function buildCrate(size) {
  const box = new THREE.BoxGeometry(size, size, size, 6, 6, 6).translate(0, size / 2, 0);
  return paint(box, (color, x, y, z) => {
    const edge = Math.max(Math.abs(x), Math.abs(z)) > size * 0.44 && (Math.abs(x) > size * 0.44) + (Math.abs(z) > size * 0.44) + (y < size * 0.07 || y > size * 0.93) >= 2;
    const plank = Math.abs(Math.sin(y / size * Math.PI * 5)) < 0.12;
    color.copy(edge ? WOOD_DARK : WOOD).multiplyScalar(plank ? 0.65 : 1);
  });
}

function buildBottle(length, radius) {
  const profile = [[0, 0], [radius, 0.05], [radius, length * 0.62], [radius * 0.45, length * 0.78], [radius * 0.38, length * 0.98], [radius * 0.45, length], [0, length]];
  const bottle = paint(lathe(profile, 18), (color, x, y) => color.copy(GLASS).multiplyScalar(0.8 + 0.6 * smoothstep(length * 0.5, length * 0.75, y)));
  const label = solid(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, length * 0.26, 18, 1, true).translate(0, length * 0.35, 0), linearColor(0.85, 0.78, 0.6));
  return mergeGeometries([bottle, label]).rotateZ(Math.PI / 2).translate(length / 2, radius, 0);
}

function buildCutlass(height) {
  const blade = new THREE.BoxGeometry(2.2, height, 0.25, 1, 8, 1).translate(0, height / 2, 0);
  const positions = blade.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const share = positions.getY(index) / height;
    positions.setX(index, positions.getX(index) * (0.35 + 0.65 * share) + 1.2 * (1 - share) * (1 - share));
  }
  blade.computeVertexNormals();
  const parts = [paint(blade, (color, x, y) => color.copy(STEEL).multiplyScalar(0.8 + 0.3 * smoothstep(-0.6, 0.6, x)))];
  parts.push(solid(new THREE.TorusGeometry(1.8, 0.28, 8, 16, Math.PI).rotateY(Math.PI / 2).translate(0, height + 0.3, 0), BRASS));
  parts.push(solid(new THREE.CylinderGeometry(0.55, 0.6, 4.2, 10).translate(0, height + 2.3, 0), LEATHER));
  parts.push(solid(new THREE.SphereGeometry(0.8, 10, 8).translate(0, height + 4.6, 0), BRASS));
  return mergeGeometries(parts).translate(0, -height * 0.3, 0).rotateZ(0.18);
}

function buildBoot(length) {
  const foot = new THREE.SphereGeometry(1, 20, 12).scale(length * 0.5, 3.4, 4.2).translate(length * 0.1, 3.0, 0);
  const sole = new THREE.CylinderGeometry(1, 1, 1.1, 20).scale(length * 0.52, 1, 4.4).translate(length * 0.1, 0.55, 0);
  const shaft = new THREE.CylinderGeometry(4.4, 4.0, length * 0.75, 18, 3, false).rotateZ(Math.PI / 2 - 0.12).translate(-length * 0.55, 4.6, 0);
  const cuff = new THREE.TorusGeometry(4.5, 0.7, 8, 18).rotateY(Math.PI / 2).translate(-length * 0.92, 5.1, 0);
  return mergeGeometries([paint(foot, (color, x, y) => color.copy(LEATHER).multiplyScalar(0.8 + 0.4 * smoothstep(2, 6, y))), solid(sole, CHAR), paint(shaft, (color, x, y) => color.copy(LEATHER).multiplyScalar(0.75 + 0.35 * smoothstep(2, 8, y))), solid(cuff, linearColor(0.22, 0.12, 0.06))]);
}

function buildHat(radius) {
  const brim = new THREE.CylinderGeometry(radius, radius, 0.5, 36, 1).translate(0, 0.6, 0);
  const positions = brim.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const distance = Math.hypot(x, z) / radius;
    const corner = Math.pow(Math.max(0, Math.cos(Math.atan2(z, x) * 3)), 2);
    positions.setY(index, positions.getY(index) + distance * distance * (1.2 + 3.2 * (1 - corner)));
  }
  brim.computeVertexNormals();
  const crown = new THREE.SphereGeometry(radius * 0.55, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.15, 1).translate(0, 0.8, 0);
  const trim = new THREE.TorusGeometry(radius * 0.56, 0.22, 6, 24).rotateX(Math.PI / 2).translate(0, 1.7, 0);
  return mergeGeometries([solid(brim, HAT), solid(crown, HAT), solid(trim, linearColor(0.5, 0.36, 0.12))]);
}

function buildTent(width, height) {
  const poles = [-1, 1].map((side) => solid(new THREE.CylinderGeometry(0.7, 0.8, height, 8).translate(side * width / 2, height / 2, 0), WOOD_DARK));
  const ridge = solid(new THREE.CylinderGeometry(0.6, 0.6, width + 2, 8).rotateZ(Math.PI / 2).translate(0, height, 0), WOOD_DARK);
  const canvas = new THREE.PlaneGeometry(width + 1.5, Math.hypot(height, 14), 16, 8).rotateX(-Math.PI / 2);
  const positions = canvas.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const share = (positions.getZ(index) + Math.hypot(height, 14) / 2) / Math.hypot(height, 14);
    const sag = Math.sin(share * Math.PI) * 1.4 * (1 - Math.pow(Math.abs(x) / (width / 2 + 1), 4));
    positions.setXYZ(index, x, height * (1 - share) - sag * 0.5, -share * 14 + sag * 0.6);
  }
  canvas.computeVertexNormals();
  const cloth = paint(canvas, (color, x, y, z) => color.copy(CANVAS).multiplyScalar(0.82 + 0.18 * Math.sin(x * 0.4 + z * 0.9) * Math.sin(x * 0.13)).lerp(linearColor(0.6, 0.52, 0.38), smoothstep(height * 0.3, 0, y) * 0.5));
  return mergeGeometries([...poles, ridge, cloth]);
}

function buildChest(width, depth, height) {
  const body = paint(new THREE.BoxGeometry(width, height, depth, 4, 3, 2).translate(0, height / 2, 0), (color, x, y) => color.copy(Math.abs(x) > width * 0.42 || Math.abs(y - height * 0.6) < height * 0.06 ? IRON : WOOD).multiplyScalar(0.85 + 0.15 * Math.sin(y * 2)));
  const lid = paint(new THREE.CylinderGeometry(depth / 2, depth / 2, width, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).rotateX(-0.9).translate(0, height + depth * 0.3, -depth * 0.55), (color, x) => color.copy(Math.abs(x) > width * 0.42 ? IRON : WOOD_DARK));
  const coins = [];
  const random = createRandom(77);
  for (let coin = 0; coin < 26; coin++) coins.push(solid(new THREE.CylinderGeometry(0.75, 0.75, 0.22, 12).rotateX(random() * 0.8).rotateZ(random() * 0.8).translate((random() - 0.5) * width * 0.75, height + 0.2 + random() * 0.9, (random() - 0.5) * depth * 0.6), GOLD));
  return mergeGeometries([body, lid, ...coins]);
}

function buildRope(radius) {
  const coils = [0, 1, 2].map((layer) => paint(new THREE.TorusGeometry(radius - layer * 0.9, 0.62, 8, 32).rotateX(Math.PI / 2).translate(0, 0.6 + layer * 1.05, 0), (color, x, y, z) => color.copy(ROPE).multiplyScalar(0.8 + 0.25 * Math.sin(Math.atan2(z, x) * 40))));
  return mergeGeometries(coils);
}

function buildCampfire(radius) {
  const random = createRandom(31);
  const parts = [solid(new THREE.CircleGeometry(radius * 0.92, 24).rotateX(-Math.PI / 2).translate(0, 0.12, 0), ASH)];
  for (let stone = 0; stone < 14; stone++) {
    const angle = (stone / 14) * Math.PI * 2;
    const size = 1.6 + random() * 0.8;
    parts.push(paint(new THREE.IcosahedronGeometry(size, 1).scale(1, 0.7, 1).translate(Math.cos(angle) * radius, size * 0.4, Math.sin(angle) * radius), (color, x, y) => color.copy(STONE).multiplyScalar(0.7 + 0.15 * y)));
  }
  for (let log = 0; log < 3; log++) {
    const angle = log * 1.05 + 0.3;
    parts.push(paint(new THREE.CylinderGeometry(0.85, 0.95, radius * 1.3, 16, 4).rotateZ(Math.PI / 2 - 0.08).rotateY(angle).translate(0, 1.0 + log * 0.7, 0), (color, x, y, z) => color.copy(WOOD_DARK).lerp(CHAR, smoothstep(radius * 0.35, 0, Math.hypot(x, z)))));
  }
  return mergeGeometries(parts);
}

function buildEmbers(radius) {
  const random = createRandom(57);
  const parts = [];
  for (let ember = 0; ember < 40; ember++) {
    const distance = Math.sqrt(random()) * radius * 0.6;
    const angle = random() * Math.PI * 2;
    parts.push(new THREE.IcosahedronGeometry(0.15 + random() * 0.22, 1).translate(Math.cos(angle) * distance, 0.4 + random() * 0.5, Math.sin(angle) * distance));
  }
  return mergeGeometries(parts.map((part) => part.deleteAttribute('uv')));
}

const BUILDERS = {
  campfire: (prop) => buildCampfire(prop.radius),
  barrel: (prop) => buildBarrel(prop.radius, prop.height),
  barrelLying: (prop) => buildBarrel(prop.radius, prop.length).translate(0, -prop.length / 2, 0).rotateX(Math.PI / 2).translate(0, prop.radius * 0.92, 0),
  crate: (prop) => buildCrate(prop.size),
  bottle: (prop) => buildBottle(prop.length, prop.radius).rotateY(Math.PI / 2),
  cutlass: (prop) => buildCutlass(prop.height),
  boot: (prop) => buildBoot(prop.length).rotateY(Math.PI / 2),
  hat: (prop) => buildHat(prop.radius),
  tent: (prop) => buildTent(prop.width, prop.height),
  chest: (prop) => buildChest(prop.width, prop.depth, prop.height),
  rope: (prop) => buildRope(prop.radius),
};

export function normalize(geometry) {
  const indexed = geometry.index ? geometry : mergeVertices(geometry, 1e-5);
  for (const name of Object.keys(indexed.attributes)) if (!['position', 'normal', 'color'].includes(name)) indexed.deleteAttribute(name);
  if (!indexed.attributes.normal) indexed.computeVertexNormals();
  return indexed;
}

export function createCampProps(scene, world, quality) {
  const pieces = world.campProps.map((prop) => {
    const geometry = normalize(BUILDERS[prop.kind](prop));
    const groundY = world.heightAt(prop.x, prop.z);
    return geometry.rotateY(prop.heading || 0).translate(prop.x, groundY - 0.15, prop.z);
  });
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, side: THREE.DoubleSide }), { cutaway: true, wetDarkening: 0.4, wetRoughness: 0.4, chromaticCaustics: quality.chromaticCaustics });
  const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const fire = world.campProps.find((prop) => prop.kind === 'campfire');
  const embers = new THREE.Mesh(buildEmbers(fire.radius).translate(fire.x, world.heightAt(fire.x, fire.z), fire.z), new THREE.MeshStandardMaterial({ color: 0x220800, emissive: new THREE.Color(1, 0.22, 0.02), emissiveIntensity: 1.8, roughness: 1 }));
  scene.add(mesh, embers);

  function update(time) {
    embers.material.emissiveIntensity = 1.6 + 0.6 * Math.sin(time * 7.3) * Math.sin(time * 3.1 + 1);
  }

  function setVisible(visible) {
    mesh.visible = visible;
    embers.visible = visible;
  }

  return { mesh, update, setVisible };
}
