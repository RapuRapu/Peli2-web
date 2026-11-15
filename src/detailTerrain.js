import * as THREE from 'three';
import { createNoise2D, smoothstep } from './noise.js';
import { terrainColorAt, createGridIndices, createTerrainMaterial } from './island.js';

const PATCH_SIZE = 256;
const PATCH_RESOLUTION = 257;
const PATCH_CELL = PATCH_SIZE / (PATCH_RESOLUTION - 1);
const RECENTER_DISTANCE = 48;
const RECENTER_SNAP = 32;
const ROWS_PER_FRAME = 24;
const EDGE_FADE_METERS = 12;

export function createDetailedGround(heightmap) {
  const detailNoise = createNoise2D(1234);

  function detailAmplitude(baseHeight) {
    return smoothstep(0.8, 3.0, baseHeight) * 0.45;
  }

  function heightAt(x, z) {
    const baseHeight = heightmap.heightAt(x, z);
    const detail = detailNoise(x * 0.11, z * 0.11) * 0.65 + detailNoise(x * 0.37 + 7.1, z * 0.37 - 3.3) * 0.35;
    return baseHeight + detail * detailAmplitude(baseHeight);
  }

  function slopeAt(x, z) {
    return Math.hypot(heightAt(x + 1, z) - heightAt(x - 1, z), heightAt(x, z + 1) - heightAt(x, z - 1)) / 2;
  }

  return { heightAt, slopeAt, baseHeightAt: heightmap.heightAt, detailAmplitude, detailNoise };
}

function createPatchMesh() {
  const vertexCount = PATCH_RESOLUTION * PATCH_RESOLUTION;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
  geometry.setIndex(new THREE.BufferAttribute(createGridIndices(PATCH_RESOLUTION), 1));
  const mesh = new THREE.Mesh(geometry, createTerrainMaterial());
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.visible = false;
  mesh.frustumCulled = false;
  return mesh;
}

export function createDetailTerrain(scene, ground, baseHiddenRectangle) {
  const meshes = [createPatchMesh(), createPatchMesh()];
  meshes.forEach((mesh) => scene.add(mesh));
  const heights = new Float32Array(PATCH_RESOLUTION * PATCH_RESOLUTION);
  const color = new THREE.Color();
  let frontIndex = 0;
  let frontCenterX = Infinity;
  let frontCenterZ = Infinity;
  let build = null;
  let enabled = false;

  function edgeFade(localX, localZ) {
    const distanceToEdge = Math.min(localX, localZ, PATCH_SIZE - localX, PATCH_SIZE - localZ);
    return smoothstep(0, EDGE_FADE_METERS, distanceToEdge);
  }

  function startBuild(centerX, centerZ) {
    build = { centerX, centerZ, mesh: meshes[1 - frontIndex], phase: 0, row: 0 };
  }

  function buildHeightRows(job, rowCount) {
    const originX = job.centerX - PATCH_SIZE / 2;
    const originZ = job.centerZ - PATCH_SIZE / 2;
    const positions = job.mesh.geometry.attributes.position.array;
    const lastRow = Math.min(PATCH_RESOLUTION, job.row + rowCount);
    for (let row = job.row; row < lastRow; row++) {
      for (let column = 0; column < PATCH_RESOLUTION; column++) {
        const index = row * PATCH_RESOLUTION + column;
        const localX = column * PATCH_CELL;
        const localZ = row * PATCH_CELL;
        const worldX = originX + localX;
        const worldZ = originZ + localZ;
        const baseHeight = ground.baseHeightAt(worldX, worldZ);
        const detailedHeight = ground.heightAt(worldX, worldZ);
        const height = baseHeight + (detailedHeight - baseHeight) * edgeFade(localX, localZ);
        heights[index] = height;
        positions[index * 3] = worldX;
        positions[index * 3 + 1] = height;
        positions[index * 3 + 2] = worldZ;
      }
    }
    job.row = lastRow;
  }

  function buildShadingRows(job, rowCount) {
    const originX = job.centerX - PATCH_SIZE / 2;
    const originZ = job.centerZ - PATCH_SIZE / 2;
    const normals = job.mesh.geometry.attributes.normal.array;
    const colors = job.mesh.geometry.attributes.color.array;
    const lastRow = Math.min(PATCH_RESOLUTION, job.row + rowCount);
    for (let row = job.row; row < lastRow; row++) {
      for (let column = 0; column < PATCH_RESOLUTION; column++) {
        const index = row * PATCH_RESOLUTION + column;
        const left = heights[row * PATCH_RESOLUTION + Math.max(0, column - 1)];
        const right = heights[row * PATCH_RESOLUTION + Math.min(PATCH_RESOLUTION - 1, column + 1)];
        const back = heights[Math.max(0, row - 1) * PATCH_RESOLUTION + column];
        const front = heights[Math.min(PATCH_RESOLUTION - 1, row + 1) * PATCH_RESOLUTION + column];
        const gradientX = (right - left) / (2 * PATCH_CELL);
        const gradientZ = (front - back) / (2 * PATCH_CELL);
        const inverseLength = 1 / Math.hypot(gradientX, 1, gradientZ);
        normals[index * 3] = -gradientX * inverseLength;
        normals[index * 3 + 1] = inverseLength;
        normals[index * 3 + 2] = -gradientZ * inverseLength;
        const slope = Math.hypot(gradientX, gradientZ) * 0.6;
        terrainColorAt(originX + column * PATCH_CELL, originZ + row * PATCH_CELL, heights[index], slope, color);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }
    }
    job.row = lastRow;
  }

  function finishBuild(job) {
    const geometry = job.mesh.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeBoundingSphere();
    meshes[frontIndex].visible = false;
    frontIndex = 1 - frontIndex;
    job.mesh.visible = enabled;
    frontCenterX = job.centerX;
    frontCenterZ = job.centerZ;
    const inset = 0.5;
    baseHiddenRectangle.set(
      frontCenterX - PATCH_SIZE / 2 + inset, frontCenterZ - PATCH_SIZE / 2 + inset,
      frontCenterX + PATCH_SIZE / 2 - inset, frontCenterZ + PATCH_SIZE / 2 - inset,
    );
    if (!enabled) hideBaseCutout();
  }

  function hideBaseCutout() {
    baseHiddenRectangle.set(1e9, 1e9, -1e9, -1e9);
  }

  function stepBuild(rowBudget) {
    if (!build) return;
    if (build.phase === 0) {
      buildHeightRows(build, rowBudget);
      if (build.row >= PATCH_RESOLUTION) {
        build.phase = 1;
        build.row = 0;
      }
    } else {
      buildShadingRows(build, rowBudget);
      if (build.row >= PATCH_RESOLUTION) {
        finishBuild(build);
        build = null;
      }
    }
  }

  function snap(value) {
    return Math.round(value / RECENTER_SNAP) * RECENTER_SNAP;
  }

  function update(focusX, focusZ) {
    if (!enabled) return;
    const needsRecenter = Math.hypot(focusX - frontCenterX, focusZ - frontCenterZ) > RECENTER_DISTANCE;
    if (needsRecenter && !build) startBuild(snap(focusX), snap(focusZ));
    stepBuild(ROWS_PER_FRAME);
  }

  function buildImmediately(focusX, focusZ) {
    startBuild(snap(focusX), snap(focusZ));
    while (build) stepBuild(PATCH_RESOLUTION);
  }

  function setEnabled(isEnabled, focusX, focusZ) {
    enabled = isEnabled;
    if (enabled) {
      buildImmediately(focusX, focusZ);
    } else {
      build = null;
      meshes.forEach((mesh) => { mesh.visible = false; });
      frontCenterX = Infinity;
      frontCenterZ = Infinity;
      hideBaseCutout();
    }
  }

  return { update, setEnabled, frontMesh: () => meshes[frontIndex] };
}
