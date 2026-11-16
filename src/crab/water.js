import * as THREE from 'three';
import { seaUniforms, SEA_COMMON_GLSL, SEA_LEVELS_GLSL, lighting } from './seaside.js';

const NEAR_HALF_SIZE = 190;
const NEAR_SEGMENTS = 176;
const FAR_HALF_SIZE = 2600;

const WATER_VERTEX_GLSL = /* glsl */ `
${SEA_LEVELS_GLSL}
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  world.y = waterLevelAt(world.xz);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const WATER_FRAGMENT_GLSL = /* glsl */ `
${SEA_COMMON_GLSL}
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D uWaveGradient;
uniform vec2 uInverseResolution;
uniform mat4 uInverseViewProjection;
uniform vec3 uAbsorption;
uniform vec3 uScatterColor;
uniform vec3 uHazeColor;
uniform float uHazeDensity;
varying vec3 vWorld;

vec3 worldFromDepth(vec2 uv, float depth) {
  vec4 world = uInverseViewProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return world.xyz / world.w;
}

void main() {
  vec2 uv = gl_FragCoord.xy * uInverseResolution;
  float sceneDepth = texture2D(tDepth, uv).r;
  if (sceneDepth < gl_FragCoord.z) discard;

  vec3 toSurface = vWorld - cameraPosition;
  float surfaceDistance = length(toSurface);
  vec3 viewDirection = toSurface / surfaceDistance;
  vec3 directFloor = worldFromDepth(uv, sceneDepth);
  float directDepth = vWorld.y - directFloor.y;

  vec2 point = vWorld.xz;
  vec4 swellA = texture2D(uWaveGradient, point * 0.0105 + vec2(uTime * 0.006, uTime * 0.0035));
  vec4 swellB = texture2D(uWaveGradient, point * 0.0173 + vec2(-uTime * 0.0045, uTime * 0.0052) + 0.41);
  vec2 slope = (swellA.rg - 0.5) * 0.3 + (swellB.rg - 0.5) * 0.22 + (swellA.ba - 0.5) * 0.2 + (swellB.ba - 0.5) * 0.16;
  float calmNearShore = smoothstep(0.0, 1.6, directDepth);
  float inPool = smoothstep(0.08, 0.3, texture2D(uRetained, point / uWorldSize + 0.5).g) * step(uSeaLevel, retainedLevel(point));
  slope *= mix(0.35, 1.0, calmNearShore) * mix(1.0, 0.55, inPool);
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

  vec2 edgeFade = smoothstep(vec2(0.0), vec2(0.04), uv) * (1.0 - smoothstep(vec2(0.96), vec2(1.0), uv));
  vec2 refractedUv = uv + slope * (0.07 * calmNearShore * edgeFade.x * edgeFade.y) * min(1.0, 26.0 / surfaceDistance);
  float refractedDepth = texture2D(tDepth, refractedUv).r;
  if (refractedDepth < gl_FragCoord.z) {
    refractedUv = uv;
    refractedDepth = sceneDepth;
  }
  vec3 floorPosition = worldFromDepth(refractedUv, refractedDepth);
  float pathLength = min(distance(floorPosition, vWorld), 60.0);
  vec3 floorColor = texture2D(tScene, refractedUv).rgb;

  vec3 transmitted = floorColor * exp(-uAbsorption * pathLength);
  float turbidity = 1.0 - exp(-pathLength * mix(0.05, 0.022, inPool));
  vec3 underwater = transmitted + uScatterColor * turbidity;

  vec4 sparkleA = texture2D(uWaveGradient, point * 0.071 + vec2(uTime * 0.021, -uTime * 0.014));
  vec4 sparkleB = texture2D(uWaveGradient, point * 0.113 + vec2(-uTime * 0.017, uTime * 0.023) + 0.27);
  vec2 sparkleSlope = slope + ((sparkleA.ba - 0.5) * 0.17 + (sparkleB.ba - 0.5) * 0.12) * mix(0.5, 1.0, calmNearShore);
  vec4 sparkleC = texture2D(uWaveGradient, point * 0.29 + vec2(uTime * 0.03, uTime * 0.019) + 0.61);
  sparkleSlope += (sparkleC.ba - 0.5) * 0.2 * mix(0.4, 1.0, calmNearShore);
  vec3 sparkleNormal = normalize(vec3(-sparkleSlope.x, 1.0, -sparkleSlope.y));
  vec3 reflected = reflect(viewDirection, sparkleNormal);
  reflected.y = abs(reflected.y);
  float facing = max(dot(-viewDirection, normal), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  float towardSun = max(dot(reflected, uSunDirection), 0.0);
  vec3 glitter = mix(uSunColor, vec3(1.0), 0.3) * min(pow(towardSun, 900.0) * 14.0 + pow(towardSun, 120.0) * 0.1, 4.5);
  vec3 color = mix(underwater, skyColor(reflected), fresnel) + glitter;

  float lapping = 0.5 + 0.5 * sin(uTime * 1.3 + point.x * 0.21 + point.y * 0.13);
  float foamLace = texture2D(uNoise, point * 0.055 + vec2(uTime * 0.012, -uTime * 0.008)).r * 0.65 + texture2D(uNoise, point * 0.16 - vec2(uTime * 0.01, uTime * 0.006)).g * 0.55;
  float foamReach = 0.1 + 0.16 * lapping;
  float foamBand = 1.0 - smoothstep(0.0, foamReach, directDepth);
  float sandFloor = 1.0 - texture2D(tScene, uv).a;
  float foam = foamBand * foamBand * smoothstep(0.5, 0.72, foamLace + 0.24 * foamBand) * (1.0 - inPool) * sandFloor * sandFloor;
  color = mix(color, vec3(1.02, 1.0, 0.96), min(1.0, foam) * 0.65);

  float hazeReach = surfaceDistance * uHazeDensity;
  float haze = 1.0 - exp(-hazeReach * hazeReach);
  color = mix(color, uHazeColor, haze);

  float coverage = smoothstep(0.0, 0.05, directDepth);
  gl_FragColor = vec4(mix(texture2D(tScene, uv).rgb, color, coverage), 1.0);
}
`;

function buildSeaGeometry() {
  const near = new THREE.PlaneGeometry(NEAR_HALF_SIZE * 2, NEAR_HALF_SIZE * 2, NEAR_SEGMENTS, NEAR_SEGMENTS).rotateX(-Math.PI / 2);
  const positions = Array.from(near.attributes.position.array);
  const indices = Array.from(near.index.array);
  const corners = [
    [-NEAR_HALF_SIZE, -NEAR_HALF_SIZE], [NEAR_HALF_SIZE, -NEAR_HALF_SIZE], [NEAR_HALF_SIZE, NEAR_HALF_SIZE], [-NEAR_HALF_SIZE, NEAR_HALF_SIZE],
    [-FAR_HALF_SIZE, -FAR_HALF_SIZE], [FAR_HALF_SIZE, -FAR_HALF_SIZE], [FAR_HALF_SIZE, FAR_HALF_SIZE], [-FAR_HALF_SIZE, FAR_HALF_SIZE],
  ];
  const firstCorner = positions.length / 3;
  for (const [x, z] of corners) positions.push(x, 0, z);
  for (let side = 0; side < 4; side++) {
    const inner = firstCorner + side;
    const innerNext = firstCorner + ((side + 1) % 4);
    const outer = firstCorner + 4 + side;
    const outerNext = firstCorner + 4 + ((side + 1) % 4);
    indices.push(inner, innerNext, outer, innerNext, outerNext, outer);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

export function createWater(waveGradientTexture, overlayUniforms) {
  const uniforms = {
    ...seaUniforms,
    ...overlayUniforms,
    uWaveGradient: { value: waveGradientTexture },
    uAbsorption: { value: new THREE.Vector3(0.17, 0.04, 0.03) },
    uScatterColor: { value: new THREE.Color(0.03, 0.34, 0.4) },
    uHazeColor: { value: lighting.hazeColor },
    uHazeDensity: { value: lighting.hazeDensity },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VERTEX_GLSL, fragmentShader: WATER_FRAGMENT_GLSL, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(buildSeaGeometry(), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return { mesh, uniforms };
}
