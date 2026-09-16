"""Build isolated read-only spawn metadata capture; use the existing one-shot attach entry."""
from pathlib import Path
import hashlib,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'.test-work/spawn-capture';classes=out/'classes';classes.mkdir(parents=True,exist_ok=True)
subprocess.run(['javac','--release','8','-encoding','UTF-8','-d',str(classes),str(ROOT/'tools/spawn-capture/LiveCapture.java')],check=True)
jar=out/'helper.jar'
with zipfile.ZipFile(jar,'w') as z:
    for p in classes.rglob('*.class'):z.write(p,p.relative_to(classes).as_posix())
immutable=out/('helper-'+hashlib.sha256(jar.read_bytes()).hexdigest()+'.jar');immutable.write_bytes(jar.read_bytes())
target=ROOT/'private-packs/runtime-session';target.mkdir(parents=True,exist_ok=True)
(out/'capture.properties').write_text('mode=worker\nhelper='+immutable.as_posix()+'\noutput='+target.as_posix()+'\n','utf-8')
print('Built read-only spawn biome capture helper.')
