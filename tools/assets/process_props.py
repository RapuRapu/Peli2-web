import sys
import json
import bpy

import os
PROP_TRIANGLES = {"burrow_entrance": 3000, "burrow_exit": 4000}
TEXTURE_PIXELS = 512

source_folder, output_glb = sys.argv[-2], sys.argv[-1]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 1
report = {}


def image_feeding(material, socket_name):
    principled = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    stack = [principled.inputs[socket_name]]
    while stack:
        socket = stack.pop()
        for link in socket.links:
            if link.from_node.type == "TEX_IMAGE":
                return link.from_node.image
            stack.extend(link.from_node.inputs)
    return None


low_objects = []
for name, triangles in PROP_TRIANGLES.items():
    if not os.path.exists(f"{source_folder}/{name}.glb"):
        continue
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=f"{source_folder}/{name}.glb")
    high = next(obj for obj in bpy.context.scene.objects if obj not in before and obj.type == "MESH")
    source_material = high.data.materials[0]
    base_color = image_feeding(source_material, "Base Color")
    roughness = image_feeding(source_material, "Roughness")
    base_color.name = f"{name}_color"
    roughness.name = f"{name}_roughness"
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    bpy.context.view_layer.objects.active = high
    bpy.ops.object.duplicate()
    low = bpy.context.active_object
    low.name = name
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.object.mode_set(mode="OBJECT")
    count = sum(len(polygon.vertices) - 2 for polygon in low.data.polygons)
    decimate = low.modifiers.new("decimate", "DECIMATE")
    decimate.ratio = min(1, triangles / count)
    bpy.ops.object.modifier_apply(modifier="decimate")
    bpy.ops.object.shade_smooth()

    baked_normal = bpy.data.images.new(f"{name}_normal", TEXTURE_PIXELS, TEXTURE_PIXELS)
    baked_normal.colorspace_settings.name = "Non-Color"
    bake_material = bpy.data.materials.new(f"{name}_bake")
    bake_material.use_nodes = True
    bake_node = bake_material.node_tree.nodes.new("ShaderNodeTexImage")
    bake_node.image = baked_normal
    bake_material.node_tree.nodes.active = bake_node
    low.data.materials.clear()
    low.data.materials.append(bake_material)
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type="NORMAL", use_selected_to_active=True, cage_extrusion=0.012, max_ray_distance=0.03, margin=4)

    base_color.scale(TEXTURE_PIXELS, TEXTURE_PIXELS)
    roughness.scale(TEXTURE_PIXELS // 2, TEXTURE_PIXELS // 2)
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes["Principled BSDF"]
    color_node = nodes.new("ShaderNodeTexImage")
    color_node.image = base_color
    links.new(color_node.outputs["Color"], principled.inputs["Base Color"])
    roughness_node = nodes.new("ShaderNodeTexImage")
    roughness_node.image = roughness
    roughness.colorspace_settings.name = "Non-Color"
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(roughness_node.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], principled.inputs["Roughness"])
    links.new(separate.outputs["Blue"], principled.inputs["Metallic"])
    normal_node = nodes.new("ShaderNodeTexImage")
    normal_node.image = baked_normal
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])
    low.data.materials.clear()
    low.data.materials.append(material)
    bpy.data.objects.remove(high, do_unlink=True)
    low_objects.append(low)
    report[name] = {"triangles": sum(len(polygon.vertices) - 2 for polygon in low.data.polygons), "source_triangles": count}
    print(name, report[name], flush=True)

bpy.ops.object.select_all(action="DESELECT")
for low in low_objects:
    low.select_set(True)
bpy.ops.export_scene.gltf(filepath=output_glb, export_format="GLB", use_selection=True, export_image_format="WEBP", export_image_quality=80, export_animations=False, export_yup=True)
print(json.dumps(report))
