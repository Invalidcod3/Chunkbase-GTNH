"""Resolve actual configured constant biomes into a data-only browser pack."""
from pathlib import Path
import importlib.util,json
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('preview_builder',ROOT/'tools/build-rwg-preview.py')
builder=importlib.util.module_from_spec(spec);spec.loader.exec_module(builder)
p=json.loads((ROOT/'private-packs/uniform-input/profile.json').read_text('utf-8'))
names={v[0]:v for v in json.loads((ROOT/'tools/dimension-names.json').read_text('utf-8')).values()}
aliases={
 'galaxyspace.core.world.BiomeGenSpaceGS':'galaxyspace_space',
 'micdoodle8.mods.galacticraft.core.world.gen.BiomeGenBaseOrbit':'galacticraft_orbit',
 'galaxyspace.SolarSystem.planets.kuiperbelt.world.BiomeGenBaseKuiper':'kuiper_belt',
 'galaxyspace.SolarSystem.planets.venus.world.BiomeGenVenus':'venus',
 'galaxyspace.SolarSystem.moons.titan.world.BiomeGenTitan':'titan',
 'micdoodle8.mods.galacticraft.core.world.gen.BiomeGenFlatMoon':'moon',
 'toxiceverglades.biome.BiomeEverglades$BiomeGenEverglades':'toxic_everglades',
}
biomes={};dimensions=[]
for d in p['dimensions']:
    if d.get('pending') or not d.get('biome'):raise ValueError('Unresolved dimension: '+d['key'])
    if 'micdoodle8.mods.galacticraft.api.prefab.world.gen.WorldChunkManagerSpace' not in d['ancestry'] and d.get('constantSource')!='toxiceverglades.biome.GenLayerBiomes':raise ValueError('Unreviewed constant manager')
    b=dict(d['biome']);key='amidst:uniform_'+aliases[b['class']]
    if len(d['samples'])<4 or any(len(s['ids'])!=16 or any(i!=b['id'] for i in s['ids']) for s in d['samples']):raise ValueError('Constant biome samples differ: '+d['key'])
    # Match the desktop's dimension-specific display tags, preserving raw registered names/IDs.
    b['tags']=list(b['tags'])
    if b['class'].startswith('galaxyspace.'):b['tags'].append('GALAXYSPACE')
    if b['class'].endswith('BiomeGenFlatMoon'):b['tags'].append('MOON')
    if key in biomes and biomes[key]!=b:raise ValueError('Conflicting registered biome: '+key)
    biomes[key]=b
    dimensions.append({'key':d['key'],'id':d['id'],'zh':names[d['key']][1],'en':names[d['key']][2],'capabilities':['biomes'],'uniformBiome':key,
        'note':'当前整合包已确认的固定生物群系：'+b['name'],'noteEn':'Configured constant biome: '+b['name']})
palette,_=builder.colors(list(biomes.values()))
entries=[{'key':key,'zh':b['name'],'en':b['name'],'color':palette[b['id']],
          'legacy':[{'environment':'gtnh-uniform-captured','dimension':'registered-biome','id':b['id']}]} for key,b in biomes.items()]
out=ROOT/'private-packs/uniform-browser';out.mkdir(parents=True,exist_ok=True)
(out/'profile.json').write_text(json.dumps({'schemaVersion':1,'dimensions':dimensions,'biomes':entries},ensure_ascii=False,indent=2),'utf-8')
print('Prepared',len(dimensions),'dimensions with',len(entries),'actual registered biomes.')
