"""Assemble a private, local static preview from an explicitly calibrated RWG pack."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile
import argparse

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def colors(descriptors):
    # Execute the reference Amidst's unchanged default-color methods on the JVM.
    source = ROOT/'reference/Amidst-GTNH/src/main/java/amidst/gtnh/worker/GtnhBiomeColorPalette.java'
    original = source.read_text('utf-8')
    body = original[original.index('\tstatic BiomeColor defaultColor'):original.index('\tprivate static void applyOverrides')]
    body += original[original.index('\tprivate static boolean contains'):original.index('\tprivate static final class OverrideFile')]
    code = '''import java.awt.Color; import java.util.*;
public class PaletteOracle {
 record BiomeColor(int r,int g,int b) {static BiomeColor from(int r,int g,int b){return new BiomeColor(r,g,b);}}
 record GtnhBiomeDescriptor(int id,String name,int mapColor,float temperature,float rainfall,float rootHeight,List<String> tags){boolean hasTag(String tag){return tags.contains(tag);}}
'''+body+'public static void main(String[] args){\n'
    for d in descriptors:
        args = [str(d['id']), json.dumps(d['name'], ensure_ascii=False), str(d['mapColor'])]
        args += [repr(float(d[k]))+'F' for k in ['temperature','rainfall','rootHeight']]
        args += ['List.of('+','.join(json.dumps(t) for t in d['tags'])+')']
        code += '{BiomeColor c=defaultColor(new GtnhBiomeDescriptor('+','.join(args)+'));System.out.printf("'+str(d['id'])+'=#%02x%02x%02x%n",c.r,c.g,c.b);}\n'
    code += '}}\n'
    work = ROOT/'.test-work/palette-oracle'; work.mkdir(parents=True, exist_ok=True)
    (work/'PaletteOracle.java').write_text(code, 'utf-8')
    subprocess.run(['javac','-encoding','UTF-8','-d',str(work),str(work/'PaletteOracle.java')],check=True)
    result = subprocess.run(['java','-cp',str(work),'PaletteOracle'],check=True,capture_output=True,text=True)
    return {int(k):v for k,v in (line.split('=') for line in result.stdout.splitlines())}, digest(source)


def checked_report(name):
    report=json.loads((ROOT/'private-packs/runtime-session'/name).read_text('utf-8'))
    if report.get('mismatches',0) or not report.get('hashes'):raise ValueError('Invalid validation: '+name)
    for path,expected in report['hashes'].items():
        if digest(ROOT/path)!=expected:raise ValueError('Stale validation: '+name+' / '+path)
    return report


def build(resources=False):
    pack=ROOT/'private-packs/rwg-terrain-browser'
    profile=json.loads((pack/'profile.json').read_text('utf-8'))
    manifest=json.loads((pack/'manifest.json').read_text('utf-8'))
    actual=digest(pack/'selection.js')
    reports=[]
    for name in ['terrain-coverage-calibration.json','terrain-extra-calibration.json']:
        report=json.loads((ROOT/'private-packs/runtime-session'/name).read_text('utf-8'))
        if report['mismatches'] or report['pixels'] < 1024 or report['engineSha256']!=actual or report['profileSha256']!=digest(pack/'profile.json'):
            raise ValueError('Current engine/profile has not passed live calibration: '+name)
        reports.append(report)
    oracle=json.loads((pack/'jvm-validation.json').read_text('utf-8'))
    if oracle['engineSha256']!=actual:raise ValueError('Stale JVM validation')
    villages=json.loads((pack/'village-validation.json').read_text('utf-8'))
    if villages['engineSha256']!=actual or villages['matchedVillages']<1:
        raise ValueError('Current village engine has not passed offline Java validation')
    catalog={v['legacyId']:v for b in profile['biomes'] for v in [b['base'],b['river']]}
    hello=json.loads((ROOT/'private-packs/runtime-session/hello.json').read_text('utf-8'))
    descriptors={b['id']:b for b in hello['biomes']}
    palette,palette_hash=colors([descriptors[i] for i in catalog])
    aliases=json.loads((ROOT/'tools/worldgen-compiler/biome-aliases.json').read_text('utf-8'))
    keys,biomes={},[]
    for id,b in catalog.items():
        identity=b['class']+('#'+b['name'] if b['class']=='rwg.biomes.base.BaseBiomeRiver' else '')
        if identity not in aliases:raise ValueError('Declare a stable namespace alias for '+identity)
        key=aliases[identity]
        if key in keys.values():raise ValueError('Ambiguous namespace mapping '+key)
        keys[id]=key
        biomes.append({'key':key,'zh':b['name'],'en':b['name'],'color':palette[id],
                       'legacy':[{'environment':'gtnh-'+profile['observedManagerSha256'][:12],'dimension':'overworld','id':id}]})
    out=ROOT/'private-packs/rwg-local-preview'
    resource_output=out/'packs/resources'
    if not resources and resource_output.exists():
        # Only remove this builder's previous optional output, never an arbitrary path.
        expected=ROOT.resolve()/'private-packs/rwg-local-preview/packs/resources'
        if resource_output.is_symlink() or resource_output.resolve()!=expected:
            raise ValueError('Unexpected resource output path')
        shutil.rmtree(resource_output)
    shutil.copytree(ROOT/'dist',out,dirs_exist_ok=True)
    installed=out/'packs/rwg';installed.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(pack/'selection.js',installed/'selection.js')
    config={'noise':profile['noise'],'groups':profile['groups']}
    (installed/'provider.js').write_text('import * as engine from "./selection.js";\nimport {createRwgProvider} from "../../engine/rwg-provider.js";\nexport const provider=createRwgProvider(engine,'+json.dumps(config)+','+json.dumps(keys)+');\n','utf-8')
    live_structures=checked_report('live-structures-validation.json') if resources else None
    note='RWG + BOP 底图已校准；村庄及已接入模组结构通过实例样本对照。未包含存档修改。' if live_structures else 'RWG + BOP 底图已校准；村庄候选通过原 Java 离线对照，待实例复核。未包含存档修改。'
    descriptor={'id':'local-rwg-calibrated','apiVersion':1,'browserExecutable':True,'entry':'./rwg/provider.js',
                'dimensions':[{'key':'overworld','capabilities':['biomes','structures'],'note':note}], 'biomes':biomes}
    packs=[descriptor]
    if resources:
        validation=checked_report('resource-validation.json')
        resource_profile=json.loads((ROOT/'private-packs/runtime-session/resource-profile.json').read_text('utf-8'))
        environment=json.loads((ROOT/'dist/environment.json').read_text('utf-8'))
        dimension_ids=environment['dimensionIds']
        available={d['id']:d for d in resource_profile['dimensions']}
        capabilities=[]
        for key,id in dimension_ids.items():
            if id not in available:continue
            d=available[id]
            capabilities.append({'key':key,'capabilities':['resources'],'resourceModes':[mode for mode,field in [('ORES','ores'),('FLUID','fluids')] if d.get(field)]})
        installed_resources=out/'packs/resources';installed_resources.mkdir(parents=True,exist_ok=True)
        (installed_resources/'provider.js').write_text('import {createProspectingProvider} from "../../engine/prospecting.js";\nconst response=await fetch(new URL("./profile.json",import.meta.url));\nif(!response.ok)throw new Error("Cannot load resource profile");\nexport const provider=createProspectingProvider(await response.json(),'+json.dumps(dimension_ids)+');\n','utf-8')
        shutil.copyfile(ROOT/'private-packs/runtime-session/resource-profile.json',installed_resources/'profile.json')
        (installed_resources/'provenance.json').write_text(json.dumps({'scope':'local-only; initialized GT and VP data and textures; no save records','validation':validation,'structures':live_structures},indent=2),'utf-8')
        packs.append({'id':'local-resources-calibrated','apiVersion':1,'browserExecutable':True,'entry':'./resources/provider.js','dimensions':capabilities})
    (out/'packs/registry.json').write_text(json.dumps({'schemaVersion':1,'packs':packs},ensure_ascii=False,indent=2),'utf-8')
    report={'scope':'local-only calibration preview; redistribution not reviewed','engineSha256':actual,'profileSha256':digest(pack/'profile.json'),
            'colorSourceSha256':palette_hash,'workerPixels':sum(r['pixels'] for r in reports),'jvm':oracle,'villages':villages,
            'namespaces':'Declared Web aliases for legacy classes/variants; not claims of official 1.7 registry keys.',
            'limitations':['RWG pre-cave/pre-population prediction','No save edits or Forge post-generation listeners','Other dimensions retain the existing preview support']}
    (out/'packs/rwg/provenance.json').write_text(json.dumps(report,indent=2),'utf-8')
    notice=(out/'NOTICE.md').read_text('utf-8').replace('未接入：RWG/BOP 主世界完整底图、','未接入：')
    notice+='\n\n本地环境校准预览：已接入 RWG + BOP 主世界底图，含实际环境中的 Thaumcraft 群系。计算函数来自当前实例的 RWG 字节码；混合缓存来自原 Amidst-GTNH Worker。配色直接运行参考 Amidst 的默认配色方法得到。命名空间为本工具声明的旧群系别名，保留实际类来源。此包未完成上游代码再分发许可审查，不自动公开发布。\n'
    if resources:notice+='\n本地资源包已接入当前界面的 11 个维度。GregTech / GalacticGreg 决定矿脉与地下流体，Visual Prospecting 提供显示名称、颜色和图标。已通过 41 维度的实例预测对照；所有结果仅为种子候选或初始产量，不包含存档当前余量。未配置流体的维度明确显示无配置。\n'
    (out/'NOTICE.md').write_text(notice,'utf-8')
    with zipfile.ZipFile(ROOT/'private-packs/amidst-gtnh-rwg-local-preview.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(out.rglob('*')):
            if path.is_file():archive.write(path,path.relative_to(out).as_posix())
    print('Local static preview ready: private-packs/rwg-local-preview ('+str(len(biomes))+' biome colors from reference Amidst)')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resources',action='store_true',help='Include the explicitly calibrated private resource profile')
    build(parser.parse_args().resources)
