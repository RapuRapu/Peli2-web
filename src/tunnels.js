import * as THREE from 'three';

export const TUNNEL_FLOOR_Y = -300;
const GRID_SIZE = 21;
const CELL_SIZE = 2;
const ROCK_HEIGHT = 1.15;
const DIG_ROCK_SECONDS = 2.5;
const CENTER = Math.floor(GRID_SIZE / 2);

function buildRockGeometry(seed) {
  const geometry = new THREE.BoxGeometry(CELL_SIZE * 1.04, ROCK_HEIGHT, CELL_SIZE * 1.04, 2, 1, 2);
  geometry.translate(0, ROCK_HEIGHT / 2, 0);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const half = (CELL_SIZE * 1.04) / 2;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const isTop = y > ROCK_HEIGHT - 0.01;
    const isRim = isTop && (Math.abs(x) > half - 0.01 || Math.abs(z) > half - 0.01);
    if (isTop) position.setY(i, y + (x * (0.05 - seed * 0.04) + z * (seed * 0.03 - 0.02)) - (isRim ? 0.05 : 0) + Math.sin(x * 2.2 + z * 1.6 + seed * 3.1) * 0.03);
    const shade = isRim ? 1.1 : isTop ? 0.78 : 1.05 - (1 - y / ROCK_HEIGHT) * 0.4;
    colors.set([shade, shade * 0.97, shade * 0.93], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildLadder(height) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2c, roughness: 0.9 });
  for (const side of [-0.35, 0.35]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, height, 0.1), wood);
    rail.position.set(side, height / 2, 0);
    group.add(rail);
  }
  for (let y = 0.4; y < height; y += 0.45) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.07, 0.08), wood);
    rung.position.set(0, y, 0);
    group.add(rung);
  }
  return group;
}

function buildEntranceMesh() {
  const group = new THREE.Group();
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), new THREE.MeshBasicMaterial({ color: 0x120c06, polygonOffset: true, polygonOffsetFactor: -4 }));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.06;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.22, 6, 18), new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 1, flatShading: true }));
  rim.rotation.x = -Math.PI / 2;
  rim.scale.z = 0.45;
  rim.position.y = 0.05;
  const ladderTop = buildLadder(1.1);
  ladderTop.position.set(0, -0.2, -0.5);
  ladderTop.rotation.x = -0.25;
  const cover = new THREE.Group();
  const frondMaterial = new THREE.MeshStandardMaterial({ color: 0x5f8a2e, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.4, 1, 3), frondMaterial);
    frond.rotation.set(-Math.PI / 2 + 0.08, 0, (i / 6) * Math.PI);
    frond.position.y = 0.14 + i * 0.015;
    cover.add(frond);
  }
  group.add(hole, rim, ladderTop, cover);
  return { group, cover };
}

export function createTunnels(scene, ground, savedTunnel) {
  let tunnel = null;
  const underground = new THREE.Group();
  underground.visible = false;
  scene.add(underground);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE), new THREE.MeshStandardMaterial({ color: 0xd9b27a, emissive: 0x3a2610, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  underground.add(floor);

  const ROCK_VARIANTS = 3;
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95 });
  const outerRock = new THREE.Group();
  const outerMaterial = new THREE.MeshBasicMaterial({ color: 0x0b0806 });
  for (const [offsetX, offsetZ, width, depth] of [[0, -1, 1, 0], [0, 1, 1, 0], [-1, 0, 0, 1], [1, 0, 0, 1]]) {
    const span = GRID_SIZE * CELL_SIZE;
    const slab = new THREE.Mesh(new THREE.PlaneGeometry(width ? span + 400 : 200, depth ? span : 200), outerMaterial);
    slab.rotation.x = -Math.PI / 2;
    slab.position.set(offsetX * (span / 2 + 100), ROCK_HEIGHT, offsetZ * (span / 2 + 100));
    outerRock.add(slab);
  }
  underground.add(outerRock);
  const rockSets = Array.from({ length: ROCK_VARIANTS }, (_, seed) => {
    const set = new THREE.InstancedMesh(buildRockGeometry(seed), rockMaterial, GRID_SIZE * GRID_SIZE);
    set.castShadow = true;
    set.receiveShadow = true;
    underground.add(set);
    return set;
  });

  const ladder = buildLadder(5);
  underground.add(ladder);
  const shaft = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255, 220, 150, 0.55)');
    gradient.addColorStop(1, 'rgba(255, 200, 120, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.rotation.x = -Math.PI / 2;
    return glow;
  })();
  underground.add(shaft);

  const torch = new THREE.PointLight(0xffa850, 40, 34, 1.2);
  torch.castShadow = false;
  underground.add(torch);
  const caveFill = new THREE.HemisphereLight(0x9a8a78, 0x3a2a1c, 1.6);
  caveFill.visible = false;
  scene.add(caveFill);

  const entranceBadge = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgba(40, 24, 10, 0.85)';
    context.beginPath();
    context.arc(48, 48, 42, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#e8b86a';
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(34, 18); context.lineTo(34, 80);
    context.moveTo(62, 18); context.lineTo(62, 80);
    for (let y = 28; y <= 72; y += 14) { context.moveTo(34, y); context.lineTo(62, y); }
    context.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.renderOrder = 5;
    sprite.scale.set(2.2, 2.2, 1);
    sprite.visible = false;
    scene.add(sprite);
    return sprite;
  })();
  const entrance = buildEntranceMesh();
  entrance.group.visible = false;
  scene.add(entrance.group);

  const dummy = new THREE.Object3D();
  const rockColor = new THREE.Color();
  const dug = new Set();
  const task = { active: false, cell: null, progress: 0, seconds: 0, onDone: null, kind: 'dig' };

  const cellIndex = (column, row) => row * GRID_SIZE + column;
  const wobbleOf = (column, row) => Math.sin(column * 31.7 + row * 17.3) * 0.5 + 0.5;
  const isEdge = (column, row) => column === 0 || row === 0 || column === GRID_SIZE - 1 || row === GRID_SIZE - 1;
  const cellCenter = (column, row) => ({ x: tunnel.x + (column - CENTER) * CELL_SIZE, z: tunnel.z + (row - CENTER) * CELL_SIZE });

  function cellAt(x, z) {
    const column = Math.round((x - tunnel.x) / CELL_SIZE) + CENTER;
    const row = Math.round((z - tunnel.z) / CELL_SIZE) + CENTER;
    if (column < 0 || row < 0 || column >= GRID_SIZE || row >= GRID_SIZE) return null;
    return { column, row, index: cellIndex(column, row) };
  }

  function refreshRocks() {
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let column = 0; column < GRID_SIZE; column++) {
        const index = cellIndex(column, row);
        const center = cellCenter(column, row);
        const variant = Math.floor((Math.sin(column * 7.31 + row * 3.17) * 0.5 + 0.5) * ROCK_VARIANTS * 0.999);
        for (let other = 0; other < ROCK_VARIANTS; other++) {
          if (other === variant && !dug.has(index)) continue;
          dummy.position.set(0, -1000, 0);
          dummy.scale.setScalar(0.001);
          dummy.updateMatrix();
          rockSets[other].setMatrixAt(index, dummy.matrix);
        }
        const rocks = rockSets[variant];
        if (dug.has(index)) {
          dummy.position.set(0, -1000, 0);
          dummy.scale.setScalar(0.001);
        } else {
          const wobble = Math.sin(column * 12.9 + row * 78.2) * 0.5 + 0.5;
          const wobbleB = Math.sin(column * 39.3 + row * 11.7) * 0.5 + 0.5;
          const heightScale = 0.8 + wobble * 0.5;
          dummy.position.set(center.x, TUNNEL_FLOOR_Y, center.z);
          dummy.scale.set(1, heightScale, 1);
          if (isEdge(column, row)) rockColor.setRGB(0.07, 0.06, 0.06);
          else rockColor.setRGB(0.095 + wobbleB * 0.03, 0.09 + wobbleB * 0.022, 0.085 + wobble * 0.015);
          rocks.setColorAt(index, rockColor);
        }
        dummy.rotation.set(0, dug.has(index) ? 0 : Math.floor(wobbleOf(column, row) * 4) * (Math.PI / 2), 0);
        dummy.updateMatrix();
        rocks.setMatrixAt(index, dummy.matrix);
      }
    }
    for (const rocks of rockSets) {
      rocks.instanceMatrix.needsUpdate = true;
      if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    }
  }

  function build(spec) {
    tunnel = { x: spec.x, z: spec.z, covered: spec.covered ?? false, dug: spec.dug ?? [cellIndex(CENTER, CENTER)] };
    dug.clear();
    for (const index of tunnel.dug) dug.add(index);
    floor.position.set(tunnel.x, TUNNEL_FLOOR_Y, tunnel.z);
    outerRock.position.set(tunnel.x, TUNNEL_FLOOR_Y, tunnel.z);
    ladder.position.set(tunnel.x, TUNNEL_FLOOR_Y, tunnel.z - 0.7);
    shaft.position.set(tunnel.x, TUNNEL_FLOOR_Y + 0.05, tunnel.z);
    entrance.group.position.set(tunnel.x, ground.heightAt(tunnel.x, tunnel.z), tunnel.z);
    entrance.group.visible = true;
    entranceBadge.position.set(tunnel.x, ground.heightAt(tunnel.x, tunnel.z) + 2.6, tunnel.z);
    entranceBadge.visible = true;
    entrance.cover.visible = tunnel.covered;
    refreshRocks();
  }

  if (savedTunnel) build(savedTunnel);

  function exists() {
    return tunnel !== null;
  }

  function create(x, z) {
    build({ x, z });
  }

  function setActive(active) {
    underground.visible = active;
    entranceBadge.visible = !active && tunnel !== null;
    caveFill.visible = active;
  }

  function neighbors(index) {
    const column = index % GRID_SIZE;
    const row = Math.floor(index / GRID_SIZE);
    const result = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nextColumn = column + dc;
      const nextRow = row + dr;
      if (nextColumn >= 0 && nextRow >= 0 && nextColumn < GRID_SIZE && nextRow < GRID_SIZE) result.push(cellIndex(nextColumn, nextRow));
    }
    return result;
  }

  function pathBetween(fromIndex, toIndex) {
    const previous = new Map([[fromIndex, -1]]);
    const queue = [fromIndex];
    while (queue.length) {
      const current = queue.shift();
      if (current === toIndex) break;
      for (const next of neighbors(current)) {
        if (dug.has(next) && !previous.has(next)) {
          previous.set(next, current);
          queue.push(next);
        }
      }
    }
    if (!previous.has(toIndex)) return null;
    const cells = [];
    for (let at = toIndex; at !== -1; at = previous.get(at)) cells.unshift(at);
    return cells.map((index) => cellCenter(index % GRID_SIZE, Math.floor(index / GRID_SIZE)));
  }

  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TUNNEL_FLOOR_Y);
  const topPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TUNNEL_FLOOR_Y + ROCK_HEIGHT));
  const hitPoint = new THREE.Vector3();

  function tap(ray, character) {
    const here = cellAt(character.state.x, character.state.z);
    if (!here) return { kind: 'none' };
    let target = null;
    if (ray.intersectPlane(topPlane, hitPoint)) {
      const topCell = cellAt(hitPoint.x, hitPoint.z);
      if (topCell && !dug.has(topCell.index)) target = topCell;
    }
    if (!target && ray.intersectPlane(floorPlane, hitPoint)) target = cellAt(hitPoint.x, hitPoint.z);
    if (!target) return { kind: 'none' };
    if (dug.has(target.index)) {
      const path = pathBetween(here.index, target.index);
      if (path) character.setPath(path.slice(1));
      return { kind: 'walk', cell: target };
    }
    if (isEdge(target.column, target.row)) return { kind: 'bedrock' };
    const standOn = neighbors(target.index).filter((index) => dug.has(index));
    let bestPath = null;
    for (const index of standOn) {
      const path = pathBetween(here.index, index);
      if (path && (!bestPath || path.length < bestPath.length)) bestPath = path;
    }
    if (!bestPath) return { kind: 'unreachable' };
    character.setPath(bestPath.slice(1));
    Object.assign(task, { active: true, cell: target, progress: 0, seconds: 0, kind: 'dig', onDone: null });
    return { kind: 'dig', cell: target };
  }

  function walkTo(x, z, character) {
    const here = cellAt(character.state.x, character.state.z);
    const target = cellAt(x, z);
    if (!here || !target) return false;
    const path = pathBetween(here.index, target.index);
    if (!path) return false;
    character.setPath(path.slice(1).concat([{ x, z }]));
    return true;
  }

  function startWork(seconds, onDone) {
    Object.assign(task, { active: true, cell: null, progress: 0, seconds, kind: 'work', onDone });
  }

  function cancelTask() {
    task.active = false;
  }

  function update(deltaTime, time, character, digMultiplier) {
    torch.position.set(character.state.x, TUNNEL_FLOOR_Y + 3.2, character.state.z);
    torch.intensity = 40 + Math.sin(time * 11) * 2.5 + Math.sin(time * 7.3) * 2;
    if (!task.active) return null;
    const state = character.state;
    if (state.pathIndex < state.path.length) return null;
    if (task.kind === 'dig') {
      const center = cellCenter(task.cell.column, task.cell.row);
      state.heading = Math.atan2(center.x - state.x, center.z - state.z);
    }
    const seconds = task.kind === 'dig' ? DIG_ROCK_SECONDS * digMultiplier : task.seconds;
    task.progress += deltaTime / seconds;
    character.setWorkPose(task.kind === 'dig' ? 'tree' : 'bush', (task.progress * seconds * 1.3) % 1);
    if (task.progress < 1) return null;
    task.active = false;
    character.setWorkPose(null, 0);
    if (task.kind === 'dig') {
      dug.add(task.cell.index);
      tunnel.dug = [...dug];
      refreshRocks();
      return { dugCell: task.cell };
    }
    task.onDone?.();
    return { worked: true };
  }

  function onEntranceCell(x, z) {
    const cell = cellAt(x, z);
    return cell?.index === cellIndex(CENTER, CENTER);
  }

  function nearEntrance(x, z, radius = 2.6) {
    return tunnel && Math.hypot(x - tunnel.x, z - tunnel.z) < radius;
  }

  function setCovered(covered) {
    tunnel.covered = covered;
    entrance.cover.visible = covered;
  }

  function entranceUnderRay(ray) {
    if (!tunnel) return false;
    hitPoint.set(tunnel.x, ground.heightAt(tunnel.x, tunnel.z) + 0.3, tunnel.z);
    return ray.distanceToPoint(hitPoint) < 1.8;
  }

  function visibleEntrances() {
    return tunnel ? [{ x: tunnel.x, z: tunnel.z, visible: !tunnel.covered }] : [];
  }

  function cellCenterAt(x, z) {
    const cell = cellAt(x, z);
    return cell ? { ...cellCenter(cell.column, cell.row), index: cell.index, isEntrance: cell.index === cellIndex(CENTER, CENTER) } : null;
  }

  function serialize() {
    return tunnel ? { x: tunnel.x, z: tunnel.z, covered: tunnel.covered, dug: [...dug] } : null;
  }

  return { exists, create, setActive, tap, walkTo, startWork, cancelTask, update, task, onEntranceCell, nearEntrance, setCovered, entranceUnderRay, visibleEntrances, cellCenterAt, serialize, get state() { return tunnel; }, dugCount: () => dug.size };
}
