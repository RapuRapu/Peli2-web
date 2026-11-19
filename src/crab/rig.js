import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const UP = new THREE.Vector3(0, 1, 0);

export async function parseModel(bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new GLTFLoader().parseAsync(buffer, '');
}

export class Joint {
  constructor(bone, raiseAxisWorld) {
    this.bone = bone;
    this.rest = bone.quaternion.clone();
    const worldRest = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.raiseAxis = raiseAxisWorld.clone().applyQuaternion(worldRest).normalize();
    this.turnAxis = UP.clone().applyQuaternion(worldRest).normalize();
    this.pitchAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(worldRest).normalize();
  }

  pose(raise = 0, turn = 0, pitch = 0) {
    const bone = this.bone;
    bone.quaternion.copy(this.rest);
    if (turn) bone.quaternion.multiply(scratch.setFromAxisAngle(this.turnAxis, turn));
    if (raise) bone.quaternion.multiply(scratch.setFromAxisAngle(this.raiseAxis, raise));
    if (pitch) bone.quaternion.multiply(scratch.setFromAxisAngle(this.pitchAxis, pitch));
  }
}
const scratch = new THREE.Quaternion();

export function limbChain(bones, name) {
  const first = bones[`${name}_1`];
  const last = bones[`${name}_tip`];
  const start = first.getWorldPosition(new THREE.Vector3());
  const end = last.getWorldPosition(new THREE.Vector3());
  const outward = new THREE.Vector3(end.x - start.x, 0, end.z - start.z).normalize();
  const raiseAxis = new THREE.Vector3().crossVectors(outward, UP).normalize();
  return {
    side: Math.sign(start.x) || 1,
    joints: [1, 2, 3].map((segment) => new Joint(bones[`${name}_${segment}`], raiseAxis)),
  };
}

