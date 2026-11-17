import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySeaside } from './seaside.js';

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const CARAPACE = linearColor(0.86, 0.3, 0.14);
const CARAPACE_DARK = linearColor(0.6, 0.16, 0.1);
const CLAW_TIP = linearColor(0.98, 0.86, 0.72);
const EYE = linearColor(0.03, 0.03, 0.04);

const SHELL_RINGS = 96;
const SHELL_SIDES = 20;
const SHELL_LEAN_BACK = -0.5;
const ANTENNA_FORWARD_TILT = 1.32;
const LEG_RISE = 0.28;
const LEG_SPLAY = 0.32;

function tinted(geometry, color, shadeByHeight = 0) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  for (let index = 0; index < positions.count; index++) {
    const heightShare = (positions.getY(index) - min.y) / Math.max(1e-5, max.y - min.y);
    const shade = 1 - shadeByHeight * (1 - heightShare);
    colors.set([color.r * shade, color.g * shade, color.b * shade], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  return geometry;
}

function buildSoftAbdomenGeometry(look) {
  const skin = linearColor(...look.light);
  const fold = linearColor(...look.band);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.05, 0.12, 0.42),
    new THREE.Vector3(0.22, 0.02, 0.78),
    new THREE.Vector3(0.36, -0.26, 0.9),
    new THREE.Vector3(0.4, -0.5, 0.7),
  ]);
  const segments = 28;
  const geometry = new THREE.TubeGeometry(curve, segments, 1, 14, false);
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3();
  const colors = [];
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    const along = Math.floor(index / 15) / segments;
    curve.getPointAt(along, point);
    const radius = look.tubeRadius * (1 - 0.7 * along) * (1 - 0.12 * Math.pow(0.5 + 0.5 * Math.cos(along * segments * 0.9), 4));
    positions.setXYZ(index, point.x + (positions.getX(index) - point.x) * radius, point.y + (positions.getY(index) - point.y) * radius, point.z + (positions.getZ(index) - point.z) * radius);
    color.copy(skin).lerp(fold, Math.pow(0.5 + 0.5 * Math.cos(along * segments * 0.9), 6));
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();
  return { geometry, mouthOffset: 0 };
}

export function buildShellGeometry(look) {
  if (look.soft) return buildSoftAbdomenGeometry(look);
  const light = linearColor(...look.light);
  const bandColor = linearColor(...look.band);
  const positions = [];
  const colors = [];
  const indices = [];
  const color = new THREE.Color();
  for (let ring = 0; ring <= SHELL_RINGS; ring++) {
    const along = (ring / SHELL_RINGS) * look.spireShare;
    const closing = ring === SHELL_RINGS ? 0 : 1;
    const angle = along * look.turns * Math.PI * 2;
    const whorlRadius = look.whorlRadius * Math.pow(1 - along, 1.15) + 0.02 * (1 - along);
    const tubeRadius = (look.tubeRadius * Math.pow(1 - along, 0.95) + 0.015 * (1 - along)) * closing;
    const centerX = Math.cos(angle) * whorlRadius;
    const centerZ = Math.sin(angle) * whorlRadius;
    const centerY = along * look.height + look.tubeRadius * (1 - Math.pow(1 - along, 0.95));
    for (let side = 0; side < SHELL_SIDES; side++) {
      const around = (side / SHELL_SIDES) * Math.PI * 2;
      const outward = Math.cos(around);
      const lift = Math.sin(around);
      positions.push(centerX + Math.cos(angle) * outward * tubeRadius, centerY + lift * tubeRadius, centerZ + Math.sin(angle) * outward * tubeRadius);
      const band = 0.5 + 0.5 * Math.sin(along * look.turns * look.bandFrequency + lift * 1.4);
      color.copy(light).lerp(bandColor, THREE.MathUtils.smoothstep(band, 0.55, 0.8) * 0.85);
      const seamShade = 0.62 + 0.38 * THREE.MathUtils.smoothstep(outward, -0.9, 0.2);
      colors.push(color.r * seamShade, color.g * seamShade, color.b * seamShade);
    }
  }
  for (let ring = 0; ring < SHELL_RINGS; ring++) {
    for (let side = 0; side < SHELL_SIDES; side++) {
      const current = ring * SHELL_SIDES + side;
      const next = ring * SHELL_SIDES + ((side + 1) % SHELL_SIDES);
      indices.push(current, current + SHELL_SIDES, next, next, current + SHELL_SIDES, next + SHELL_SIDES);
    }
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shell.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  const mouthOffset = look.whorlRadius + 0.02;
  const mouthLining = tinted(new THREE.CircleGeometry(look.tubeRadius * 0.93, SHELL_SIDES), linearColor(...look.inside)).translate(mouthOffset, 0, 0.05);
  return { geometry: mergeGeometries([shell, mouthLining]), mouthOffset };
}

function buildLeg(material, { reach, drop, thickness }) {
  const hip = new THREE.Group();
  const upper = new THREE.Mesh(tinted(new THREE.CapsuleGeometry(thickness, reach, 3, 8).rotateZ(Math.PI / 2).translate(reach / 2, 0, 0), CARAPACE, 0.2), material);
  const knee = new THREE.Group();
  knee.position.set(reach, 0, 0);
  const lower = new THREE.Mesh(tinted(new THREE.ConeGeometry(thickness * 1.05, drop, 7).rotateX(Math.PI).translate(0, -drop / 2, 0), CARAPACE, 0.45), material);
  knee.add(lower);
  hip.add(upper, knee);
  upper.castShadow = true;
  lower.castShadow = true;
  return { hip, knee };
}

function buildClaw(material, size) {
  const shoulder = new THREE.Group();
  const arm = new THREE.Mesh(tinted(new THREE.CapsuleGeometry(0.1 * size, 0.42 * size, 3, 8).rotateX(Math.PI / 2).translate(0, 0, 0.21 * size), CARAPACE, 0.25), material);
  const wrist = new THREE.Group();
  wrist.position.set(0, 0, 0.46 * size);
  const palmGeometry = tinted(new THREE.SphereGeometry(0.24 * size, 14, 10).scale(0.85, 0.72, 1.25).translate(0, 0, 0.2 * size), CARAPACE, 0.3);
  const fixedFinger = tinted(new THREE.ConeGeometry(0.1 * size, 0.42 * size, 8).rotateX(Math.PI / 2).translate(0, -0.07 * size, 0.6 * size), CLAW_TIP, 0);
  const palm = new THREE.Mesh(mergeGeometries([palmGeometry, fixedFinger]), material);
  const thumb = new THREE.Group();
  thumb.position.set(0, 0.08 * size, 0.36 * size);
  const thumbMesh = new THREE.Mesh(tinted(new THREE.ConeGeometry(0.085 * size, 0.4 * size, 8).rotateX(Math.PI / 2).translate(0, 0, 0.2 * size), CLAW_TIP, 0), material);
  thumb.add(thumbMesh);
  wrist.add(palm, thumb);
  shoulder.add(arm, wrist);
  for (const mesh of [arm, palm, thumbMesh]) mesh.castShadow = true;
  return { shoulder, wrist, thumb };
}

export function createHermit(scene, quality, shellLook) {
  const wetnessUniforms = { uBodyWetness: { value: 0 }, uBodyWetTop: { value: -1000 } };
  const wetSurface = { wetDarkening: 0.45, wetRoughness: 0.08, causticStrength: 1.6, chromaticCaustics: quality.chromaticCaustics, bodyWetness: wetnessUniforms };
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.02 }), wetSurface);
  const shellMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, side: THREE.DoubleSide }), { ...wetSurface, wetDarkening: 0.42, wetRoughness: 0.12 });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: EYE, roughness: 0.08 });

  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const body = new THREE.Group();
  root.add(tilt);
  tilt.add(body);

  const shell = new THREE.Mesh(undefined, shellMaterial);
  shell.castShadow = true;
  const shellPivot = new THREE.Group();
  shell.rotation.set(0, Math.PI, 0);
  function setShell(look) {
    const built = buildShellGeometry(look);
    shell.geometry.dispose();
    shell.geometry = built.geometry;
    shell.position.set(built.mouthOffset, 0, 0);
    shellMaterial.roughness = look.soft ? 0.82 : 0.32;
  }
  setShell(shellLook);
  shellPivot.add(shell);
  shellPivot.position.set(0, 0.64, -0.12);
  shellPivot.rotation.set(SHELL_LEAN_BACK, 0, 0.1);
  body.add(shellPivot);

  const headGeometry = mergeGeometries([
    tinted(new THREE.SphereGeometry(0.4, 18, 12).scale(0.95, 0.66, 1.2).translate(0, 0.5, 0.22), CARAPACE, 0.45),
    tinted(new THREE.SphereGeometry(0.22, 12, 8).scale(1.1, 0.7, 1).translate(0, 0.46, 0.66), CARAPACE_DARK, 0.2),
  ]);
  const head = new THREE.Mesh(headGeometry, material);
  head.castShadow = true;
  body.add(head);

  const eyes = [-1, 1].map((side) => {
    const stalk = new THREE.Group();
    stalk.position.set(side * 0.16, 0.66, 0.6);
    const stem = new THREE.Mesh(tinted(new THREE.CylinderGeometry(0.035, 0.05, 0.36, 7).translate(0, 0.18, 0), CARAPACE, 0), material);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 9).translate(0, 0.4, 0), eyeMaterial);
    stalk.add(stem, ball);
    stalk.rotation.set(0.35, 0, -side * 0.32);
    body.add(stalk);
    return stalk;
  });

  const antennae = [-1, 1].map((side) => {
    const antenna = new THREE.Mesh(tinted(new THREE.ConeGeometry(0.014, 1.15, 5).translate(0, 0.575, 0), CARAPACE_DARK, 0), material);
    antenna.position.set(side * 0.08, 0.56, 0.8);
    antenna.rotation.set(ANTENNA_FORWARD_TILT, 0, -side * 0.55);
    body.add(antenna);
    return antenna;
  });

  const bigClaw = buildClaw(material, 1.25);
  bigClaw.shoulder.position.set(-0.34, 0.4, 0.5);
  bigClaw.shoulder.rotation.set(0.25, -0.5, 0);
  bigClaw.wrist.rotation.set(0.25, 0.85, 0);
  const smallClaw = buildClaw(material, 0.85);
  smallClaw.shoulder.position.set(0.34, 0.4, 0.5);
  smallClaw.shoulder.rotation.set(0.25, 0.5, 0);
  smallClaw.wrist.rotation.set(0.25, -0.85, 0);
  body.add(bigClaw.shoulder, smallClaw.shoulder);

  const legs = [];
  for (const side of [-1, 1]) {
    for (let pair = 0; pair < 2; pair++) {
      const leg = buildLeg(material, { reach: 0.6 - pair * 0.06, drop: 0.7, thickness: 0.09 });
      const mount = new THREE.Group();
      mount.position.set(side * 0.28, 0.46, 0.26 - pair * 0.34);
      mount.rotation.y = side > 0 ? -0.35 + pair * 0.75 : Math.PI + 0.35 - pair * 0.75;
      mount.add(leg.hip);
      body.add(mount);
      legs.push({ ...leg, side, phase: (pair + (side > 0 ? 0 : 1)) * Math.PI });
    }
  }

  scene.add(root);

  const pose = { stride: 0, snip: 0, idleTime: 0, tiltX: 0, tiltZ: 0 };

  function update(deltaTime, { x, y, z, heading, speed, working, groundNormal }) {
    root.position.set(x, y, z);
    root.rotation.y = heading;
    pose.idleTime += deltaTime;
    pose.stride += speed * deltaTime * 2.6;
    const moving = Math.min(1, speed / 3);

    const cosHeading = Math.cos(heading);
    const sinHeading = Math.sin(heading);
    const forwardSlope = groundNormal.x * sinHeading + groundNormal.z * cosHeading;
    const sideSlope = groundNormal.x * cosHeading - groundNormal.z * sinHeading;
    const blend = Math.min(1, deltaTime * 8);
    pose.tiltX += (Math.atan2(forwardSlope, groundNormal.y) - pose.tiltX) * blend;
    pose.tiltZ += (-Math.atan2(sideSlope, groundNormal.y) - pose.tiltZ) * blend;
    tilt.rotation.set(pose.tiltX, 0, pose.tiltZ);

    body.position.y = Math.sin(pose.stride * 2) * 0.03 * moving + Math.sin(pose.idleTime * 1.7) * 0.012;
    shellPivot.rotation.z = 0.1 + Math.sin(pose.stride) * 0.06 * moving;
    shellPivot.rotation.x = SHELL_LEAN_BACK + Math.sin(pose.stride * 2 + 0.6) * 0.03 * moving;

    for (const leg of legs) {
      const cycle = pose.stride + leg.phase;
      leg.hip.rotation.y = Math.sin(cycle) * 0.45 * moving * leg.side;
      leg.hip.rotation.z = LEG_RISE + Math.max(0, Math.cos(cycle)) * 0.3 * moving;
      leg.knee.rotation.z = LEG_SPLAY - leg.hip.rotation.z;
    }

    pose.snip = working ? pose.snip + deltaTime * 11 : 0;
    const snipOpen = working ? 0.35 + 0.35 * Math.sin(pose.snip) : 0.16 + 0.08 * Math.sin(pose.idleTime * 0.9);
    bigClaw.thumb.rotation.x = -snipOpen;
    smallClaw.thumb.rotation.x = -snipOpen * 0.8;
    const reach = working ? 0.28 + 0.12 * Math.sin(pose.snip * 0.5) : 0;
    bigClaw.shoulder.rotation.x = 0.25 + reach + Math.sin(pose.stride + 1) * 0.05 * moving;
    smallClaw.shoulder.rotation.x = 0.25 + reach * 0.8 - Math.sin(pose.stride + 1) * 0.05 * moving;

    eyes[0].rotation.x = 0.35 + Math.sin(pose.idleTime * 0.8) * 0.06;
    eyes[1].rotation.x = 0.35 + Math.sin(pose.idleTime * 0.8 + 1.4) * 0.06;
    antennae[0].rotation.x = ANTENNA_FORWARD_TILT + Math.sin(pose.idleTime * 2.3) * 0.09;
    antennae[1].rotation.x = ANTENNA_FORWARD_TILT + Math.sin(pose.idleTime * 2.3 + 0.9) * 0.09;
  }

  return { root, update, wetnessUniforms, setShell };
}
