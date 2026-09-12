"""Build optional RWG constructor observation agent using pinned cached ASM."""
from pathlib import Path
import subprocess
import zipfile
import os
import hashlib
import shutil

ROOT = Path(__file__).resolve().parents[1]


def build():
    asm = ROOT/'.test-work/noise-compiler/repository/org/ow2/asm/asm/9.8/asm-9.8.jar'
    out = ROOT/'artifacts/profile-agent'
    classes = out/'classes'
    classes.mkdir(parents=True,exist_ok=True)
    subprocess.run(['javac','--release','8','-encoding','UTF-8','-cp',str(asm),'-d',str(classes),str(ROOT/'tools/worldgen-compiler/RuntimeProfileAgent.java'),str(ROOT/'tools/worldgen-compiler/LiveCapture.java'),str(ROOT/'tools/worldgen-compiler/LiveCaptureEntry.java')],check=True)
    manifest='Manifest-Version: 1.0\nPremain-Class: amidst.web.profile.RuntimeProfileAgent\nAgent-Class: amidst.web.profile.LiveCaptureEntry\nCan-Redefine-Classes: false\nCan-Retransform-Classes: false\n\n'
    with zipfile.ZipFile(out/'unshaded-profile.jar','w',zipfile.ZIP_DEFLATED) as jar:
        jar.writestr('META-INF/MANIFEST.MF',manifest)
        for path in classes.rglob('*.class'): jar.write(path,path.relative_to(classes).as_posix())
        with zipfile.ZipFile(asm) as dependency:
            for name in dependency.namelist():
                if name.startswith('org/objectweb/asm/') or 'LICENSE' in name:
                    jar.writestr(name,dependency.read(name))
    commons = asm.parents[2]/'asm-commons/9.8/asm-commons-9.8.jar'
    cp = os.pathsep.join(map(str,[asm,commons]))
    shading = out/'shading'
    shading.mkdir(exist_ok=True)
    subprocess.run(['javac','-cp',cp,'-d',str(shading),str(ROOT/'tools/worldgen-compiler/ShadeAgent.java')],check=True)
    subprocess.run(['java','-cp',str(shading)+os.pathsep+cp,'ShadeAgent',str(out/'unshaded-profile.jar'),str(out/'amidst-rwg-profile.jar')],check=True)
    subprocess.run(['javac','--add-modules','jdk.attach','-d',str(out),str(ROOT/'tools/worldgen-compiler/AttachCapture.java')],check=True)
    subprocess.run(['javac','--release','8','-encoding','UTF-8','-cp',str(classes),'-d',str(classes),str(ROOT/'tools/worldgen-compiler/LiveCaptureObserved.java')],check=True)
    live_manifest='Manifest-Version: 1.0\nAgent-Class: amidst.web.profile.LiveCaptureObserved\nCan-Redefine-Classes: false\nCan-Retransform-Classes: true\n\n'
    with zipfile.ZipFile(out/'observed-input.jar','w',zipfile.ZIP_DEFLATED) as jar:
        jar.writestr('META-INF/MANIFEST.MF',live_manifest)
        for path in classes.rglob('*.class'):jar.write(path,path.relative_to(classes).as_posix())
        with zipfile.ZipFile(asm) as dependency:
            for name in dependency.namelist():
                if name.startswith('org/objectweb/asm/') or 'LICENSE' in name:jar.writestr(name,dependency.read(name))
    subprocess.run(['java','-cp',str(shading)+os.pathsep+cp,'ShadeAgent',str(out/'observed-input.jar'),str(out/'amidst-rwg-observed.jar')],check=True)
    helper_hash=hashlib.sha256((out/'amidst-rwg-observed.jar').read_bytes()).hexdigest()
    immutable=out/('helper-'+helper_hash+'.jar')
    if not immutable.exists():shutil.copyfile(out/'amidst-rwg-observed.jar',immutable)
    bootstrap=out/'bootstrap';bootstrap.mkdir(exist_ok=True)
    subprocess.run(['javac','--release','8','-d',str(bootstrap),str(ROOT/'tools/worldgen-compiler/IsolatedCaptureEntry.java')],check=True)
    with zipfile.ZipFile(out/'amidst-capture-entry.jar','w',zipfile.ZIP_DEFLATED) as jar:
        jar.writestr('META-INF/MANIFEST.MF','Manifest-Version: 1.0\nAgent-Class: IsolatedCaptureEntry\nCan-Retransform-Classes: true\n\n')
        jar.write(bootstrap/'IsolatedCaptureEntry.class','IsolatedCaptureEntry.class')
    config=ROOT/'private-packs/live-capture.properties'
    config.write_text('helper='+immutable.as_posix()+'\noutput='+(ROOT/'private-packs/live-isolated').as_posix()+'\nmode=observed\n','utf-8')
    print('Built artifacts/profile-agent/amidst-rwg-profile.jar')


if __name__=='__main__': build()
