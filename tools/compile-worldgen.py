"""Compile an explicit RWG selection slice; output is not a final biome provider."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def run(args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def compile_worldgen(archive):
    cache = ROOT / '.test-work/noise-compiler'
    work = ROOT / '.test-work/worldgen-compiler'
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
    expected = json.loads((ROOT/'tools/worldgen-compiler/profile.json').read_text('utf-8'))
    for cls, digest in expected['inputClasses'].items():
        if hashes.get(cls) != digest:
            raise ValueError('Unsupported worldgen class version: ' + cls)
    cp = os.pathsep.join(map(str, asm))
    slicer = work/'slicer'
    slicer.mkdir(exist_ok=True)
    run(['javac', '-cp', cp, '-d', slicer, ROOT/'tools/worldgen-compiler/Slice.java'])
    java = ['java', '-cp', str(slicer)+os.pathsep+cp, 'Slice']
    run(java+['slice', work/'input.jar', work/'selection-input.jar'])
    src = work/'src/main/java'
    src.mkdir(parents=True, exist_ok=True)
    for path in (ROOT/'tools/worldgen-compiler/src').glob('*.java'):
        shutil.copyfile(path, src/path.name)
    pom = (ROOT/'tools/noise-compiler/pom.xml').read_text('utf-8')
    pom = pom.replace('rwg-noise-browser', 'rwg-selection-browser').replace('noise-input.jar', 'selection-input.jar').replace('amidst.web.NoiseExports','amidst.web.BiomeExports').replace('noise.js','selection.js')
    (work/'pom.xml').write_text(pom,'utf-8')
    distro = cache/'apache-maven-3.9.9'
    launcher = next((distro/'boot').glob('plexus-classworlds-*.jar'))
    maven = ['java', f'-Dmaven.home={distro}', f'-Dmaven.multiModuleProjectDirectory={work}', f'-Dclassworlds.conf={distro}/bin/m2.conf', '-cp', launcher, 'org.codehaus.plexus.classworlds.launcher.Launcher', '-o', '-B', '-ntp', f'-Dmaven.repo.local={cache}/repository', '-f', work/'pom.xml']
    run(maven+['compiler:compile'], cwd=work)
    oracle = run(['java', '-cp', str(work/'target/classes')+os.pathsep+str(work/'selection-input.jar'), 'amidst.web.BiomeExports'], capture_output=True, text=True)
    fixtures = json.loads(oracle.stdout)
    # JVM oracle above uses unmodified arithmetic. Browser lowering is validated against it.
    run(java+['round', work/'selection-input.jar', work/'rounded-input.jar'])
    shutil.copyfile(work/'rounded-input.jar', work/'selection-input.jar')
    run(java+['round-directory', work/'target/classes'])
    run(maven+['org.teavm:teavm-maven-plugin:0.15.0:compile'], cwd=work)
    output = ROOT/'private-packs/rwg-selection-browser'
    output.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(work/'target/browser/selection.js', output/'selection.js')
    (output/'reference.json').write_text(json.dumps(fixtures),'utf-8')
    report = {'schemaVersion':1, 'kind':'browser-function-library', 'browserExecutable':True,
              'stage':'realistic-biome-selection', 'worldBiomeGenerator':False,
              'compiler':'TeaVM 0.15.0', 'floatArithmetic':'binary32 after each JVM float arithmetic/conversion opcode',
              'validation':'pending', 'inputClasses':expected['inputClasses'],
              'runtimeProfile':'required; validation uses controlled identity tables',
              'excluded':['actual registry initialization','terrain heights','river biome replacement','surface painters','map generators'],
              'adapters':['explicit initialized manager/generator fields','long-key cache','coordinate packing','biome identity; discarded terrain callback returns zero']}
    (output/'manifest.json').write_text(json.dumps(report,indent=2),'utf-8')
    print('Compiled selection slice. Run node tools/verify-worldgen.mjs before use.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True)
    compile_worldgen(Path(parser.parse_args().input))
