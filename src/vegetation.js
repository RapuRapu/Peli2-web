import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { scatterOnIsland } from './island.js';
import { smoothstep } from './noise.js';

const TILE_SIZE = 256;

function paintGeometry(geometry, colorForVertex) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    colorForVertex(positions.getX(i), positions.getY(i), positions.getZ(i), color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function buildPalmGeometry() {
  const trunkHeight = 10;
  const trunkBend = 1.6;
  const trunk = new THREE.CylinderGeometry(0.22, 0.38, trunkHeight, 7, 6, true);
  trunk.translate(0, trunkHeight / 2, 0);
  trunk.deleteAttribute('uv');
  const trunkPositions = trunk.attributes.position;
  for (let i = 0; i < trunkPositions.count; i++) {
    const heightFraction = trunkPositions.getY(i) / trunkHeight;
    trunkPositions.setX(i, trunkPositions.getX(i) + trunkBend * heightFraction * heightFraction);
  }
  trunk.computeVertexNormals();
  paintGeometry(trunk, (x, y, z, color) => {
    const ring = 0.85 + 0.15 * Math.sin(y * 9);
    color.setRGB(0.56 * ring, 0.47 * ring, 0.35 * ring);
  });

  const crownX = trunkBend;
  const crownY = trunkHeight;
  const frondCount = 9;
  const frondSegments = 6;
  const frondLength = 5.2;
  const fronds = [];
  for (let f = 0; f < frondCount; f++) {
    const yaw = (f / frondCount) * Math.PI * 2 + (f % 2) * 0.2;
    const lift = 0.55 - (f % 3) * 0.22;
    const positions = [];
    const indices = [];
    for (let s = 0; s <= frondSegments; s++) {
      const t = s / frondSegments;
      const along = t * frondLength;
      const droop = lift * along - 0.32 * along * along / frondLength * 2.2;
      const halfWidth = 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.05;
      const centerX = crownX + Math.cos(yaw) * along;
      const centerZ = Math.sin(yaw) * along;
      const sideX = -Math.sin(yaw) * halfWidth;
      const sideZ = Math.cos(yaw) * halfWidth;
      positions.push(centerX - sideX, crownY + droop - halfWidth * 0.25, centerZ - sideZ);
      positions.push(centerX, crownY + droop + 0.05, centerZ);
      positions.push(centerX + sideX, crownY + droop - halfWidth * 0.25, centerZ + sideZ);
    }
    for (let s = 0; s < frondSegments; s++) {
      const a = s * 3;
      const b = a + 3;
      indices.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
    }
    const frond = new THREE.BufferGeometry();
    frond.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    frond.setIndex(indices);
    frond.computeVertexNormals();
    paintGeometry(frond, (x, y, z, color) => {
      const distanceFromCrown = Math.hypot(x - crownX, z) / frondLength;
      color.setRGB(0.16 + 0.12 * distanceFromCrown, 0.38 + 0.08 * distanceFromCrown, 0.1);
    });
    fronds.push(frond);
  }
  return mergeGeometries([trunk, ...fronds]);
}

function buildBushGeometry() {
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const positions = blob.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const wobble = 1 + 0.18 * Math.sin(x * 5.1 + z * 3.7) * Math.cos(y * 4.3);
    positions.setXYZ(i, x * wobble, Math.max(-0.3, y) * 0.8 * wobble + 0.25, z * wobble);
  }
  blob.computeVertexNormals();
  return paintGeometry(blob, (x, y, z, color) => {
    const shade = 0.7 + 0.3 * smoothstep(-0.3, 1, y);
    color.setRGB(0.15 * shade, 0.34 * shade, 0.1 * shade);
  });
}

function buildBroadleafTreeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1.0, 6, 1, true);
  trunk.translate(0, 0.5, 0);
  trunk.deleteAttribute('uv');
  paintGeometry(trunk, (x, y, z, color) => color.setRGB(0.3, 0.22, 0.14));
  const canopyClusters = [
    { x: 0, y: 1.75, z: 0, radius: 0.95 },
    { x: 0.55, y: 1.45, z: 0.25, radius: 0.62 },
    { x: -0.45, y: 1.5, z: -0.35, radius: 0.66 },
    { x: 0.1, y: 2.25, z: -0.15, radius: 0.55 },
  ].map(({ x, y, z, radius }) => {
    const cluster = new THREE.IcosahedronGeometry(radius, radius > 0.8 ? 1 : 0);
    cluster.scale(1, 0.72, 1);
    cluster.translate(x, y - 0.35, z);
    cluster.deleteAttribute('uv');
    return paintGeometry(cluster, (vx, vy, vz, color) => {
      const topLight = smoothstep(0.9, 2.3, vy);
      color.setRGB(0.12 + 0.12 * topLight, 0.3 + 0.16 * topLight, 0.08 + 0.04 * topLight);
    });
  });
  const merged = mergeGeometries([trunk.toNonIndexed(), ...canopyClusters]);
  merged.computeVertexNormals();
  return merged;
}

function buildRockGeometry() {
  const rock = new THREE.DodecahedronGeometry(1, 0);
  const positions = rock.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, positions.getY(i) * 0.6);
  }
  rock.computeVertexNormals();
  return paintGeometry(rock, (x, y, z, color) => {
    const shade = 0.85 + 0.15 * y;
    color.setRGB(0.48 * shade, 0.41 * shade, 0.33 * shade);
  });
}

export const vegetationOcclusion = {
  camera: { value: new THREE.Vector3() },
  focus: { value: new THREE.Vector3() },
  enabled: { value: 0 },
};

function configureVegetationMaterial(material, timeUniform, swayStrength, canopyHeight, canopyRadius) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.swayTime = timeUniform;
    shader.uniforms.occlusionCamera = vegetationOcclusion.camera;
    shader.uniforms.occlusionFocus = vegetationOcclusion.focus;
    shader.uniforms.occlusionEnabled = vegetationOcclusion.enabled;
    shader.vertexShader = 'uniform float swayTime;\nvarying vec3 vegetationWorldPosition;\nvarying vec3 vegetationInstanceCanopy;\nvarying float vegetationInstanceReach;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
       float swayPhase = swayTime * 1.4 + instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.05;
       float swayAmount = ${swayStrength.toFixed(4)} * transformed.y * transformed.y;
       transformed.x += sin(swayPhase) * swayAmount;
       transformed.z += cos(swayPhase * 0.8) * swayAmount * 0.6;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
       vegetationWorldPosition = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
       float instanceSize = length(instanceMatrix[1].xyz);
       vegetationInstanceCanopy = (modelMatrix * instanceMatrix * vec4(0.0, ${canopyHeight.toFixed(2)}, 0.0, 1.0)).xyz;
       vegetationInstanceReach = ${canopyRadius.toFixed(2)} * instanceSize;`);
    shader.fragmentShader = 'uniform vec3 occlusionCamera;\nuniform vec3 occlusionFocus;\nuniform float occlusionEnabled;\nvarying vec3 vegetationWorldPosition;\nvarying vec3 vegetationInstanceCanopy;\nvarying float vegetationInstanceReach;\n' + shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
       if (occlusionEnabled > 0.5) {
         vec3 sightLine = occlusionFocus - occlusionCamera;
         float along = clamp(dot(vegetationInstanceCanopy - occlusionCamera, sightLine) / dot(sightLine, sightLine), 0.0, 1.0);
         float distanceToSightLine = length(vegetationInstanceCanopy - (occlusionCamera + sightLine * along));
         if (distanceToSightLine < vegetationInstanceReach) {
           vec2 ditherCell = mod(floor(gl_FragCoord.xy / 3.0), 4.0);
           float bayer = mod(ditherCell.x * 2.0 + ditherCell.y * 3.0 + floor(ditherCell.x * 0.5) * 5.0 + floor(ditherCell.y * 0.5) * 7.0, 16.0) / 16.0;
           if (bayer < 0.55) discard;
         }
       }`,
    );
  };
}

function createTiledInstances(group, geometry, material, placements, composeMatrix, { castShadow }) {
  const tiles = new Map();
  for (const placement of placements) {
    const key = `${Math.floor(placement.x / TILE_SIZE)},${Math.floor(placement.z / TILE_SIZE)}`;
    if (!tiles.has(key)) tiles.set(key, []);
    tiles.get(key).push(placement);
  }
  const matrix = new THREE.Matrix4();
  const instanceColor = new THREE.Color();
  for (const tilePlacements of tiles.values()) {
    const instances = new THREE.InstancedMesh(geometry, material, tilePlacements.length);
    tilePlacements.forEach((placement, index) => {
      composeMatrix(placement, matrix);
      instances.setMatrixAt(index, matrix);
      const tint = 0.85 + placement.random * 0.3;
      instances.setColorAt(index, instanceColor.setRGB(tint, tint * (0.95 + placement.random * 0.1), tint));
    });
    instances.castShadow = castShadow;
    instances.receiveShadow = true;
    instances.computeBoundingSphere();
    group.add(instances);
  }
}

export function createVegetation(scene, heightmap, swayTimeUniform) {
  const group = new THREE.Group();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const euler = new THREE.Euler();
  const obstacles = [];

  const palms = scatterOnIsland(heightmap, {
    seed: 11, count: 1400, minHeight: 1.2, maxHeight: 40, maxSlope: 0.45,
    accept: (x, z, height, slope, random) => random() < (height < 10 ? 1 : 0.25),
  });
  const palmMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  configureVegetationMaterial(palmMaterial, swayTimeUniform, 0.0016, 9, 4.5);
  createTiledInstances(group, buildPalmGeometry(), palmMaterial, palms, (placement, matrix) => {
    euler.set((placement.random - 0.5) * 0.15, placement.random * Math.PI * 2 * 7.3, 0);
    rotation.setFromEuler(euler);
    const size = 0.75 + placement.random * 0.5;
    obstacles.push({ x: placement.x, z: placement.z, radius: 0.45 * size, canopyRadius: 6 * size, canopyHeight: 10 * size });
    scale.set(size, size, size);
    position.set(placement.x, placement.y - 0.2, placement.z);
    matrix.compose(position, rotation, scale);
  }, { castShadow: true });

  const jungle = scatterOnIsland(heightmap, {
    seed: 23, count: 5200, minHeight: 3, maxHeight: 150, maxSlope: 1.3,
    accept: (x, z, height, slope, random) => random() < smoothstep(2.5, 9, height),
  });
  const bushMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
  configureVegetationMaterial(bushMaterial, swayTimeUniform, 0.002, 1.5, 1.2);
  const broadleafTrees = jungle.filter((placement) => placement.y > 10 && placement.random > 0.25);
  const shrubs = jungle.filter((placement) => !(placement.y > 10 && placement.random > 0.25));
  createTiledInstances(group, buildBroadleafTreeGeometry(), bushMaterial, broadleafTrees, (placement, matrix) => {
    const size = 3.2 + placement.random * 3.2;
    obstacles.push({ x: placement.x, z: placement.z, radius: 0.22 * size });
    euler.set(0, placement.random * 40, 0);
    rotation.setFromEuler(euler);
    scale.set(size, size * (0.85 + placement.random * 0.35), size);
    position.set(placement.x, placement.y - 0.3, placement.z);
    matrix.compose(position, rotation, scale);
  }, { castShadow: true });
  createTiledInstances(group, buildBushGeometry(), bushMaterial, shrubs, (placement, matrix) => {
    const size = 1.6 + placement.random * 2.2;
    obstacles.push({ x: placement.x, z: placement.z, radius: 0.6 * size });
    euler.set(0, placement.random * 40, 0);
    rotation.setFromEuler(euler);
    scale.set(size, size * (0.8 + placement.random * 0.4), size);
    position.set(placement.x, placement.y - size * 0.15, placement.z);
    matrix.compose(position, rotation, scale);
  }, { castShadow: true });

  const rocks = scatterOnIsland(heightmap, {
    seed: 37, count: 320, minHeight: 0.4, maxHeight: 45, maxSlope: 3,
    accept: (x, z, height, slope, random) => (slope > 0.5 && random() < 0.8) || (height < 1.2 && random() < 0.12),
  });
  const rockMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  createTiledInstances(group, buildRockGeometry(), rockMaterial, rocks, (placement, matrix) => {
    const size = 1.0 + placement.random * placement.random * 5;
    obstacles.push({ x: placement.x, z: placement.z, radius: 0.85 * size });
    euler.set(placement.random * 3, placement.random * 17, placement.random * 2);
    rotation.setFromEuler(euler);
    scale.set(size, size * (0.7 + placement.random * 0.5), size * (0.8 + placement.random * 0.3));
    position.set(placement.x, placement.y - size * 0.38, placement.z);
    matrix.compose(position, rotation, scale);
  }, { castShadow: true });

  scene.add(group);
  return { group, obstacles };
}
