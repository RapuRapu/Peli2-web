import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRandom } from '../noise.js';
import { applySeaside } from './seaside.js';
import { HOLD, holdWallDiscs } from './world.js';
import { paint, solid, buildBarrel, buildCrate, normalize } from './camp.js';

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const HULL_WOOD = linearColor(0.36, 0.25, 0.15);
const HULL_DARK = linearColor(0.16, 0.11, 0.07);
const FLOOR_WOOD = linearColor(0.46, 0.33, 0.2);
const FLOOR_WOOD_LIGHT = linearColor(0.6, 0.46, 0.3);
const BURLAP = linearColor(0.66, 0.54, 0.36);
const BRICK = linearColor(0.6, 0.28, 0.18);
const IRON = linearColor(0.12, 0.12, 0.13);
const STEW = linearColor(0.5, 0.26, 0.1);
const BONE = linearColor(0.92, 0.9, 0.82);
const ONION = linearColor(0.52, 0.2, 0.32);
const BRASS = linearColor(0.82, 0.6, 0.24);
const STEEL = linearColor(0.75, 0.77, 0.8);
const FLOOR_LIFT = 0.25;
const RIB_WOOD = linearColor(0.56, 0.44, 0.3);

const wallHeightAt = (angle) => 3 + 8 * Math.pow(Math.max(0, Math.sin(angle)), 0.7) + 2.5 * Math.abs(Math.sin(angle * 9.3)) * (Math.sin(angle) < 0.2 ? 1 : 0.15);

function buildHull(heightAt) {
  const discs = holdWallDiscs();
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  const pushQuad = (a, b, c, d, shadeA, shadeB) => {
    for (const [point, shade] of [[a, shadeA], [b, shadeA], [c, shadeB], [b, shadeA], [d, shadeB], [c, shadeB]]) {
      positions.push(point.x, point.y, point.z);
      color.copy(HULL_WOOD).lerp(HULL_DARK, shade);
      colors.push(color.r, color.g, color.b);
    }
  };
  const rows = 9;
  for (let index = 0; index < discs.length - 1; index++) {
    const from = discs[index];
    const to = discs[index + 1];
    if (Math.abs(to.angle - from.angle) > 0.2) continue;
    for (const side of [0, 1]) {
      const flare = side ? 1.4 : 0;
      for (let row = 0; row < rows; row++) {
        const point = (disc, share) => {
          const height = wallHeightAt(disc.angle) * share;
          const outward = flare + share * share * 2.2;
          return new THREE.Vector3(disc.x + Math.cos(disc.angle) * outward, heightAt(disc.x, disc.z) - 0.4 + height, disc.z + Math.sin(disc.angle) * outward);
        };
        const lower = row / rows;
        const upper = (row + 1) / rows;
        const seam = (share) => (row % 2 ? 0.05 : 0.3) + 0.12 * Math.sin(from.angle * 23 + row * 1.7) + (share === lower ? 0.35 : 0);
        if (side) pushQuad(point(from, lower), point(to, lower), point(from, upper), point(to, upper), seam(lower), seam(upper));
        else pushQuad(point(to, lower), point(from, lower), point(to, upper), point(from, upper), seam(lower) * 0.8 + 0.1, seam(upper) * 0.8 + 0.1);
      }
    }
  }
  const wall = new THREE.BufferGeometry();
  wall.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  wall.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  wall.computeVertexNormals();
  const parts = [normalize(wall)];
  for (let index = 0; index < discs.length; index += 5) {
    const disc = discs[index];
    const height = wallHeightAt(disc.angle) + 4 + 3 * Math.abs(Math.sin(index * 1.7));
    const points = [0, 0.35, 0.7, 1].map((share) => { const outward = 0.7 + share * 2.6 - share * share * share * 4.2; return new THREE.Vector3(disc.x + Math.cos(disc.angle) * outward, heightAt(disc.x, disc.z) - 0.4 + height * share, disc.z + Math.sin(disc.angle) * outward); });
    const rib = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 8, 0.55, 6, false);
    parts.push(normalize(solid(rib, RIB_WOOD)));
  }
  const bowX = HOLD.x + HOLD.halfLength + 1.5;
  const stem = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(bowX, heightAt(bowX, HOLD.z) - 0.5, HOLD.z), new THREE.Vector3(bowX + 2.5, heightAt(bowX, HOLD.z) + 10, HOLD.z), new THREE.Vector3(bowX + 6, heightAt(bowX, HOLD.z) + 19, HOLD.z)]), 10, 1.2, 8, false);
  parts.push(normalize(solid(stem, HULL_DARK)));
  return mergeGeometries(parts);
}

const BOARD_WIDTH = 1.8;
const BOARD_GAP = 0.14;
const BOARD_LENGTH = 5.2;

function buildFloorBase(heightAt) {
  const ringGeometry = new THREE.RingGeometry(0.0001, 1, 64, 14).rotateX(-Math.PI / 2);
  const positions = ringGeometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = HOLD.x + positions.getX(index) * (HOLD.halfLength - 0.8);
    const z = HOLD.z + positions.getZ(index) * (HOLD.halfWidth - 0.8);
    positions.setXYZ(index, x, heightAt(x, z) + FLOOR_LIFT - 0.06, z);
  }
  ringGeometry.computeVertexNormals();
  return paint(ringGeometry, (color) => color.copy(HULL_DARK).multiplyScalar(0.6));
}

function buildFloorBoard(heightAt, startX, endX, centerZ, tone) {
  const length = endX - startX - BOARD_GAP;
  const board = new THREE.PlaneGeometry(length, BOARD_WIDTH - BOARD_GAP, Math.max(2, Math.ceil(length / 1.5)), 1).rotateX(-Math.PI / 2).translate(startX + length / 2, 0, centerZ);
  const positions = board.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, heightAt(x, z) + FLOOR_LIFT);
  }
  board.computeVertexNormals();
  return paint(board, (color, x) => color.copy(tone).multiplyScalar(0.92 + 0.08 * Math.sin(x * 1.7 + centerZ)));
}

function buildFloor(heightAt) {
  const pieces = [buildFloorBase(heightAt)];
  const insideHalfLength = HOLD.halfLength - 0.8;
  const insideHalfWidth = HOLD.halfWidth - 0.8;
  const rowCount = Math.floor((insideHalfWidth * 2) / BOARD_WIDTH);
  for (let row = 0; row < rowCount; row++) {
    const nearZ = -insideHalfWidth + row * BOARD_WIDTH;
    const edgeShare = Math.max(Math.abs(nearZ), Math.abs(nearZ + BOARD_WIDTH)) / insideHalfWidth;
    if (edgeShare >= 1) continue;
    const rowHalfLength = insideHalfLength * Math.sqrt(1 - edgeShare * edgeShare);
    if (rowHalfLength < 1.5) continue;
    const centerZ = HOLD.z + nearZ + BOARD_WIDTH / 2;
    const rowStart = HOLD.x - rowHalfLength;
    const rowEnd = HOLD.x + rowHalfLength;
    let boardStart = rowStart;
    let boardIndex = 0;
    let boardEnd = rowStart + ((row * 2.3) % BOARD_LENGTH) + 1.2;
    while (boardStart < rowEnd - 0.5) {
      const end = Math.min(boardEnd, rowEnd);
      const variation = 0.5 + 0.5 * Math.sin(row * 4.1 + boardIndex * 2.7);
      const tone = new THREE.Color().copy(FLOOR_WOOD).lerp(FLOOR_WOOD_LIGHT, variation);
      pieces.push(buildFloorBoard(heightAt, boardStart, end, centerZ, tone));
      boardStart = end;
      boardEnd = boardStart + BOARD_LENGTH;
      boardIndex++;
    }
  }
  return mergeGeometries(pieces.map((geometry) => geometry.toNonIndexed()));
}

function buildSack(radius) {
  const sack = new THREE.SphereGeometry(1, 18, 12).scale(radius, radius * 0.85, radius * 1.15).translate(0, radius * 0.7, 0);
  const positions = sack.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const lump = 1 + 0.08 * Math.sin(positions.getX(index) * 3.1) * Math.sin(positions.getZ(index) * 2.7);
    positions.setXYZ(index, positions.getX(index) * lump, Math.max(0.05, positions.getY(index)), positions.getZ(index) * lump);
  }
  sack.computeVertexNormals();
  const tie = new THREE.CylinderGeometry(radius * 0.25, radius * 0.4, radius * 0.5, 10).translate(0, radius * 1.5, 0);
  return mergeGeometries([paint(sack, (color, x, y) => color.copy(BURLAP).multiplyScalar(0.8 + 0.25 * Math.sin(x * 9) * Math.sin(y * 9))), normalize(solid(tie, BURLAP.clone().multiplyScalar(0.7)))]);
}

function buildLanternPost(height) {
  const post = solid(new THREE.CylinderGeometry(0.6, 0.7, height, 8).translate(0, height / 2, 0), HULL_DARK);
  const arm = solid(new THREE.BoxGeometry(4, 0.6, 0.6).translate(1.8, height - 0.3, 0), HULL_DARK);
  const frame = solid(new THREE.BoxGeometry(1.8, 2.4, 1.8, 1, 1, 1).translate(3.4, height - 2.2, 0), BRASS);
  return mergeGeometries([post, arm, frame].map(normalize));
}

function buildHearth(radius) {
  const random = createRandom(91);
  const parts = [];
  for (let brick = 0; brick < 20; brick++) {
    const angle = (brick / 20) * Math.PI * 2;
    for (let layer = 0; layer < 3; layer++) parts.push(paint(new THREE.BoxGeometry(2.2, 1.1, 1.3).rotateY(-angle).translate(Math.cos(angle) * radius, 0.55 + layer * 1.1, Math.sin(angle) * radius), (color) => color.copy(BRICK).multiplyScalar(0.75 + random() * 0.4)));
  }
  const pot = new THREE.SphereGeometry(radius * 0.85, 22, 14, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65).translate(0, radius * 1.1, 0);
  parts.push(solid(pot, IRON));
  parts.push(solid(new THREE.TorusGeometry(radius * 0.8, 0.28, 8, 24).rotateX(Math.PI / 2).translate(0, radius * 1.1 + radius * 0.85 * Math.cos(Math.PI * 0.35), 0), IRON));
  parts.push(solid(new THREE.CircleGeometry(radius * 0.76, 22).rotateX(-Math.PI / 2).translate(0, radius * 1.1 + radius * 0.85 * Math.cos(Math.PI * 0.35) - 0.3, 0), STEW));
  return mergeGeometries(parts.map(normalize));
}

function buildChoppingBlock(radius) {
  const block = paint(new THREE.CylinderGeometry(radius, radius * 1.05, 3.2, 20).translate(0, 1.6, 0), (color, x, y, z) => color.copy(FLOOR_WOOD).multiplyScalar(y > 3.1 ? 0.8 + 0.25 * Math.sin(Math.hypot(x, z) * 6) : 0.75));
  return mergeGeometries([block].map(normalize));
}

function buildFishBones(length) {
  const parts = [solid(new THREE.CylinderGeometry(0.18, 0.12, length, 6).rotateZ(Math.PI / 2).translate(0, 0.25, 0), BONE)];
  for (let rib = 0; rib < 9; rib++) {
    const x = -length * 0.35 + rib * length * 0.075;
    for (const side of [-1, 1]) parts.push(solid(new THREE.CylinderGeometry(0.07, 0.05, 1.6 - Math.abs(rib - 4) * 0.12, 4).rotateX(side * 1.2).translate(x, 0.3, side * 0.7), BONE));
  }
  parts.push(solid(new THREE.ConeGeometry(0.9, 2.2, 8).rotateZ(Math.PI / 2).translate(length * 0.55, 0.5, 0), BONE));
  parts.push(solid(new THREE.ConeGeometry(0.9, 1.4, 3).rotateZ(-Math.PI / 2).scale(1, 1, 0.3).translate(-length * 0.55, 0.4, 0), BONE));
  return mergeGeometries(parts.map(normalize));
}

function buildOnions(radius) {
  const parts = [];
  for (const [x, z, size] of [[0, 0, 1], [radius * 0.9, 0.6, 0.85], [-0.5, radius * 0.85, 0.75]]) {
    parts.push(paint(new THREE.SphereGeometry(radius * 0.55 * size, 14, 10).scale(1, 0.9, 1).translate(x, radius * 0.5 * size, z), (color, px, py) => color.copy(ONION).multiplyScalar(0.75 + 0.35 * Math.abs(Math.sin(Math.atan2(px - x, 1) * 6)))));
    parts.push(solid(new THREE.ConeGeometry(0.2 * size, 0.9 * size, 6).translate(x, radius * size, z), linearColor(0.6, 0.5, 0.3)));
  }
  return mergeGeometries(parts.map(normalize));
}

const BUILDERS = {
  crate: (prop) => buildCrate(prop.size),
  sack: (prop) => buildSack(prop.radius),
  barrel: (prop) => buildBarrel(prop.radius, prop.height),
  lantern: (prop) => buildLanternPost(prop.height),
  hearth: (prop) => buildHearth(prop.radius),
  choppingBlock: (prop) => buildChoppingBlock(prop.radius),
  fishBones: (prop) => buildFishBones(prop.length),
  onions: (prop) => buildOnions(prop.radius),
};

function buildGlow(world) {
  const parts = [];
  const lantern = world.holdProps.find((prop) => prop.kind === 'lantern');
  parts.push(new THREE.BoxGeometry(1.3, 1.9, 1.3).translate(lantern.x + 3.4, world.heightAt(lantern.x, lantern.z) + lantern.height - 2.2, lantern.z));
  const hearth = world.holdProps.find((prop) => prop.kind === 'hearth');
  const random = createRandom(13);
  for (let flame = 0; flame < 14; flame++) {
    const angle = random() * Math.PI * 2;
    const distance = random() * hearth.radius * 0.6;
    parts.push(new THREE.ConeGeometry(0.5 + random() * 0.4, 1.4 + random() * 1.4, 6).translate(hearth.x + Math.cos(angle) * distance, world.heightAt(hearth.x, hearth.z) + 1.2, hearth.z + Math.sin(angle) * distance));
  }
  return mergeGeometries(parts.map((part) => { part.deleteAttribute('uv'); return part.index ? part.toNonIndexed() : part; }));
}

export function createHoldProps(scene, world, quality) {
  const pieces = [normalize(buildHull(world.heightAt)), normalize(buildFloor(world.heightAt))];
  for (const prop of world.holdProps) {
    const geometry = normalize(BUILDERS[prop.kind](prop));
    pieces.push(geometry.rotateY(prop.heading || 0).translate(prop.x, world.heightAt(prop.x, prop.z) + FLOOR_LIFT - 0.1, prop.z));
  }
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), { cutaway: true, wetDarkening: 0.4, wetRoughness: 0.4, chromaticCaustics: quality.chromaticCaustics });
  const mesh = new THREE.Mesh(mergeGeometries(pieces), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const glow = new THREE.Mesh(buildGlow(world), new THREE.MeshStandardMaterial({ color: 0x331100, emissive: new THREE.Color(1, 0.5, 0.12), emissiveIntensity: 2, roughness: 1 }));
  scene.add(mesh, glow);

  function update(time) {
    glow.material.emissiveIntensity = 1.8 + 0.5 * Math.sin(time * 6.1) * Math.sin(time * 2.3 + 0.5);
  }

  function setVisible(visible) {
    mesh.visible = visible;
    glow.visible = visible;
  }

  return { mesh, update, setVisible };
}

