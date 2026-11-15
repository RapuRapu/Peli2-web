const CELL_SIZE = 2;
const MAX_EXPANSIONS = 150000;
const HEURISTIC_WEIGHT = 1.4;
const SLOPE_SAMPLE_DISTANCE = 2;
const MAX_WALKABLE_SLOPE = 1.0;
import { tide } from './tide.js';

const LOWEST_EVER_WALKABLE_HEIGHT = -1.6;
const MAX_WADING_DEPTH = 0.45;
const DIAGONAL_COST = Math.SQRT2;

export function createWalkGrid(ground, worldSize, obstacles) {
  const gridSize = Math.ceil(worldSize / CELL_SIZE);
  const halfWorld = worldSize / 2;
  const cellCount = gridSize * gridSize;
  const walkableCache = new Int8Array(cellCount).fill(-1);
  const blocked = new Uint8Array(cellCount);
  const cellHeights = new Float32Array(cellCount);

  function baseSlopeAt(x, z) {
    const d = SLOPE_SAMPLE_DISTANCE;
    return Math.hypot(ground.baseHeightAt(x + d, z) - ground.baseHeightAt(x - d, z), ground.baseHeightAt(x, z + d) - ground.baseHeightAt(x, z - d)) / (2 * d);
  }

  const activeObstacles = new Set(obstacles);
  for (const obstacle of obstacles) markObstacle(obstacle);

  function markObstacle(obstacle) {
    const reach = obstacle.radius + 0.4;
    const minColumn = Math.floor((obstacle.x - reach + halfWorld) / CELL_SIZE);
    const maxColumn = Math.floor((obstacle.x + reach + halfWorld) / CELL_SIZE);
    const minRow = Math.floor((obstacle.z - reach + halfWorld) / CELL_SIZE);
    const maxRow = Math.floor((obstacle.z + reach + halfWorld) / CELL_SIZE);
    for (let row = Math.max(0, minRow); row <= Math.min(gridSize - 1, maxRow); row++) {
      for (let column = Math.max(0, minColumn); column <= Math.min(gridSize - 1, maxColumn); column++) {
        const centerX = (column + 0.5) * CELL_SIZE - halfWorld;
        const centerZ = (row + 0.5) * CELL_SIZE - halfWorld;
        if (Math.hypot(centerX - obstacle.x, centerZ - obstacle.z) < reach) blocked[row * gridSize + column] = 1;
      }
    }
  }

  function removeObstacle(obstacle) {
    if (!activeObstacles.delete(obstacle)) return;
    const reach = obstacle.radius + 0.4;
    const minColumn = Math.max(0, Math.floor((obstacle.x - reach + halfWorld) / CELL_SIZE));
    const maxColumn = Math.min(gridSize - 1, Math.floor((obstacle.x + reach + halfWorld) / CELL_SIZE));
    const minRow = Math.max(0, Math.floor((obstacle.z - reach + halfWorld) / CELL_SIZE));
    const maxRow = Math.min(gridSize - 1, Math.floor((obstacle.z + reach + halfWorld) / CELL_SIZE));
    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        blocked[row * gridSize + column] = 0;
        walkableCache[row * gridSize + column] = -1;
      }
    }
    for (const other of activeObstacles) {
      if (Math.abs(other.x - obstacle.x) < reach + other.radius + 2 && Math.abs(other.z - obstacle.z) < reach + other.radius + 2) markObstacle(other);
    }
  }

  const toColumn = (x) => Math.floor((x + halfWorld) / CELL_SIZE);
  const toRow = (z) => Math.floor((z + halfWorld) / CELL_SIZE);
  const cellCenterX = (column) => (column + 0.5) * CELL_SIZE - halfWorld;
  const cellCenterZ = (row) => (row + 0.5) * CELL_SIZE - halfWorld;

  function isCellWalkable(column, row) {
    if (column < 0 || row < 0 || column >= gridSize || row >= gridSize) return false;
    const index = row * gridSize + column;
    if (walkableCache[index] === -1) {
      const x = cellCenterX(column);
      const z = cellCenterZ(row);
      cellHeights[index] = ground.heightAt(x, z);
      const walkable = !blocked[index] && cellHeights[index] > LOWEST_EVER_WALKABLE_HEIGHT && baseSlopeAt(x, z) < MAX_WALKABLE_SLOPE;
      walkableCache[index] = walkable ? 1 : 0;
    }
    return walkableCache[index] === 1 && cellHeights[index] > tide.level - MAX_WADING_DEPTH;
  }

  function isPointWalkable(x, z) {
    return isCellWalkable(toColumn(x), toRow(z));
  }

  function isPointBlocked(x, z) {
    const column = toColumn(x);
    const row = toRow(z);
    if (column < 0 || row < 0 || column >= gridSize || row >= gridSize) return false;
    return blocked[row * gridSize + column] === 1;
  }

  const costSoFar = new Float32Array(cellCount);
  const cameFrom = new Int32Array(cellCount);
  const visitStamp = new Uint32Array(cellCount);
  const closedStamp = new Uint32Array(cellCount);
  let stamp = 0;
  const heapCells = new Int32Array(MAX_EXPANSIONS * 8 + 16);
  const heapScores = new Float32Array(MAX_EXPANSIONS * 8 + 16);
  let heapLength = 0;

  function heapPush(cell, score) {
    let position = heapLength++;
    while (position > 0) {
      const parent = (position - 1) >> 1;
      if (heapScores[parent] <= score) break;
      heapCells[position] = heapCells[parent];
      heapScores[position] = heapScores[parent];
      position = parent;
    }
    heapCells[position] = cell;
    heapScores[position] = score;
  }

  function heapPop() {
    const top = heapCells[0];
    const lastCell = heapCells[--heapLength];
    const lastScore = heapScores[heapLength];
    let position = 0;
    while (true) {
      let child = position * 2 + 1;
      if (child >= heapLength) break;
      if (child + 1 < heapLength && heapScores[child + 1] < heapScores[child]) child++;
      if (heapScores[child] >= lastScore) break;
      heapCells[position] = heapCells[child];
      heapScores[position] = heapScores[child];
      position = child;
    }
    heapCells[position] = lastCell;
    heapScores[position] = lastScore;
    return top;
  }

  function nearestWalkableCell(column, row) {
    for (let radius = 0; radius < 12; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
          if (isCellWalkable(column + dx, row + dz)) return [column + dx, row + dz];
        }
      }
    }
    return null;
  }

  function lineIsWalkable(fromX, fromZ, toX, toZ) {
    const distance = Math.hypot(toX - fromX, toZ - fromZ);
    const steps = Math.ceil(distance / (CELL_SIZE * 0.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!isPointWalkable(fromX + (toX - fromX) * t, fromZ + (toZ - fromZ) * t)) return false;
    }
    return true;
  }

  function findPath(fromX, fromZ, toX, toZ) {
    const start = nearestWalkableCell(toColumn(fromX), toRow(fromZ));
    const goal = nearestWalkableCell(toColumn(toX), toRow(toZ));
    if (!start || !goal) return [];
    stamp++;
    heapLength = 0;
    const startIndex = start[1] * gridSize + start[0];
    const goalIndex = goal[1] * gridSize + goal[0];
    const heuristic = (column, row) => {
      const dx = Math.abs(column - goal[0]);
      const dz = Math.abs(row - goal[1]);
      return (dx + dz + (DIAGONAL_COST - 2) * Math.min(dx, dz)) * HEURISTIC_WEIGHT;
    };
    visitStamp[startIndex] = stamp;
    costSoFar[startIndex] = 0;
    cameFrom[startIndex] = -1;
    heapPush(startIndex, heuristic(start[0], start[1]));
    let bestIndex = startIndex;
    let bestHeuristic = heuristic(start[0], start[1]);
    let expansions = 0;

    while (heapLength > 0 && expansions < MAX_EXPANSIONS && heapLength < heapCells.length - 8) {
      const current = heapPop();
      if (closedStamp[current] === stamp) continue;
      closedStamp[current] = stamp;
      expansions++;
      if (current === goalIndex) {
        bestIndex = current;
        break;
      }
      const column = current % gridSize;
      const row = (current - column) / gridSize;
      const currentHeuristic = heuristic(column, row);
      if (currentHeuristic < bestHeuristic) {
        bestHeuristic = currentHeuristic;
        bestIndex = current;
      }
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const neighborColumn = column + dx;
          const neighborRow = row + dz;
          if (!isCellWalkable(neighborColumn, neighborRow)) continue;
          if (dx !== 0 && dz !== 0 && (!isCellWalkable(column + dx, row) || !isCellWalkable(column, row + dz))) continue;
          const neighbor = neighborRow * gridSize + neighborColumn;
          if (closedStamp[neighbor] === stamp) continue;
          const stepCost = dx !== 0 && dz !== 0 ? DIAGONAL_COST : 1;
          const newCost = costSoFar[current] + stepCost;
          if (visitStamp[neighbor] !== stamp || newCost < costSoFar[neighbor]) {
            visitStamp[neighbor] = stamp;
            costSoFar[neighbor] = newCost;
            cameFrom[neighbor] = current;
            heapPush(neighbor, newCost + heuristic(neighborColumn, neighborRow));
          }
        }
      }
    }

    const cellPath = [];
    for (let cell = bestIndex; cell !== -1; cell = cameFrom[cell]) cellPath.push(cell);
    cellPath.reverse();
    const points = cellPath.map((cell) => {
      const column = cell % gridSize;
      return { x: cellCenterX(column), z: cellCenterZ((cell - column) / gridSize) };
    });
    if (bestIndex === goalIndex && points.length > 0 && isPointWalkable(toX, toZ)) points[points.length - 1] = { x: toX, z: toZ };

    const smoothed = [];
    let anchorX = fromX;
    let anchorZ = fromZ;
    let index = 0;
    while (index < points.length) {
      let farthest = index;
      for (let candidate = points.length - 1; candidate > index; candidate--) {
        if (lineIsWalkable(anchorX, anchorZ, points[candidate].x, points[candidate].z)) {
          farthest = candidate;
          break;
        }
      }
      smoothed.push(points[farthest]);
      anchorX = points[farthest].x;
      anchorZ = points[farthest].z;
      index = farthest + 1;
    }
    return smoothed;
  }

  return { findPath, isPointWalkable, isPointBlocked, removeObstacle };
}
