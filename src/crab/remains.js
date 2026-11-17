import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySeaside } from './seaside.js';
import { buildShellGeometry } from './hermit.js';
import { SHELLS } from './gear.js';
import { element } from './workbench.js';
import { WORLD_LABEL_TOP_PIXELS } from './enemies.js';

export const REMAINS_REACH = 2.2;
const PICK_RADIUS_PIXELS = 64;
const ARROW_MARGIN_PIXELS = 52;

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);

function buildBundleGeometry() {
  const kelp = linearColor(0.2, 0.3, 0.12);
  const twine = linearColor(0.55, 0.42, 0.26);
  const parts = [
    new THREE.SphereGeometry(0.62, 14, 10).scale(1, 0.62, 0.85).translate(0, 0.32, 0),
    new THREE.SphereGeometry(0.34, 10, 8).translate(0.18, 0.72, -0.05),
    new THREE.TorusGeometry(0.5, 0.06, 5, 18).rotateX(Math.PI / 2).translate(0, 0.42, 0),
  ];
  return mergeGeometries(parts.map((geometry, index) => {
    const color = index === 2 ? twine : kelp;
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let vertex = 0; vertex < geometry.attributes.position.count; vertex++) colors.set([color.r, color.g, color.b], vertex * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.deleteAttribute('uv');
    return geometry;
  }));
}

export function createRemains(scene, world, quality, labelParent, saved) {
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, side: THREE.DoubleSide }), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.5, wetRoughness: 0.1 });
  const ringMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.4, 4.6), transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, fog: false });
  const ringGeometry = new THREE.RingGeometry(1.75, 2.35, 56).rotateX(-Math.PI / 2);
  const bundleGeometry = buildBundleGeometry();
  const arrow = element('div', 'remains-arrow hidden', labelParent);
  element('span', 'remains-arrow-icon', arrow, '💀');
  const arrowPointer = element('span', 'remains-arrow-pointer', arrow, '➤');
  const list = [];
  const projected = new THREE.Vector3();
  let nextId = 1;

  function shellKindOf(record) {
    const worn = record.gear.shells.find((item) => item.id === record.gear.wornShellId);
    return (worn || record.gear.shells[0] || {}).kind || null;
  }

  function build(record) {
    const kind = shellKindOf(record);
    const group = new THREE.Group();
    const y = world.heightAt(record.x, record.z);
    let mesh;
    if (kind) {
      const built = buildShellGeometry(SHELLS[kind].look);
      mesh = new THREE.Mesh(built.geometry, material);
      mesh.rotation.set(0.25, record.id * 1.7, Math.PI * 0.46);
      mesh.position.y = SHELLS[kind].look.tubeRadius * 0.85;
    } else {
      mesh = new THREE.Mesh(bundleGeometry, material);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.renderOrder = 4;
    ring.position.y = 0.1;
    group.add(mesh, ring);
    group.position.set(record.x, y, record.z);
    scene.add(group);
    const label = element('div', 'world-label remains-label hidden', labelParent, '💀 Remains');
    return { ...record, y, group, ring, label };
  }

  function add(record) {
    const entry = build({ ...record, id: nextId++ });
    list.push(entry);
    return entry;
  }

  function remove(entry) {
    scene.remove(entry.group);
    const geometry = entry.group.children[0].geometry;
    if (geometry !== bundleGeometry) geometry.dispose();
    entry.label.remove();
    list.splice(list.indexOf(entry), 1);
  }

  for (const record of saved || []) add(record);

  function screenPoint(entry, camera) {
    projected.set(entry.x, entry.y + 2.6, entry.z).project(camera);
    return { x: (projected.x * 0.5 + 0.5) * innerWidth, y: (-projected.y * 0.5 + 0.5) * innerHeight, behind: projected.z > 1 };
  }

  function update(time, camera, player) {
    let nearest = null;
    for (const entry of list) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + entry.id);
      entry.ring.scale.setScalar(1 + 0.06 * pulse);
      const point = screenPoint(entry, camera);
      const onScreen = !point.behind && point.x > ARROW_MARGIN_PIXELS && point.x < innerWidth - ARROW_MARGIN_PIXELS && point.y > ARROW_MARGIN_PIXELS && point.y < innerHeight - ARROW_MARGIN_PIXELS;
      entry.label.classList.toggle('hidden', !onScreen);
      if (onScreen) entry.label.style.transform = `translate(-50%, -100%) translate(${point.x}px, ${Math.max(WORLD_LABEL_TOP_PIXELS, point.y - 5 * pulse)}px)`;
      const distance = Math.hypot(entry.x - player.x, entry.z - player.z);
      if (!onScreen && (!nearest || distance < nearest.distance)) nearest = { point, distance };
    }
    ringMaterial.opacity = 0.65 + 0.3 * Math.sin(time * 3);
    arrow.classList.toggle('hidden', !nearest);
    if (!nearest) return;
    const centerX = innerWidth / 2;
    const centerY = innerHeight / 2;
    let directionX = nearest.point.x - centerX;
    let directionY = nearest.point.y - centerY;
    if (nearest.point.behind) {
      directionX = -directionX;
      directionY = -directionY;
    }
    const scale = Math.min((centerX - ARROW_MARGIN_PIXELS) / Math.max(1e-3, Math.abs(directionX)), (centerY - ARROW_MARGIN_PIXELS - 40) / Math.max(1e-3, Math.abs(directionY)));
    arrow.style.transform = `translate(-50%, -50%) translate(${centerX + directionX * scale}px, ${centerY + directionY * scale}px)`;
    arrowPointer.style.transform = `rotate(${Math.atan2(directionY, directionX)}rad)`;
  }

  function pick(clientX, clientY, camera) {
    let best = null;
    for (const entry of list) {
      projected.set(entry.x, entry.y + 0.6, entry.z).project(camera);
      if (projected.z > 1) continue;
      const distance = Math.hypot((projected.x * 0.5 + 0.5) * innerWidth - clientX, (-projected.y * 0.5 + 0.5) * innerHeight - clientY);
      if (distance < PICK_RADIUS_PIXELS && (!best || distance < best.distance)) best = { entry, distance };
    }
    return best ? best.entry : null;
  }

  const serialize = () => list.map(({ x, z, inventory, gear }) => ({ x, z, inventory, gear }));

  return { list, add, remove, update, pick, serialize };
}
