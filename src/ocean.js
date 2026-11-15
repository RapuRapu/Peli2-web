import * as THREE from 'three';

const GRAVITY = 9.81;

const WAVE_DEFINITIONS = [
  { angleDegrees: 200, wavelength: 46, amplitude: 0.34 },
  { angleDegrees: 235, wavelength: 29, amplitude: 0.22 },
  { angleDegrees: 170, wavelength: 18, amplitude: 0.13 },
  { angleDegrees: 260, wavelength: 11.5, amplitude: 0.07 },
];

const WAVE_COUNT = WAVE_DEFINITIONS.length;
const waveDirectionX = new Float32Array(WAVE_COUNT);
const waveDirectionZ = new Float32Array(WAVE_COUNT);
const waveNumber = new Float32Array(WAVE_COUNT);
const waveAngularSpeed = new Float32Array(WAVE_COUNT);
const waveAmplitude = new Float32Array(WAVE_COUNT);
const waveUniformVectors = [];

WAVE_DEFINITIONS.forEach((wave, index) => {
  const angle = (wave.angleDegrees * Math.PI) / 180;
  waveDirectionX[index] = Math.cos(angle);
  waveDirectionZ[index] = Math.sin(angle);
  waveNumber[index] = (2 * Math.PI) / wave.wavelength;
  waveAngularSpeed[index] = Math.sqrt(GRAVITY * waveNumber[index]);
  waveAmplitude[index] = wave.amplitude;
  waveUniformVectors.push(new THREE.Vector4(waveDirectionX[index], waveDirectionZ[index], waveNumber[index], waveAngularSpeed[index]));
});

export function waveHeightAt(worldX, worldZ, time) {
  let height = 0;
  for (let i = 0; i < WAVE_COUNT; i++) {
    const phase = waveNumber[i] * (waveDirectionX[i] * worldX + waveDirectionZ[i] * worldZ) - waveAngularSpeed[i] * time;
    height += waveAmplitude[i] * Math.sin(phase);
  }
  return height;
}

const vertexShader = /* glsl */ `
  #define WAVE_COUNT ${WAVE_COUNT}
  uniform float time;
  uniform vec4 waves[WAVE_COUNT];
  uniform float amplitudes[WAVE_COUNT];
  varying vec3 worldPosition;
  varying vec3 waveNormal;
  varying float waveCrest;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec2 horizontal = world.xz;
    vec3 displaced = vec3(horizontal.x, 0.0, horizontal.y);
    vec2 slope = vec2(0.0);
    float crest = 0.0;
    for (int i = 0; i < WAVE_COUNT; i++) {
      vec2 direction = waves[i].xy;
      float phase = waves[i].z * dot(direction, horizontal) - waves[i].w * time;
      float amplitude = amplitudes[i];
      float sinePhase = sin(phase);
      float cosinePhase = cos(phase);
      displaced.y += amplitude * sinePhase;
      displaced.xz -= direction * (0.45 * amplitude) * cosinePhase;
      slope += direction * (amplitude * waves[i].z * cosinePhase);
      crest += amplitude * sinePhase;
    }
    waveNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
    waveCrest = crest;
    worldPosition = displaced;
    gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float time;
  uniform sampler2D seabedHeights;
  uniform float terrainWorldSize;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform vec3 skyHorizonColor;
  uniform vec3 skyZenithColor;
  uniform vec3 shallowColor;
  uniform vec3 deepColor;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;
  varying vec3 worldPosition;
  varying vec3 waveNormal;
  varying float waveCrest;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 blend = local * local * (3.0 - 2.0 * local);
    float a = hash(cell);
    float b = hash(cell + vec2(1.0, 0.0));
    float c = hash(cell + vec2(0.0, 1.0));
    float d = hash(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
  }

  vec2 noiseGradient(vec2 p) {
    const float e = 0.35;
    float center = valueNoise(p);
    return vec2(valueNoise(p + vec2(e, 0.0)) - center, valueNoise(p + vec2(0.0, e)) - center) / e;
  }

  vec2 rippleSlope(vec2 p, float t) {
    vec2 slope = noiseGradient(p * 0.55 + vec2(t * 0.32, t * 0.21));
    slope += noiseGradient(p * 1.3 - vec2(t * 0.41, -t * 0.37) + 17.3) * 0.55;
    return slope;
  }

  void main() {
    vec3 toCamera = cameraPosition - worldPosition;
    float viewDistance = length(toCamera);
    vec3 viewDirection = toCamera / viewDistance;

    vec2 seabedUv = (worldPosition.xz + terrainWorldSize * 0.5) / terrainWorldSize;
    float seabedHeight = -60.0;
    if (all(greaterThan(seabedUv, vec2(0.0))) && all(lessThan(seabedUv, vec2(1.0)))) {
      seabedHeight = texture2D(seabedHeights, seabedUv).r;
    }
    float waterDepth = worldPosition.y - seabedHeight;

    float detailFade = 1.0 - smoothstep(60.0, 380.0, viewDistance);
    vec2 ripple = rippleSlope(worldPosition.xz * 0.6, time) * 0.06 * detailFade;
    vec3 normal = normalize(waveNormal + vec3(-ripple.x, 0.0, -ripple.y));

    float facing = max(dot(normal, viewDirection), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);

    vec3 reflected = reflect(-viewDirection, normal);
    vec3 skyColor = mix(skyHorizonColor, skyZenithColor, clamp(reflected.y * 1.4, 0.0, 1.0));

    float depthBlend = smoothstep(0.0, 16.0, waterDepth);
    vec3 bodyColor = mix(shallowColor, deepColor, depthBlend);
    vec2 windDrift = vec2(-0.94, 0.34);
    vec2 streakSpace = vec2(dot(worldPosition.xz, windDrift), dot(worldPosition.xz, vec2(-windDrift.y, windDrift.x)));
    float swellStreaks = valueNoise(streakSpace * vec2(0.035, 0.12) + vec2(time * 0.08, 0.0)) * 0.6
                       + valueNoise(streakSpace * vec2(0.09, 0.3) - vec2(time * 0.12, time * 0.03)) * 0.4;
    bodyColor *= 0.9 + 0.2 * swellStreaks * (0.4 + 0.6 * depthBlend);
    float diffuse = 0.55 + 0.45 * max(dot(normal, sunDirection), 0.0);
    bodyColor *= diffuse * sunColor;

    vec3 color = mix(bodyColor, skyColor, fresnel * 0.45 * smoothstep(0.0, 4.0, waterDepth));

    vec3 halfVector = normalize(sunDirection + viewDirection);
    float specularLobe = max(dot(normal, halfVector), 0.0);
    float specular = pow(specularLobe, 90.0) * 0.04;
    color += sunColor * vec3(1.0, 0.9, 0.72) * min(specular, 0.45);

    float foamNoise = valueNoise(worldPosition.xz * 0.45 + vec2(time * 0.15, -time * 0.1)) * 0.6
                    + valueNoise(worldPosition.xz * 1.3 - vec2(time * 0.2, time * 0.05)) * 0.4;
    float shoreBand = 1.0 - smoothstep(0.0, 0.8 + foamNoise * 0.5, waterDepth);
    float shorePulse = 0.65 + 0.35 * sin(waterDepth * 4.0 - time * 1.4 + foamNoise * 3.0);
    float shoreFoam = pow(shoreBand, 1.4) * shorePulse * smoothstep(0.15, 0.55, foamNoise);
    float whitecapShape = valueNoise(streakSpace * vec2(0.07, 0.75) + vec2(time * 0.2, 0.0));
    float whitecapLife = 0.5 + 0.5 * sin(time * 0.7 + valueNoise(floor(streakSpace * vec2(0.05, 0.12))) * 40.0);
    float whitecapClusters = smoothstep(0.45, 0.75, valueNoise(worldPosition.xz * 0.012 + 3.1));
    float whitecaps = smoothstep(0.86, 0.96, whitecapShape) * whitecapLife * whitecapLife * whitecapClusters * smoothstep(8.0, 20.0, waterDepth) * 0.22 * detailFade;
    float foam = clamp(shoreFoam + whitecaps, 0.0, 1.0);
    color = mix(color, vec3(0.95, 0.97, 0.97) * (0.75 + 0.25 * sunColor), foam);

    float opacity = mix(0.28, 1.0, smoothstep(0.0, 3.5, waterDepth));
    opacity = max(opacity, fresnel);
    opacity = max(opacity, foam);
    opacity *= smoothstep(-0.05, 0.12, waterDepth);

    float fogAmount = clamp((viewDistance - fogNear) / (fogFar - fogNear), 0.0, 1.0);
    color = mix(color, fogColor, fogAmount);
    opacity = mix(opacity, 1.0, fogAmount);

    gl_FragColor = vec4(color, opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createOcean({ seabedTexture, terrainWorldSize, lighting }) {
  const gridSize = 1100;
  const gridSegments = 180;
  const geometry = new THREE.PlaneGeometry(gridSize, gridSize, gridSegments, gridSegments);
  geometry.rotateX(-Math.PI / 2);

  const uniforms = {
    time: { value: 0 },
    waves: { value: waveUniformVectors },
    amplitudes: { value: Array.from(waveAmplitude) },
    seabedHeights: { value: seabedTexture },
    terrainWorldSize: { value: terrainWorldSize },
    sunDirection: { value: lighting.sunDirection },
    sunColor: { value: lighting.sunColor },
    skyHorizonColor: { value: lighting.skyHorizonColor },
    skyZenithColor: { value: lighting.skyZenithColor },
    shallowColor: { value: new THREE.Color(0.02, 0.55, 0.55) },
    deepColor: { value: new THREE.Color(0.015, 0.14, 0.26) },
    fogColor: { value: lighting.fogColor },
    fogNear: { value: lighting.fogNear },
    fogFar: { value: lighting.fogFar },
  };

  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  const gridCellSize = gridSize / gridSegments;

  function update(time, focusX, focusZ) {
    uniforms.time.value = time;
    mesh.position.x = Math.round(focusX / gridCellSize) * gridCellSize;
    mesh.position.z = Math.round(focusZ / gridCellSize) * gridCellSize;
  }

  return { mesh, update, uniforms };
}
