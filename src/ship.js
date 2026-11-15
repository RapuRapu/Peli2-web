import * as THREE from 'three';
import { waveHeightAt } from './ocean.js';
import { smoothstep } from './noise.js';

const HULL_LENGTH = 18;
const HALF_BEAM = 2.7;
const KEEL_DEPTH = 2.1;
const DRAFT = 1.7;
const MAST_POSITION_Z = 2.2;
const MAST_HEIGHT = 17;
const BOOM_HEIGHT = 3.0;
const BOOM_LENGTH = 10.5;
const VISUAL_SCALE = 1.35;
const MAX_BOOM_ANGLE = 1.0;

const RAIL_CAP = new THREE.Color(0.1, 0.065, 0.04);
const BULWARK_PAINT = new THREE.Color(0.6, 0.42, 0.16);
const WALE_BLACK = new THREE.Color(0.06, 0.05, 0.045);
const HULL_WOOD = new THREE.Color(0.34, 0.2, 0.11);
const BOTTOM_PAINT = new THREE.Color(0.78, 0.74, 0.64);
const DECK_WOOD = new THREE.Color(0.4, 0.27, 0.16);
const SAILCLOTH = new THREE.Color(0.76, 0.69, 0.55);
const SPAR_WOOD = new THREE.Color(0.32, 0.21, 0.12);
const IRON = new THREE.Color(0.17, 0.17, 0.17);

function hullHalfBeam(t) {
  const sternWidth = 0.6 + 0.4 * smoothstep(0, 0.35, t);
  if (t <= 0.5) return HALF_BEAM * sternWidth;
  return HALF_BEAM * Math.pow(Math.max(0, 1 - smoothstep(0.5, 1, t)), 0.62);
}

function hullSheer(t) {
  return 2.0 + 0.9 * Math.pow(t - 0.45, 2) * 2.2 + (t < 0.12 ? (0.12 - t) * 4 : 0) + smoothstep(0.75, 1, t) * 0.7;
}

function hullKeel(t) {
  return -KEEL_DEPTH * (1 - smoothstep(0.8, 1.0, t) * 0.8) + (t < 0.05 ? 0.2 : 0);
}

function sectionPoint(t, s, side) {
  const halfBeam = hullHalfBeam(t);
  const sheer = hullSheer(t);
  const keel = hullKeel(t);
  const tumbleHome = 1 - 0.06 * Math.pow(1 - s, 6);
  const x = side * halfBeam * Math.pow(Math.cos((s * Math.PI) / 2), 0.55) * tumbleHome;
  const y = sheer + (keel - sheer) * Math.pow(s, 1.35);
  const z = (t - 0.5) * HULL_LENGTH;
  return [x, y, z];
}

function hullColorFor(y, sheer) {
  if (y < 0.1) return BOTTOM_PAINT;
  if (y > sheer - 0.14) return RAIL_CAP;
  if (y > sheer - 0.62) return BULWARK_PAINT;
  if (y > sheer - 0.85) return WALE_BLACK;
  if (y > sheer - 1.25) return HULL_WOOD;
  if (y > sheer - 1.4) return WALE_BLACK;
  return HULL_WOOD;
}

export function buildHullGeometry() {
  const lengthSteps = 36;
  const ringSteps = 18;
  const positions = [];
  const colors = [];
  const indices = [];
  const ringVertexCount = ringSteps * 2 + 1;

  for (let i = 0; i <= lengthSteps; i++) {
    const t = i / lengthSteps;
    const sheer = hullSheer(t);
    for (let j = 0; j <= ringSteps * 2; j++) {
      const side = j <= ringSteps ? -1 : 1;
      const s = j <= ringSteps ? j / ringSteps : (ringSteps * 2 - j) / ringSteps;
      const point = sectionPoint(t, s, side);
      positions.push(...point);
      const color = hullColorFor(point[1], sheer);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let i = 0; i < lengthSteps; i++) {
    for (let j = 0; j < ringSteps * 2; j++) {
      const a = i * ringVertexCount + j;
      const b = a + ringVertexCount;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }

  const transomCenterIndex = positions.length / 3;
  positions.push(0, (hullSheer(0) + hullKeel(0)) * 0.5, -HULL_LENGTH / 2);
  colors.push(HULL_WOOD.r, HULL_WOOD.g, HULL_WOOD.b);
  for (let j = 0; j < ringSteps * 2; j++) indices.push(transomCenterIndex, j + 1, j);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createDeckPlankTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 128, 128);
  for (let plank = 0; plank < 8; plank++) {
    const shade = 225 + ((plank * 37) % 30);
    context.fillStyle = `rgb(${shade},${shade},${shade})`;
    context.fillRect(plank * 16 + 1, 0, 14, 128);
    context.fillStyle = 'rgba(40,25,15,0.55)';
    context.fillRect(plank * 16, ((plank * 53) % 128), 16, 1.5);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function buildDeckGeometry() {
  const lengthSteps = 30;
  const positions = [];
  const uvs = [];
  const indices = [];
  const deckInset = 0.2;
  const plankRepeatMeters = 2.4;
  for (let i = 0; i <= lengthSteps; i++) {
    const t = i / lengthSteps;
    const halfBeam = Math.max(0, hullHalfBeam(t) - deckInset);
    const deckHeight = hullSheer(t) - 0.6;
    const z = (t - 0.5) * HULL_LENGTH;
    positions.push(-halfBeam, deckHeight, z, halfBeam, deckHeight, z);
    uvs.push(-halfBeam / plankRepeatMeters, z / plankRepeatMeters, halfBeam / plankRepeatMeters, z / plankRepeatMeters);
  }
  for (let i = 0; i < lengthSteps; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildSailGeometry(corners, columns, rows, camber) {
  const [tackPoint, clewPoint, peakPoint, throatPoint] = corners.map((corner) => new THREE.Vector3(...corner));
  const positions = [];
  const colors = [];
  const indices = [];
  const bottom = new THREE.Vector3();
  const top = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      bottom.lerpVectors(tackPoint, clewPoint, u);
      top.lerpVectors(throatPoint, peakPoint, u);
      point.lerpVectors(bottom, top, v);
      const belly = Math.sin(Math.pow(u, 0.8) * Math.PI) * (0.6 + 0.4 * Math.sin(v * Math.PI));
      point.x += belly * camber;
      positions.push(point.x, point.y, point.z);
      const seam = Math.abs(((u * 6) % 1) - 0.5) > 0.42 ? 0.9 : 1;
      const edgeShade = 0.86 + 0.14 * belly;
      colors.push(SAILCLOTH.r * seam * edgeShade, SAILCLOTH.g * seam * edgeShade, SAILCLOTH.b * seam * edgeShade);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function spar(length, radius, material) {
  const geometry = new THREE.CylinderGeometry(radius * 0.75, radius, length, 8);
  geometry.translate(0, length / 2, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

function createJollyRogerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 80;
  const context = canvas.getContext('2d');
  context.fillStyle = '#1b1a19';
  context.fillRect(0, 0, 128, 80);
  context.strokeStyle = '#e9e2d0';
  context.lineWidth = 7;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(38, 60); context.lineTo(90, 24);
  context.moveTo(38, 24); context.lineTo(90, 60);
  context.stroke();
  context.fillStyle = '#e9e2d0';
  context.beginPath();
  context.arc(64, 33, 15, 0, Math.PI * 2);
  context.fill();
  context.fillRect(56, 40, 16, 12);
  context.fillStyle = '#1b1a19';
  context.beginPath();
  context.arc(58, 32, 4, 0, Math.PI * 2);
  context.arc(70, 32, 4, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createHullContactRing() {
  const ringLength = HULL_LENGTH * 1.18;
  const ringWidth = HALF_BEAM * 2 * 1.55;
  const geometry = new THREE.PlaneGeometry(ringWidth, ringLength, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, speedFraction: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 ringUv;
      varying vec3 worldPosition;
      void main() {
        ringUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        worldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float speedFraction;
      varying vec2 ringUv;
      varying vec3 worldPosition;
      float hash(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
      float valueNoise(vec2 p) {
        vec2 cell = floor(p); vec2 local = fract(p); vec2 blend = local * local * (3.0 - 2.0 * local);
        return mix(mix(hash(cell), hash(cell + vec2(1, 0)), blend.x), mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), blend.x), blend.y);
      }
      void main() {
        vec2 centered = ringUv * 2.0 - 1.0;
        float bowward = centered.y;
        float pointedX = centered.x / mix(1.0, 0.35, smoothstep(0.1, 1.0, bowward));
        float radial = length(vec2(pointedX, centered.y));
        float shadowMask = 1.0 - smoothstep(0.55, 0.95, radial);
        float rim = smoothstep(0.62, 0.8, radial) * (1.0 - smoothstep(0.84, 1.0, radial));
        float noise = valueNoise(worldPosition.xz * 1.6 + vec2(time * 0.9, -time * 0.7));
        float bowBoost = 0.3 + 1.1 * smoothstep(0.3, 0.9, bowward) + 0.6 * smoothstep(-0.55, -0.9, bowward);
        float foam = rim * smoothstep(0.3, 0.7, noise + 0.2) * (0.35 + 0.65 * speedFraction) * bowBoost;
        vec3 color = mix(vec3(0.01, 0.06, 0.09), vec3(0.95, 0.97, 0.98), clamp(foam * 1.4, 0.0, 1.0));
        float alpha = max(shadowMask * 0.38, clamp(foam, 0.0, 0.9));
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  mesh.position.set(0, 0.14, 0.4);
  return mesh;
}

export function createShip(scene, sunDirection) {
  const root = new THREE.Group();
  const hullMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  const deckMaterial = new THREE.MeshStandardMaterial({ color: DECK_WOOD, map: createDeckPlankTexture(), roughness: 0.9 });
  const sparMaterial = new THREE.MeshStandardMaterial({ color: SPAR_WOOD, roughness: 0.8 });
  const sailMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, emissive: new THREE.Color(0.05, 0.04, 0.025) });
  const ironMaterial = new THREE.MeshStandardMaterial({ color: IRON, roughness: 0.55, metalness: 0.5 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 1 });

  const hull = new THREE.Mesh(buildHullGeometry(), hullMaterial);
  hull.castShadow = true;
  hull.receiveShadow = true;
  root.add(hull);

  const deck = new THREE.Mesh(buildDeckGeometry(), deckMaterial);
  deck.receiveShadow = true;
  root.add(deck);

  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.7), new THREE.MeshStandardMaterial({ color: HULL_WOOD, roughness: 0.85 }));
  rudder.position.set(0, -0.7, -HULL_LENGTH / 2 - 0.15);
  root.add(rudder);
  const tiller = spar(2.4, 0.08, sparMaterial);
  tiller.rotation.x = Math.PI / 2 - 0.1;
  tiller.position.set(0, hullSheer(0.03) - 0.45, -HULL_LENGTH / 2 + 0.4);
  root.add(tiller);

  const quarterdeckLength = 3.6;
  const quarterdeck = new THREE.Mesh(new THREE.BoxGeometry(hullHalfBeam(0.12) * 1.75, 0.75, quarterdeckLength), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.3, 0.19, 0.11), roughness: 0.85 }));
  quarterdeck.position.set(0, hullSheer(0.15) - 0.3, -HULL_LENGTH / 2 + 1.0 + quarterdeckLength / 2 + 0.6);
  quarterdeck.castShadow = true;
  root.add(quarterdeck);
  const quarterdeckRoof = new THREE.Mesh(new THREE.BoxGeometry(hullHalfBeam(0.12) * 1.8, 0.1, quarterdeckLength + 0.2), deckMaterial);
  quarterdeckRoof.position.copy(quarterdeck.position).setY(quarterdeck.position.y + 0.42);
  root.add(quarterdeckRoof);

  const barrelGeometry = new THREE.CylinderGeometry(0.33, 0.33, 0.85, 10);
  const barrelMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.45, 0.3, 0.16), roughness: 0.8 });
  for (const [x, t] of [[1.3, 0.44], [1.0, 0.47], [-1.25, 0.46], [0.9, 0.81]]) {
    const barrel = new THREE.Mesh(barrelGeometry, barrelMaterial);
    barrel.position.set(x, hullSheer(t) - 0.6 + 0.42, (t - 0.5) * HULL_LENGTH);
    barrel.castShadow = true;
    root.add(barrel);
  }
  const capstan = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.9, 10), sparMaterial);
  capstan.position.set(0, hullSheer(0.72) - 0.6 + 0.45, (0.72 - 0.5) * HULL_LENGTH);
  root.add(capstan);

  const deckHeightAtMast = hullSheer(MAST_POSITION_Z / HULL_LENGTH + 0.5) - 0.6;
  const mast = spar(MAST_HEIGHT, 0.26, sparMaterial);
  mast.position.set(0, deckHeightAtMast, MAST_POSITION_Z);
  root.add(mast);

  const bowsprit = spar(7, 0.17, sparMaterial);
  bowsprit.position.set(0, hullSheer(1) - 0.35, HULL_LENGTH / 2 - 0.8);
  bowsprit.rotation.x = Math.PI / 2 - 0.2;
  root.add(bowsprit);
  const bowspritTip = new THREE.Vector3(0, 7, 0).applyEuler(bowsprit.rotation).add(bowsprit.position);

  const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 1.8), new THREE.MeshStandardMaterial({ color: HULL_WOOD, roughness: 0.85 }));
  hatch.position.set(0, hullSheer(0.38) - 0.45, (0.38 - 0.5) * HULL_LENGTH);
  hatch.castShadow = true;
  root.add(hatch);

  const cannonGeometry = new THREE.CylinderGeometry(0.11, 0.16, 1.0, 8);
  cannonGeometry.rotateZ(Math.PI / 2);
  const gunportGeometry = new THREE.BoxGeometry(0.06, 0.42, 0.5);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const t = 0.27 + i * 0.12;
      const portHeight = hullSheer(t) - 0.4;
      const sideX = side * hullHalfBeam(t);
      const gunport = new THREE.Mesh(gunportGeometry, darkMaterial);
      gunport.position.set(sideX * 0.995, portHeight, (t - 0.5) * HULL_LENGTH);
      root.add(gunport);
      const cannon = new THREE.Mesh(cannonGeometry, ironMaterial);
      cannon.position.set(sideX + side * 0.2, portHeight, (t - 0.5) * HULL_LENGTH);
      root.add(cannon);
    }
  }

  const mainsailPivot = new THREE.Group();
  mainsailPivot.position.set(0, deckHeightAtMast, MAST_POSITION_Z);
  root.add(mainsailPivot);

  const boom = spar(BOOM_LENGTH, 0.2, sparMaterial);
  boom.rotation.x = -Math.PI / 2;
  boom.position.y = BOOM_HEIGHT;
  mainsailPivot.add(boom);

  const gaffLength = 6.8;
  const gaffThroatHeight = MAST_HEIGHT - 3.4;
  const gaffAngle = 0.45;
  const gaff = spar(gaffLength, 0.17, sparMaterial);
  gaff.position.y = gaffThroatHeight;
  gaff.rotation.x = -Math.PI / 2 + gaffAngle;
  mainsailPivot.add(gaff);
  const gaffPeak = new THREE.Vector3(0, gaffThroatHeight + Math.sin(gaffAngle) * gaffLength, -Math.cos(gaffAngle) * gaffLength);

  const mainsail = new THREE.Mesh(buildSailGeometry(
    [[0, BOOM_HEIGHT + 0.2, -0.3], [0, BOOM_HEIGHT + 0.2, -BOOM_LENGTH + 0.3], [gaffPeak.x, gaffPeak.y - 0.25, gaffPeak.z + 0.2], [0, gaffThroatHeight - 0.15, -0.3]],
    12, 12, 1.5,
  ), sailMaterial);
  mainsail.castShadow = true;
  mainsailPivot.add(mainsail);

  const forestayTop = new THREE.Vector3(0, deckHeightAtMast + MAST_HEIGHT - 2.2, MAST_POSITION_Z);
  const forestay = forestayTop.clone().sub(bowspritTip);
  const forestayLength = forestay.length();
  const jibPivot = new THREE.Group();
  jibPivot.position.copy(bowspritTip);
  jibPivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), forestay.clone().normalize());
  root.add(jibPivot);
  const jibClewLocal = new THREE.Vector3(0, forestayLength * 0.08, -forestayLength * 0.5);
  const jib = new THREE.Mesh(buildSailGeometry(
    [[0, 0.6, 0], [jibClewLocal.x, jibClewLocal.y, jibClewLocal.z], [0, forestayLength * 0.92, 0], [0, forestayLength * 0.92, 0]],
    8, 10, 1.0,
  ), sailMaterial);
  jib.castShadow = true;
  jibPivot.add(jib);
  const jibClewMarker = new THREE.Object3D();
  jibClewMarker.position.copy(jibClewLocal);
  jib.add(jibClewMarker);

  const flagGeometry = new THREE.PlaneGeometry(1.9, 1.2, 8, 1);
  flagGeometry.translate(-0.95, 0, 0);
  const flagRestPositions = Float32Array.from(flagGeometry.attributes.position.array);
  const flag = new THREE.Mesh(flagGeometry, new THREE.MeshStandardMaterial({ map: createJollyRogerTexture(), side: THREE.DoubleSide, roughness: 1 }));
  flag.position.set(0, deckHeightAtMast + MAST_HEIGHT + 0.2, MAST_POSITION_Z);
  root.add(flag);

  const rigLineMaterial = new THREE.LineBasicMaterial({ color: 0x2a2018 });
  const rigPoints = [];
  const mastTop = new THREE.Vector3(0, deckHeightAtMast + MAST_HEIGHT, MAST_POSITION_Z);
  rigPoints.push(bowspritTip, forestayTop);
  for (const side of [-1, 1]) {
    for (const t of [0.52, 0.6]) {
      rigPoints.push(mastTop, new THREE.Vector3(side * hullHalfBeam(t), hullSheer(t), (t - 0.5) * HULL_LENGTH));
    }
  }
  const standingRigging = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rigPoints), rigLineMaterial);
  root.add(standingRigging);

  const sheetPositions = new Float32Array(12);
  const sheetGeometry = new THREE.BufferGeometry();
  sheetGeometry.setAttribute('position', new THREE.BufferAttribute(sheetPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const sheets = new THREE.LineSegments(sheetGeometry, rigLineMaterial);
  sheets.frustumCulled = false;
  root.add(sheets);
  const mainSheetAnchor = new THREE.Vector3(0, hullSheer(0.04) - 0.3, -HULL_LENGTH / 2 + 0.6);
  const jibSheetAnchorZ = (0.6 - 0.5) * HULL_LENGTH;

  const contactRing = createHullContactRing();
  root.add(contactRing);

  const brokenMastStump = spar(4.2, 0.27, sparMaterial);
  brokenMastStump.position.copy(mast.position);
  brokenMastStump.rotation.z = 0.12;
  brokenMastStump.visible = false;
  root.add(brokenMastStump);

  root.scale.setScalar(VISUAL_SCALE);
  scene.add(root);

  const hullHole = new THREE.Mesh(new THREE.CircleGeometry(1, 9), new THREE.MeshBasicMaterial({ color: 0x0d0805, side: THREE.DoubleSide }));
  hullHole.scale.set(1.3, 0.8, 1);
  hullHole.position.set(HALF_BEAM * 1.005, 0.9, -1.5);
  hullHole.rotation.y = Math.PI / 2;
  hullHole.visible = false;
  root.add(hullHole);

  function setDamaged(isDamaged) {
    for (const part of [mast, mainsailPivot, jibPivot, flag, standingRigging, sheets, contactRing]) part.visible = !isDamaged;
    for (const part of [brokenMastStump, hullHole]) part.visible = isDamaged;
  }

  const sailShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: 'varying vec2 shadowUv; void main() { shadowUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec2 shadowUv;
        void main() {
          vec2 centered = shadowUv * 2.0 - 1.0;
          float falloff = 1.0 - smoothstep(0.35, 1.0, length(centered));
          float alongShadow = shadowUv.y;
          float width = mix(0.35, 1.0, smoothstep(0.0, 0.35, alongShadow)) * mix(1.0, 0.55, smoothstep(0.6, 1.0, alongShadow));
          float across = abs(centered.x) / width;
          float soft = (1.0 - smoothstep(0.5, 1.0, across)) * smoothstep(0.0, 0.08, alongShadow) * (1.0 - smoothstep(0.75, 1.0, alongShadow));
          gl_FragColor = vec4(0.0, 0.03, 0.06, soft * 0.15);
        }`,
    }),
  );
  sailShadow.renderOrder = 2;
  const sunHorizontalLength = Math.hypot(sunDirection.x, sunDirection.z);
  const shadowReach = ((MAST_HEIGHT * 0.55 * VISUAL_SCALE) / sunDirection.y) * sunHorizontalLength;
  const shadowOffsetX = (-sunDirection.x / sunHorizontalLength) * shadowReach;
  const shadowOffsetZ = (-sunDirection.z / sunHorizontalLength) * shadowReach;
  const shadowAngle = Math.atan2(-shadowOffsetX, -shadowOffsetZ);
  const shadowLength = shadowReach * 1.35;

  function updateSailShadow(x, z, heading, waterHeight) {
    sailShadow.position.set(x + shadowOffsetX * 0.62, waterHeight + 0.2, z + shadowOffsetZ * 0.62);
    sailShadow.rotation.y = shadowAngle;
    sailShadow.scale.set(10 * VISUAL_SCALE, 1, shadowLength);
  }

  const clewWorld = new THREE.Vector3();

  function updateRigging(boomAngle, windSide, time, speedFraction) {
    const boomEndX = -Math.sin(boomAngle) * BOOM_LENGTH * 0.95;
    const boomEndZ = MAST_POSITION_Z - Math.cos(boomAngle) * BOOM_LENGTH * 0.95;
    sheetPositions[0] = boomEndX;
    sheetPositions[1] = deckHeightAtMast + BOOM_HEIGHT;
    sheetPositions[2] = boomEndZ;
    sheetPositions[3] = mainSheetAnchor.x;
    sheetPositions[4] = mainSheetAnchor.y;
    sheetPositions[5] = mainSheetAnchor.z;

    root.updateMatrixWorld();
    jibClewMarker.getWorldPosition(clewWorld);
    root.worldToLocal(clewWorld);
    sheetPositions[6] = clewWorld.x;
    sheetPositions[7] = clewWorld.y;
    sheetPositions[8] = clewWorld.z;
    sheetPositions[9] = Math.sign(clewWorld.x || 1) * hullHalfBeam(0.6) * 0.9;
    sheetPositions[10] = hullSheer(0.6) - 0.1;
    sheetPositions[11] = jibSheetAnchorZ;
    sheetGeometry.attributes.position.needsUpdate = true;

    const flagPositions = flagGeometry.attributes.position.array;
    for (let i = 0; i < flagPositions.length; i += 3) {
      const alongFlag = -flagRestPositions[i];
      flagPositions[i + 2] = flagRestPositions[i + 2] + Math.sin(alongFlag * 2.4 - time * 9) * 0.16 * alongFlag;
    }
    flagGeometry.attributes.position.needsUpdate = true;

    contactRing.material.uniforms.time.value = time;
    contactRing.material.uniforms.speedFraction.value = speedFraction;
  }

  return {
    root, mainsailPivot, jibPivot, flag, updateRigging, updateSailShadow, setDamaged,
    length: HULL_LENGTH * VISUAL_SCALE, halfBeam: HALF_BEAM * VISUAL_SCALE, draft: DRAFT,
    maxBoomAngle: MAX_BOOM_ANGLE,
  };
}

const MAX_SPEED = 7;
const MIN_STEERAGE_SPEED = 0.9;
const MAX_TURN_RATE = 0.42;
const NO_GO_ANGLE = (32 * Math.PI) / 180;

export function sailingEfficiency(angleOffWind) {
  if (angleOffWind < NO_GO_ANGLE) return 0;
  const closeHauled = smoothstep(NO_GO_ANGLE, (75 * Math.PI) / 180, angleOffWind);
  const runningPenalty = 1 - 0.25 * smoothstep((120 * Math.PI) / 180, Math.PI, angleOffWind);
  return closeHauled * runningPenalty;
}

const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function createShipController(ship, heightmap, wind) {
  const state = {
    x: 0, z: 0, heading: 0, speed: 0,
    targetX: 0, targetZ: 0, hasTarget: false, steeringHeld: false,
    aground: false, anchored: false, angleOffWind: 0, windSide: 1,
    boomAngle: 0.3, heel: 0, pitch: 0, roll: 0, bob: 0,
  };

  function place(x, z, heading, speed = 4) {
    state.x = x;
    state.z = z;
    state.heading = heading;
    state.speed = speed;
    state.hasTarget = false;
  }

  function setTarget(x, z, held) {
    state.targetX = x;
    state.targetZ = z;
    state.hasTarget = true;
    state.steeringHeld = held;
  }

  function releaseSteering() {
    state.steeringHeld = false;
  }

  function step(deltaTime, time) {
    const forwardX = Math.sin(state.heading);
    const forwardZ = Math.cos(state.heading);

    if (state.hasTarget) {
      const toTargetX = state.targetX - state.x;
      const toTargetZ = state.targetZ - state.z;
      const distance = Math.hypot(toTargetX, toTargetZ);
      if (distance < 12 && !state.steeringHeld) {
        state.hasTarget = false;
      } else {
        const desiredHeading = Math.atan2(toTargetX, toTargetZ);
        const headingError = wrapAngle(desiredHeading - state.heading);
        const turnAuthority = 0.35 + 0.65 * Math.min(1, state.speed / 4);
        const maxTurn = MAX_TURN_RATE * turnAuthority * deltaTime;
        state.heading = wrapAngle(state.heading + Math.max(-maxTurn, Math.min(maxTurn, headingError)));
      }
    }

    const windFromX = -wind.directionX;
    const windFromZ = -wind.directionZ;
    state.angleOffWind = Math.acos(Math.max(-1, Math.min(1, forwardX * windFromX + forwardZ * windFromZ)));
    state.windSide = forwardX * windFromZ - forwardZ * windFromX > 0 ? 1 : -1;

    const efficiency = sailingEfficiency(state.angleOffWind);
    const maxSpeed = ship.maxSpeed ?? MAX_SPEED;
    let targetSpeed = state.anchored ? 0 : Math.max(MIN_STEERAGE_SPEED, maxSpeed * efficiency * wind.strength);

    const bowX = state.x + forwardX * ship.length * 0.45;
    const bowZ = state.z + forwardZ * ship.length * 0.45;
    const bowSeabed = heightmap.heightAt(bowX, bowZ);
    const centerSeabed = heightmap.heightAt(state.x, state.z);
    state.aground = bowSeabed > -ship.draft || centerSeabed > -ship.draft;
    if (state.aground) {
      targetSpeed = 0;
      state.speed = Math.min(state.speed, 1.2);
      if (bowSeabed > -ship.draft) {
        state.x -= forwardX * 1.5 * deltaTime;
        state.z -= forwardZ * 1.5 * deltaTime;
      }
    }

    const response = targetSpeed > state.speed ? 0.22 : 0.45;
    state.speed += (targetSpeed - state.speed) * Math.min(1, response * deltaTime);
    if (!state.aground) {
      state.x += forwardX * state.speed * deltaTime;
      state.z += forwardZ * state.speed * deltaTime;
    }

    const halfLength = ship.length * 0.4;
    const bowWave = waveHeightAt(state.x + forwardX * halfLength, state.z + forwardZ * halfLength, time);
    const sternWave = waveHeightAt(state.x - forwardX * halfLength, state.z - forwardZ * halfLength, time);
    const portWave = waveHeightAt(state.x + forwardZ * ship.halfBeam, state.z - forwardX * ship.halfBeam, time);
    const starboardWave = waveHeightAt(state.x - forwardZ * ship.halfBeam, state.z + forwardX * ship.halfBeam, time);
    const targetBob = (bowWave + sternWave + portWave + starboardWave) * 0.25;
    const targetPitch = Math.atan2(sternWave - bowWave, halfLength * 2);
    const targetRoll = Math.atan2(portWave - starboardWave, ship.halfBeam * 2);
    const smoothing = Math.min(1, deltaTime * 3);
    state.bob += (targetBob - state.bob) * smoothing;
    state.pitch += (targetPitch - state.pitch) * smoothing;
    state.roll += (targetRoll - state.roll) * smoothing;

    const heelTarget = Math.sin(Math.min(state.angleOffWind, Math.PI - 0.2)) * efficiency * wind.strength * 0.13 * -state.windSide;
    state.heel += (heelTarget - state.heel) * Math.min(1, deltaTime * 0.8);

    const boomTarget = Math.max(0.12, Math.min(ship.maxBoomAngle, (state.angleOffWind - 0.35) * 0.55)) * -state.windSide;
    state.boomAngle += (boomTarget - state.boomAngle) * Math.min(1, deltaTime * 1.5);

    ship.root.position.set(state.x, state.bob - 0.15, state.z);
    ship.root.rotation.set(state.pitch, state.heading, state.roll + state.heel, 'YXZ');
    ship.mainsailPivot.rotation.y = state.boomAngle;
    ship.jibPivot.children[0].rotation.y = Math.max(-0.42, Math.min(0.42, state.boomAngle * 0.6));
    ship.updateSailShadow(state.x, state.z, state.heading, state.bob);
    ship.updateRigging(state.boomAngle, state.windSide, time, Math.min(1, state.speed / maxSpeed));
    ship.flag.rotation.y = Math.atan2(wind.directionX, wind.directionZ) - state.heading + Math.PI / 2 + Math.sin(time * 6) * 0.15;
  }

  return { state, place, setTarget, releaseSteering, step };
}
