import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applySeaside } from './seaside.js';
import { createNoise2D } from '../noise.js';
import { SHELLS, CLAWS, canAfford, enchantBonus, enchantCost, ENCHANT_LEVELS, MAX_ENCHANT } from './gear.js';
import { RESOURCE_TYPES } from './resources.js';

export const WORKSHOP_REACH = 2.9;
export const WORKSHOP_BLOCK_RADIUS = 1.7;

const linearColor = (red, green, blue) => new THREE.Color().setRGB(red, green, blue, THREE.SRGBColorSpace);
const STONE_COLOR = linearColor(0.82, 0.66, 0.48);
const SHELL_TOOL_COLOR = linearColor(0.95, 0.88, 0.76);
const SHELL_TOOL_EDGE = linearColor(0.82, 0.5, 0.36);
const HANDLE_COLOR = linearColor(0.62, 0.5, 0.36);

function painted(geometry, color, shadeByHeight = 0) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index++) {
    const heightShare = (positions.getY(index) - min.y) / Math.max(1e-5, max.y - min.y);
    const shade = 1 - shadeByHeight * (1 - heightShare);
    colors.set([color.r * shade, color.g * shade, color.b * shade], index * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  if (geometry.index) return geometry.toNonIndexed();
  return geometry;
}

function buildStoneGeometry() {
  const noise = createNoise2D(61);
  const geometry = new THREE.IcosahedronGeometry(1, 4);
  const positions = geometry.attributes.position;
  const point = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    const bump = 1 + 0.08 * noise(point.x * 1.7 + 3, point.z * 1.7) + 0.04 * noise(point.x * 4.1, point.y * 4.1 + point.z * 2);
    const flatTop = point.y > 0.25 ? 0.25 + (point.y - 0.25) * 0.25 : point.y;
    positions.setXYZ(index, point.x * 1.75 * bump, flatTop * 0.62 * bump + 0.05, point.z * 1.4 * bump);
  }
  geometry.computeVertexNormals();
  return painted(geometry, STONE_COLOR, 0.35);
}

function buildToolsGeometry() {
  const hammerHead = painted(new THREE.CylinderGeometry(0.17, 0.24, 0.85, 10).rotateZ(Math.PI / 2), SHELL_TOOL_COLOR, 0.25);
  const hammerBand = painted(new THREE.TorusGeometry(0.215, 0.04, 5, 14).rotateY(Math.PI / 2), SHELL_TOOL_EDGE);
  const handle = painted(new THREE.CylinderGeometry(0.07, 0.085, 1.3, 7).rotateX(Math.PI / 2), HANDLE_COLOR, 0.3);
  const scallop = painted(new THREE.ConeGeometry(0.3, 0.12, 9, 1, true).rotateX(Math.PI).scale(1, 1, 1.1), SHELL_TOOL_COLOR);
  const awl = painted(new THREE.ConeGeometry(0.07, 0.62, 6).rotateZ(Math.PI / 2), SHELL_TOOL_EDGE);
  return mergeGeometries([
    hammerHead.translate(0, 0.62, 0.62).rotateY(0.5).translate(-0.25, 0, -0.2),
    hammerBand.translate(0, 0.62, 0.62).rotateY(0.5).translate(-0.25, 0, -0.2),
    handle.translate(0, 0.5, 0).rotateY(0.5).translate(-0.25, 0, -0.2),
    scallop.translate(0.55, 0.47, 0.45),
    awl.rotateY(-0.9).translate(-0.1, 0.43, -0.55),
  ]);
}

export function createWorkbenchModel(scene, world, quality, spot, labelParent) {
  const group = new THREE.Group();
  const stoneMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { surface: 'rock', wetDarkening: 0.55, wetRoughness: 0.3, chromaticCaustics: quality.chromaticCaustics });
  const toolMaterial = applySeaside(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, side: THREE.DoubleSide }), { chromaticCaustics: quality.chromaticCaustics });
  const stone = new THREE.Mesh(buildStoneGeometry(), stoneMaterial);
  const tools = new THREE.Mesh(buildToolsGeometry(), toolMaterial);
  for (const mesh of [stone, tools]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  group.add(stone, tools);
  group.position.set(spot.x, world.heightAt(spot.x, spot.z) - 0.12, spot.z);
  group.rotation.y = 0.4;
  group.visible = false;
  scene.add(group);

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 2.65, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.0), transparent: true, opacity: 0, depthWrite: false, fog: false }),
  );
  marker.position.set(spot.x, world.heightAt(spot.x, spot.z) + 0.1, spot.z);
  marker.visible = false;
  scene.add(marker);
  const label = element('div', 'world-label hidden', labelParent, '🔨 Workshop');
  const labelPoint = new THREE.Vector3();

  return {
    spot,
    group,
    get built() {
      return group.visible;
    },
    build() {
      group.visible = true;
    },
    update(time, highlighted, camera) {
      marker.visible = group.visible && highlighted;
      labelPoint.set(spot.x, group.position.y + 2.2, spot.z).project(camera);
      const labelVisible = marker.visible && labelPoint.z < 1;
      label.classList.toggle('hidden', !labelVisible);
      if (labelVisible) label.style.transform = `translate(-50%, -100%) translate(${(labelPoint.x * 0.5 + 0.5) * innerWidth}px, ${(-labelPoint.y * 0.5 + 0.5) * innerHeight - 6 * Math.abs(Math.sin(time * 2.6))}px)`;
      marker.material.opacity = 0.55 + 0.35 * Math.sin(time * 3.2);
      marker.scale.setScalar(1 + 0.05 * Math.sin(time * 3.2));
    },
  };
}

export function element(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

export function percent(value) {
  return `${Math.round(value * 100)}%`;
}

export function shellStatsText(definition) {
  return `🛡 ${definition.defense} · 🏃 ${percent(definition.speedFactor)} · 🗡️ ×${definition.attackFactor.toFixed(2)}`;
}

function costRow(cost, inventory, parent) {
  const row = element('div', 'cost', parent);
  for (const [type, amount] of Object.entries(cost)) {
    const have = inventory[type] || 0;
    element('span', have >= amount ? 'cost-item' : 'cost-item short', row, have >= amount ? `${RESOURCE_TYPES[type].icon} ${amount} ✓` : `${RESOURCE_TYPES[type].icon} ${amount} (have ${have})`);
  }
}

function enchantedStatText(category, definition, level) {
  if (category === 'shell') return `🛡 ${definition.defense + enchantBonus(definition.defense, level)}`;
  return `🗡️ +${definition.attackBonus + enchantBonus(definition.attackBonus, level)}`;
}

export function createWorkbenchPanel(root, { gear, inventory, onCraft, onEnchant, onClose }) {
  const overlay = element('div', 'workbench', root);
  const card = element('div', 'workbench-card', overlay);
  const header = element('div', 'workbench-header', card);
  element('div', 'workbench-title', header, '🔨 Workshop');
  const closeButton = element('button', 'workbench-close', header, '✕');
  closeButton.setAttribute('aria-label', 'Close');
  const tabRow = element('div', 'workbench-tabs', card);
  const tabNames = ['Craft', 'Enchant'];
  const tabButtons = tabNames.map((name) => {
    const button = element('button', '', tabRow, name);
    button.dataset.tab = name;
    return button;
  });
  const body = element('div', 'workbench-body', card);
  let activeTab = 'Craft';

  function renderCraft() {
    const entries = [
      ...Object.entries(SHELLS).filter(([, definition]) => definition.cost).map(([kind, definition]) => ({ category: 'shell', kind, definition })),
      ...Object.entries(CLAWS).filter(([, definition]) => definition.cost).map(([kind, definition]) => ({ category: 'claws', kind, definition })),
    ];
    for (const { category, kind, definition } of entries) {
      const row = element('div', 'item', body);
      const text = element('div', 'item-text', row);
      element('div', 'item-name', text, category === 'shell' ? `${definition.label} · ${definition.role}` : definition.label);
      element('div', 'item-stats', text, category === 'shell' ? shellStatsText(definition) : `🗡️ +${definition.attackBonus} attack`);
      if (definition.ability) element('div', 'item-ability', text, `${definition.ability.label} — ${definition.ability.description}`);
      const owned = (category === 'shell' ? gear.state.shells : gear.state.claws).filter((item) => item.kind === kind).length;
      if (owned) element('div', 'item-owned', text, `Owned: ${owned}`);
      costRow(definition.cost, inventory(), text);
      const button = element('button', 'item-action', row, 'Craft');
      button.dataset.craft = `${category}:${kind}`;
      button.disabled = !canAfford(definition.cost, inventory());
      button.addEventListener('click', () => onCraft(category, kind));
    }
  }

  function renderEnchantResult() {
    if (!enchantState.lastResult) return;
    const { success, label, level } = enchantState.lastResult;
    element('div', success ? 'enchant-result success' : 'enchant-result broke', body, success ? `✨ ${label} is now +${level}!` : `💥 ${label} broke.`);
  }

  function renderEnchant() {
    renderEnchantResult();
    const pearls = inventory().pearls || 0;
    element('div', 'summary', body, `You have 🦪 ${pearls} · +1 to +3 never fail. Higher levels can break the item.`);
    if (!pearls) element('div', 'enchant-hint', body, 'Pearls lie in the deep parts of tide pools. Shore crabs sometimes drop one.');
    const entries = gear.enchantableItems().sort((first, second) => isWorn(second.item) - isWorn(first.item));
    if (!entries.length) element('div', 'placeholder', body, 'Craft a shell or claws to enchant them.');
    for (const { category, item, definition } of entries) {
      const level = item.enchant || 0;
      const targetLevel = level + 1;
      const row = element('div', isWorn(item) ? 'item worn' : 'item', body);
      row.dataset.enchantItem = String(item.id);
      const text = element('div', 'item-text', row);
      const name = element('div', 'item-name', text, level ? `${definition.label} +${level}` : definition.label);
      if (isWorn(item)) element('span', 'enchant-worn', name, '✓ Wearing');
      if (targetLevel > MAX_ENCHANT) {
        element('div', 'item-stats', text, `${enchantedStatText(category, definition, level)} · fully enchanted`);
        const maxButton = element('button', 'item-action', row, 'Max');
        maxButton.disabled = true;
        continue;
      }
      element('div', 'item-stats', text, `${enchantedStatText(category, definition, level)} → ${enchantedStatText(category, definition, targetLevel).split(' ')[1]}`);
      const chance = ENCHANT_LEVELS[targetLevel].chance;
      const odds = element('div', 'enchant-odds', text, `+${targetLevel}: ${chance < 1 ? `${percent(chance)} success` : 'always succeeds'}`);
      if (chance < 1) {
        odds.classList.add('risky');
        element('span', 'enchant-break', odds, ` · ⚠ ${percent(1 - chance)} break risk`);
      }
      odds.dataset.chance = String(chance);
      const cost = enchantCost(targetLevel);
      costRow(cost, inventory(), text);
      const armed = enchantState.armedId === item.id;
      const button = element('button', armed ? 'item-action armed' : chance < 1 ? 'item-action risky-action' : 'item-action', row, armed ? `Confirm · ${percent(1 - chance)} break` : 'Enchant');
      button.dataset.enchant = String(item.id);
      button.disabled = !canAfford(cost, inventory());
      button.addEventListener('click', () => {
        if (chance < 1 && enchantState.armedId !== item.id) {
          Object.assign(enchantState, { armedId: item.id, lastResult: null });
          render();
          return;
        }
        enchantState.armedId = null;
        const result = onEnchant(item.id);
        if (result) enchantState.lastResult = { success: result.success, label: definition.label, level: result.level };
        render();
      });
    }
  }

  function isWorn(item) {
    return item.id === gear.state.wornShellId || item.id === gear.state.wornClawsId;
  }

  const enchantState = { armedId: null, lastResult: null };

  function render() {
    body.replaceChildren();
    for (const button of tabButtons) button.classList.toggle('active', button.dataset.tab === activeTab);
    if (activeTab === 'Craft') renderCraft();
    else renderEnchant();
  }

  for (const button of tabButtons) {
    button.addEventListener('click', () => {
      activeTab = button.dataset.tab;
      Object.assign(enchantState, { armedId: null, lastResult: null });
      render();
    });
  }
  closeButton.addEventListener('click', () => onClose());
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) onClose();
  });

  return {
    get isOpen() {
      return overlay.classList.contains('visible');
    },
    open(tab) {
      if (tab) activeTab = tab;
      render();
      overlay.classList.add('visible');
      root.classList.add('panel-open');
    },
    close() {
      Object.assign(enchantState, { armedId: null, lastResult: null });
      overlay.classList.remove('visible');
      root.classList.remove('panel-open');
    },
    render,
  };
}
