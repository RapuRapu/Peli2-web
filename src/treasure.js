import * as THREE from 'three';
import { tide } from './tide.js';

const PATCH_FADE_SECONDS = 600;
const WASH_MARGIN = 0.1;
const DIG_REACH = 2.4;

function buildChestMesh() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.8, flatShading: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.5, metalness: 0.6 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), wood);
  box.position.y = 0.3;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), wood);
  lid.position.y = 0.6;
  for (const x of [-0.4, 0.4]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.66, 0.84), iron);
    band.position.set(x, 0.33, 0);
    group.add(band);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.06), new THREE.MeshStandardMaterial({ color: 0xd8a830, metalness: 0.8, roughness: 0.3 }));
  lock.position.set(0, 0.5, 0.42);
  group.add(box, lid, lock);
  group.traverse((child) => { child.castShadow = true; });
  return group;
}

function buildMoundMesh() {
  const group = new THREE.Group();
  const soil = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1, flatShading: true });
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1.1, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), soil);
  mound.scale.set(1, 0.22, 1);
  group.add(mound);
  for (let i = 0; i < 5; i++) {
    const clod = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), soil);
    const angle = (i / 5) * Math.PI * 2 + 0.4;
    clod.position.set(Math.cos(angle) * 1.4, 0.05, Math.sin(angle) * 1.4);
    group.add(clod);
  }
  group.traverse((child) => { child.receiveShadow = true; });
  return group;
}

function buildOpenHoleMesh() {
  const group = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.9, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2e1f10 }));
  hole.position.y = 0.05;
  const spoil = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a7a4e, roughness: 1, flatShading: true }));
  spoil.scale.set(1, 0.45, 0.8);
  spoil.position.set(1.5, 0, 0.3);
  group.add(hole, spoil);
  return group;
}

function buildOwnerMarker() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d');
  context.font = '64px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.globalAlpha = 0.85;
  context.fillText('📍', 48, 52);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.renderOrder = 5;
  sprite.scale.set(2.3, 2.3, 1);
  return sprite;
}

export function createTreasure(scene, ground, savedCaches) {
  const caches = [];
  const openHole = buildOpenHoleMesh();
  openHole.visible = false;
  scene.add(openHole);

  function addCache({ id, x, z, contents, buriedAt, patchVisible = true, underground = false, found = false, floorY = null }) {
    const height = underground && floorY !== null ? floorY : ground.heightAt(x, z);
    const mound = buildMoundMesh();
    mound.position.set(x, height, z);
    mound.rotation.y = (x * 7.1 + z * 3.3) % (Math.PI * 2);
    const marker = buildOwnerMarker();
    marker.position.set(x, height + 2.4, z);
    const cache = { id, x, z, height, contents, buriedAt, patchVisible, underground, found, floorY, mound, marker };
    mound.visible = patchVisible;
    marker.visible = !found && contents !== 'empty';
    scene.add(mound, marker);
    caches.push(cache);
    return cache;
  }

  for (const saved of savedCaches) addCache(saved);

  function setDigPreview(x, z, visible) {
    openHole.visible = visible;
    if (visible) openHole.position.set(x, ground.heightAt(x, z), z);
  }

  function removeCache(cache) {
    scene.remove(cache.mound, cache.marker);
    caches.splice(caches.indexOf(cache), 1);
  }

  function cacheNear(x, z, radius = DIG_REACH) {
    let best = null;
    let bestDistance = radius;
    for (const cache of caches) {
      if (cache.underground) continue;
      const distance = Math.hypot(cache.x - x, cache.z - z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = cache;
      }
    }
    return best;
  }

  const rayPoint = new THREE.Vector3();
  function cacheUnderRay(ray, underground = false) {
    let best = null;
    let bestDistance = 2.4;
    for (const cache of caches) {
      if (cache.underground !== underground) continue;
      rayPoint.set(cache.x, cache.height + 0.3, cache.z);
      const distance = ray.distanceToPoint(rayPoint);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = cache;
      }
    }
    return best;
  }

  let checkTimer = 0;
  function update(deltaTime, worldTime, playerX, playerZ) {
    for (const cache of caches) {
      if (!cache.marker.visible) continue;
      const near = playerX !== null && Math.hypot(playerX - cache.x, playerZ - cache.z) < 45;
      cache.marker.material.opacity = near ? 0.95 : 0;
      cache.marker.position.y = cache.height + 2.6 + Math.sin(worldTime * 3 + cache.x) * 0.15;
    }
    checkTimer -= deltaTime;
    if (checkTimer > 0) return;
    checkTimer = 0.5;
    for (const cache of caches) {
      if (!cache.patchVisible || cache.underground) continue;
      const washed = cache.height < tide.level + WASH_MARGIN;
      const faded = worldTime - cache.buriedAt > PATCH_FADE_SECONDS;
      if (washed || faded) {
        cache.patchVisible = false;
        cache.mound.visible = false;
      }
    }
  }

  function coverPatch(cache) {
    cache.patchVisible = false;
    cache.mound.visible = false;
  }

  function serialize() {
    return caches.map(({ id, x, z, contents, buriedAt, patchVisible, underground, found, floorY }) => ({ id, x, z, contents, buriedAt, patchVisible, underground, found, floorY }));
  }

  return { caches, addCache, removeCache, cacheNear, cacheUnderRay, coverPatch, setDigPreview, update, serialize, buildChestMesh };
}
