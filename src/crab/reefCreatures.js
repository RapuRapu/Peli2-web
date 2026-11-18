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
  float inside = 1.0 - smoothstep(0.985, 1.0, radius);
  float outline = smoothstep(0.9, 0.93, radius) * inside;
  float edge = smoothstep(0.8, 0.84, radius) * (1.0 - smoothstep(0.9, 0.93, radius));
  float urgent = smoothstep(0.75, 1.0, uProgress);
  float fill = (1.0 - smoothstep(uProgress - 0.04, uProgress, radius)) * inside;
  vec3 color = vec3(0.62, 0.02, 0.02);
  float alpha = (0.18 + 0.5 * fill) * inside;
  color = mix(color, vec3(1.0, 0.95, 0.9), edge * (0.85 + 0.15 * urgent));
  alpha = max(alpha, edge);
  color = mix(color, vec3(0.08, 0.0, 0.0), outline);
  alpha = max(alpha, outline * 0.9);
  alpha *= uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
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


export function buildRatGeometry() {
  const fur = linearColor(0.36, 0.31, 0.27);
  const belly = linearColor(0.62, 0.56, 0.5);
  const pink = linearColor(0.9, 0.6, 0.6);
  const dark = linearColor(0.03, 0.03, 0.03);
  const shadeFur = (color, x, y, z) => color.copy(fur).lerp(belly, THREE.MathUtils.smoothstep(1.0 - y, 0, 0.45) * 0.7).multiplyScalar(0.9 + 0.12 * Math.sin(x * 23 + z * 17));
  const body = new THREE.SphereGeometry(1, 20, 14).scale(1.05, 0.95, 2.0).translate(0, 1.05, -0.2);
  const head = new THREE.SphereGeometry(0.75, 16, 12).scale(0.9, 0.85, 1.35).translate(0, 1.2, 1.9);
  const snout = new THREE.ConeGeometry(0.42, 0.9, 12).rotateX(Math.PI / 2).translate(0, 1.08, 2.85);
  const parts = [painted(body, shadeFur), painted(head, shadeFur), painted(snout, shadeFur), solid(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.1, 3.3), pink)];
  for (const side of [-1, 1]) {
    parts.push(painted(new THREE.SphereGeometry(0.42, 12, 8).scale(1, 1, 0.3).rotateY(side * 0.5).translate(side * 0.5, 1.85, 1.55), (color, x, y, z) => color.copy(pink).lerp(fur, 0.35)));
    parts.push(solid(new THREE.SphereGeometry(0.12, 8, 6).translate(side * 0.38, 1.42, 2.35), dark));
    for (const along of [-1.2, 0.9]) parts.push(solid(new THREE.CylinderGeometry(0.16, 0.12, 0.9, 6).translate(side * 0.7, 0.35, along), fur));
    for (let whisker = 0; whisker < 3; whisker++) parts.push(solid(new THREE.CylinderGeometry(0.01, 0.01, 1.1, 3).rotateZ(Math.PI / 2 + side * (0.2 - whisker * 0.2)).translate(side * 0.55, 1.12, 3.05), linearColor(0.85, 0.85, 0.82)));
  }
  const tail = tubeAlong([new THREE.Vector3(0, 0.9, -2.0), new THREE.Vector3(0.4, 0.4, -3.2), new THREE.Vector3(-0.5, 0.2, -4.6), new THREE.Vector3(0.6, 0.18, -5.8)], (along) => 0.18 * (1 - along) + 0.03, 6, 20).geometry;
  parts.push(painted(tail, (color) => color.copy(pink).lerp(fur, 0.3)));
  return mergeGeometries(parts);
}

export function buildCatGeometry() {
  const orange = linearColor(0.92, 0.5, 0.18);
  const stripe = linearColor(0.55, 0.24, 0.07);
  const white = linearColor(0.96, 0.93, 0.86);
  const pink = linearColor(0.95, 0.6, 0.6);
  const eye = linearColor(0.45, 0.85, 0.2);
  const dark = linearColor(0.03, 0.03, 0.02);
  const tabby = (color, x, y, z) => {
    color.copy(orange).lerp(stripe, THREE.MathUtils.smoothstep(Math.sin(z * 1.6 + Math.sin(x * 0.8) * 1.5), 0.45, 0.75) * 0.8);
    color.lerp(white, THREE.MathUtils.smoothstep(2.4 - y, 0, 1.2) * 0.85);
  };
  const body = new THREE.SphereGeometry(1, 28, 18).scale(3.4, 2.6, 6.2).translate(0, 3.0, -1.2);
  const chest = new THREE.SphereGeometry(1, 20, 14).scale(2.8, 3.0, 2.8).translate(0, 4.0, 3.2);
  const head = new THREE.SphereGeometry(2.4, 24, 18).scale(1.05, 0.9, 0.95).translate(0, 6.6, 5.6);
  const muzzle = new THREE.SphereGeometry(1.1, 16, 10).scale(1.2, 0.75, 0.9).translate(0, 5.8, 7.6);
  const parts = [painted(body, tabby), painted(chest, (color, x, y, z) => color.copy(white).lerp(orange, THREE.MathUtils.smoothstep(Math.abs(x), 1.6, 2.6))), painted(head, tabby), solid(muzzle, white)];
  parts.push(solid(new THREE.SphereGeometry(0.3, 10, 8).scale(1.2, 0.8, 1).translate(0, 6.2, 8.5), pink));
  for (const side of [-1, 1]) {
    parts.push(painted(new THREE.ConeGeometry(0.95, 1.9, 4).rotateY(Math.PI / 4).translate(side * 1.5, 8.6, 5.2), (color, x, y) => color.copy(orange).lerp(pink, THREE.MathUtils.smoothstep(y, 8, 8.8) * 0.4)));
    parts.push(solid(new THREE.SphereGeometry(0.48, 12, 10).scale(1, 0.75, 0.6).translate(side * 0.95, 7.0, 7.65), eye));
    parts.push(solid(new THREE.SphereGeometry(0.22, 8, 8).scale(0.45, 1, 0.5).translate(side * 0.95, 7.0, 7.95), dark));
    for (let whisker = 0; whisker < 3; whisker++) parts.push(solid(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 3).rotateZ(Math.PI / 2 + side * (0.15 - whisker * 0.15)).translate(side * 2.2, 5.9, 8.2), white));
    parts.push(painted(new THREE.CylinderGeometry(0.75, 0.85, 3.4, 10).translate(side * 1.6, 1.7, 4.0), tabby));
    parts.push(solid(new THREE.SphereGeometry(0.95, 12, 8).scale(1, 0.55, 1.3).translate(side * 1.6, 0.4, 4.6), white));
    parts.push(painted(new THREE.SphereGeometry(1.4, 14, 10).scale(1, 1.1, 1.6).translate(side * 2.3, 1.6, -3.4), tabby));
    parts.push(solid(new THREE.SphereGeometry(0.9, 12, 8).scale(1, 0.5, 1.5).translate(side * 2.1, 0.35, -2.0), white));
  }
  const tail = tubeAlong([new THREE.Vector3(0, 2.6, -7.0), new THREE.Vector3(2.4, 0.8, -8.6), new THREE.Vector3(5.2, 0.7, -7.6), new THREE.Vector3(6.4, 1.0, -4.8)], (along) => 0.85 - along * 0.35, 10, 24).geometry;
  parts.push(painted(tail, (color, x, y, z) => { tabby(color, x, y + 2, x * 1.4); }));
  return mergeGeometries(parts);
}

export function buildCockroachGeometry() {
  const shell = linearColor(0.36, 0.17, 0.07);
  const edge = linearColor(0.62, 0.36, 0.16);
  const dark = linearColor(0.08, 0.05, 0.03);
  const body = new THREE.SphereGeometry(1, 20, 12).scale(1.0, 0.42, 1.65).translate(0, 0.62, -0.3);
  const parts = [painted(body, (color, x, y, z) => color.copy(shell).lerp(edge, THREE.MathUtils.smoothstep(Math.abs(x), 0.65, 0.95) * 0.7).lerp(dark, Math.abs(x) < 0.05 ? 0.7 : 0).multiplyScalar(0.8 + 0.4 * THREE.MathUtils.smoothstep(y, 0.6, 1.0)))];
  parts.push(painted(new THREE.SphereGeometry(0.62, 14, 10).scale(1.1, 0.45, 0.8).translate(0, 0.62, 1.45), (color, x, y, z) => color.copy(edge).lerp(dark, THREE.MathUtils.smoothstep(z, 1.6, 1.9))));
  for (const side of [-1, 1]) {
    parts.push(painted(tubeAlong([new THREE.Vector3(side * 0.2, 0.6, 1.9), new THREE.Vector3(side * 0.9, 1.1, 3.0), new THREE.Vector3(side * 1.9, 0.9, 4.0), new THREE.Vector3(side * 2.8, 0.6, 4.4)], (along) => 0.04 * (1 - along) + 0.012, 4, 14).geometry, (color) => color.copy(edge)));
    for (let pair = 0; pair < 3; pair++) {
      const z = 0.9 - pair * 0.8;
      parts.push(painted(tubeAlong([new THREE.Vector3(side * 0.7, 0.5, z), new THREE.Vector3(side * 1.5, 0.8, z + (1 - pair) * 0.4), new THREE.Vector3(side * 2.1, 0.0, z + (1 - pair) * 0.8)], (along) => 0.09 * (1 - along * 0.6), 5, 8).geometry, (color) => color.copy(dark)));
    }
  }
  return mergeGeometries(parts);
}

export function buildCookLegGeometry() {
  const boot = linearColor(0.12, 0.09, 0.08);
  const trousers = linearColor(0.42, 0.46, 0.6);
  const stripe = linearColor(0.84, 0.82, 0.74);
  const apron = linearColor(0.94, 0.92, 0.86);
  const stain = linearColor(0.62, 0.4, 0.26);
  const parts = [];
  const sole = linearColor(0.06, 0.04, 0.03);
  const lace = linearColor(0.82, 0.76, 0.6);
  parts.push(painted(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(3.1, 3.0, 4.2).translate(0, 1.0, 3.0), (color, x, y, z) => color.copy(boot).multiplyScalar(0.7 + 0.5 * THREE.MathUtils.smoothstep(y, 1.5, 3.6) + 0.25 * THREE.MathUtils.smoothstep(z, 5, 7))));
  parts.push(painted(new THREE.BoxGeometry(6.6, 1.0, 12.6, 4, 1, 8).translate(0, 0.5, 1.6), (color) => color.copy(sole)));
  parts.push(painted(new THREE.BoxGeometry(5.6, 2.2, 3.2).translate(0, 1.1, -3.6), (color) => color.copy(sole).multiplyScalar(1.6)));
  parts.push(painted(new THREE.CylinderGeometry(3.1, 3.2, 11, 22).translate(0, 6.5, 0), (color, x, y, z) => color.copy(boot).multiplyScalar(0.75 + 0.3 * THREE.MathUtils.smoothstep(z, -1, 3))));
  for (let row = 0; row < 5; row++) for (const tilt of [-0.45, 0.45]) parts.push(painted(new THREE.BoxGeometry(2.2, 0.16, 0.12).rotateZ(tilt).translate(0, 3.6 + row * 1.5, 3.12), (color) => color.copy(lace)));
  parts.push(painted(new THREE.TorusGeometry(3.4, 0.55, 8, 24).rotateX(Math.PI / 2).translate(0, 12.4, 0), (color) => color.copy(trousers).multiplyScalar(0.7)));
  parts.push(painted(new THREE.CylinderGeometry(3.6, 3.4, 34, 28, 6).translate(0, 29, 0), (color, x, y, z) => color.copy(Math.sin(Math.atan2(z, x) * 8) > 0.35 ? stripe : trousers)));
  const apronPanel = new THREE.CylinderGeometry(5.2, 6.4, 26, 24, 6, true, -Math.PI * 0.55, Math.PI * 1.1).translate(0, 32, 0);
  parts.push(painted(apronPanel, (color, x, y, z) => color.copy(apron).lerp(stain, THREE.MathUtils.smoothstep(Math.sin(x * 0.7 + y * 0.4) * Math.sin(y * 0.9 - x * 0.3), 0.6, 0.9) * 0.7).multiplyScalar(0.82 + 0.18 * THREE.MathUtils.smoothstep(z, -2, 5))));
  return mergeGeometries(parts);
}

export function buildCleaverGeometry() {
  const steel = linearColor(0.78, 0.8, 0.84);
  const dark = linearColor(0.3, 0.31, 0.33);
  const wood = linearColor(0.32, 0.18, 0.08);
  const blade = new THREE.BoxGeometry(0.5, 7, 13, 1, 4, 8).translate(0, 3.5, 0);
  const parts = [painted(blade, (color, x, y) => color.copy(steel).lerp(dark, THREE.MathUtils.smoothstep(y, 5.5, 7) * 0.8).multiplyScalar(y < 0.6 ? 1.25 : 1))];
  parts.push(painted(new THREE.CylinderGeometry(0.9, 1.0, 9, 10).rotateX(Math.PI / 2).translate(0, 6.2, -11), (color) => color.copy(wood)));
  return mergeGeometries(parts);
}

export const LINE_TELEGRAPH_FRAGMENT_GLSL = `
uniform float uProgress;
uniform float uOpacity;
varying vec2 vLocal;
void main() {
  vec2 local = abs(vLocal);
  float inside = 1.0 - smoothstep(0.985, 1.0, max(local.x, local.y));
  float outline = smoothstep(0.92, 0.95, max(local.x, local.y)) * inside;
  float edge = smoothstep(0.84, 0.87, max(local.x, local.y)) * (1.0 - smoothstep(0.92, 0.95, max(local.x, local.y)));
  float urgent = smoothstep(0.75, 1.0, uProgress);
  float sweep = uProgress * 2.0 - 1.0;
  float fill = (1.0 - smoothstep(sweep - 0.04, sweep, vLocal.y)) * inside;
  vec3 color = vec3(0.62, 0.02, 0.02);
  float alpha = (0.18 + 0.5 * fill) * inside;
  color = mix(color, vec3(1.0, 0.95, 0.9), edge * (0.85 + 0.15 * urgent));
  alpha = max(alpha, edge);
  color = mix(color, vec3(0.08, 0.0, 0.0), outline);
  alpha = max(alpha, outline * 0.9);
  alpha *= uOpacity;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);
}
`;
