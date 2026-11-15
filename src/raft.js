import * as THREE from 'three';

const LOG_COUNT = 9;
const LOG_LENGTH = 7;
const LOG_RADIUS = 0.26;
const RAFT_SCALE = 1.8;
const MAST_HEIGHT = 6.2;
const SAIL_WIDTH = 4.0;
const SAIL_HEIGHT = 3.8;

function createHideTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#d8b88a';
  context.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) {
    context.fillStyle = `rgba(${70 + Math.random() * 40}, ${45 + Math.random() * 25}, 25, ${0.08 + Math.random() * 0.12})`;
    context.beginPath();
    context.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 7, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = 'rgba(60, 36, 18, 0.8)';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(64, 0);
  context.lineTo(64, 128);
  context.stroke();
  context.setLineDash([4, 5]);
  context.lineWidth = 2;
  context.strokeRect(4, 4, 120, 120);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildRaftDeck(material, lashingMaterial) {
  const group = new THREE.Group();
  const logGeometry = new THREE.CylinderGeometry(LOG_RADIUS, LOG_RADIUS * 0.92, LOG_LENGTH, 7);
  logGeometry.rotateX(Math.PI / 2);
  const deckHalfWidth = (LOG_COUNT * LOG_RADIUS * 2) / 2;
  for (let i = 0; i < LOG_COUNT; i++) {
    const log = new THREE.Mesh(logGeometry, material);
    const lengthJitter = 1 - (Math.abs(i - (LOG_COUNT - 1) / 2) / LOG_COUNT) * 0.35;
    log.scale.z = lengthJitter;
    log.position.set(-deckHalfWidth + LOG_RADIUS + i * LOG_RADIUS * 2, 0, ((i * 37) % 5) * 0.06);
    log.castShadow = true;
    log.receiveShadow = true;
    group.add(log);
  }
  for (const z of [-2.4, 0, 2.4]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(deckHalfWidth * 2 + 0.3, 0.16, 0.22), material);
    beam.position.set(0, LOG_RADIUS + 0.05, z);
    beam.castShadow = true;
    group.add(beam);
    const lashing = new THREE.Mesh(new THREE.BoxGeometry(deckHalfWidth * 2 + 0.34, 0.06, 0.08), lashingMaterial);
    lashing.position.set(0, LOG_RADIUS + 0.14, z);
    group.add(lashing);
  }
  return { group, deckHalfWidth };
}

export function createRaft(scene) {
  const root = new THREE.Group();
  const logMaterial = new THREE.MeshStandardMaterial({ color: 0x6a4a2c, roughness: 0.9, flatShading: true });
  const lashingMaterial = new THREE.MeshStandardMaterial({ color: 0xd2b47a, roughness: 1 });
  const { group: deck, deckHalfWidth } = buildRaftDeck(logMaterial, lashingMaterial);
  root.add(deck);

  const mastBaseY = LOG_RADIUS + 0.1;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, MAST_HEIGHT, 7), logMaterial);
  mast.position.set(0, mastBaseY + MAST_HEIGHT / 2, 0.6);
  mast.castShadow = true;
  root.add(mast);

  const mainsailPivot = new THREE.Group();
  mainsailPivot.position.set(0, mastBaseY, 0.6);
  root.add(mainsailPivot);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, SAIL_WIDTH + 0.4, 6).rotateZ(Math.PI / 2), logMaterial);
  yard.position.set(0, MAST_HEIGHT - 0.3, 0.12);
  const sailGeometry = new THREE.PlaneGeometry(SAIL_WIDTH, SAIL_HEIGHT, 6, 6);
  const sailPositions = sailGeometry.attributes.position;
  for (let i = 0; i < sailPositions.count; i++) {
    const u = sailPositions.getX(i) / SAIL_WIDTH + 0.5;
    const v = sailPositions.getY(i) / SAIL_HEIGHT + 0.5;
    sailPositions.setZ(i, Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 0.9 + 0.2) * 0.45);
  }
  sailGeometry.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeometry, new THREE.MeshStandardMaterial({ map: createHideTexture(), side: THREE.DoubleSide, roughness: 1 }));
  sail.position.set(0, MAST_HEIGHT - 0.35 - SAIL_HEIGHT / 2, 0.16);
  sail.castShadow = true;
  const boom = yard.clone();
  boom.position.y = MAST_HEIGHT - 0.4 - SAIL_HEIGHT;
  mainsailPivot.add(yard, sail, boom);

  const jibPivot = new THREE.Group();
  jibPivot.add(new THREE.Object3D());
  root.add(jibPivot);

  const flagGeometry = new THREE.PlaneGeometry(0.9, 0.35, 4, 1).translate(-0.45, 0, 0);
  const flag = new THREE.Mesh(flagGeometry, new THREE.MeshStandardMaterial({ color: 0x9a1a14, side: THREE.DoubleSide, roughness: 1 }));
  flag.position.set(0, mastBaseY + MAST_HEIGHT + 0.1, 0.6);
  root.add(flag);

  const paddle = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6).rotateX(Math.PI / 2), logMaterial);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 0.7), logMaterial);
  blade.position.z = -1.3;
  paddle.add(shaft, blade);
  paddle.position.set(deckHalfWidth * 0.55, LOG_RADIUS + 0.12, -2.2);
  paddle.rotation.y = 0.25;
  root.add(paddle);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const shadowContext = shadowCanvas.getContext('2d');
  const gradient = shadowContext.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(0, 20, 28, 0.45)');
  gradient.addColorStop(1, 'rgba(0, 20, 28, 0)');
  shadowContext.fillStyle = gradient;
  shadowContext.fillRect(0, 0, 64, 64);
  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(deckHalfWidth * 3, LOG_LENGTH * 1.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false }),
  );
  contactShadow.position.y = 0.05;
  contactShadow.renderOrder = 2;
  root.add(contactShadow);

  root.scale.setScalar(RAFT_SCALE);
  scene.add(root);

  return {
    root, mainsailPivot, jibPivot, flag,
    updateRigging: () => {},
    updateSailShadow: () => {},
    setDamaged: () => {},
    length: LOG_LENGTH * RAFT_SCALE,
    halfBeam: deckHalfWidth * RAFT_SCALE,
    draft: 0.6,
    maxBoomAngle: 0.45,
    maxSpeed: 4.2,
  };
}
