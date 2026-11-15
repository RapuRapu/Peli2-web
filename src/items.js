import * as THREE from 'three';
import { createRandom } from './noise.js';

export const ITEM_CATEGORIES = [
  { id: 'valuable', name: 'Valuables' },
  { id: 'resource', name: 'Raw materials' },
  { id: 'food', name: 'Food' },
  { id: 'crafted', name: 'Crafted' },
  { id: 'tool', name: 'Tools' },
];

export const ITEM_TYPES = {
  wood: { name: 'Wood', icon: '🪵', category: 'resource' },
  fronds: { name: 'Palm fronds', icon: '🌴', category: 'resource' },
  fiber: { name: 'Palm fiber', icon: '🌿', category: 'resource' },
  stick: { name: 'Stick', icon: '🥢', category: 'resource' },
  stone: { name: 'Stone', icon: '🪨', category: 'resource' },
  hide: { name: 'Boar hide', icon: '🐗', category: 'resource' },
  meat: { name: 'Raw meat', icon: '🍖', category: 'food', food: 30 },
  coconut: { name: 'Coconut', icon: '🥥', category: 'food', food: 15 },
  rope: { name: 'Rope', icon: '🪢', category: 'crafted' },
  raftFrame: { name: 'Raft frame', icon: '🛶', category: 'crafted' },
  hideSail: { name: 'Hide sail', icon: '⛵', category: 'crafted' },
  paddle: { name: 'Paddle', icon: '🏏', category: 'crafted' },
  axe: { name: 'Stone axe', icon: '🪓', category: 'tool' },
  diggingStick: { name: 'Digging stick', icon: '🪏', category: 'tool' },
  pouch: { name: 'Coin pouch', icon: '💰', gold: 25 },
  treasureChest: { name: 'Treasure chest', icon: '👑', category: 'valuable' },
  decoyChest: { name: 'Decoy chest', icon: '📦', category: 'valuable' },
  pickaxe: { name: 'Pickaxe', icon: '⛏️', category: 'tool' },
};

const PICKUP_RADIUS = 2.0;
const PICKUP_ANIMATION_SECONDS = 0.45;
const ITEM_SCALE = 1.5;

function buildItemMesh(type) {
  const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  const group = new THREE.Group();
  if (type === 'barrel') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.95, 10), material(0x7a5232));
    barrel.position.y = 0.47;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.035, 4, 14).rotateX(Math.PI / 2), material(0x2a2622));
    hoop.position.y = 0.75;
    group.add(barrel, hoop, hoop.clone().translateY(-0.55));
  } else if (type === 'stone') {
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), material(0x8a8680));
    stone.scale.set(1, 0.65, 0.85);
    stone.position.y = 0.16;
    const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), material(0x9a958c));
    pebble.position.set(0.32, 0.09, 0.1);
    group.add(stone, pebble);
  } else if (type === 'stick') {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.3, 5).rotateZ(Math.PI / 2), material(0x7a5430));
    stick.position.y = 0.06;
    const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.4, 4).rotateZ(Math.PI / 2 - 0.6), material(0x7a5430));
    twig.position.set(0.25, 0.14, 0);
    group.add(stick, twig);
  } else if (type === 'crate') {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.65, 0.8), material(0x9a7448));
    crate.position.y = 0.32;
    crate.rotation.y = 0.4;
    group.add(crate);
  } else if (type === 'rope') {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.11, 6, 16).rotateX(Math.PI / 2), material(0xc8a46a));
    coil.position.y = 0.12;
    const upperCoil = coil.clone();
    upperCoil.position.y = 0.3;
    upperCoil.scale.setScalar(0.8);
    group.add(coil, upperCoil);
  } else if (type === 'plank') {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 1.6), material(0xb8783a));
    plank.position.y = 0.06;
    plank.rotation.set(0, 0.9, 0);
    group.add(plank);
  } else if (type === 'axe') {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 6).rotateZ(Math.PI / 2), material(0x8a5a2c));
    handle.position.y = 0.06;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.34), material(0x9a9ca0));
    blade.position.set(0.5, 0.06, 0.12);
    group.add(handle, blade);
  } else if (type === 'sailcloth') {
    const folded = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.22, 0.7), material(0xece2c8));
    folded.position.y = 0.11;
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8).rotateZ(Math.PI / 2), material(0xddd0b0));
    roll.position.set(0, 0.34, 0.1);
    group.add(folded, roll);
  } else {
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), material(0xb08a5a));
    sack.scale.set(1, 0.8, 1);
    sack.position.y = 0.24;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 0.18, 7), material(0xb08a5a));
    neck.position.y = 0.52;
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 4, 10).rotateX(Math.PI / 2), material(0x8a1a12));
    tie.position.y = 0.46;
    group.add(sack, neck, tie);
    const goldMaterial = new THREE.MeshStandardMaterial({ color: 0xf0c040, roughness: 0.3, metalness: 0.8, emissive: 0x4a3000 });
    for (const [x, z] of [[0.36, 0.1], [0.46, -0.12], [0.3, -0.3]]) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.035, 10), goldMaterial);
      coin.position.set(x, 0.03, z);
      group.add(coin);
    }
  }
  group.traverse((child) => { child.castShadow = true; });
  return group;
}

function buildHighlightRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.15, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
  );
  ring.position.y = 0.22;
  ring.renderOrder = 3;
  return ring;
}

export function createItems(scene, ground, walkGrid, zones, collectedIds, canopies, isReachable) {
  const isUnderCanopy = (x, z) => canopies.some((canopy) => Math.hypot(canopy.x - x, canopy.z - z) < canopy.canopyRadius);
  const random = createRandom(31);
  const items = [];
  const placedSoFar = [];
  for (const zone of zones) {
    zone.types.forEach((type, indexInZone) => {
      let placed = null;
      for (let attempt = 0; attempt < 400 && !placed; attempt++) {
        const angle = random() * Math.PI * 2;
        const distance = zone.minRadius + random() * (zone.maxRadius - zone.minRadius);
        const x = zone.x + Math.cos(angle) * distance;
        const z = zone.z + Math.sin(angle) * distance;
        const height = ground.heightAt(x, z);
        const tooCloseToAnother = placedSoFar.some((other) => Math.hypot(other.x - x, other.z - z) < 5);
        if (height > zone.minHeight && height < zone.maxHeight && walkGrid.isPointWalkable(x, z) && !isUnderCanopy(x, z) && !tooCloseToAnother && isReachable(x, z)) placed = { x, z };
      }
      if (!placed) return;
      placedSoFar.push(placed);
      const id = `${zone.id}-${indexInZone}`;
      const root = new THREE.Group();
      root.add(buildItemMesh(type), buildHighlightRing());
      root.scale.setScalar(ITEM_SCALE);
      root.position.set(placed.x, ground.heightAt(placed.x, placed.z), placed.z);
      root.rotation.y = random() * Math.PI * 2;
      const collected = collectedIds.has(id);
      root.visible = !collected;
      scene.add(root);
      items.push({ id, type, zone: zone.id, x: placed.x, z: placed.z, root, collected, pickupTime: -1 });
    });
  }

  const ray = new THREE.Ray();
  const itemCenter = new THREE.Vector3();

  function itemUnderRay(cameraRay) {
    ray.copy(cameraRay);
    let best = null;
    let bestDistance = 2.2;
    for (const item of items) {
      if (item.collected || item.carried) continue;
      itemCenter.set(item.x, item.root.position.y + 0.6, item.z);
      const distance = ray.distanceToPoint(itemCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = item;
      }
    }
    return best;
  }

  function update(deltaTime, time, characterX, characterZ, onCollect, isNeeded) {
    for (const item of items) {
      if (item.collected) {
        if (item.pickupTime >= 0) {
          item.pickupTime += deltaTime;
          const progress = Math.min(1, item.pickupTime / PICKUP_ANIMATION_SECONDS);
          item.root.scale.setScalar(ITEM_SCALE * (1 - progress));
          item.root.position.y = ground.heightAt(item.x, item.z) + progress * 2;
          if (progress >= 1) {
            item.root.visible = false;
            item.pickupTime = -1;
          }
        }
        continue;
      }
      if (item.carried) continue;
      const ring = item.root.children[1];
      ring.material.color.setHex(isNeeded(item.type) ? 0xffa020 : 0xf4ecd8);
      ring.material.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(time * 3 + item.x));
      if (characterX !== null && Math.hypot(characterX - item.x, characterZ - item.z) < PICKUP_RADIUS) {
        item.collected = true;
        item.pickupTime = 0;
        onCollect(item);
      }
    }
  }

  return { items, itemUnderRay, update };
}
