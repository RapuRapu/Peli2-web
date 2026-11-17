import * as THREE from 'three';

const WADING_MINIMUM_DEPTH = 0.04;
const WADING_MAXIMUM_DEPTH_PER_SIZE = 1.9;
const MOVING_EMIT_SPACING_PER_SIZE = 0.55;
const MOVING_STRENGTH_RANGE = [0.6, 1.0];
const RESTING_EMIT_INTERVAL_SECONDS = 1.8;
const RESTING_STRENGTH = 0.35;
const CROSSING_STRENGTH = 1.4;
const MOVING_SPEED_THRESHOLD = 0.4;
const FULL_STRENGTH_SPEED = 7;
const WADER_RADIUS_PER_SIZE = 0.9;
const WADER_FADE_SECONDS = 0.3;

export const RIPPLE_LIFETIME_SECONDS = 2.0;

export function isWading(player) {
  return player.waterDepth > WADING_MINIMUM_DEPTH && player.waterDepth < WADING_MAXIMUM_DEPTH_PER_SIZE * player.size;
}

export function createRipples(waterUniforms) {
  const slots = waterUniforms.uRipples.value;
  const wader = waterUniforms.uWader.value;
  let nextSlot = 0;
  let wasWading = false;
  let distanceSinceEmit = 0;
  let restingTimer = 0;
  let previousX = null;
  let previousZ = null;

  function emit(x, z, strength, time) {
    slots[nextSlot].set(x, z, time, strength);
    nextSlot = (nextSlot + 1) % slots.length;
  }

  function update(deltaTime, time, player) {
    const moved = previousX === null ? 0 : Math.hypot(player.x - previousX, player.z - previousZ);
    previousX = player.x;
    previousZ = player.z;
    const wading = isWading(player);
    if (wading !== wasWading) {
      emit(player.x, player.z, CROSSING_STRENGTH, time);
      distanceSinceEmit = 0;
      restingTimer = 0;
    } else if (wading) {
      distanceSinceEmit += moved;
      if (player.speed > MOVING_SPEED_THRESHOLD) {
        restingTimer = 0;
        if (distanceSinceEmit >= MOVING_EMIT_SPACING_PER_SIZE * player.size) {
          distanceSinceEmit = 0;
          const speedShare = Math.min(1, player.speed / FULL_STRENGTH_SPEED);
          emit(player.x, player.z, THREE.MathUtils.lerp(...MOVING_STRENGTH_RANGE, speedShare), time);
        }
      } else {
        restingTimer += deltaTime;
        if (restingTimer >= RESTING_EMIT_INTERVAL_SECONDS) {
          restingTimer = 0;
          emit(player.x, player.z, RESTING_STRENGTH, time);
        }
      }
    }
    wasWading = wading;
    const waderTarget = wading ? 1 : 0;
    const waderStep = deltaTime / WADER_FADE_SECONDS;
    wader.set(player.x, player.z, WADER_RADIUS_PER_SIZE * player.size, wader.w + THREE.MathUtils.clamp(waderTarget - wader.w, -waderStep, waderStep));
  }

  function activeCount() {
    const time = waterUniforms.uTime.value;
    return slots.filter((slot) => slot.w > 0 && time - slot.z >= 0 && time - slot.z < RIPPLE_LIFETIME_SECONDS).length;
  }

  return { emit, update, activeCount };
}
