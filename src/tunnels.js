import * as THREE from 'three';

export const TUNNEL_FLOOR_Y = -300;
const GRID_SIZE = 21;
const CELL_SIZE = 2;
const ROCK_HEIGHT = 1.5;
const DIG_ROCK_SECONDS = 2.5;
const CENTER = Math.floor(GRID_SIZE / 2);

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

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE * CELL_SIZE, GRID_SIZE * CELL_SIZE), new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  underground.add(floor);

  const rockGeometry = new THREE.BoxGeometry(CELL_SIZE, ROCK_HEIGHT, CELL_SIZE);
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, GRID_SIZE * GRID_SIZE);
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  underground.add(rocks);

  const ladder = buildLadder(5);
  underground.add(ladder);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 9, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
  underground.add(shaft);

  const torch = new THREE.PointLight(0xffb060, 60, 26, 1.4);
  torch.castShadow = false;
  underground.add(torch);
  const caveFill = new THREE.HemisphereLight(0x6a5a50, 0x2a1e14, 0.9);
  caveFill.visible = false;
  scene.add(caveFill);

  const entrance = buildEntranceMesh();
  entrance.group.visible = false;
  scene.add(entrance.group);

  const dummy = new THREE.Object3D();
  const rockColor = new THREE.Color();
  const dug = new Set();
  const task = { active: false, cell: null, progress: 0, seconds: 0, onDone: null, kind: 'dig' };

  const cellIndex = (column, row) => row * GRID_SIZE + column;
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
        if (dug.has(index)) {
          dummy.position.set(0, -1000, 0);
          dummy.scale.setScalar(0.001);
        } else {
          const wobble = Math.sin(column * 12.9 + row * 78.2) * 0.5 + 0.5;
          dummy.position.set(center.x, TUNNEL_FLOOR_Y + ROCK_HEIGHT / 2 + wobble * 0.12, center.z);
          dummy.scale.set(1, 1 + wobble * 0.16, 1);
          if (isEdge(column, row)) rockColor.setRGB(0.2, 0.17, 0.15);
          else rockColor.setRGB(0.5 + wobble * 0.1, 0.4 + wobble * 0.07, 0.3 + wobble * 0.04);
          rocks.setColorAt(index, rockColor);
        }
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        rocks.setMatrixAt(index, dummy.matrix);
      }
    }
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  }

  function build(spec) {
    tunnel = { x: spec.x, z: spec.z, covered: spec.covered ?? false, dug: spec.dug ?? [cellIndex(CENTER, CENTER)] };
    dug.clear();
    for (const index of tunnel.dug) dug.add(index);
    floor.position.set(tunnel.x, TUNNEL_FLOOR_Y, tunnel.z);
    ladder.position.set(tunnel.x, TUNNEL_FLOOR_Y, tunnel.z - 0.7);
    shaft.position.set(tunnel.x, TUNNEL_FLOOR_Y + 4.5, tunnel.z);
    entrance.group.position.set(tunnel.x, ground.heightAt(tunnel.x, tunnel.z), tunnel.z);
    entrance.group.visible = true;
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
    torch.intensity = 60 + Math.sin(time * 11) * 4 + Math.sin(time * 7.3) * 3;
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
