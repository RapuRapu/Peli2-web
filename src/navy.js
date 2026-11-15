import * as THREE from 'three';
import { createCharacter } from './character.js';
import { buildHullGeometry } from './ship.js';
import { waveHeightAt } from './ocean.js';
import { createRandom } from './noise.js';

const MARINE_COUNT = 4;
const SEARCH_SECONDS = 240;
const DIG_SECONDS = 7;
const FIND_RADIUS = 2.4;
const SPOT_DISTANCE = 10;
const SPOT_COOLDOWN = 15;
const TRAPPED_SECONDS = 25;
const BOAT_APPROACH_SECONDS = 18;
const BASE_RADIUS = 38;

const RED_COAT = new THREE.Color(0.62, 0.08, 0.06);
const WHITE = new THREE.Color(0.88, 0.86, 0.8);
const BLACK = new THREE.Color(0.08, 0.07, 0.07);

function buildBadge(emoji) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(150, 25, 18, 0.9)';
  context.beginPath();
  context.arc(48, 48, 40, 0, Math.PI * 2);
  context.fill();
  context.font = '52px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(emoji, 48, 52);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.renderOrder = 5;
  sprite.scale.set(2.6, 2.6, 1);
  return sprite;
}

function buildCircle() {
  const material = new THREE.LineDashedMaterial({ color: 0xd02a1a, dashSize: 2.2, gapSize: 1.4, transparent: true, opacity: 0.9, depthTest: false });
  const line = new THREE.LineLoop(new THREE.BufferGeometry(), material);
  line.renderOrder = 4;
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

export function createNavy(scene, ground, walkGrid, { tracks, treasure, wildlife, landingPointFor, seaPointFor, tunnelEntrances = () => [] }) {
  const random = createRandom(Math.floor(Math.random() * 1e9));
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(buildHullGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  hull.scale.setScalar(0.38);
  hull.castShadow = true;
  boat.add(hull);
  boat.visible = false;
  scene.add(boat);

  const marines = [];
  for (let i = 0; i < MARINE_COUNT; i++) {
    const body = createCharacter(scene, { coat: RED_COAT, sash: WHITE, trousers: WHITE, hat: BLACK, scale: 1.2 });
    body.setVisible(false);
    marines.push({ body, state: 'boat', targets: [], digProgress: 0, trappedTimer: 0, target: null });
  }

  const circle = buildCircle();
  scene.add(circle);
  const fill = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xd02a1a, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
  fill.visible = false;
  fill.frustumCulled = false;
  scene.add(fill);
  const anchorBadges = [0, 1, 2, 3].map(() => {
    const badge = buildBadge('⚓');
    badge.visible = false;
    scene.add(badge);
    return badge;
  });
  const search = { state: 'idle', timer: 0, centerX: 0, centerZ: 0, radius: BASE_RADIUS, landing: null, sea: null, spotCooldown: 0, found: null };

  function drawCircle() {
    const points = [];
    for (let i = 0; i < 64; i++) {
      const angle = (i / 64) * Math.PI * 2;
      const x = search.centerX + Math.cos(angle) * search.radius;
      const z = search.centerZ + Math.sin(angle) * search.radius;
      points.push(new THREE.Vector3(x, Math.max(0.3, ground.heightAt(x, z)) + 0.6, z));
    }
    circle.geometry.dispose();
    circle.geometry = new THREE.BufferGeometry().setFromPoints(points);
    circle.computeLineDistances();
    const rings = 8;
    const segments = 64;
    const positions = [];
    const ringPoint = (ring, segment) => {
      const radius = (ring / rings) * search.radius;
      const angle = (segment / segments) * Math.PI * 2;
      const x = search.centerX + Math.cos(angle) * radius;
      const z = search.centerZ + Math.sin(angle) * radius;
      return [x, Math.max(0.15, ground.heightAt(x, z)) + 0.25, z];
    };
    for (let ring = 0; ring < rings; ring++) {
      for (let segment = 0; segment < segments; segment++) {
        const a = ringPoint(ring, segment);
        const b = ringPoint(ring + 1, segment);
        const c = ringPoint(ring + 1, segment + 1);
        const d = ringPoint(ring, segment + 1);
        positions.push(...a, ...b, ...c, ...a, ...c, ...d);
      }
    }
    fill.geometry.dispose();
    fill.geometry = new THREE.BufferGeometry();
    fill.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    anchorBadges.forEach((badge, index) => {
      const angle = (index / 4) * Math.PI * 2 + 0.4;
      const x = search.centerX + Math.cos(angle) * search.radius;
      const z = search.centerZ + Math.sin(angle) * search.radius;
      badge.position.set(x, Math.max(0.3, ground.heightAt(x, z)) + 2.2, z);
    });
  }

  function evidenceCircle(playerCarriesChest, playerX, playerZ) {
    const chestCache = treasure.caches.find((cache) => cache.contents === 'chest' && !cache.underground);
    let centerX;
    let centerZ;
    let radius = BASE_RADIUS;
    if (playerCarriesChest) {
      centerX = playerX;
      centerZ = playerZ;
      radius = 22;
    } else if (chestCache) {
      if (chestCache.patchVisible) radius = 20;
      const prints = tracks.positionsWithin(chestCache.x, chestCache.z, 8, 'player').length;
      if (prints > 10) radius = Math.min(radius, 32);
      const offsetAngle = random() * Math.PI * 2;
      const offsetDistance = random() * radius * 0.55;
      centerX = chestCache.x + Math.cos(offsetAngle) * offsetDistance;
      centerZ = chestCache.z + Math.sin(offsetAngle) * offsetDistance;
    } else {
      const hidden = treasure.caches.find((cache) => cache.contents === 'chest');
      const anchor = hidden ?? { x: playerX, z: playerZ };
      centerX = anchor.x + (random() - 0.5) * 60;
      centerZ = anchor.z + (random() - 0.5) * 60;
    }
    return { centerX, centerZ, radius };
  }

  function planTargets() {
    const inCircle = (point) => Math.hypot(point.x - search.centerX, point.z - search.centerZ) < search.radius;
    const patches = treasure.caches.filter((cache) => !cache.underground && cache.patchVisible && inCircle(cache)).map((cache) => ({ x: cache.x, z: cache.z }));
    const prints = tracks.positionsWithin(search.centerX, search.centerZ, search.radius, 'player');
    const printSamples = [];
    for (let i = 0; i < Math.min(3, prints.length); i++) printSamples.push(prints[Math.floor(random() * prints.length)]);
    const openTrapdoors = tunnelEntrances().filter((entrance) => entrance.visible && inCircle(entrance));
    const shared = [...patches, ...printSamples, ...openTrapdoors.map((entrance) => ({ ...entrance, tunnel: true }))];
    marines.forEach((marine, index) => {
      const own = shared.filter((_, targetIndex) => targetIndex % MARINE_COUNT === index);
      for (let i = 0; i < 12; i++) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * search.radius;
        own.push({ x: search.centerX + Math.cos(angle) * distance, z: search.centerZ + Math.sin(angle) * distance });
      }
      marine.targets = own;
    });
  }

  function walkMarineTo(marine, x, z) {
    const state = marine.body.state;
    marine.body.setPath(walkGrid.findPath(state.x, state.z, x, z));
  }

  function land(context) {
    const circleSpec = evidenceCircle(context.playerCarriesChest, context.playerX, context.playerZ);
    Object.assign(search, circleSpec);
    search.landing = landingPointFor(search.centerX, search.centerZ);
    search.sea = seaPointFor(search.landing.x, search.landing.z);
    search.state = 'approach';
    search.timer = 0;
    search.found = null;
    boat.visible = true;
    drawCircle();
    setCircleVisible(true);
  }

  function setCircleVisible(visible) {
    circle.visible = visible;
    fill.visible = visible;
    for (const badge of anchorBadges) badge.visible = visible;
  }

  function finish(found, onFinished) {
    search.found = found;
    search.state = 'leaving';
    search.timer = 0;
    for (const marine of marines) {
      if (marine.state === 'gone') continue;
      marine.state = 'returning';
      marine.body.setWorkPose(null, 0);
      walkMarineTo(marine, search.landing.x, search.landing.z);
    }
    onFinished?.(found);
  }

  function nextTarget(marine) {
    marine.target = marine.targets.shift() ?? null;
    if (!marine.target) {
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * search.radius;
      marine.target = { x: search.centerX + Math.cos(angle) * distance, z: search.centerZ + Math.sin(angle) * distance };
    }
    marine.state = 'walking';
    walkMarineTo(marine, marine.target.x, marine.target.z);
  }

  function update(deltaTime, time, context, callbacks) {
    if (search.state === 'idle' || search.state === 'done') return;
    search.timer += deltaTime;
    const speedMultiplier = context.slowdown ?? 1;

    if (search.state === 'approach') {
      const progress = Math.min(1, search.timer / BOAT_APPROACH_SECONDS);
      const x = search.sea.x + (search.landing.x - search.sea.x) * progress;
      const z = search.sea.z + (search.landing.z - search.sea.z) * progress;
      boat.position.set(x, waveHeightAt(x, z, time) - 0.1, z);
      boat.rotation.y = Math.atan2(search.landing.x - search.sea.x, search.landing.z - search.sea.z);
      if (progress >= 1) {
        search.state = 'searching';
        search.timer = 0;
        planTargets();
        marines.forEach((marine, index) => {
          marine.body.place(search.landing.x + (index - 1.5) * 1.6, search.landing.z, boat.rotation.y);
          marine.body.setVisible(true);
          nextTarget(marine);
        });
        callbacks.onLanded?.();
      }
      return;
    }

    for (const marine of marines) {
      if (marine.state === 'gone' || marine.state === 'boat') continue;
      marine.body.update(deltaTime, ground, marine.state === 'trapped' ? 0 : speedMultiplier);
      const state = marine.body.state;

      if (marine.state === 'trapped') {
        marine.trappedTimer -= deltaTime;
        marine.body.root.position.y -= 0.9;
        marine.body.setWorkPose('bush', (time * 3) % 1);
        if (marine.trappedTimer <= 0) {
          marine.body.setWorkPose(null, 0);
          if (search.state === 'searching') nextTarget(marine);
          else {
            marine.state = 'returning';
            walkMarineTo(marine, search.landing.x, search.landing.z);
          }
        }
        continue;
      }

      if (marine.state === 'walking' || marine.state === 'returning') {
        for (const trap of wildlife.traps) {
          if (trap.state === 'armed' && Math.hypot(trap.x - state.x, trap.z - state.z) < 1.3) {
            wildlife.springOnMarine(trap);
            marine.state = 'trapped';
            marine.trappedTimer = TRAPPED_SECONDS;
            marine.body.stop();
            state.x = trap.x;
            state.z = trap.z;
            callbacks.onTrapped?.();
            break;
          }
        }
        if (marine.state === 'trapped') continue;
      }

      const arrived = state.pathIndex >= state.path.length;
      if (marine.state === 'walking' && arrived) {
        marine.state = 'digging';
        marine.digProgress = 0;
      } else if (marine.state === 'digging') {
        marine.digProgress += (deltaTime * speedMultiplier) / DIG_SECONDS;
        marine.body.setWorkPose('tree', (marine.digProgress * DIG_SECONDS * 1.1) % 1);
        if (marine.digProgress >= 1) {
          marine.body.setWorkPose(null, 0);
          const cache = treasure.cacheNear(state.x, state.z, FIND_RADIUS);
          if (cache) {
            treasure.removeCache(cache);
            if (cache.contents === 'chest' || cache.contents === 'decoy') {
              finish(cache.contents, callbacks.onFinished);
              break;
            }
            callbacks.onEmptyHole?.();
          }
          const tunnelFind = marine.target?.tunnel ? callbacks.searchTunnel?.() : null;
          if (tunnelFind) {
            finish(tunnelFind, callbacks.onFinished);
            break;
          }
          nextTarget(marine);
        }
      } else if (marine.state === 'returning' && arrived) {
        marine.state = 'gone';
        marine.body.setVisible(false);
      }

      if (context.playerX !== null && search.state === 'searching') {
        const distance = Math.hypot(state.x - context.playerX, state.z - context.playerZ);
        if (context.playerCarriesChest && distance < 4) {
          finish('chest', callbacks.onFinished);
          callbacks.onChestTaken?.();
          break;
        }
        if (distance < SPOT_DISTANCE && search.spotCooldown <= 0) {
          search.spotCooldown = SPOT_COOLDOWN;
          search.centerX += (context.playerX - search.centerX) * 0.3;
          search.centerZ += (context.playerZ - search.centerZ) * 0.3;
          search.radius = Math.max(15, search.radius * 0.85);
          drawCircle();
          callbacks.onSpotted?.();
        }
      }
    }
    search.spotCooldown -= deltaTime;

    if (search.state === 'searching' && search.timer > SEARCH_SECONDS) finish(null, callbacks.onFinished);

    if (search.state === 'leaving') {
      const everyoneAboard = marines.every((marine) => marine.state === 'gone' || marine.state === 'trapped');
      if (everyoneAboard || search.timer > 60) {
        for (const marine of marines) {
          marine.state = 'gone';
          marine.body.setVisible(false);
        }
        const progress = Math.min(1, (search.timer - (everyoneAboard ? 0 : 60)) / BOAT_APPROACH_SECONDS);
        boat.position.x += (search.sea.x - boat.position.x) * Math.min(1, deltaTime * 0.15);
        boat.position.z += (search.sea.z - boat.position.z) * Math.min(1, deltaTime * 0.15);
        boat.position.y = waveHeightAt(boat.position.x, boat.position.z, time) - 0.1;
        boat.rotation.y = Math.atan2(search.sea.x - search.landing.x, search.sea.z - search.landing.z);
        if (progress >= 1 || Math.hypot(boat.position.x - search.sea.x, boat.position.z - search.sea.z) < 6) {
          search.state = 'done';
          boat.visible = false;
          setCircleVisible(false);
          callbacks.onDeparted?.(search.found);
        }
      }
    }
  }

  function contains(x, z) {
    return search.state === 'searching' && Math.hypot(x - search.centerX, z - search.centerZ) < search.radius;
  }

  function remainingSearchSeconds() {
    return search.state === 'searching' ? Math.max(0, SEARCH_SECONDS - search.timer) : null;
  }

  return { search, marines, land, update, remainingSearchSeconds, contains, boat };
}
