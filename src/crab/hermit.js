import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySeaside, createEnchantUniforms, updateEnchantUniforms } from './seaside.js';
import { enchantLook } from './gear.js';

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
const ATTACK_SECONDS = 0.45;
const HURT_SECONDS = 0.55;
const DEATH_SECONDS = 1.1;

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

const GROUND_GLOW_RADIUS = 2.4;

function buildGroundGlow() {
  const uniforms = { uColor: { value: new THREE.Color() } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vDisc;
      void main() {
        vDisc = position.xz / ${GROUND_GLOW_RADIUS.toFixed(2)};
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vDisc;
      void main() {
        float distanceShare = length(vDisc);
        float falloff = 1.0 - smoothstep(0.0, 1.0, distanceShare);
        float ring = smoothstep(0.62, 0.74, distanceShare) * (1.0 - smoothstep(0.78, 0.9, distanceShare));
        gl_FragColor = vec4(uColor * (falloff * falloff * 1.6 + ring * 1.5), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(GROUND_GLOW_RADIUS, 40).rotateX(-Math.PI / 2).translate(0, 0.06, 0), material);
  mesh.renderOrder = 3;
  mesh.visible = false;
  return { mesh, uniforms };
}

export function createHermit(scene, quality, shellLook) {
  const wetnessUniforms = { uBodyWetness: { value: 0 }, uBodyWetTop: { value: -1000 } };
  const wetSurface = { wetDarkening: 0.45, wetRoughness: 0.08, causticStrength: 1.6, chromaticCaustics: quality.chromaticCaustics, bodyWetness: wetnessUniforms };
  const shellEnchantUniforms = createEnchantUniforms();
  const clawEnchantUniforms = createEnchantUniforms();
  const material = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.02 }), wetSurface);
  const clawMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.02 }), { ...wetSurface, enchant: clawEnchantUniforms });
  const shellMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, side: THREE.DoubleSide }), { ...wetSurface, wetDarkening: 0.42, wetRoughness: 0.12, enchant: shellEnchantUniforms });
  const enchant = { shell: 0, claws: 0 };
  const groundGlow = buildGroundGlow();
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: EYE, roughness: 0.08 });

  const root = new THREE.Group();
  const tilt = new THREE.Group();
  const body = new THREE.Group();
  const front = new THREE.Group();
  root.add(tilt);
  tilt.add(body);
  body.add(front);

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
  front.add(head);

  const eyes = [-1, 1].map((side) => {
    const stalk = new THREE.Group();
    stalk.position.set(side * 0.16, 0.66, 0.6);
    const stem = new THREE.Mesh(tinted(new THREE.CylinderGeometry(0.035, 0.05, 0.36, 7).translate(0, 0.18, 0), CARAPACE, 0), material);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 9).translate(0, 0.4, 0), eyeMaterial);
    stalk.add(stem, ball);
    stalk.rotation.set(0.35, 0, -side * 0.32);
    front.add(stalk);
    return stalk;
  });

  const antennae = [-1, 1].map((side) => {
    const antenna = new THREE.Mesh(tinted(new THREE.ConeGeometry(0.014, 1.15, 5).translate(0, 0.575, 0), CARAPACE_DARK, 0), material);
    antenna.position.set(side * 0.08, 0.56, 0.8);
    antenna.rotation.set(ANTENNA_FORWARD_TILT, 0, -side * 0.55);
    front.add(antenna);
    return antenna;
  });

  const bigClaw = buildClaw(clawMaterial, 1.25);
  bigClaw.shoulder.position.set(-0.34, 0.4, 0.5);
  bigClaw.shoulder.rotation.set(0.25, -0.5, 0);
  bigClaw.wrist.rotation.set(0.25, 0.85, 0);
  const smallClaw = buildClaw(clawMaterial, 0.85);
  smallClaw.shoulder.position.set(0.34, 0.4, 0.5);
  smallClaw.shoulder.rotation.set(0.25, 0.5, 0);
  smallClaw.wrist.rotation.set(0.25, -0.85, 0);
  front.add(bigClaw.shoulder, smallClaw.shoulder);

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

  root.add(groundGlow.mesh);
  scene.add(root);

  function setEnchant(shellLevel, clawLevel) {
    enchant.shell = shellLevel;
    enchant.claws = clawLevel;
  }

  const pose = { stride: 0, snip: 0, idleTime: 0, tiltX: 0, tiltZ: 0 };
  const attack = { time: 1, variant: 'big' };
  const hurt = { amount: 0, strength: 1, side: 0 };
  const death = { time: -1 };
  const flashColor = new THREE.Color();

  function playAttack(variant) {
    attack.time = 0;
    attack.variant = variant;
  }

  function playHurt(strength, sideways) {
    hurt.amount = 1;
    hurt.strength = strength;
    hurt.side = sideways;
  }

  function playDeath() {
    death.time = 0;
  }

  function resetPose() {
    death.time = -1;
    hurt.amount = 0;
    attack.time = 1;
  }

  const clawWorld = new THREE.Vector3();
  function clawPosition(which, target = clawWorld) {
    return (which === 'small' ? smallClaw : bigClaw).thumb.getWorldPosition(target);
  }

  function gatherPose(type, progress) {
    const reachDown = THREE.MathUtils.smoothstep(progress, 0, 0.35) * (1 - THREE.MathUtils.smoothstep(progress, 0.55, 0.9));
    const lifted = THREE.MathUtils.smoothstep(progress, 0.55, 0.9);
    const pinch = progress > 0.45 && progress < 0.95 ? 0.05 : 0.6;
    if (type === 'driftwood') {
      const tug = Math.sin(progress * Math.PI * 7) * THREE.MathUtils.smoothstep(progress, 0.3, 0.45);
      return { big: { reach: 0.75 * reachDown + 0.35, open: pinch, spread: -0.25 }, small: { reach: 0.7 * reachDown + 0.3, open: pinch, spread: -0.25 }, lunge: 0.1 * reachDown - 0.12 * Math.max(0, tug), pitch: 0.18 * reachDown, lifted };
    }
    if (type === 'seaLettuce') {
      const nibble = Math.sin(progress * Math.PI * 8);
      return { big: { reach: 0.55 + 0.45 * Math.max(0, nibble) - 0.5 * Math.max(0, -nibble), open: 0.35 + 0.3 * Math.max(0, nibble), spread: 0.1 }, small: { reach: 0.55 + 0.45 * Math.max(0, -nibble) - 0.5 * Math.max(0, nibble), open: 0.35 + 0.3 * Math.max(0, -nibble), spread: 0.1 }, lunge: 0.06, pitch: 0.2 + 0.05 * Math.sin(progress * Math.PI * 16), lifted: 0 };
    }
    if (type === 'pearls') {
      return { big: { reach: 0.85 * reachDown - 0.3 * lifted, open: pinch * 0.6, spread: -0.35 }, small: { reach: 0.85 * reachDown - 0.3 * lifted, open: pinch * 0.6, spread: -0.35 }, lunge: 0.1 * reachDown, pitch: 0.22 * reachDown, lifted };
    }
    return { big: { reach: 0.1, open: 0.2, spread: 0 }, small: { reach: 0.95 * reachDown - 0.45 * lifted, open: pinch, spread: -0.3 }, lunge: 0.08 * reachDown, pitch: 0.2 * reachDown, lifted };
  }

  function update(deltaTime, { x, y, z, heading, speed, working, gatherType = null, gatherProgress = 0, groundNormal }) {
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

    const idleOpen = 0.16 + 0.08 * Math.sin(pose.idleTime * 0.9);
    const claws = { big: { reach: Math.sin(pose.stride + 1) * 0.05 * moving, open: idleOpen, spread: 0 }, small: { reach: -Math.sin(pose.stride + 1) * 0.05 * moving, open: idleOpen * 0.8, spread: 0 } };
    let lunge = 0;
    let pitch = 0;
    if (working && gatherType) {
      const gather = gatherPose(gatherType, gatherProgress);
      Object.assign(claws, { big: gather.big, small: gather.small });
      lunge = gather.lunge;
      pitch = gather.pitch;
    }
    attack.time = Math.min(1, attack.time + deltaTime / ATTACK_SECONDS);
    if (attack.time < 1) {
      const windup = THREE.MathUtils.smoothstep(attack.time, 0, 0.33) * (1 - THREE.MathUtils.smoothstep(attack.time, 0.33, 0.48));
      const strike = THREE.MathUtils.smoothstep(attack.time, 0.33, 0.48) * (1 - THREE.MathUtils.smoothstep(attack.time, 0.55, 1));
      const power = attack.variant === 'both' ? 1.3 : 1;
      for (const which of attack.variant === 'both' ? ['big', 'small'] : [attack.variant]) {
        claws[which] = { reach: -0.75 * windup + 0.85 * strike * power, open: 0.9 * windup + 0.05 * strike, spread: -0.35 * strike };
      }
      lunge += (-0.14 * windup + 0.5 * strike) * power;
      pitch += -0.12 * windup + 0.14 * strike * power;
    }
    for (const [which, claw] of [['big', bigClaw], ['small', smallClaw]]) {
      const side = which === 'big' ? -1 : 1;
      claw.thumb.rotation.x = -claws[which].open * (which === 'big' ? 1 : 0.8);
      claw.shoulder.rotation.x = 0.25 + claws[which].reach;
      claw.shoulder.rotation.y = side * (0.5 + claws[which].spread);
    }

    hurt.amount = Math.max(0, hurt.amount - deltaTime / HURT_SECONDS);
    const deathShare = death.time >= 0 ? Math.min(1, (death.time += deltaTime / DEATH_SECONDS)) : 0;
    const retract = Math.max(Math.pow(hurt.amount, 0.5) * Math.min(1, 0.7 + 0.3 * hurt.strength), THREE.MathUtils.smoothstep(deathShare, 0, 0.35));
    for (const claw of [bigClaw, smallClaw]) {
      claw.shoulder.rotation.x = THREE.MathUtils.lerp(claw.shoulder.rotation.x, -0.55, retract);
      claw.thumb.rotation.x *= 1 - retract;
    }
    front.position.set(0, 0.12 * retract, -0.5 * retract);
    front.scale.setScalar(1 - 0.32 * retract);
    body.position.z = lunge;
    body.rotation.x = pitch - 0.25 * hurt.amount * hurt.strength;
    const fall = THREE.MathUtils.smoothstep(deathShare, 0.3, 0.8);
    tilt.rotation.z += fall * 1.35 + hurt.side * hurt.amount * 0.25 * hurt.strength;
    for (const leg of legs) leg.knee.rotation.z += retract * 0.9;
    const flash = hurt.amount * hurt.amount;
    flashColor.setRGB(0.75 * flash, 0.62 * flash, 0.55 * flash);
    material.emissive.copy(flashColor);
    clawMaterial.emissive.copy(flashColor);
    const shellEnchantLook = enchantLook(enchant.shell);
    updateEnchantUniforms(shellEnchantUniforms, shellEnchantLook, pose.idleTime);
    updateEnchantUniforms(clawEnchantUniforms, enchantLook(enchant.claws), pose.idleTime);
    const groundLook = [shellEnchantLook, enchantLook(enchant.claws)].find((look) => look.groundGlow);
    groundGlow.mesh.visible = Boolean(groundLook);
    if (groundLook) {
      groundGlow.uniforms.uColor.value.setRGB(groundLook.color[0], groundLook.color[1], groundLook.color[2]).multiplyScalar(0.55 + 0.45 * Math.sin(pose.idleTime * 3.2) ** 2);
      groundGlow.mesh.rotation.set(pose.tiltX, 0, pose.tiltZ);
    }
    shellMaterial.emissive.copy(flashColor).multiplyScalar(0.3);

    eyes[0].rotation.x = 0.35 + Math.sin(pose.idleTime * 0.8) * 0.06;
    eyes[1].rotation.x = 0.35 + Math.sin(pose.idleTime * 0.8 + 1.4) * 0.06;
    antennae[0].rotation.x = ANTENNA_FORWARD_TILT + Math.sin(pose.idleTime * 2.3) * 0.09;
    antennae[1].rotation.x = ANTENNA_FORWARD_TILT + Math.sin(pose.idleTime * 2.3 + 0.9) * 0.09;
    for (const eye of eyes) eye.rotation.x += retract * 0.9;
  }

  return { root, update, wetnessUniforms, setShell, setEnchant, playAttack, playHurt, playDeath, resetPose, clawPosition };
}
