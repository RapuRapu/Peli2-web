import { element } from './workbench.js';

const MAP_CELLS = 96;
const MAP_EXTENT = 75;
const SAND = [214, 188, 140];
const WET_SAND = [170, 150, 112];
const WATER = [62, 132, 150];
const ROCK = [110, 104, 96];
const OUTSIDE = [20, 24, 26];

export function createMapView(root, { world, fog, halfSize, waterLevel, cameraYaw }) {
  const frame = element('div', 'map-view hidden', root);
  element('div', 'map-title', frame, 'Map');
  const canvas = element('canvas', 'map-canvas', frame);
  canvas.width = canvas.height = MAP_CELLS * 2;
  const context = canvas.getContext('2d');
  let terrain = null;

  const extent = MAP_EXTENT;
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
      context.lineWidth = 1.5;
      context.stroke();
    }
  }

  function draw({ focus = { x: 0, z: 0 }, player = null, entrances = [], candidates = [] }) {
    if (!terrain || focus.x !== center.x || focus.z !== center.z) {
      center = { ...focus };
      buildTerrain();
    }
    const image = context.createImageData(MAP_CELLS, MAP_CELLS);
    for (let row = 0; row < MAP_CELLS; row++) {
      for (let column = 0; column < MAP_CELLS; column++) {
        const { x, z } = worldOfCell(column, row);
        const index = (row * MAP_CELLS + column) * 4;
        const shade = fog.isRevealed(x, z) ? 1 : 0.12;
        for (let channel = 0; channel < 3; channel++) image.data[index + channel] = terrain.data[index + channel] * shade;
        image.data[index + 3] = 255;
      }
    }
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = MAP_CELLS;
    scratch.getContext('2d').putImageData(image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.drawImage(scratch, 0, 0, canvas.width, canvas.height);
    for (const point of candidates) dot(point, 5, 'rgba(120, 255, 150, 0.95)', '#0b2a12');
    for (const point of entrances) dot(point, 4.5, '#3a2410', '#ffd28a');
    if (player) dot(player, 4, '#ff6a3c', '#fff3d6');
  }

  return {
    show(markers) {
      draw(markers);
      frame.classList.remove('hidden');
    },
    hide() {
      frame.classList.add('hidden');
    },
    get isOpen() {
      return !frame.classList.contains('hidden');
    },
  };
}
