import sys
import json
import bpy
import numpy as np
import scipy.sparse as sparse
import scipy.sparse.csgraph as csgraph
from mathutils import Vector

CREATURES = {
    "shoreCrab": {"core": {"min": [-0.5, -0.35, -0.2], "max": [0.5, 0.32, 1]}, "suppress": 0.12, "min_reach": 0.25, "scale": 1.6, "joints": (0.4, 0.75)},
    "sandHopper": {"core": {"min": [-0.22, -0.62, -0.25], "max": [0.22, 0.75, 1]}, "suppress": 0.1, "min_reach": 0.2, "scale": 0.7, "joints": (0.4, 0.75), "tail_split_y": 0.15},
    "gull": {"core": {"min": [-0.17, -0.6, -0.24], "max": [0.17, 0.6, 1]}, "suppress": 0.4, "min_reach": 0.18, "scale": 12, "joints": (0.35, 0.7), "head_split_y": -0.25},
    "cockroach": {"core": {"min": [-0.2, -0.6, -1], "max": [0.2, 0.8, 1]}, "suppress": 0.1, "min_reach": 0.15, "scale": 4, "joints": (0.35, 0.7)},
    "rat": {"core": {"min": [-0.25, -1, -0.13], "max": [0.25, 0.08, 1]}, "suppress": 0.16, "min_reach": 0.1, "scale": 4, "joints": (0.4, 0.75), "head_split_y": -0.62},
    "shipCat": {"core": {"min": [-0.3, -1, -0.42], "max": [0.3, 0.62, 1]}, "suppress": 0.35, "min_reach": 0.15, "scale": 4, "joints": (0.4, 0.75), "head_split_y": -0.62},
    "moray": {"spine": {"head": [-0.2, -0.93], "segments": 7}, "scale": 4},
    "octopus": {"core": {"min": [-0.18, -0.12, -1], "max": [0.18, 0.4, 1]}, "suppress": 0.35, "min_reach": 0.3, "scale": 4, "joints": (0.3, 0.65)},
    "mantisShrimp": {"core": {"min": [-0.17, -1, -0.28], "max": [0.17, 1, 1]}, "suppress": 0.15, "min_reach": 0.15, "scale": 4, "joints": (0.4, 0.75), "tail_split_y": 0.55},
    "giantLobster": {"core": {"min": [-0.2, -0.45, -0.3], "max": [0.2, 1, 1]}, "suppress": 0.16, "min_reach": 0.18, "scale": 4, "joints": (0.4, 0.75), "tail_split_y": 0.25},
}
TEXTURE_PIXELS = 512
JOINT_BLEND = 0.05

name, stage_blend, output_glb, report_json = sys.argv[-4], sys.argv[-3], sys.argv[-2], sys.argv[-1]
spec = CREATURES[name]

bpy.ops.wm.open_mainfile(filepath=stage_blend)
high = bpy.data.objects["crab_high"]
low = bpy.data.objects["crab_low"]
source_material = high.data.materials[0]


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
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 1
baked_normal = bpy.data.images.new(f"{name}_normal", TEXTURE_PIXELS, TEXTURE_PIXELS)
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
bpy.ops.object.bake(type="NORMAL", use_selected_to_active=True, cage_extrusion=0.012, max_ray_distance=0.03, margin=4)

positions = np.array([vertex.co[:] for vertex in low.data.vertices])
edges = np.array([edge.vertices[:] for edge in low.data.edges])
weights = {}


def add_weight(bone, vertex, value):
    if value > 1e-4:
        weights.setdefault(bone, {})
        weights[bone][int(vertex)] = weights[bone].get(int(vertex), 0) + value


def rig_spine(spine):
    lengths = np.linalg.norm(positions[edges[:, 0]] - positions[edges[:, 1]], axis=1)
    graph = sparse.coo_matrix((lengths, (edges[:, 0], edges[:, 1])), shape=(len(positions),) * 2).tocsr()
    head_vertex = int(np.argmin(np.linalg.norm(positions[:, :2] - np.array(spine["head"]), axis=1)))
    from_head = csgraph.dijkstra(graph, directed=False, indices=head_vertex)
    reachable = np.isfinite(from_head)
    from_head[~reachable] = from_head[reachable].max()
    share = 1 - from_head / from_head.max()
    count = spine["segments"]
    edges_at = np.linspace(0, 1, count + 1)
    centers = []
    for boundary in edges_at:
        band = positions[np.abs(share - boundary) < 0.5 / count]
        centers.append(band.mean(axis=0))
    heads = {"root": (Vector(centers[0]), Vector(centers[0] + np.array([0, 0, 0.1])))}
    parents = {}
    previous = "root"
    for segment in range(count):
        bone = f"spine_{segment + 1}"
        heads[bone] = (Vector(centers[segment]), Vector(centers[segment + 1]))
        parents[bone] = previous
        previous = bone
    blend = 0.35 / count
    for vertex, value in enumerate(share):
        position = value * count
        index = min(count - 1, int(position))
        local = position - index
        if local < 0.5 and index > 0:
            towards_previous = np.clip((0.5 - local) / (blend * count) * 0.5, 0, 0.5)
            add_weight(f"spine_{index + 1}", vertex, 1 - towards_previous)
            add_weight(f"spine_{index}", vertex, towards_previous)
        elif local >= 0.5 and index < count - 1:
            towards_next = np.clip((local - 0.5) / (blend * count) * 0.5, 0, 0.5)
            add_weight(f"spine_{index + 1}", vertex, 1 - towards_next)
            add_weight(f"spine_{index + 2}", vertex, towards_next)
        else:
            add_weight(f"spine_{index + 1}", vertex, 1)
    return heads, parents, np.array(centers).mean(axis=0)


if "spine" in spec:
    bone_heads, parents, core_center = rig_spine(spec["spine"])
    tips = []
    limb_report = {}
    core_mask = np.zeros(len(positions), bool)
if "spine" not in spec:
    core_min, core_max = np.array(spec["core"]["min"]), np.array(spec["core"]["max"])
    core_mask = np.all((positions > core_min) & (positions < core_max), axis=1)
    core_center = positions[core_mask].mean(axis=0)
    outside = np.where(~core_mask)[0]
    remap = -np.ones(len(positions), int)
    remap[outside] = np.arange(len(outside))
    inner_edges = remap[edges[~core_mask[edges[:, 0]] & ~core_mask[edges[:, 1]]]]
    lengths = np.linalg.norm(positions[outside[inner_edges[:, 0]]] - positions[outside[inner_edges[:, 1]]], axis=1)
    graph = sparse.coo_matrix((lengths, (inner_edges[:, 0], inner_edges[:, 1])), shape=(len(outside),) * 2).tocsr()
    border_edges = edges[core_mask[edges[:, 0]] != core_mask[edges[:, 1]]]
    border = np.unique(np.where(core_mask[border_edges[:, 0]], border_edges[:, 1], border_edges[:, 0]))
    from_core = csgraph.dijkstra(graph, directed=False, indices=remap[border], min_only=True)
    from_core[~np.isfinite(from_core)] = 0

    tips = []
    available = from_core.copy()
    while True:
        candidate = int(np.argmax(available))
        if available[candidate] < spec["min_reach"]:
            break
        tips.append(candidate)
        from_tip = csgraph.dijkstra(graph, directed=False, indices=candidate)
        on_the_way = from_tip + from_core <= from_core[candidate] + spec["suppress"]
        available[on_the_way] = 0
        available[candidate] = 0

    _, _, owner_source = csgraph.dijkstra(graph, directed=False, indices=tips, min_only=True, return_predecessors=True)
    tip_positions = positions[outside[tips]]
    order = np.lexsort((tip_positions[:, 1], np.sign(tip_positions[:, 0])))
    limb_names = {}
    for rank, tip_index in enumerate(order):
        side = "L" if tip_positions[tip_index, 0] > 0 else "R"
        same_side = [index for index in order[:rank] if (tip_positions[index, 0] > 0) == (side == "L")]
        limb_names[tips[tip_index]] = f"limb_{side}{len(same_side)}"

    bone_heads = {"root": (Vector((core_center[0], core_center[1], positions[:, 2].min())), Vector((core_center[0], core_center[1], positions[:, 2].min() + 0.1)))}
    bone_heads["body"] = (Vector(core_center), Vector(core_center + np.array([0, 0, 0.1])))
    limb_report = {}
    parents = {"body": "root"}
    for tip in tips:
        limb = limb_names[tip]
        members = outside[(owner_source == tip)]
        tip_point = positions[outside[tip]]
        direction = tip_point - core_center
        along = (positions[members] - core_center) @ direction / (direction @ direction)
        start, end = along.min(), along.max()
        share = (along - start) / max(1e-6, end - start)
        root_point = positions[members][share < 0.06].mean(axis=0)
        joint_points = [root_point]
        for fraction in spec["joints"]:
            band = positions[members][np.abs(share - fraction) < 0.05]
            joint_points.append(band.mean(axis=0) if len(band) else root_point + (tip_point - root_point) * fraction)
        joint_points.append(tip_point)
        bones = [f"{limb}_{segment}" for segment in (1, 2, 3)]
        for segment, bone in enumerate(bones):
            bone_heads[bone] = (Vector(joint_points[segment]), Vector(joint_points[segment + 1]))
            parents[bone] = "body" if segment == 0 else bones[segment - 1]
        tip_direction = Vector(joint_points[3]) - Vector(joint_points[2])
        bone_heads[f"{limb}_tip"] = (Vector(joint_points[3]), Vector(joint_points[3]) + tip_direction.normalized() * 0.03)
        parents[f"{limb}_tip"] = bones[2]
        first, second = spec["joints"]
        for vertex, value in zip(members, share):
            to_second = np.clip((value - first + JOINT_BLEND) / (2 * JOINT_BLEND), 0, 1)
            to_third = np.clip((value - second + JOINT_BLEND) / (2 * JOINT_BLEND), 0, 1)
            add_weight(bones[0], vertex, 1 - to_second)
            add_weight(bones[1], vertex, to_second * (1 - to_third))
            add_weight(bones[2], vertex, to_third)
        limb_report[limb] = {"vertices": int(len(members)), "tip": tip_point.round(3).tolist(), "root": root_point.round(3).tolist()}

    limb_members = {limb_names[tip]: outside[(owner_source == tip)] for tip in tips}
    limb_shares = {}
    for tip in tips:
        limb = limb_names[tip]
        members = limb_members[limb]
        tip_point = positions[outside[tip]]
        direction = tip_point - core_center
        along = (positions[members] - core_center) @ direction / (direction @ direction)
        limb_shares[limb] = (along - along.min()) / max(1e-6, along.max() - along.min())
    for limb in limb_members:
        root_point = np.array(limb_report[limb]["root"])
        best = None
        for other, members in limb_members.items():
            if other == limb:
                continue
            distances = np.linalg.norm(positions[members] - root_point, axis=1)
            nearest = int(np.argmin(distances))
            if distances[nearest] < 0.06 and limb_shares[other][nearest] > 0.3 and (best is None or distances[nearest] < best[0]):
                segment = 1 + int(limb_shares[other][nearest] > spec["joints"][0]) + int(limb_shares[other][nearest] > spec["joints"][1])
                best = (distances[nearest], f"{other}_{segment}")
        if best:
            parents[f"{limb}_1"] = best[1]
            limb_report[limb]["parent"] = best[1]

    core_vertices = np.where(core_mask)[0]
    for split_key, bone, sign in (("tail_split_y", "tail", 1), ("head_split_y", "head", -1)):
        if split_key not in spec:
            continue
        split = spec[split_key]
        part = core_vertices[(positions[core_vertices, 1] - split) * sign > 0]
        far = positions[part][np.argmax(positions[part, 1] * sign)]
        head_point = np.array([core_center[0], split, positions[part, 2].mean()])
        bone_heads[bone] = (Vector(head_point), Vector(far))
        parents[bone] = "body"
        for vertex in part:
            blend = np.clip(abs(positions[vertex, 1] - split) / 0.06, 0, 1)
            add_weight(bone, vertex, blend)
            add_weight("body", vertex, 1 - blend)
assigned = np.zeros(len(positions), bool)
for bone_weights in weights.values():
    assigned[list(bone_weights)] = True
for vertex in np.where(~assigned)[0]:
    add_weight("body" if "spine" not in spec else "spine_1", vertex, 1.0)

shift = np.array([-core_center[0], -core_center[1], -positions[:, 2].min()])


def to_game(point):
    return Vector(((np.array(point) + shift) * spec["scale"]).tolist())


for vertex in low.data.vertices:
    vertex.co = to_game(vertex.co)

base_color_image.scale(TEXTURE_PIXELS, TEXTURE_PIXELS)
material = bpy.data.materials.new(f"creature_{name}")
material.use_nodes = True
nodes = material.node_tree.nodes
links = material.node_tree.links
principled = nodes["Principled BSDF"]
color_node = nodes.new("ShaderNodeTexImage")
color_node.image = base_color_image
links.new(color_node.outputs["Color"], principled.inputs["Base Color"])
roughness_node = nodes.new("ShaderNodeTexImage")
roughness_node.image = roughness_image
roughness_image.colorspace_settings.name = "Non-Color"
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

armature_data = bpy.data.armatures.new(f"{name}_rig")
armature = bpy.data.objects.new(f"{name}_rig", armature_data)
scene.collection.objects.link(armature)
bpy.context.view_layer.objects.active = armature
bpy.ops.object.select_all(action="DESELECT")
armature.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
edit_bones = {}
for bone_name, (head, tail) in bone_heads.items():
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
        group.add([vertex], float(value), "ADD")
low.parent = armature
modifier = low.modifiers.new("rig", "ARMATURE")
modifier.object = armature
bpy.data.objects.remove(high, do_unlink=True)
low.name = name
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=output_glb, export_format="GLB", use_selection=True, export_image_format="WEBP", export_image_quality=80, export_skins=True, export_animations=False, export_yup=True)
report = {"tips": len(tips), "limbs": limb_report, "core_vertices": int(core_mask.sum()), "height": float(max(v.co.z for v in low.data.vertices))}
with open(report_json, "w") as handle:
    json.dump(report, handle, indent=1)
print(json.dumps(report))
