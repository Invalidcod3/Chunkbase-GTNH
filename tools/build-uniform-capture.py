"""Build isolated read-only dimension/biome metadata capture."""
from pathlib import Path
import hashlib,json,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'.test-work/uniform-capture';classes=out/'classes';classes.mkdir(parents=True,exist_ok=True)
subprocess.run(['javac','--release','8','-encoding','UTF-8','-d',str(classes),str(ROOT/'tools/uniform-biomes/LiveCapture.java')],check=True)
jar=out/'helper.jar'
with zipfile.ZipFile(jar,'w') as z:
    for p in classes.rglob('*.class'):z.write(p,p.relative_to(classes).as_posix())
immutable=out/('helper-'+hashlib.sha256(jar.read_bytes()).hexdigest()+'.jar');immutable.write_bytes(jar.read_bytes())
target=ROOT/'private-packs/uniform-input';target.mkdir(parents=True,exist_ok=True)
names=json.loads((ROOT/'tools/dimension-names.json').read_text('utf-8'))
resources=json.loads((ROOT/'private-packs/runtime-session/resource-profile.json').read_text('utf-8'))
mapped={'overworld','nether','end','twilight','moon','mars','ceres','io','enceladus','proteus','pluto','ross128b','barnarda_c','anubis','horus','asteroids','mehen'}
(target/'targets.txt').write_text('\n'.join(names[d['name']][0]+' '+str(d['id']) for d in resources['dimensions'] if names[d['name']][0] not in mapped),'utf-8')
(out/'capture.properties').write_text('mode=worker\nhelper='+immutable.as_posix()+'\noutput='+target.as_posix()+'\n','utf-8')
print('Built isolated uniform biome capture helper.')
