import sys, math, bpy
glb, out = sys.argv[-2], sys.argv[-1]
tests = [('claw_big_1',(0.5,0,0)),('claw_small_2',(0.6,0,0)),('leg_front_R_1',(0,0,0.5)),('leg_middle_L_2',(0.6,0,0)),('eye_R',(0.7,0,0)),('abdomen',(0.4,0,0))]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
rig = next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=8; sc.render.resolution_x=sc.render.resolution_y=400
w=bpy.data.worlds.new('w'); w.use_nodes=True; w.node_tree.nodes['Background'].inputs[1].default_value=1.0; sc.world=w
sd=bpy.data.lights.new('s','SUN'); sd.energy=3; s=bpy.data.objects.new('s',sd); s.rotation_euler=(0.8,0,0.5); sc.collection.objects.link(s)
cd=bpy.data.cameras.new('c'); cd.type='ORTHO'; cd.ortho_scale=2.6; c=bpy.data.objects.new('c',cd); sc.collection.objects.link(c); sc.camera=c
c.location=(2.2,-3.0,2.4); c.rotation_euler=(math.radians(60),0,math.radians(36))
for b in rig.pose.bones: b.rotation_mode='XYZ'
for i,(bone,rot) in enumerate(tests):
    for b in rig.pose.bones: b.rotation_euler=(0,0,0)
    rig.pose.bones[bone].rotation_euler=rot
    sc.render.filepath=f'{out}_{i}.png'; bpy.ops.render.render(write_still=True)
