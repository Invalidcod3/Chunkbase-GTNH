"""Compile the pure RWG noise bytecode slice into a browser ES module.

Uses explicit entry adapters; does not claim to compile the full world generator.
All compiler downloads, intermediates and private output stay inside the project.
"""
import argparse, hashlib, json, os, shutil, subprocess, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NAMES = ['rwg/util/NoiseGenerator','rwg/util/PerlinNoise','rwg/util/OpenSimplexNoise','rwg/util/OpenSimplexNoise$Contribution3','rwg/util/CellNoise']


def fetch(url, output):
    if output.is_file(): return
    print('Downloading ' + url.rsplit('/',1)[-1], flush=True)
    with urllib.request.urlopen(url, timeout=60) as response:
        output.write_bytes(response.read())


def compile_noise(archive):
    work = ROOT/'.test-work/noise-compiler'
    work.mkdir(parents=True,exist_ok=True)
    distro = work/'apache-maven-3.9.9'
    if not distro.is_dir():
        url='https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip'
        binary, checksum = work/'maven.zip',work/'maven.zip.sha512'
        fetch(url,binary);fetch(url+'.sha512',checksum)
        if hashlib.sha512(binary.read_bytes()).hexdigest()!=checksum.read_text().strip().split()[0]: raise ValueError('Maven distribution checksum mismatch')
        with zipfile.ZipFile(binary) as zipped:
            for item in zipped.infolist():
                if not (work/item.filename).resolve().is_relative_to(work.resolve()):raise ValueError('Unsafe Maven archive path')
            zipped.extractall(work)
    hashes={}
    with zipfile.ZipFile(archive) as source, zipfile.ZipFile(work/'noise-input.jar','w') as selected:
        manifest=json.loads(source.read('manifest.json'))
        for name in NAMES:
            data=source.read('classes/'+name+'.class')
            digest=hashlib.sha256(data).hexdigest()
            if digest!=manifest['classHashes'][name]:raise ValueError('Input hash mismatch: '+name)
            selected.writestr(name+'.class',data);hashes[name]=digest
    java = work/'src/main/java/amidst/web/NoiseExports.java'
    java.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/'tools/noise-compiler/NoiseExports.java',java)
    shutil.copyfile(ROOT/'tools/noise-compiler/pom.xml',work/'pom.xml')
    launcher = next((distro/'boot').glob('plexus-classworlds-*.jar'))
    subprocess.run(['java',f'-Dmaven.home={distro}',f'-Dmaven.multiModuleProjectDirectory={work}',f'-Dclassworlds.conf={distro}/bin/m2.conf','-cp',str(launcher),'org.codehaus.plexus.classworlds.launcher.Launcher','-B','-ntp',f'-Dmaven.repo.local={work}/repository','-f',str(work/'pom.xml'),'process-classes'],check=True,cwd=work)
    oracle=subprocess.run(['java','-cp',str(work/'target/classes')+os.pathsep+str(work/'noise-input.jar'),'amidst.web.NoiseExports'],check=True,capture_output=True,text=True)
    fixtures=json.loads(oracle.stdout)
    output=ROOT/'private-packs/rwg-noise-browser'
    output.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(work/'target/browser/noise.js',output/'noise.js')
    (output/'reference.json').write_text(json.dumps(fixtures,indent=2),'utf-8')
    report={'schemaVersion':1,'kind':'browser-function-library','browserExecutable':True,'compiler':'TeaVM 0.15.0','inputClasses':hashes,'exports':['setSeed','perlin3','simplex3','cell3'],'worldBiomeGenerator':False,'validation':'pending'}
    (output/'manifest.json').write_text(json.dumps(report,indent=2),'utf-8')
    print('Compiled private-packs/rwg-noise-browser/noise.js; differential validation is still required.',flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--input',required=True);args=parser.parse_args();compile_noise(Path(args.input))
