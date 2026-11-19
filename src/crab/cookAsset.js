import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import cookBytes from './assets/cook.glb';
import cleaverBytes from './assets/cleaver.glb';
import { parseModel } from './rig.js';
import { applySeaside } from './seaside.js';

export const COOK_HEIGHT = 40;
const FADE_SECONDS = 0.22;
const WALK_STRIDE_SHARE = 0.55;
const SLAM_RAISED_TIME = 30 / 24;
const SLAM_IMPACT_TIME = 45 / 24;
const SLAM_DOWNSWING_SHARE = 0.18;
const STOMP_THIGH_LIFT = 1.15;
const STOMP_KNEE_BEND = 1.5;
const CLEAVER_GRIP = { position: [-0.9, 19.2, 20.9], rotation: [Math.PI, Math.PI / 2, 0, 'YXZ'], scale: 32 };
const CLEAVER_METALNESS = 0.45;
const CLEAVER_GLINT = 0.3;
const PANIC_LEAN = 0.35;
const PANIC_ARM_RAISE = 2.0;
const PANIC_FLAIL = 0.45;
const PANIC_FLAIL_SPEED = 14;
const FLASH_COLOR = new THREE.Color(1, 0.9, 0.82);
const FLASH_SHARE = 0.035;

let cookSource = null;

export async function loadCookAsset() {
  const [cook, cleaver] = await Promise.all([parseModel(cookBytes), parseModel(cleaverBytes)]);
  cookSource = { scene: cook.scene, clips: cook.animations, cleaver: cleaver.scene };
}

export const cookAssetAvailable = () => cookSource !== null;

function seasideCopy(source, quality) {
  const material = applySeaside(new THREE.MeshStandardMaterial(), { chromaticCaustics: quality.chromaticCaustics, wetDarkening: 0.4, wetRoughness: 0.3, cutaway: 'ray' });
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'roughness', 'metalness']) material[key] = source[key];
  if (source.normalScale) material.normalScale.copy(source.normalScale);
  material.side = THREE.DoubleSide;
  return material;
}

export function createCook(quality) {
  const model = cloneSkinned(cookSource.scene);
  const materials = [];
  const bones = {};
  model.traverse((node) => {
    if (node.isBone) bones[node.name.replace('mixamorig', '').replace(':', '')] = node;
    if (node.isMesh) {
      node.material = seasideCopy(node.material, quality);
      materials.push(node.material);
      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
    }
  });
  model.updateMatrixWorld(true);
  const headTop = bones.HeadTop_End.getWorldPosition(new THREE.Vector3()).y;
  const root = new THREE.Group();
  model.scale.multiplyScalar(COOK_HEIGHT / headTop);
  root.add(model);

  const cleaverMaterials = [];
  const cleaver = cookSource.cleaver.clone(true);
  cleaver.traverse((node) => {
    if (node.isMesh) {
      node.material = seasideCopy(node.material, quality);
      node.material.metalness = CLEAVER_METALNESS;
      cleaverMaterials.push(node.material);
      node.castShadow = true;
    }
  });
  cleaver.position.fromArray(CLEAVER_GRIP.position);
  cleaver.rotation.fromArray(CLEAVER_GRIP.rotation);
  cleaver.scale.setScalar(CLEAVER_GRIP.scale);
  bones.RightHand.add(cleaver);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of cookSource.clips) {
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true;
    action.setEffectiveWeight(0);
    actions[clip.name] = action;
  }
  const clipNames = { stand: 'Angry_Ground_Stomp', walk: 'Walking', run: 'Running', grumble: 'Angry_Ground_Stomp', slam: 'Charged_Ground_Slam', chop: 'Charged_Ground_Slam', stomp: 'Angry_Ground_Stomp' };
  const scratch = new THREE.Quaternion();
  const thighAxis = new THREE.Vector3(1, 0, 0);
  let current = { mode: 'stand', time: 0 };
  let previous = null;
  let fade = 0;

  function clipTime(mode, phase, time, deltaTime, rate) {
    if (mode === 'slam' && phase !== null) {
      if (phase >= 1) return SLAM_IMPACT_TIME + (phase - 1) * (actions.Charged_Ground_Slam.getClip().duration - SLAM_IMPACT_TIME);
      const raiseShare = 1 - SLAM_DOWNSWING_SHARE;
      return phase < raiseShare ? (phase / raiseShare) * SLAM_RAISED_TIME : SLAM_RAISED_TIME + ((phase - raiseShare) / SLAM_DOWNSWING_SHARE) * (SLAM_IMPACT_TIME - SLAM_RAISED_TIME);
    }
    if (mode === 'stomp' && phase !== null) return Math.min(1, phase) * actions.Angry_Ground_Stomp.getClip().duration * 0.6;
    if (mode === 'stand') return 0;
    const duration = actions[clipNames[mode]].getClip().duration;
    return (time + deltaTime * rate) % duration;
  }

  function layersFor(state, share) {
    if (state.mode === 'walk') return [[clipNames.stand, (1 - WALK_STRIDE_SHARE) * share, 0], [clipNames.walk, WALK_STRIDE_SHARE * share, state.time]];
    return [[clipNames[state.mode], share, state.time]];
  }

  function stompLeg(mode, phase) {
    if (mode !== 'stomp' || phase === null) return 0;
    if (phase < 1) return THREE.MathUtils.smoothstep(phase, 0, 0.75) * (1 - THREE.MathUtils.smoothstep(phase, 0.86, 1));
    return 0;
  }

  function pose({ deltaTime = 0, mode = 'stand', phase = null, rate = 1, glint = 0 }) {
    for (const material of cleaverMaterials) material.emissive.setScalar(CLEAVER_GLINT * glint);
    if (mode !== current.mode) {
      previous = { ...current };
      fade = 1;
      current = { mode, time: 0 };
    }
    current.time = clipTime(mode, phase, current.time, deltaTime, rate);
    fade = Math.max(0, fade - deltaTime / FADE_SECONDS);
    for (const action of Object.values(actions)) action.setEffectiveWeight(0);
    const layers = [...(previous && fade > 0 ? layersFor(previous, fade) : []), ...layersFor(current, 1 - fade)];
    for (const [name, weight, time] of layers) {
      const action = actions[name];
      action.setEffectiveWeight(action.getEffectiveWeight() + weight);
      action.time = time;
    }
    mixer.update(0);
    alignBlade(mode === 'slam' && phase !== null ? THREE.MathUtils.smoothstep(phase, 0.82, 0.98) * (1 - THREE.MathUtils.smoothstep(phase, 1.5, 1.9)) : 0);
    if (current.mode === 'run') panic(1 - fade);
    const lift = stompLeg(mode, phase);
    if (lift > 0) {
      bones.RightUpLeg.quaternion.multiply(scratch.setFromAxisAngle(thighAxis, lift * STOMP_THIGH_LIFT));
      bones.RightLeg.quaternion.multiply(scratch.setFromAxisAngle(thighAxis, -lift * STOMP_KNEE_BEND));
    }
  }

  const bladeDirection = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const yaw = new THREE.Quaternion();
  const handWorld = new THREE.Quaternion();
  const parentWorld = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  function alignBlade(weight) {
    if (weight <= 0.001) return;
    root.updateMatrixWorld(true);
    bladeDirection.set(-1, 0, 0).transformDirection(cleaver.matrixWorld).setY(0);
    forward.set(0, 0, 1).transformDirection(root.matrixWorld).setY(0);
    if (bladeDirection.lengthSq() < 1e-4) return;
    const angle = Math.atan2(bladeDirection.x * forward.z - bladeDirection.z * forward.x, bladeDirection.x * forward.x + bladeDirection.z * forward.z);
    const hand = bones.RightHand;
    hand.getWorldQuaternion(handWorld);
    hand.parent.getWorldQuaternion(parentWorld);
    yaw.setFromAxisAngle(UP, -angle * weight);
    hand.quaternion.copy(parentWorld.invert().multiply(yaw.multiply(handWorld)));
  }

  function panic(weight) {
    bones.Spine.quaternion.multiply(scratch.setFromAxisAngle(thighAxis, PANIC_LEAN * weight));
    for (const [name, offset] of [['LeftArm', 0], ['RightArm', Math.PI]]) {
      const flail = Math.sin(current.time * PANIC_FLAIL_SPEED + offset) * PANIC_FLAIL;
      bones[name].quaternion.multiply(scratch.setFromAxisAngle(thighAxis, (PANIC_ARM_RAISE + flail) * weight));
    }
  }

  function setFlash(hurt) {
    for (const material of materials) material.emissive.copy(FLASH_COLOR).multiplyScalar(FLASH_SHARE * hurt * hurt);
  }

  pose({});
  return { object: root, pose, setFlash, height: COOK_HEIGHT };
}
