"""Compile an explicit RWG selection slice; output is not a final biome provider."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile
import importlib.util

ROOT = Path(__file__).resolve().parents[1]


def run(args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def compile_worldgen(archive, adapter_profile=None, runtime_profile=None):
    cache = ROOT / '.test-work/noise-compiler'
    work = ROOT / ('.test-work/terrain-compiler' if runtime_profile else '.test-work/worldgen-compiler')
    work.mkdir(parents=True, exist_ok=True)
    asm = [cache / f'repository/org/ow2/asm/{name}/9.8/{name}-9.8.jar' for name in ['asm', 'asm-tree']]
    if not all(p.is_file() for p in asm):
        raise ValueError('Run compile-noise.py first to provision the pinned compiler dependencies')
    hashes = {}
    with zipfile.ZipFile(archive) as source, zipfile.ZipFile(work/'input.jar', 'w') as jar:
        manifest = json.loads(source.read('manifest.json'))
        for name in source.namelist():
            if not name.startswith('classes/') or not name.endswith('.class'):
                continue
            data = source.read(name)
            cls = name[8:-6]
            digest = hashlib.sha256(data).hexdigest()
            if digest != manifest['classHashes'][cls]:
                raise ValueError('Input hash mismatch: ' + cls)
            hashes[cls] = digest
            jar.writestr(name[8:], data)
    # Deliberately pin the two field-layout adapters to verified inputs.
    expected = json.loads((Path(adapter_profile) if adapter_profile else ROOT/'tools/worldgen-compiler/profile.json').read_text('utf-8'))
    for cls, digest in expected['inputClasses'].items():
        if hashes.get(cls) != digest:
            raise ValueError('Unsupported worldgen class version: ' + cls)
    cp = os.pathsep.join(map(str, asm))
    slicer = work/'slicer'
    slicer.mkdir(exist_ok=True)
    run(['javac', '-cp', cp, '-d', slicer, ROOT/'tools/worldgen-compiler/Slice.java'])
    java = ['java', '-cp', str(slicer)+os.pathsep+cp, 'Slice']
    run(java+['terrain' if runtime_profile else 'slice', work/'input.jar', work/'selection-input.jar'])
    src = work/'src/main/java'
    src.mkdir(parents=True, exist_ok=True)
    for path in (ROOT/'tools/worldgen-compiler/src').glob('*.java'):
        shutil.copyfile(path, src/path.name)
    profile = json.loads(Path(runtime_profile).read_text('utf-8')) if runtime_profile else None
    if profile:
        surface_inputs = json.loads((ROOT/'tools/worldgen-compiler/surface-adapter-profile.json').read_text('utf-8'))['inputClasses']
        for cls, digest in surface_inputs.items():
            if hashes.get(cls) != digest:
                raise ValueError('Surface adapter needs review for changed runtime class: '+cls)
        for node in profile['objects']:
            cls = node['class'].replace('.', '/')
            if cls.startswith(('rwg/surface/', 'rwg/biomes/realistic/', 'rwg/support/RealisticBiomeSupport')) and cls not in surface_inputs:
                raise ValueError('Unreviewed realistic biome or surface: '+cls)
        for path in (ROOT/'tools/worldgen-compiler/fast').glob('*.java'):
            shutil.copyfile(path, src/path.name)
        if profile['observedManagerSha256'] != hashes['rwg/world/ChunkManagerRealistic']:
            raise ValueError('Runtime profile does not match compiled manager')
        spec = importlib.util.spec_from_file_location('terrain_profile', ROOT/'tools/terrain-profile.py')
        adapter = importlib.util.module_from_spec(spec); spec.loader.exec_module(adapter)
        adapter.generate(profile, work/'selection-input.jar', src/'RuntimeObjects.java')
        base = (src/'RealisticBiomeBase.java').read_text('utf-8').replace('public final class', 'public class').replace('public final int biomeID;', 'public int biomeID;\n    public RealisticBiomeBase() {}').replace('return 0;', 'return 63;')
        (src/'RealisticBiomeBase.java').write_text(base, 'utf-8')
        entry = (src/'BiomeExports.java').read_text('utf-8')
        entry = entry.replace('Arrays.fill(RealisticBiomeBase.REGISTRY, null);', 'Arrays.fill(RealisticBiomeBase.REGISTRY, null); RuntimeObjects.install();')
        entry = entry.replace('manager = m; generator = g;', 'manager = m; generator = g; fast = new FastKernel(m);')
        fragment = (ROOT/'tools/worldgen-compiler/TerrainMethods.java.fragment').read_text('utf-8')
        entry = entry.replace('    public static void main(String[] arguments) {', fragment+'\n    public static void main(String[] arguments) {')
        start = entry.index('    public static void main(String[] arguments) {')
        # JVM oracle uses this exact captured profile, before browser float lowering.
        groups = ','.join('new int[]{'+','.join(map(str,profile['groups'][g]))+'}' for g in ['snow','cold','hot','wet','small'])
        entry = entry[:start]+'public static void configureCaptured(String seed){configure(seed,"'+profile['noise']+'",'+groups+');}\n'+'''    public static void main(String[] args) {
        boolean first=true; System.out.print("[");
        for(String seed:new String[]{"0","-1","9007199254740993"}) {
            configure(seed,"'''+profile['noise']+'",'+groups+''');
            for(int[] p:new int[][]{{0,0},{-1,-1},{1038,-1250},{-113,97},{1001,-2049}}) {
                if(!first)System.out.print(",");first=false;
                int[] ids=referenceFinalChunk(p[0],p[1]);
                System.out.print("{\\"seed\\":\\""+seed+"\\",\\"chunk\\":"+Arrays.toString(p)+",\\"ids\\":"+Arrays.toString(ids)+",\\"heights\\":"+Arrays.toString(chunkHeights())+"}");
            }
        }
        System.out.println("]");
    }
}
'''
        (src/'BiomeExports.java').write_text(entry, 'utf-8')
        shutil.copyfile(ROOT/'tools/worldgen-compiler/VillageOracle.java',src/'VillageOracle.java')
        shutil.copyfile(ROOT/'reference/Amidst-GTNH/gtnh-worker/src/main/java/amidst/gtnh/worker/RwgStructurePredictor.java',src/'RwgStructurePredictor.java')
        (src/'SurfaceBiomeSampler.java').write_text('package amidst.gtnh.worker; interface SurfaceBiomeSampler {boolean isVillageLocationViable(int x,int z);}', 'utf-8')
        (src/'RoguelikeDungeonPredictor.java').write_text('package amidst.gtnh.worker; class RoguelikeDungeonPredictor {static class StructureDescriptor {final String kind,subtype,certainty;final int x,z;StructureDescriptor(String k,String s,int x,int z,String c){kind=k;subtype=s;this.x=x;this.z=z;certainty=c;}}}', 'utf-8')
        (src/'ConfigRWG.java').write_text('package rwg.config; public class ConfigRWG {public static boolean generateVillages=true,generateMineshafts=false;}', 'utf-8')
    pom = (ROOT/'tools/noise-compiler/pom.xml').read_text('utf-8')
    pom = pom.replace('rwg-noise-browser', 'rwg-selection-browser').replace('noise-input.jar', 'selection-input.jar').replace('amidst.web.NoiseExports','amidst.web.BiomeExports').replace('noise.js','selection.js')
    (work/'pom.xml').write_text(pom,'utf-8')
    distro = cache/'apache-maven-3.9.9'
    launcher = next((distro/'boot').glob('plexus-classworlds-*.jar'))
    maven = ['java', f'-Dmaven.home={distro}', f'-Dmaven.multiModuleProjectDirectory={work}', f'-Dclassworlds.conf={distro}/bin/m2.conf', '-cp', launcher, 'org.codehaus.plexus.classworlds.launcher.Launcher', '-o', '-B', '-ntp', f'-Dmaven.repo.local={cache}/repository', '-f', work/'pom.xml']
    run(maven+['compiler:compile'], cwd=work)
    oracle = run(['java', '-cp', str(work/'target/classes')+os.pathsep+str(work/'selection-input.jar'), 'amidst.web.BiomeExports'], capture_output=True, text=True)
    fixtures = json.loads(oracle.stdout)
    villages = None
    if profile:
        villages = json.loads(run(['java','-cp',str(work/'target/classes')+os.pathsep+str(work/'selection-input.jar'),'amidst.gtnh.worker.VillageOracle'],capture_output=True,text=True).stdout)
    # JVM oracle above uses unmodified arithmetic. Browser lowering is validated against it.
    run(java+['round', work/'selection-input.jar', work/'rounded-input.jar'])
    shutil.copyfile(work/'rounded-input.jar', work/'selection-input.jar')
    run(java+['round-directory', work/'target/classes'])
    run(maven+['org.teavm:teavm-maven-plugin:0.15.0:compile'], cwd=work)
    output = ROOT/('private-packs/rwg-terrain-browser' if profile else 'private-packs/rwg-selection-browser')
    output.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(work/'target/browser/selection.js', output/'selection.js')
    (output/'reference.json').write_text(json.dumps(fixtures),'utf-8')
    if villages is not None:(output/'village-reference.json').write_text(json.dumps(villages),'utf-8')
    report = {'schemaVersion':1, 'kind':'browser-function-library', 'browserExecutable':True,
              'stage':'realistic-biome-selection', 'worldBiomeGenerator':False,
              'compiler':'TeaVM 0.15.0', 'floatArithmetic':'binary32 after each JVM float arithmetic/conversion opcode',
              'validation':'pending', 'inputClasses':expected['inputClasses'],
              'runtimeProfile':'required; validation uses controlled identity tables',
              'excluded':['actual registry initialization','terrain heights','river biome replacement','surface painters','map generators'],
              'adapters':['explicit initialized manager/generator fields','long-key cache','coordinate packing','biome identity; discarded terrain callback returns zero']}
    if profile:
        report.update(stage='terrain-and-surface-calibration', runtimeProfileSha256=hashlib.sha256(Path(runtime_profile).read_bytes()).hexdigest(), inputClasses=hashes,
                      excluded=['map generators','unverified surface effects'],
                      adapters=['captured initialized terrain objects','long-key cache','coordinate packing','river assignment','SurfaceDuneValley biome boundary'])
        shutil.copyfile(runtime_profile, output/'profile.json')
    (output/'manifest.json').write_text(json.dumps(report,indent=2),'utf-8')
    print('Compiled terrain preview; run verify-terrain.mjs and live calibration before use.' if profile else 'Compiled selection slice. Run node tools/verify-worldgen.mjs before use.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True)
    parser.add_argument('--adapter-profile')
    parser.add_argument('--runtime-profile')
    args=parser.parse_args()
    compile_worldgen(Path(args.input),args.adapter_profile,args.runtime_profile)
