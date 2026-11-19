#!/bin/sh
# Usage: build_cook.sh <raw cook glb> <output glb>; run where @gltf-transform/cli and functions are installed.
set -e
work=$(mktemp -d)
cli="npx @gltf-transform/cli@4"
node "$(dirname "$0")/prune_cook.mjs" "$1" "$work/pruned.glb"
$cli resize "$work/pruned.glb" "$work/a.glb" --width 1024 --height 1024 --pattern "texture_0"
$cli resize "$work/a.glb" "$work/b.glb" --width 512 --height 512 --pattern "normal"
$cli resize "$work/b.glb" "$work/c.glb" --width 256 --height 256 --pattern "*metallic*"
$cli webp "$work/c.glb" "$work/d.glb" --quality 78
$cli weld "$work/d.glb" "$work/e.glb"
$cli simplify "$work/e.glb" "$work/f.glb" --ratio 0.55 --error 0.002
$cli quantize "$work/f.glb" "$2" --quantizeWeight 8
rm -rf "$work"
