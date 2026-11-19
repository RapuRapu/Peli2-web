import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import crabModelBytes from './assets/crab.glb';
import shellModelBytes from './assets/shells.glb';
import { Joint, limbChain, parseModel } from './rig.js';

const LEG_NAMES = ['leg_front_L', 'leg_middle_R', 'leg_rear_L', 'leg_front_R', 'leg_middle_L', 'leg_rear_R'];
const TRIPOD_PHASE = { leg_front_L: 0, leg_middle_R: 0, leg_rear_L: 0, leg_front_R: Math.PI, leg_middle_L: Math.PI, leg_rear_R: Math.PI };
const LEG_SWING = 0.5;
const LEG_LIFT = 0.75;
const CLAW_REACH = 1.4;
const CLAW_THRUST = 1.1;
const CLAW_SPREAD = 1.3;
const CLAW_OPEN = 0.35;
const MODEL_SCALE = 1.2;
const TUCKED_ABDOMEN_SCALE = 0.45;

export const SHELL_MODEL_FIT = {
  snail: { scale: 0.8, rotation: [-1.0, Math.PI, 0], offset: [0.3, 0.2, -0.3] },
  turban: { scale: 0.8, rotation: [-1.0, Math.PI, 0], offset: [0.3, 0.2, -0.3] },
  cone: { scale: 1.1, rotation: [-1.25, Math.PI, 0], offset: [0.15, 0.25, -0.55] },
  coral: { scale: 0.85, rotation: [-1.0, Math.PI, 0], offset: [0.3, 0.15, -0.22] },
  whelk: { scale: 1.05, rotation: [-1.25, Math.PI, 0], offset: [0.15, 0.25, -0.55] },
};

let loadedCrab = null;
const shellModels = new Map();


export async function loadCrabAsset() {
  const [crab, shells] = await Promise.all([parseModel(crabModelBytes), parseModel(shellModelBytes)]);
  loadedCrab = crab.scene;
  shells.scene.traverse((node) => {
    if (node.isMesh && SHELL_MODEL_FIT[node.name]) shellModels.set(node.name, node);
  });
  return loadedCrab;
}

export const shellModelAvailable = (kind) => shellModels.has(kind);

export function dressShellMaterial(kind, material) {
  const source = shellModels.get(kind).material;
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'roughness', 'metalness']) material[key] = source[key];
  material.normalScale.copy(source.normalScale);
  material.vertexColors = false;
  material.color.setRGB(1, 1, 1);
  material.side = THREE.DoubleSide;
  material.needsUpdate = true;
  return material;
}

export function buildShellModel(kind, material) {
  const fit = SHELL_MODEL_FIT[kind];
  const holder = new THREE.Group();
  const mesh = new THREE.Mesh(shellModels.get(kind).geometry, material);
  mesh.castShadow = true;
  mesh.scale.setScalar(fit.scale);
  mesh.rotation.set(...fit.rotation);
  mesh.position.set(...fit.offset);
  holder.add(mesh);
  return holder;
}

export const crabAssetLoaded = () => loadedCrab !== null;

export function buildAssetRig({ bodyMaterial, clawMaterial, abdomenMaterial, rearMaterial }) {
  const model = cloneSkinned(loadedCrab);
  model.scale.setScalar(MODEL_SCALE);
  model.updateMatrixWorld(true);
  const bones = {};
  const meshes = {};
  model.traverse((node) => {
    if (node.isBone) bones[node.name] = node;
    if (node.isSkinnedMesh) {
      const role = node.material.name.replace('crab_', '');
      meshes[role] = node;
      const original = node.material;
      const replacement = { body: bodyMaterial, claws: clawMaterial, abdomen: abdomenMaterial, rear: rearMaterial }[role];
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'roughness', 'metalness']) replacement[key] = original[key];
      replacement.normalScale.copy(original.normalScale);
      replacement.needsUpdate = true;
      node.material = replacement;
      node.castShadow = true;
      node.frustumCulled = false;
    }
  });

  const legs = LEG_NAMES.map((name) => ({ name, phase: TRIPOD_PHASE[name], ...limbChain(bones, name) }));
  const claws = { big: limbChain(bones, 'claw_big'), small: limbChain(bones, 'claw_small') };
  const eyes = ['eye_L', 'eye_R'].map((name) => new Joint(bones[name], new THREE.Vector3(1, 0, 0)));
  const bodyBone = bones.body;
  const bodyRest = bodyBone.position.clone();
  const abdomen = new Joint(bones.abdomen, new THREE.Vector3(1, 0, 0));
  const abdomenAnchor = bones.abdomen.getWorldPosition(new THREE.Vector3());

  const clawTips = { big: bones.claw_big_tip, small: bones.claw_small_tip };
  const tines = {};

  function setClawTines(mesh, which) {
    if (tines[which]) tines[which].removeFromParent();
    tines[which] = mesh;
    if (mesh) bones[`claw_${which}_tip`].add(mesh);
  }

  function setNaked(naked) {
    bones.abdomen.scale.setScalar(naked ? 1 : TUCKED_ABDOMEN_SCALE);
  }

  function setClawGrowth(bigScale, smallScale) {
    bones.claw_big_1.scale.setScalar(bigScale);
    bones.claw_small_1.scale.setScalar(smallScale);
  }

  function pose({ stride, moving, idleTime, claws: clawPose, retract, withdrawn }) {
    for (const leg of legs) {
      const cycle = stride + leg.phase;
      const lift = Math.max(0, Math.cos(cycle)) * LEG_LIFT * moving;
      const fold = retract * 0.9 + (withdrawn ? 0.5 : 0);
      leg.joints[0].pose(lift + fold * 0.6, Math.sin(cycle) * LEG_SWING * moving * leg.side);
      leg.joints[1].pose(-lift * 0.7 - fold);
      leg.joints[2].pose(-fold * 0.6);
    }
    for (const which of ['big', 'small']) {
      const claw = claws[which];
      const motion = clawPose[which];
      const tuck = retract * 0.9;
      const windup = Math.max(0, -motion.reach);
      const thrust = Math.max(0, motion.reach);
      claw.joints[0].pose(windup * CLAW_REACH + thrust * 0.3 + tuck, claw.side * motion.spread * CLAW_SPREAD);
      claw.joints[1].pose(windup * 0.7 + thrust * CLAW_THRUST + tuck * 0.6);
      claw.joints[2].pose(motion.open * CLAW_OPEN * (1 - retract) + thrust * 0.3);
    }
    eyes[0].pose(0, 0, -0.06 * Math.sin(idleTime * 0.8) + retract * 0.9);
    eyes[1].pose(0, 0, -0.06 * Math.sin(idleTime * 0.8 + 1.4) + retract * 0.9);
    abdomen.pose(0, Math.sin(stride) * 0.05 * moving, 0.03 * Math.sin(idleTime * 1.3));
    bodyBone.position.set(bodyRest.x, bodyRest.y - 0.16 * retract, bodyRest.z - 0.32 * retract);
  }

  return { object: model, pose, setNaked, setClawGrowth, setClawTines, clawTips, abdomenAnchor, meshes };
}
