import { NodeIO } from '@gltf-transform/core';
import { prune, resample } from '@gltf-transform/functions';

const [source, target] = process.argv.slice(2);
const UNUSED_ANIMATIONS = ['Charged_Axe_Chop', 'Attack'];
const io = new NodeIO();
const document = await io.read(source);
const root = document.getRoot();
for (const node of root.listNodes()) if (node.getName().startsWith('Icosphere')) node.dispose();
for (const animation of root.listAnimations()) if (UNUSED_ANIMATIONS.includes(animation.getName())) animation.dispose();
for (const primitive of root.listMeshes().flatMap((mesh) => mesh.listPrimitives())) primitive.setAttribute('TANGENT', null);
await document.transform(resample({ tolerance: 0.002 }), prune());
await io.write(target, document);
console.log(root.listAnimations().map((animation) => animation.getName()).join(', '));
