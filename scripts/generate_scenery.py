"""Rebuild low-poly, self-contained GLB scenery with Blender 4.3+.

Run: blender --background --python scripts/generate_scenery.py
No textures, downloads or external assets are required.
"""
import math
from pathlib import Path
import bpy

OUTPUT = Path(__file__).resolve().parent.parent / 'assets'
OUTPUT.mkdir(exist_ok=True)


def material(name, color):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1)
    value.use_nodes = True
    value.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*color, 1)
    value.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
    return value


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)


def assign(obj, name, color):
    obj.name = name
    obj.data.materials.append(material(name, color))


def export(name):
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / f'{name}.glb'), export_format='GLB', export_yup=True, export_materials='EXPORT')


clear()
bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.2, depth=2.8, location=(0, 0, 1.4))
assign(bpy.context.object, 'Pine trunk', (0.19, 0.12, 0.075))
for index, (radius, height, z) in enumerate([(1.6, 3.0, 3.0), (1.2, 2.6, 4.3), (0.85, 2.2, 5.4)]):
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=radius, radius2=0, depth=height, location=(0, 0, z))
    assign(bpy.context.object, f'Pine crown {index}', (0.055 + index * 0.018, 0.21 + index * 0.03, 0.145 + index * 0.015))
export('pine')

clear()
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(0, 0, 0.5))
bpy.context.object.scale = (1.4, 0.8, 0.9)
assign(bpy.context.object, 'Granite', (0.38, 0.43, 0.42))
export('rock')

clear()
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.4))
bpy.context.object.scale = (4.5, 3.5, 2.8)
assign(bpy.context.object, 'Chalet walls', (0.72, 0.63, 0.44))
mesh = bpy.data.meshes.new('Roof mesh')
mesh.from_pydata([(-2.6, -2.1, 2.8), (2.6, -2.1, 2.8), (0, -2.1, 4.3), (-2.6, 2.1, 2.8), (2.6, 2.1, 2.8), (0, 2.1, 4.3)], [], [(0, 1, 2), (3, 5, 4), (0, 2, 5, 3), (1, 4, 5, 2), (0, 3, 4, 1)])
obj = bpy.data.objects.new('Copper roof', mesh)
bpy.context.collection.objects.link(obj)
assign(obj, 'Copper roof', (0.32, 0.14, 0.09))
for x in [-1.2, 1.2]:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, -1.76, 1.7))
    bpy.context.object.scale = (0.65, 0.05, 0.75)
    assign(bpy.context.object, 'Window', (0.075, 0.15, 0.18))
export('chalet')
print(f'Generated scenery in {OUTPUT}')
