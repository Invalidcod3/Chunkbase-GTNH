"""Assemble a private, local static preview from an explicitly calibrated RWG pack."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

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


def build():
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
    shutil.copytree(ROOT/'dist',out,dirs_exist_ok=True)
    installed=out/'packs/rwg';installed.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(pack/'selection.js',installed/'selection.js')
    config={'noise':profile['noise'],'groups':profile['groups']}
    (installed/'provider.js').write_text('import * as engine from "./selection.js";\nimport {createRwgProvider} from "../../engine/rwg-provider.js";\nexport const provider=createRwgProvider(engine,'+json.dumps(config)+','+json.dumps(keys)+');\n','utf-8')
    descriptor={'id':'local-rwg-calibrated','apiVersion':1,'browserExecutable':True,'entry':'./rwg/provider.js',
                'dimensions':[{'key':'overworld','capabilities':['biomes','structures'],'note':'RWG + BOP 底图已校准；村庄候选通过原 Java 离线对照，待实例复核。未包含存档修改。'}], 'biomes':biomes}
    (out/'packs/registry.json').write_text(json.dumps({'schemaVersion':1,'packs':[descriptor]},ensure_ascii=False,indent=2),'utf-8')
    report={'scope':'local-only calibration preview; redistribution not reviewed','engineSha256':actual,'profileSha256':digest(pack/'profile.json'),
            'colorSourceSha256':palette_hash,'workerPixels':sum(r['pixels'] for r in reports),'jvm':oracle,'villages':villages,
            'namespaces':'Declared Web aliases for legacy classes/variants; not claims of official 1.7 registry keys.',
            'limitations':['RWG pre-cave/pre-population prediction','No save edits or Forge post-generation listeners','Other dimensions retain the existing preview support']}
    (out/'packs/rwg/provenance.json').write_text(json.dumps(report,indent=2),'utf-8')
    notice=(out/'NOTICE.md').read_text('utf-8').replace('未接入：RWG/BOP 主世界完整底图、','未接入：')
    notice+='\n\n本地环境校准预览：已接入 RWG + BOP 主世界底图，含实际环境中的 Thaumcraft 群系。计算函数来自当前实例的 RWG 字节码；混合缓存来自原 Amidst-GTNH Worker。配色直接运行参考 Amidst 的默认配色方法得到。命名空间为本工具声明的旧群系别名，保留实际类来源。此包未完成上游代码再分发许可审查，不自动公开发布。\n'
    (out/'NOTICE.md').write_text(notice,'utf-8')
    with zipfile.ZipFile(ROOT/'private-packs/amidst-gtnh-rwg-local-preview.zip','w',zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(out.rglob('*')):
            if path.is_file():archive.write(path,path.relative_to(out).as_posix())
    print('Local static preview ready: private-packs/rwg-local-preview ('+str(len(biomes))+' biome colors from reference Amidst)')


if __name__=='__main__':build()
