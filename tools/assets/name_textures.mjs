import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [source, target] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(source);
for (const material of document.getRoot().listMaterials()) {
  const slots = { baseColor: material.getBaseColorTexture(), normal: material.getNormalTexture(), metallicRoughness: material.getMetallicRoughnessTexture() };
  for (const [slot, texture] of Object.entries(slots)) if (texture) texture.setName(`${material.getName()}_${slot}`);
}
await io.write(target, document);
