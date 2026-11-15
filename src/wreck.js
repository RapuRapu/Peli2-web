import * as THREE from 'three';
import { buildHullGeometry } from './ship.js';
import { createRandom } from './noise.js';

export function createWreck(scene, ground, { x, z, heading }) {
  const group = new THREE.Group();
  const weatheredWood = new THREE.MeshStandardMaterial({ color: 0x7a6a58, roughness: 0.95, flatShading: true });

  const hull = new THREE.Mesh(buildHullGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x9a9088, roughness: 0.95, side: THREE.DoubleSide, flatShading: true }));
  hull.scale.setScalar(1.15);
  hull.rotation.set(0.12, 0, 0.62);
  hull.position.set(0, -0.9, 0);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const ribMaterial = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.2 - (i % 2) * 0.9, 0.3), ribMaterial);
    rib.position.set(-1.2 + (i % 2) * 0.3, 1.2, -6 + i * 2.3);
    rib.rotation.z = 0.35;
    rib.castShadow = true;
    group.add(rib);
  }
  const mastStump = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 3.4, 7), weatheredWood);
  mastStump.position.set(-0.4, 1.0, 2.6);
  mastStump.rotation.z = 0.75;
  mastStump.castShadow = true;
  group.add(mastStump);

  const brokenMast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 11, 7), weatheredWood);
  brokenMast.rotation.set(Math.PI / 2, 0.5, 0);
  brokenMast.position.set(5.5, 0.25, 3.5);
  brokenMast.castShadow = true;
  group.add(brokenMast);

  const random = createRandom(77);
  const plankGeometry = new THREE.BoxGeometry(0.45, 0.1, 3.2);
  for (let i = 0; i < 9; i++) {
    const plank = new THREE.Mesh(plankGeometry, weatheredWood);
    const angle = random() * Math.PI * 2;
    const distance = 5 + random() * 9;
    plank.position.set(Math.cos(angle) * distance, 0.08, Math.sin(angle) * distance);
    plank.rotation.set((random() - 0.5) * 0.2, random() * Math.PI, (random() - 0.5) * 0.2);
    plank.castShadow = true;
    group.add(plank);
  }

  group.position.set(x, ground.heightAt(x, z), z);
  group.rotation.y = heading;
  group.updateMatrixWorld(true);
  scene.add(group);

  const obstacles = [{ x, z, radius: 5 }, ...[-8, -4, 4, 8].map((alongHull) => ({ x: x + Math.sin(heading) * alongHull, z: z + Math.cos(heading) * alongHull, radius: 3 }))];
  return { group, obstacles };
}
