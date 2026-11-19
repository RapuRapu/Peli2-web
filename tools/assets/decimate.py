import sys
import bpy

source_path, output_path, target_triangles = sys.argv[-3], sys.argv[-2], int(sys.argv[-1])

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source_path)
high = next(obj for obj in bpy.context.scene.objects if obj.type == "MESH")
high.name = "crab_high"
bpy.context.view_layer.objects.active = high
high.select_set(True)
bpy.ops.object.duplicate()
low = bpy.context.active_object
low.name = "crab_low"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.object.mode_set(mode="OBJECT")
triangle_count = sum(len(polygon.vertices) - 2 for polygon in low.data.polygons)
decimate = low.modifiers.new("decimate", "DECIMATE")
decimate.ratio = target_triangles / triangle_count
bpy.ops.object.modifier_apply(modifier="decimate")
print("low triangles", sum(len(polygon.vertices) - 2 for polygon in low.data.polygons), "vertices", len(low.data.vertices))
bpy.ops.wm.save_as_mainfile(filepath=output_path)
