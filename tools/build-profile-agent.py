"""Build optional RWG constructor observation agent using pinned cached ASM."""
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def build():
    asm = ROOT/'.test-work/noise-compiler/repository/org/ow2/asm/asm/9.8/asm-9.8.jar'
    out = ROOT/'artifacts/profile-agent'
    classes = out/'classes'
    classes.mkdir(parents=True,exist_ok=True)
    subprocess.run(['javac','--release','8','-encoding','UTF-8','-cp',str(asm),'-d',str(classes),str(ROOT/'tools/worldgen-compiler/RuntimeProfileAgent.java')],check=True)
    manifest='Manifest-Version: 1.0\nPremain-Class: amidst.web.profile.RuntimeProfileAgent\nCan-Redefine-Classes: false\nCan-Retransform-Classes: false\n\n'
    with zipfile.ZipFile(out/'amidst-rwg-profile.jar','w',zipfile.ZIP_DEFLATED) as jar:
        jar.writestr('META-INF/MANIFEST.MF',manifest)
        for path in classes.rglob('*.class'): jar.write(path,path.relative_to(classes).as_posix())
        with zipfile.ZipFile(asm) as dependency:
            for name in dependency.namelist():
                if name.startswith('org/objectweb/asm/') or 'LICENSE' in name:
                    jar.writestr(name,dependency.read(name))
    print('Built artifacts/profile-agent/amidst-rwg-profile.jar')


if __name__=='__main__': build()
