import * as THREE from 'three';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const bounds = new THREE.Box3();
const hitPoint = new THREE.Vector3();

export function pickTarget(clientX, clientY, camera, candidates) {
  pointer.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  camera.updateMatrixWorld();
  raycaster.setFromCamera(pointer, camera);
  let best = null;
  for (const { object, value } of candidates) {
    if (!object || !object.visible) continue;
    object.updateWorldMatrix(true, true);
    bounds.setFromObject(object);
    if (!raycaster.ray.intersectBox(bounds, hitPoint)) continue;
    const distance = hitPoint.distanceTo(raycaster.ray.origin);
    if (!best || distance < best.distance) best = { value, distance };
  }
  return best ? best.value : null;
}
