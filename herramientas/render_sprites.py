import bpy, math
N, RES, ELEV = 48, 320, math.atan2(330, 430)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath="herramientas/fuente/papamovil.glb")
car = [o for o in sc.objects if o.type == "MESH"][0]
k = 42 / car.dimensions.y; car.scale = (k, k, k); bpy.context.view_layer.update()
car.location.z = -min((car.matrix_world @ v.co).z for v in car.data.vertices)
car.rotation_euler.z = math.pi / 2          # frente del auto hacia +X
bpy.context.view_layer.update()
H0 = 9.0                                     # altura del punto al que mira la cámara (centro del sprite)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 62
wd = bpy.data.worlds.new("W"); sc.world = wd; wd.use_nodes = True
wd.node_tree.nodes["Background"].inputs[1].default_value = 0.45
sun = bpy.data.objects.new("SUN", bpy.data.lights.new("SUN", "SUN")); sc.collection.objects.link(sun); sun.data.energy = 2.0
r = sc.render; r.engine = "CYCLES"; sc.cycles.samples = 24; sc.cycles.use_denoising = True
r.resolution_x = r.resolution_y = RES; r.film_transparent = True; sc.view_settings.view_transform = "Standard"
r.image_settings.file_format = "PNG"; r.image_settings.color_mode = "RGBA"
from mathutils import Vector
for i in range(N):
    phi = 2 * math.pi * i / N; D = 200
    pos = Vector((math.cos(phi) * D * math.cos(ELEV), math.sin(phi) * D * math.cos(ELEV), H0 + D * math.sin(ELEV)))
    cam.location = pos; cam.rotation_euler = (Vector((0, 0, H0)) - pos).to_track_quat("-Z", "Y").to_euler()
    sun.rotation_euler = (math.radians(40), 0, phi + math.radians(150))   # luz fija respecto a la cámara
    r.filepath = f"herramientas/fuente/vistas/f{i:02d}.png"; bpy.ops.render.render(write_still=True)
