import * as THREE from 'three';
import { tide } from './tide.js';

const CAPACITY = 900;
const FADE_START_SECONDS = 420;
const FADE_SECONDS = 180;
const WASH_MARGIN = 0.05;

function buildPrintTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 4, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(45, 30, 15, 0.95)');
  gradient.addColorStop(0.7, 'rgba(45, 30, 15, 0.7)');
  gradient.addColorStop(1, 'rgba(45, 30, 15, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(32, 32, 18, 30, 0, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createTracks(scene, ground) {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ map: buildPrintTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const prints = new THREE.InstancedMesh(geometry, material, CAPACITY);
  prints.frustumCulled = false;
  prints.renderOrder = 1;
  scene.add(prints);

  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < CAPACITY; i++) prints.setMatrixAt(i, hidden);
  const records = Array.from({ length: CAPACITY }, () => ({ alive: false, x: 0, z: 0, height: 0, heading: 0, width: 0, length: 0, age: 0 }));
  let next = 0;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let checkTimer = 0;

  function place(index, scaleFactor) {
    const record = records[index];
    rotation.setFromAxisAngle(up, record.heading);
    matrix.compose(position.set(record.x, record.height + 0.03, record.z), rotation, scale.set(record.width * scaleFactor, 1, record.length * scaleFactor));
    prints.setMatrixAt(index, matrix);
  }

  function add(x, z, heading, kind) {
    if (kind === 'boar') {
      const jitter = (Math.random() - 0.5) * 0.5;
      for (const side of [-1, 1]) addSingle(x + Math.cos(heading) * 0.07 * side, z - Math.sin(heading) * 0.07 * side, heading + jitter + side * 0.12, 0.13, 0.32, kind);
      return;
    }
    addSingle(x, z, heading, 0.32, 0.55, kind);
  }

  function addSingle(x, z, heading, width, length, kind) {
    const height = ground.heightAt(x, z);
    if (height < tide.level + WASH_MARGIN || height > 8) return;
    const record = records[next];
    Object.assign(record, { alive: true, x, z, height, heading, age: 0, width, length, kind });
    place(next, 1);
    prints.instanceMatrix.needsUpdate = true;
    next = (next + 1) % CAPACITY;
  }

  function update(deltaTime) {
    checkTimer -= deltaTime;
    if (checkTimer > 0) return;
    const elapsed = 0.5 - checkTimer;
    checkTimer = 0.5;
    let changed = false;
    for (let i = 0; i < CAPACITY; i++) {
      const record = records[i];
      if (!record.alive) continue;
      record.age += elapsed;
      const washed = record.height < tide.level + WASH_MARGIN;
      const fade = 1 - Math.max(0, record.age - FADE_START_SECONDS) / FADE_SECONDS;
      if (washed || fade <= 0) {
        record.alive = false;
        prints.setMatrixAt(i, hidden);
        changed = true;
      } else if (fade < 1) {
        place(i, 0.4 + 0.6 * fade);
        changed = true;
      }
    }
    if (changed) prints.instanceMatrix.needsUpdate = true;
  }

  function aliveCount() {
    return records.filter((record) => record.alive).length;
  }

  function aliveBelow(height) {
    return records.filter((record) => record.alive && record.height < height).length;
  }

  function positionsWithin(x, z, radius, kind) {
    return records.filter((record) => record.alive && record.kind === kind && Math.hypot(record.x - x, record.z - z) < radius).map((record) => ({ x: record.x, z: record.z }));
  }

  function eraseWithin(x, z, radius) {
    let erased = 0;
    for (let i = 0; i < CAPACITY; i++) {
      const record = records[i];
      if (record.alive && Math.abs(record.x - x) < radius && Math.abs(record.z - z) < radius) {
        record.alive = false;
        prints.setMatrixAt(i, hidden);
        erased++;
      }
    }
    if (erased) prints.instanceMatrix.needsUpdate = true;
    return erased;
  }

  return { add, update, aliveCount, aliveBelow, positionsWithin, eraseWithin };
}
