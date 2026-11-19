import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import shoreCrabBytes from './assets/shoreCrab.glb';
import sandHopperBytes from './assets/sandHopper.glb';
import gullBytes from './assets/gull.glb';
import { Joint, limbChain, parseModel } from './rig.js';
import { applySeaside } from './seaside.js';
import { cookAssetAvailable, createCook, loadCookAsset } from './cookAsset.js';

const CREATURE_BYTES = { shoreCrab: shoreCrabBytes, sandHopper: sandHopperBytes, gull: gullBytes };
const GROUND_TIP_SHARE = 0.15;
const FLASH_COLOR = new THREE.Color(1, 0.9, 0.82);
const ENEMY_FLASH_SHARE = 0.22;
const WING_FOLD = { lower: 1.25, sweep: 1.5, elbow: 0.5, hand: 0.4 };
const loadedCreatures = new Map();

export async function loadCreatureAssets() {
  const [entries] = await Promise.all([Promise.all(Object.entries(CREATURE_BYTES).map(async ([kind, bytes]) => [kind, (await parseModel(bytes)).scene])), loadCookAsset()]);
  for (const [kind, scene] of entries) loadedCreatures.set(kind, scene);
}

export const creatureAssetAvailable = (kind) => (kind === 'cook' ? cookAssetAvailable() : loadedCreatures.has(kind));

function classifyLimbs(model, bones) {
  const limbNames = Object.keys(bones).filter((name) => name.endsWith('_1')).map((name) => name.slice(0, -2));
  const bounds = new THREE.Box3().setFromObject(model);
  const height = bounds.max.y - bounds.min.y;
  const limbs = { legs: [], appendages: [] };
  for (const name of limbNames) {
    const chain = limbChain(bones, name);
    const tip = bones[`${name}_tip`].getWorldPosition(new THREE.Vector3());
    const attachedToLimb = bones[`${name}_1`].parent && bones[`${name}_1`].parent.name.startsWith('limb_');
    Object.assign(chain, { name, tip, attachedToLimb, phase: 0 });
    (tip.y - bounds.min.y < height * GROUND_TIP_SHARE && !attachedToLimb ? limbs.legs : limbs.appendages).push(chain);
  }
  limbs.legs.sort((a, b) => b.tip.z - a.tip.z);
  for (const side of [-1, 1]) {
    limbs.legs.filter((leg) => leg.side === side).forEach((leg, order) => {
      leg.phase = (order + (side > 0 ? 0 : 1)) * Math.PI;
    });
  }
  return { ...limbs, height };
}

export function createCreature(kind, quality) {
  if (kind === 'cook') return createCook(quality);
  const model = cloneSkinned(loadedCreatures.get(kind));
  model.updateMatrixWorld(true);
  const bones = {};
  let material = null;
  model.traverse((node) => {
    if (node.isBone) bones[node.name] = node;
    if (node.isSkinnedMesh) {
      const source = node.material;
      material = applySeaside(new THREE.MeshStandardMaterial(), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.6, wetRoughness: 0.1, cutaway: kind === 'gull' ? 'soft' : false });
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'roughness', 'metalness']) material[key] = source[key];
      material.normalScale.copy(source.normalScale);
      material.side = THREE.DoubleSide;
      node.material = material;
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
    }
  });
  const limbs = classifyLimbs(model, bones);
  const head = bones.head ? new Joint(bones.head, new THREE.Vector3(1, 0, 0)) : null;
  const tail = bones.tail ? new Joint(bones.tail, new THREE.Vector3(1, 0, 0)) : null;
  const arms = limbs.appendages.filter((limb) => !limb.attachedToLimb && limb.tip.z > 0);
  const fingers = limbs.appendages.filter((limb) => limb.attachedToLimb);
  const rearAppendages = limbs.appendages.filter((limb) => !limb.attachedToLimb && limb.tip.z <= 0);
  const wings = limbs.appendages.filter((limb) => Math.abs(limb.tip.x) > limbs.height * 0.5);

  function setFlash(hurt) {
    material.emissive.copy(FLASH_COLOR).multiplyScalar(ENEMY_FLASH_SHARE * hurt * hurt);
  }

  function walk(stride, motion, lift, swing, fold = 0) {
    for (const leg of limbs.legs) {
      const cycle = stride + leg.phase;
      const raise = Math.max(0, Math.cos(cycle)) * lift * motion;
      leg.joints[0].pose(raise + fold * 0.5, Math.sin(cycle) * swing * motion * leg.side);
      leg.joints[1].pose(-raise * 0.7 - fold);
      leg.joints[2].pose(-fold * 0.5);
    }
  }

  function poseShoreCrab({ stride, motion, raised, snaps, recoil, fall }) {
    walk(stride, motion, 0.6, 0.35, fall * 0.9 + recoil * 0.4);
    for (const arm of arms) {
      const snap = arm.side < 0 ? snaps[0] : snaps[1];
      arm.joints[0].pose(raised * 0.9 - snap * 0.6 + recoil * 0.6, -arm.side * snap * 0.4);
      arm.joints[1].pose(raised * 0.5 + snap * 0.5);
      arm.joints[2].pose(0);
    }
    for (const finger of fingers) finger.joints[0].pose((0.45 * raised - snapsFor(finger, snaps) * 0.45) * 0.8);
  }

  const snapsFor = (limb, snaps) => (limb.side < 0 ? snaps[0] : snaps[1]);

  function poseHopper({ stride, motion, hop, startle, fall, time }) {
    walk(stride * 1.4, Math.max(motion, startle), 0.5, 0.45, fall * 0.8 + hop * 0.6);
    for (const limb of arms) limb.joints[0].pose(0.2 * Math.sin(time * 5 + limb.side), 0.15 * Math.sin(time * 3.1 + limb.side));
    for (const limb of rearAppendages) limb.joints[0].pose(hop * 0.5);
    if (tail) tail.pose(0, 0, -hop * 0.5 + startle * 0.3);
  }

  function poseGull({ flying, flap, strike, windup, time }) {
    for (const wing of wings) {
      const folded = 1 - flying;
      wing.joints[0].pose(flying * flap - folded * WING_FOLD.lower, wing.side * folded * WING_FOLD.sweep);
      wing.joints[1].pose(flying * flap * 0.4, wing.side * folded * WING_FOLD.elbow);
      wing.joints[2].pose(0, wing.side * folded * WING_FOLD.hand);
    }
    for (const leg of limbs.legs) {
      leg.joints[0].pose(0, 0, -flying * 0.9);
      leg.joints[1].pose(0);
      leg.joints[2].pose(0);
    }
    if (head) head.pose(0, 0, strike * 0.7 - windup * 0.3 + 0.05 * Math.sin(time * 1.7));
  }

  const posers = { shoreCrab: poseShoreCrab, sandHopper: poseHopper, gull: poseGull };
  return { object: model, setFlash, pose: posers[kind], height: limbs.height };
}
