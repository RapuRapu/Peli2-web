import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);

function painted(geometry, colorAt) {
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    colorAt(color, positions.getX(index), positions.getY(index), positions.getZ(index));
    colors.set([color.r, color.g, color.b], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  return geometry.index ? geometry.toNonIndexed() : geometry;
}

const solid = (geometry, color) => painted(geometry, (target) => target.copy(color));

function tubeAlong(points, radiusAt, radialSegments, tubularSegments) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, 1, radialSegments, false);
  const positions = geometry.attributes.position;
  const center = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (let ring = 0; ring <= tubularSegments; ring++) {
    const along = ring / tubularSegments;
    curve.getPointAt(along, center);
    const radius = radiusAt(along);
    for (let side = 0; side <= radialSegments; side++) {
      const index = ring * (radialSegments + 1) + side;
      point.fromBufferAttribute(positions, index).sub(center).multiplyScalar(radius).add(center);
      positions.setXYZ(index, point.x, point.y, point.z);
    }
  }
  geometry.computeVertexNormals();
  return { geometry, curve };
}

function spotted(base, spot, frequency, threshold) {
  return (color, x, y, z) => {
    const pattern = Math.sin(x * frequency + Math.sin(z * frequency * 0.7) * 2) * Math.sin(z * frequency * 1.3 + y * frequency * 0.6);
    color.copy(base).lerp(spot, THREE.MathUtils.smoothstep(pattern, threshold, threshold + 0.15));
  };
}

export function buildMorayGeometry() {
  const skin = linearColor(0.66, 0.52, 0.14);
  const spot = linearColor(0.12, 0.1, 0.05);
  const belly = linearColor(0.86, 0.78, 0.42);
  const dark = linearColor(0.03, 0.03, 0.02);
  const mouth = linearColor(0.92, 0.66, 0.6);
  const tooth = linearColor(0.98, 0.97, 0.92);
  const neckPoints = [new THREE.Vector3(0, -0.9, -0.2), new THREE.Vector3(0, 0.4, -0.15), new THREE.Vector3(0.25, 1.2, 0.35), new THREE.Vector3(-0.15, 1.75, 1.1), new THREE.Vector3(0, 1.85, 1.9)];
  const { geometry: neck } = tubeAlong(neckPoints, (along) => 0.38 - along * 0.08, 12, 28);
  const colorSkin = spotted(skin, spot, 9, 0.5);
  const parts = [painted(neck, (color, x, y, z) => { colorSkin(color, x, y, z); color.lerp(belly, THREE.MathUtils.smoothstep(z - y * 0.4, -0.2, 0.3) * 0.4); })];
  const head = new THREE.SphereGeometry(0.36, 16, 10).scale(0.8, 0.62, 1.5).translate(0, 1.98, 2.25);
  parts.push(painted(head, colorSkin));
  const jaw = new THREE.SphereGeometry(0.3, 14, 8).scale(0.72, 0.38, 1.45).rotateX(0.38).translate(0, 1.6, 2.28);
  parts.push(painted(jaw, (color, x, y) => color.copy(belly).lerp(mouth, THREE.MathUtils.smoothstep(y, 1.6, 1.72))));
  parts.push(solid(new THREE.CircleGeometry(0.22, 12).scale(0.75, 1, 1).rotateX(-0.9).translate(0, 1.78, 2.55), mouth));
  for (const side of [-1, 1]) {
    parts.push(solid(new THREE.SphereGeometry(0.08, 8, 6).translate(side * 0.2, 2.12, 2.5), dark));
    parts.push(solid(new THREE.SphereGeometry(0.035, 6, 4).translate(side * 0.23, 2.14, 2.55), linearColor(0.95, 0.85, 0.3)));
    for (let fang = 0; fang < 3; fang++) {
      parts.push(solid(new THREE.ConeGeometry(0.03, 0.12, 4).rotateX(Math.PI).translate(side * (0.08 + fang * 0.05), 1.86, 2.75 - fang * 0.12), tooth));
      parts.push(solid(new THREE.ConeGeometry(0.03, 0.12, 4).translate(side * (0.08 + fang * 0.05), 1.7, 2.7 - fang * 0.12), tooth));
    }
  }
  return mergeGeometries(parts);
}

export function buildDenGeometry() {
  const rim = linearColor(0.42, 0.38, 0.32);
  const hole = linearColor(0.02, 0.02, 0.02);
  const parts = [painted(new THREE.CircleGeometry(0.95, 24).rotateX(-Math.PI / 2).translate(0, 0.1, 0), (color, x, y, z) => color.copy(hole).lerp(rim, THREE.MathUtils.smoothstep(Math.hypot(x, z), 0.6, 0.95) * 0.6))];
  for (let stone = 0; stone < 9; stone++) {
    const angle = (stone / 9) * Math.PI * 2;
    const size = 0.26 + 0.08 * Math.sin(stone * 3.7);
    parts.push(painted(new THREE.IcosahedronGeometry(size, 1).scale(1, 0.6, 1).translate(Math.cos(angle) * 0.95, 0.08, Math.sin(angle) * 0.95), (color, x, y) => color.copy(rim).multiplyScalar(0.8 + 0.5 * THREE.MathUtils.smoothstep(y, 0, 0.2))));
  }
  return mergeGeometries(parts);
}

export function buildOctopusGeometry() {
  const skin = linearColor(0.62, 0.24, 0.16);
  const pale = linearColor(0.9, 0.62, 0.48);
  const suckers = linearColor(0.96, 0.82, 0.7);
  const dark = linearColor(0.04, 0.03, 0.03);
  const colorSkin = spotted(skin, pale, 6, 0.6);
  const mantle = new THREE.SphereGeometry(1, 22, 16).scale(0.85, 0.95, 1.15).translate(0, 1.25, -0.55);
  const positions = mantle.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const y = positions.getY(index);
    const lump = 1 + 0.05 * Math.sin(positions.getX(index) * 9) * Math.sin(positions.getZ(index) * 7);
    positions.setXYZ(index, positions.getX(index) * lump, y, positions.getZ(index) * lump - 0.25 * Math.max(0, y - 1.3));
  }
  mantle.computeVertexNormals();
  const parts = [painted(mantle, colorSkin)];
  parts.push(painted(new THREE.SphereGeometry(0.62, 16, 10).scale(1.1, 0.7, 1).translate(0, 0.55, 0.15), colorSkin));
  for (const side of [-1, 1]) {
    parts.push(solid(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 0.8, 1).translate(side * 0.42, 0.95, 0.42), pale));
    parts.push(solid(new THREE.BoxGeometry(0.22, 0.06, 0.05).translate(side * 0.44, 0.97, 0.6), dark));
  }
  for (let arm = 0; arm < 8; arm++) {
    const angle = (arm / 8) * Math.PI * 2 + 0.2;
    const outward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
    const curl = arm % 2 ? 1 : -1;
    const sideways = new THREE.Vector3(outward.z, 0, -outward.x).multiplyScalar(curl);
    const points = [
      outward.clone().multiplyScalar(0.3).setY(0.5),
      outward.clone().multiplyScalar(1.0).setY(0.18),
      outward.clone().multiplyScalar(1.8).addScaledVector(sideways, 0.25).setY(0.12),
      outward.clone().multiplyScalar(2.4).addScaledVector(sideways, 0.7).setY(0.18),
      outward.clone().multiplyScalar(2.3).addScaledVector(sideways, 1.15).setY(0.3),
    ];
    const { geometry } = tubeAlong(points, (along) => 0.24 * (1 - along * 0.85) + 0.02, 7, 16);
    parts.push(painted(geometry, (color, x, y, z) => { colorSkin(color, x, y, z); color.lerp(suckers, THREE.MathUtils.smoothstep(0.2 - y, 0.0, 0.08) * 0.6); }));
  }
  return mergeGeometries(parts);
}

export function buildMantisGeometry() {
  const green = linearColor(0.16, 0.56, 0.28);
  const darkGreen = linearColor(0.08, 0.32, 0.18);
  const teal = linearColor(0.1, 0.55, 0.75);
  const orange = linearColor(1, 0.45, 0.12);
  const red = linearColor(0.92, 0.16, 0.14);
  const dark = linearColor(0.04, 0.04, 0.06);
  const parts = [];
  const body = new THREE.SphereGeometry(1, 18, 24).scale(0.34, 0.2, 0.95).translate(0, 0.3, -0.25);
  const bodyPositions = body.attributes.position;
  for (let index = 0; index < bodyPositions.count; index++) {
    const z = bodyPositions.getZ(index);
    const taper = 1 - 0.4 * THREE.MathUtils.smoothstep(-z, 0.0, 1.2);
    const ridge = 1 + 0.08 * Math.max(0, Math.sin((z + 1.2) * 18));
    bodyPositions.setXYZ(index, bodyPositions.getX(index) * taper * ridge, 0.3 + (bodyPositions.getY(index) - 0.3) * taper * ridge, z);
  }
  body.computeVertexNormals();
  parts.push(painted(body, (color, x, y, z) => {
    const band = 0.5 + 0.5 * Math.sin((z + 1.2) * 18);
    color.copy(green).lerp(darkGreen, THREE.MathUtils.smoothstep(band, 0.6, 0.95) * 0.7).lerp(teal, THREE.MathUtils.smoothstep(z, 0.3, 0.6) * 0.6).lerp(orange, THREE.MathUtils.smoothstep(Math.abs(x), 0.22, 0.32) * 0.8).multiplyScalar(0.8 + 0.3 * THREE.MathUtils.smoothstep(y, 0.3, 0.48));
  }));
  for (const side of [-1, 1]) {
    const fin = new THREE.CircleGeometry(0.42, 8, 0, Math.PI).scale(0.6, 1, 1).rotateX(-Math.PI / 2).rotateY(Math.PI + side * 0.4).translate(side * 0.16, 0.28, -1.1);
    parts.push(painted(fin, (color, x, y, z) => color.copy(orange).lerp(teal, THREE.MathUtils.smoothstep(-z, 1.25, 1.45))));
  }
  parts.push(painted(new THREE.SphereGeometry(0.24, 12, 8).scale(1.1, 0.75, 1.2).translate(0, 0.36, 0.72), (color) => color.copy(teal)));
  for (const side of [-1, 1]) {
    parts.push(solid(new THREE.CylinderGeometry(0.04, 0.045, 0.32, 5).translate(side * 0.12, 0.66, 0.86), orange));
    parts.push(solid(new THREE.SphereGeometry(0.1, 10, 8).scale(1, 1.25, 1).translate(side * 0.12, 0.86, 0.88), dark));
    const upperArm = new THREE.CapsuleGeometry(0.07, 0.42, 3, 6).rotateX(Math.PI / 2 - 0.9).translate(side * 0.22, 0.4, 1.02);
    parts.push(solid(upperArm, red));
    const club = new THREE.SphereGeometry(0.14, 10, 8).scale(1, 0.9, 1.35).translate(side * 0.22, 0.24, 1.28);
    parts.push(painted(club, (color, x, y, z) => color.copy(orange).lerp(linearColor(1, 0.9, 0.6), THREE.MathUtils.smoothstep(z, 1.3, 1.45))));
    for (let pair = 0; pair < 3; pair++) parts.push(solid(new THREE.ConeGeometry(0.03, 0.34, 4).rotateX(Math.PI).rotateZ(side * 0.6).translate(side * 0.3, 0.16, 0.25 - pair * 0.28), orange));
    parts.push(solid(new THREE.ConeGeometry(0.012, 0.7, 4).rotateX(1.1).rotateZ(-side * 0.4).translate(side * 0.14, 0.78, 1.1), orange));
  }
  return mergeGeometries(parts);
}

export function buildLobsterBodyGeometry() {
  const shell = linearColor(0.12, 0.18, 0.36);
  const rust = linearColor(0.62, 0.2, 0.1);
  const underside = linearColor(0.82, 0.5, 0.24);
  const dark = linearColor(0.03, 0.03, 0.04);
  const shade = (color, x, y, z) => color.copy(shell).lerp(rust, 0.35 + 0.35 * Math.sin(x * 5 + z * 2)).lerp(underside, THREE.MathUtils.smoothstep(0.75 - y, 0, 0.25));
  const parts = [];
  const carapace = new THREE.SphereGeometry(1, 24, 14).scale(1.0, 0.8, 1.7).translate(0, 1.05, 0.6);
  parts.push(painted(carapace, shade));
  parts.push(painted(new THREE.ConeGeometry(0.22, 0.9, 6).rotateX(Math.PI / 2).translate(0, 1.35, 2.5), shade));
  for (let segment = 0; segment < 6; segment++) {
    const width = 0.9 - segment * 0.1;
    const plate = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.6).scale(width, 0.55 - segment * 0.04, 0.42).translate(0, 0.75 - segment * 0.05, -1.05 - segment * 0.48);
    parts.push(painted(plate, shade));
  }
  const fan = new THREE.CircleGeometry(0.75, 14, Math.PI * 0.1, Math.PI * 0.8).rotateX(-Math.PI / 2).rotateY(Math.PI).translate(0, 0.55, -3.7);
  parts.push(painted(fan, shade));
  for (const side of [-1, 1]) {
    parts.push(solid(new THREE.SphereGeometry(0.11, 8, 6).translate(side * 0.35, 1.7, 2.0), dark));
    const antenna = tubeAlong([new THREE.Vector3(side * 0.3, 1.5, 2.2), new THREE.Vector3(side * 0.9, 2.2, 3.4), new THREE.Vector3(side * 2.2, 2.0, 4.6), new THREE.Vector3(side * 3.6, 1.2, 4.2)], (along) => 0.07 * (1 - along) + 0.012, 5, 18).geometry;
    parts.push(painted(antenna, (color) => color.copy(rust)));
    for (let pair = 0; pair < 4; pair++) {
      const leg = tubeAlong([new THREE.Vector3(side * 0.7, 0.75, 0.9 - pair * 0.45), new THREE.Vector3(side * 1.5, 0.95, 1.0 - pair * 0.5), new THREE.Vector3(side * 2.0, 0.05, 1.05 - pair * 0.55)], () => 0.08, 5, 8).geometry;
      parts.push(painted(leg, (color) => color.copy(rust).multiplyScalar(0.8)));
    }
  }
  return mergeGeometries(parts);
}

export function buildLobsterClawGeometry() {
  const shell = linearColor(0.14, 0.2, 0.4);
  const rust = linearColor(0.7, 0.24, 0.12);
  const tooth = linearColor(0.96, 0.86, 0.66);
  const shade = (color, x, y, z) => color.copy(shell).lerp(rust, 0.4 + 0.3 * Math.sin(z * 4 + x * 3));
  const arm = tubeAlong([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.5, 0.1, 0.6), new THREE.Vector3(0.6, 0.15, 1.3)], (along) => 0.22 - along * 0.04, 8, 10).geometry;
  const palm = new THREE.SphereGeometry(0.5, 16, 10).scale(0.85, 0.6, 1.4).translate(0.6, 0.2, 2.0);
  const finger = new THREE.ConeGeometry(0.22, 1.1, 8).rotateX(Math.PI / 2).translate(0.75, 0.15, 3.05);
  const thumb = new THREE.ConeGeometry(0.18, 0.95, 8).rotateX(Math.PI / 2).translate(0.35, 0.3, 2.95);
  const parts = [painted(arm, shade), painted(palm, shade), painted(finger, (color, x, y, z) => color.copy(rust).lerp(tooth, THREE.MathUtils.smoothstep(z, 3.2, 3.6))), painted(thumb, (color, x, y, z) => color.copy(rust).lerp(tooth, THREE.MathUtils.smoothstep(z, 3.1, 3.4)))];
  return mergeGeometries(parts);
}

export const TELEGRAPH_VERTEX_GLSL = `
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const TELEGRAPH_FRAGMENT_GLSL = `
uniform float uProgress;
uniform float uOpacity;
varying vec2 vLocal;
void main() {
  float radius = length(vLocal);
  float edge = smoothstep(0.88, 0.93, radius) * (1.0 - smoothstep(0.97, 1.0, radius));
  float fill = (1.0 - smoothstep(uProgress - 0.04, uProgress, radius)) * 0.5;
  float urgent = smoothstep(0.75, 1.0, uProgress);
  edge *= 0.8 + 0.2 * urgent;
  float alpha = max(edge, (fill + 0.12) * (1.0 - smoothstep(0.97, 1.0, radius))) * uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vec3(1.0, 0.22 + 0.2 * urgent, 0.06) * (0.9 + 0.7 * edge), alpha);
}
`;

export const INK_FRAGMENT_GLSL = `
uniform float uOpacity;
uniform float uTime;
varying vec2 vLocal;
void main() {
  float radius = length(vLocal);
  float swirl = 0.5 + 0.5 * sin(atan(vLocal.y, vLocal.x) * 5.0 + radius * 9.0 - uTime * 1.6);
  float body = 1.0 - smoothstep(0.45 + 0.25 * swirl, 1.0, radius);
  float alpha = body * uOpacity * 0.85;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vec3(0.02, 0.02, 0.05) + vec3(0.03, 0.03, 0.07) * swirl, alpha);
}
`;

