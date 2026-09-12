"""Generate explicit terrain objects from a captured RWG graph (no browser reflection)."""
import importlib.util
import json
import math
from pathlib import Path
import zipfile


def generate(profile, jar, destination):
    spec = importlib.util.spec_from_file_location('class_export', Path(__file__).with_name('export-runtime.py'))
    exporter = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(exporter)
    with zipfile.ZipFile(jar) as archive:
        classes = {n[:-6].replace('/', '.'): exporter.parse_class(archive.read(n)) for n in archive.namelist() if n.endswith('.class')}
    nodes = profile['objects']
    selected = {i: n for i, n in enumerate(nodes) if n['class'] in classes and n['class'].startswith(('rwg.terrain.', 'rwg.biomes.realistic.', 'rwg.support.'))}
    lines = ['package amidst.web;', 'import rwg.biomes.realistic.RealisticBiomeBase;', 'public final class RuntimeObjects {', 'public static final int[] BASE=new int[256], RIVER=new int[256];', 'public static final float[][] VALLEYS=new float[256][];', 'public static final boolean[][] MIX=new boolean[256][];', 'public static void install() {']
    for i, n in selected.items():
        lines.append(f"{n['class']} o{i}=new {n['class']}();")

    def literal(value, descriptor):
        if value is None:
            if not descriptor.startswith(('L', '[')): raise ValueError('Null primitive')
            return 'null'
        if descriptor.startswith('['):
            component = descriptor[1:]
            names = {'F': 'float', 'I': 'int', 'D': 'double', 'Z': 'boolean'}
            name = names.get(component, component[1:-1].replace('/', '.') if component.startswith('L') else None)
            if not name or not isinstance(value, list): raise ValueError('Unsupported configuration array')
            return 'new '+name+'[]{'+','.join(literal(v, component) for v in value)+'}'
        if isinstance(value, dict) and set(value) == {'ref'} and value['ref'] in selected:
            return 'o'+str(value['ref'])
        if descriptor == 'Z' and isinstance(value, bool): return str(value).lower()
        if descriptor in ('F', 'D') and isinstance(value, (int, float)) and math.isfinite(value): return repr(float(value))+('F' if descriptor == 'F' else 'D')
        if descriptor in ('I', 'J', 'S', 'B') and type(value) is int: return str(value)+('L' if descriptor == 'J' else '')
        raise ValueError('Unsupported captured field '+descriptor+': '+repr(value))

    for i, node in selected.items():
        name = node['class']
        while name in classes:
            for field in classes[name]['fields']:
                if field['access'] & 8: raise ValueError('Static terrain state requires an explicit adapter: '+name)
                key = name+'#'+field['name']
                if key not in node['fields']: raise ValueError('Missing captured field: '+key)
                lines.append(f"(({name})o{i}).{field['name']}={literal(node['fields'][key], field['descriptor'])};")
            name = classes[name]['superclass'].replace('/', '.')
    desert_ids = {b['base']['legacyId'] for b in profile['biomes'] if b['base']['class'] == 'rwg.biomes.base.BaseBiomeHotDesert'}
    if len(desert_ids) != 1: raise ValueError('Ambiguous RWG Hot Desert identity')
    for biome in profile['biomes']:
        i, rid = biome['object']['ref'], biome['id']
        if i not in selected: raise ValueError('Missing realistic implementation')
        lines.extend([f'o{i}.biomeID={rid}; RealisticBiomeBase.REGISTRY[{rid}]=o{i};', f"BASE[{rid}]={biome['base']['legacyId']}; RIVER[{rid}]={biome['river']['legacyId']};"])
        surfaces = []
        for key, value in nodes[i]['fields'].items():
            if key.endswith('#surface') and value is not None: surfaces.append(value)
            if key.endswith('#surfaces') and value is not None: surfaces.extend(value)
        rules = [nodes[s['ref']]['fields'] for s in surfaces if nodes[s['ref']]['class'] == 'rwg.surface.SurfaceDuneValley']
        vals = [r['rwg.surface.SurfaceDuneValley#valley'] for r in rules]
        mixes = [r['rwg.surface.SurfaceDuneValley#mix'] for r in rules]
        lines.extend([f'VALLEYS[{rid}]='+literal(vals, '[F')+';', f'MIX[{rid}]='+literal(mixes, '[Z')+';'])
    lines.extend(['}', f'public static final int DESERT={desert_ids.pop()};', '}'])
    Path(destination).write_text('\n'.join(lines)+'\n', 'utf-8')
    return len(selected)
