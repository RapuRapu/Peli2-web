import os
import sys
import json
import bpy
import bmesh
import numpy as np
import scipy.sparse as sparse
import scipy.sparse.csgraph as csgraph
from mathutils import Vector

stage_blend, output_glb, report_json = sys.argv[-3], sys.argv[-2], sys.argv[-1]

TEXTURE_PIXELS = 1024
GAME_SCALE = 1.15
CORE_HALF_WIDTH = 0.24
CORE_FRONT_Y = -0.32
CORE_BACK_Y = 0.24
CORE_BOTTOM_Z = -0.22
ABDOMEN_START_Y = 0.24
ABDOMEN_HALF_WIDTH = 0.24
SMALL_COMPONENT_LIMIT = 150
JOINT_BLEND = 0.035
REAR_START_Y = 0.1
PALE_MIN = 0.35
PALE_SPREAD = 0.25
EYE_MIN_Z = 0.17
EYE_MAX_Y = -0.15
EYE_HALF_WIDTH = 0.2
EYE_MIN_Y = -10.0
EYES_INSIDE_CORE = True
FACE_HALF_WIDTH = 0.0
FACE_FRONT_Y = 0.0
ABDOMEN_MIN_Z = -0.25

LIMBS = {
    "leg_front_R": {"tip": (-0.65, -0.38), "joints": (0.45, 0.78)},
    "leg_middle_R": {"tip": (-0.62, 0.05), "joints": (0.45, 0.78)},
    "leg_rear_R": {"tip": (-0.72, 0.52), "joints": (0.45, 0.78)},
    "leg_front_L": {"tip": (0.65, -0.38), "joints": (0.45, 0.78)},
    "leg_middle_L": {"tip": (0.62, 0.05), "joints": (0.45, 0.78)},
    "leg_rear_L": {"tip": (0.72, 0.52), "joints": (0.45, 0.78)},
    "claw_small": {"tip": (-0.36, -0.55), "joints": (0.35, 0.6)},
    "claw_big": {"tip": (0.36, -0.94), "joints": (0.3, 0.55)},
}
BODY_CENTER_XY = np.array([0.0, -0.05])
ROOT_RADIUS = 0.17

if os.environ.get("RIG_CONFIG"):
    with open(os.environ["RIG_CONFIG"]) as config_file:
        overrides = json.load(config_file)
    if "BODY_CENTER_XY" in overrides:
        overrides["BODY_CENTER_XY"] = np.array(overrides["BODY_CENTER_XY"])
    globals().update(overrides)

bpy.ops.wm.open_mainfile(filepath=stage_blend)
high = bpy.data.objects["crab_high"]
low = bpy.data.objects["crab_low"]
source_material = high.data.materials[0]
source_images = {}
for node in source_material.node_tree.nodes:
    if node.type == "TEX_IMAGE":
        source_images[node.image.name] = node.image


def image_feeding(socket_name):
    principled = next(node for node in source_material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    stack = [principled.inputs[socket_name]]
    while stack:
        socket = stack.pop()
        for link in socket.links:
            if link.from_node.type == "TEX_IMAGE":
                return link.from_node.image
            stack.extend(link.from_node.inputs)
    return None


base_color_image = image_feeding("Base Color")
roughness_image = image_feeding("Roughness")
normal_image_source = image_feeding("Normal")

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 1
baked_normal = bpy.data.images.new("crab_normal", TEXTURE_PIXELS, TEXTURE_PIXELS)
baked_normal.colorspace_settings.name = "Non-Color"
bake_material = bpy.data.materials.new("bake_target")
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
bpy.ops.object.shade_smooth()
bpy.ops.object.bake(type="NORMAL", use_selected_to_active=True, cage_extrusion=0.012, max_ray_distance=0.03, margin=6)
print("normal baked")

positions = np.array([vertex.co[:] for vertex in low.data.vertices])
edges = np.array([edge.vertices[:] for edge in low.data.edges])
x, y, z = positions.T
abdomen_mask = (y > ABDOMEN_START_Y) & (np.abs(x) < ABDOMEN_HALF_WIDTH) & (z > ABDOMEN_MIN_Z)
core_mask = (np.abs(x) < CORE_HALF_WIDTH) & (y > CORE_FRONT_Y) & (y < CORE_BACK_Y) & (z > CORE_BOTTOM_Z)
core_mask |= (np.abs(x) < FACE_HALF_WIDTH) & (y > FACE_FRONT_Y) & (y <= CORE_FRONT_Y) & (z > CORE_BOTTOM_Z)
eye_mask = (core_mask | (not EYES_INSIDE_CORE)) & (z > EYE_MIN_Z) & (y < EYE_MAX_Y) & (y > EYE_MIN_Y) & (np.abs(x) < EYE_HALF_WIDTH)
outside = ~(abdomen_mask | core_mask | eye_mask)
outside_index = np.where(outside)[0]
remap = -np.ones(len(positions), int)
remap[outside_index] = np.arange(len(outside_index))
outside_edges = remap[edges[outside[edges[:, 0]] & outside[edges[:, 1]]]]
graph = sparse.coo_matrix((np.ones(len(outside_edges)), (outside_edges[:, 0], outside_edges[:, 1])), shape=(len(outside_index),) * 2)
_, component_labels = csgraph.connected_components(graph, directed=False)
component_sizes = np.bincount(component_labels)
small_component = component_sizes[component_labels] < SMALL_COMPONENT_LIMIT
body_extra = outside_index[small_component]
limb_vertices = outside_index[~small_component]


limb_names = list(LIMBS)
roots = {}
for name, limb in LIMBS.items():
    tip = np.array(limb["tip"])
    direction = (tip - BODY_CENTER_XY) / np.linalg.norm(tip - BODY_CENTER_XY)
    roots[name] = np.array(limb["root"]) if "root" in limb else BODY_CENTER_XY + direction * ROOT_RADIUS


def segment_distance(points, start, end):
    along = end - start
    share = np.clip(((points - start) @ along) / (along @ along), 0, 1)
    return np.linalg.norm(points - (start + share[:, None] * along), axis=1), ((points - start) @ along) / (along @ along)


limb_positions = positions[limb_vertices]
edge_lengths = np.linalg.norm(positions[outside_index[outside_edges[:, 0]]] - positions[outside_index[outside_edges[:, 1]]], axis=1)
weighted_graph = sparse.coo_matrix((edge_lengths, (outside_edges[:, 0], outside_edges[:, 1])), shape=(len(outside_index),) * 2).tocsr()
tip_sources = []
for name in limb_names:
    tip = np.array(LIMBS[name]["tip"])
    candidates = np.where(~small_component)[0]
    candidate_positions = positions[outside_index[candidates]]
    score = np.linalg.norm(candidate_positions[:, :2] - tip, axis=1) + 0.3 * np.maximum(0, candidate_positions[:, 2] + 0.45)
    tip_sources.append(candidates[np.argmin(score)])
_, _, nearest_source = csgraph.dijkstra(weighted_graph, directed=False, indices=tip_sources, min_only=True, return_predecessors=True)
source_to_limb = {source: number for number, source in enumerate(tip_sources)}
limb_owner = np.array([source_to_limb.get(source, -1) for source in nearest_source[~small_component]])
unreached = limb_owner < 0
if unreached.any():
    limb_xy = limb_positions[:, :2]
    fallback = np.stack([segment_distance(limb_xy, roots[name], np.array(LIMBS[name]["tip"]))[0] for name in limb_names], axis=1)
    limb_owner[unreached] = np.argmin(fallback[unreached], axis=1)
print("unreached limb vertices", int(unreached.sum()))

bone_heads = {"root": (Vector((0, 0, -0.6)), Vector((0, 0, -0.45)))}
body_core_center = positions[core_mask].mean(axis=0)
bone_heads["body"] = (Vector((body_core_center[0], body_core_center[1], body_core_center[2])), Vector((body_core_center[0], body_core_center[1], body_core_center[2] + 0.2)))
abdomen_points = positions[abdomen_mask]
abdomen_base = abdomen_points[abdomen_points[:, 1] < ABDOMEN_START_Y + 0.06].mean(axis=0)
abdomen_far = abdomen_points[abdomen_points[:, 1] > abdomen_points[:, 1].max() - 0.15].mean(axis=0)
bone_heads["abdomen"] = (Vector(abdomen_base), Vector(abdomen_far))

weights = {}


def add_weight(bone, vertex, value):
    weights.setdefault(bone, {})
    weights[bone][vertex] = weights[bone].get(vertex, 0) + value


for side, sign in (("R", -1), ("L", 1)):
    stalk = np.where(eye_mask & (np.sign(x) == sign))[0]
    stalk_points = positions[stalk]
    base = stalk_points[stalk_points[:, 2] < stalk_points[:, 2].min() + 0.06].mean(axis=0)
    top = stalk_points[stalk_points[:, 2] > stalk_points[:, 2].max() - 0.06].mean(axis=0)
    bone_heads[f"eye_{side}"] = (Vector(base), Vector(top))
    for vertex in stalk:
        add_weight(f"eye_{side}", vertex, 1.0)

limb_report = {}
for limb_number, name in enumerate(limb_names):
    members = limb_vertices[limb_owner == limb_number]
    root_xy = roots[name]
    tip_xy = np.array(LIMBS[name]["tip"])
    _, along = segment_distance(positions[members][:, :2], root_xy, tip_xy)
    joint_shares = LIMBS[name]["joints"]
    joint_points = []
    member_points = positions[members]
    root_band = member_points[along < along.min() + 0.08].mean(axis=0)
    joint_points.append(np.array([root_xy[0], root_xy[1], root_band[2]]))
    for share in joint_shares:
        band = member_points[np.abs(along - share) < 0.04]
        joint_points.append(band.mean(axis=0))
    far = member_points[along > along.max() - 0.05].mean(axis=0)
    joint_points.append(far)
    bone_names = [f"{name}_{segment}" for segment in (1, 2, 3)]
    for segment, bone in enumerate(bone_names):
        bone_heads[bone] = (Vector(joint_points[segment]), Vector(joint_points[segment + 1]))
    tip_direction = Vector(joint_points[3]) - Vector(joint_points[2])
    bone_heads[f"{name}_tip"] = (Vector(joint_points[3]), Vector(joint_points[3]) + tip_direction.normalized() * 0.05)
    boundaries = (joint_shares[0], joint_shares[1])
    for vertex, share in zip(members, along):
        first_to_second = np.clip((share - boundaries[0] + JOINT_BLEND) / (2 * JOINT_BLEND), 0, 1)
        second_to_third = np.clip((share - boundaries[1] + JOINT_BLEND) / (2 * JOINT_BLEND), 0, 1)
        add_weight(bone_names[0], vertex, 1 - first_to_second)
        add_weight(bone_names[1], vertex, first_to_second * (1 - second_to_third))
        add_weight(bone_names[2], vertex, second_to_third)
    limb_report[name] = {"vertices": int(len(members)), "joints": [point.round(3).tolist() for point in joint_points]}

assigned = np.zeros(len(positions), bool)
for bone_weights in weights.values():
    assigned[list(bone_weights)] = True
for vertex in np.where(abdomen_mask)[0]:
    add_weight("abdomen", vertex, 1.0)
    assigned[vertex] = True
for vertex in np.where(~assigned)[0]:
    add_weight("body", vertex, 1.0)

claw_vertex = np.zeros(len(positions), bool)
for name in ("claw_small", "claw_big"):
    for segment in (1, 2, 3):
        claw_vertex[list(weights[f"{name}_{segment}"])] = True

ground = positions[:, 2].min()
shift = np.array([-body_core_center[0], -body_core_center[1], -ground])


def to_game(point):
    return Vector(((np.array(point) + shift) * GAME_SCALE).tolist())


for vertex in low.data.vertices:
    vertex.co = to_game(vertex.co)

for image in (base_color_image, roughness_image):
    image.scale(TEXTURE_PIXELS, TEXTURE_PIXELS)


def build_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes["Principled BSDF"]
    color_node = nodes.new("ShaderNodeTexImage")
    color_node.image = base_color_image
    links.new(color_node.outputs["Color"], principled.inputs["Base Color"])
    roughness_node = nodes.new("ShaderNodeTexImage")
    roughness_node.image = roughness_image
    roughness_node.image.colorspace_settings.name = "Non-Color"
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(roughness_node.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], principled.inputs["Roughness"])
    links.new(separate.outputs["Blue"], principled.inputs["Metallic"])
    normal_node = nodes.new("ShaderNodeTexImage")
    normal_node.image = baked_normal
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])
    return material


color_pixels = np.array(base_color_image.pixels[:]).reshape(base_color_image.size[1], base_color_image.size[0], 4)
uv_layer = low.data.uv_layers.active.data


def is_pale_rear(polygon):
    center_y = np.mean([positions[index][1] for index in polygon.vertices])
    if center_y < REAR_START_Y:
        return False
    u = np.mean([uv_layer[loop].uv[0] for loop in polygon.loop_indices]) % 1
    v = np.mean([uv_layer[loop].uv[1] for loop in polygon.loop_indices]) % 1
    red, green, blue = color_pixels[int(v * (color_pixels.shape[0] - 1)), int(u * (color_pixels.shape[1] - 1)), :3]
    return min(red, green, blue) > PALE_MIN and max(red, green, blue) - min(red, green, blue) < PALE_SPREAD


low.data.materials.clear()
for name in ("crab_body", "crab_claws", "crab_abdomen", "crab_rear"):
    low.data.materials.append(build_material(name))
rear_faces = 0
for polygon in low.data.polygons:
    corners = list(polygon.vertices)
    if abdomen_mask[corners].sum() * 2 > len(corners):
        polygon.material_index = 2
    elif claw_vertex[corners].all():
        polygon.material_index = 1
    elif is_pale_rear(polygon):
        polygon.material_index = 3
        rear_faces += 1
    else:
        polygon.material_index = 0
print("rear faces", rear_faces)

armature_data = bpy.data.armatures.new("crab_rig")
armature = bpy.data.objects.new("crab_rig", armature_data)
scene.collection.objects.link(armature)
bpy.context.view_layer.objects.active = armature
bpy.ops.object.select_all(action="DESELECT")
armature.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
parents = {"body": "root", "abdomen": "body", "eye_R": "body", "eye_L": "body"}
for name in limb_names:
    parents[f"{name}_1"] = "body"
    parents[f"{name}_2"] = f"{name}_1"
    parents[f"{name}_3"] = f"{name}_2"
    parents[f"{name}_tip"] = f"{name}_3"
edit_bones = {}
for bone_name in ["root", "body", "abdomen", "eye_R", "eye_L"] + [f"{name}_{segment}" for name in limb_names for segment in (1, 2, 3, "tip")]:
    head, tail = bone_heads[bone_name]
    bone = armature_data.edit_bones.new(bone_name)
    bone.head = to_game(head)
    bone.tail = to_game(tail)
    if (bone.tail - bone.head).length < 0.02:
        bone.tail = bone.head + Vector((0, 0, 0.05))
    edit_bones[bone_name] = bone
for bone_name, parent_name in parents.items():
    edit_bones[bone_name].parent = edit_bones[parent_name]
bpy.ops.object.mode_set(mode="OBJECT")

for bone_name, bone_weights in weights.items():
    group = low.vertex_groups.new(name=bone_name)
    for vertex, value in bone_weights.items():
        if value > 1e-4:
            group.add([int(vertex)], float(value), "ADD")
low.parent = armature
modifier = low.modifiers.new("rig", "ARMATURE")
modifier.object = armature

bpy.data.objects.remove(high, do_unlink=True)
low.name = "crab"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=output_glb,
    export_format="GLB",
    use_selection=True,
    export_image_format="WEBP",
    export_image_quality=82,
    export_skins=True,
    export_animations=False,
    export_morph=False,
    export_yup=True,
    export_apply=False,
)
report = {
    "triangles": sum(len(polygon.vertices) - 2 for polygon in low.data.polygons),
    "vertices": len(low.data.vertices),
    "abdomen_vertices": int(abdomen_mask.sum()),
    "eye_vertices": int(eye_mask.sum()),
    "claw_vertices": int(claw_vertex.sum()),
    "body_extra_small_components": int(len(body_extra)),
    "limbs": limb_report,
    "game_height": float(max(v.co.z for v in low.data.vertices)),
}
with open(report_json, "w") as handle:
    json.dump(report, handle, indent=1)
print(json.dumps(report))
