import { element } from './workbench.js';

const MAP_CELLS = 160;
const MIN_EXTENT = 40;
const SAND = [214, 188, 140];
const WET_SAND = [170, 150, 112];
const WATER = [62, 132, 150];
const ROCK = [110, 104, 96];
const OUTSIDE = [20, 24, 26];

export function createMapView(root, { world, fog, halfSize, waterLevel, cameraYaw, onClose }) {
  const overlay = element('div', 'workbench map-panel', root);
  const card = element('div', 'workbench-card map-card', overlay);
  const header = element('div', 'workbench-header', card);
  element('div', 'workbench-title', header, 'Map');
  const closeButton = element('button', 'workbench-close', header, '✕');
  closeButton.setAttribute('aria-label', 'Close map');
  closeButton.addEventListener('click', () => onClose());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) onClose();
  });
  const canvas = element('canvas', 'map-canvas', card);
  canvas.width = canvas.height = MAP_CELLS * 4;
  const legend = element('div', 'map-legend', card);
  for (const [className, text] of [['you', 'You'], ['door', 'Burrow exits'], ['remains', 'Your remains'], ['rack', 'Drying rack']]) {
    const entry = element('span', 'map-legend-entry', legend);
    element('span', `map-key ${className}`, entry);
    element('span', '', entry, text);
  }
  const context = canvas.getContext('2d');
  let terrain = null;

  let extent = halfSize;
  let center = { x: 0, z: 0 };
  const forward = { x: -Math.sin(cameraYaw), z: Math.cos(cameraYaw) };
  const right = { x: -forward.z, z: forward.x };
  const worldOfCell = (column, row) => {
    const across = ((column + 0.5) / MAP_CELLS * 2 - 1) * extent;
    const up = (1 - (row + 0.5) / MAP_CELLS * 2) * extent;
    return { x: center.x + across * right.x + up * forward.x, z: center.z + across * right.z + up * forward.z };
  };
  const toPixel = (point) => {
    const across = (point.x - center.x) * right.x + (point.z - center.z) * right.z;
    const up = (point.x - center.x) * forward.x + (point.z - center.z) * forward.z;
    return { x: (across / extent + 1) / 2 * canvas.width, y: (1 - up / extent) / 2 * canvas.height };
  };
  const insideWorld = (point) => Math.abs(point.x) <= halfSize && Math.abs(point.z) <= halfSize;

  function buildTerrain() {
    terrain = context.createImageData(MAP_CELLS, MAP_CELLS);
    for (let row = 0; row < MAP_CELLS; row++) {
      for (let column = 0; column < MAP_CELLS; column++) {
        const { x, z } = worldOfCell(column, row);
        const height = insideWorld({ x, z }) ? world.heightAt(x, z) : -Infinity;
        const color = !insideWorld({ x, z }) ? OUTSIDE : height < waterLevel ? WATER : !world.isWalkable(x, z) ? ROCK : height < waterLevel + 1 ? WET_SAND : SAND;
        terrain.data.set([...color, 255], (row * MAP_CELLS + column) * 4);
      }
    }
  }

  function dot(point, radius, fill, stroke) {
    context.beginPath();
    const pixel = toPixel(point);
    context.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = 3;
      context.stroke();
    }
  }

  function frameExplored(points) {
    let low = { x: Infinity, z: Infinity };
    let high = { x: -Infinity, z: -Infinity };
    const include = (x, z) => {
      low = { x: Math.min(low.x, x), z: Math.min(low.z, z) };
      high = { x: Math.max(high.x, x), z: Math.max(high.z, z) };
    };
    const step = halfSize / 40;
    for (let x = -halfSize; x <= halfSize; x += step) for (let z = -halfSize; z <= halfSize; z += step) if (fog.isRevealed(x, z)) include(x, z);
    for (const point of points) include(point.x, point.z);
    if (!Number.isFinite(low.x)) return { center: { x: 0, z: 0 }, extent: halfSize };
    const size = Math.max(high.x - low.x, high.z - low.z) / 2;
    return { center: { x: (low.x + high.x) / 2, z: (low.z + high.z) / 2 }, extent: Math.min(halfSize * 1.05, Math.max(MIN_EXTENT, size * 1.25 + 8)) };
  }

  function draw({ player = null, entrances = [], remains = [], rack = null }) {
    const frame = frameExplored([player, ...entrances, ...remains, rack].filter(Boolean));
    center = frame.center;
    extent = frame.extent;
    buildTerrain();
    const image = context.createImageData(MAP_CELLS, MAP_CELLS);
    for (let row = 0; row < MAP_CELLS; row++) {
      for (let column = 0; column < MAP_CELLS; column++) {
        const { x, z } = worldOfCell(column, row);
        const index = (row * MAP_CELLS + column) * 4;
        const shade = fog.isRevealed(x, z) ? 1 : 0;
        for (let channel = 0; channel < 3; channel++) image.data[index + channel] = terrain.data[index + channel] * shade;
        image.data[index + 3] = 255;
      }
    }
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = MAP_CELLS;
    scratch.getContext('2d').putImageData(image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(scratch, 0, 0, canvas.width, canvas.height);
    if (rack) dot(rack, 6, '#7bd36a', '#1d3b16');
    for (const point of remains) dot(point, 9, '#e8e2d4', '#3a1010');
    for (const point of entrances) dot(point, 9, '#ffd23c', '#3a2410');
    if (player) dot(player, 11, '#ff6a3c', '#fff3d6');
  }

  return {
    open(markers) {
      draw(markers);
      overlay.classList.add('visible');
      root.classList.add('panel-open');
    },
    close() {
      overlay.classList.remove('visible');
      root.classList.remove('panel-open');
    },
    get isOpen() {
      return overlay.classList.contains('visible');
    },
  };
}
