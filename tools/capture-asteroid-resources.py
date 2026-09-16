"""Capture asteroid registries only; leave existing calibrated profiles intact."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'tools'/file)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result
def capture(instance,pid):
    hello=module('asteroid_worker','worker-query.py').query(instance,'hello')
    if not hello.get('ok') or hello.get('protocol') not in (21,25):raise ValueError('Reviewed Worker protocol required')
    module('asteroid_build','build-profile-agent.py').build()
    out=ROOT/'private-packs/runtime-session'
    text=(ROOT/'private-packs/live-capture.properties').read_text('utf-8')
    text='\n'.join('mode=asteroid-resources' if l.startswith('mode=') else 'output='+out.as_posix() if l.startswith('output=') else l for l in text.splitlines())+'\n'
    config=ROOT/'private-packs/asteroid-resource-capture.properties';config.write_text(text,'utf-8')
    subprocess.run(['java','--add-modules','jdk.attach','-cp',str(ROOT/'artifacts/profile-agent'),'AttachCapture',str(pid),str(ROOT/'artifacts/profile-agent/amidst-capture-entry.jar'),str(config)],check=True)
    game=Path(instance)/'.minecraft'
    hashes={}
    for pattern in ['gregtech-*.jar','HardcoreEnderExpansion*.jar','Draconic-Evolution*.jar']:
        for path in (game/'mods').glob(pattern):hashes[path.name]=hashlib.sha256(path.read_bytes()).hexdigest()
    receipt={'schemaVersion':1,'protocol':hello['protocol'],'sourceJars':hashes,'scope':'initialized registries and desktop Java selector; no save state or block generation','hashes':{}}
    for path in [out/'asteroid-resource-profile.json',out/'asteroid-resource-oracle.json',*list((ROOT/'tools/asteroid-reference').glob('*.java'))]:
        receipt['hashes'][path.relative_to(ROOT).as_posix()]=hashlib.sha256(path.read_bytes()).hexdigest()
    (out/'asteroid-resource-receipt.json').write_text(json.dumps(receipt,indent=2),'utf-8')
    print('Captured asteroid resource profile and independent Java samples.')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--instance',required=True);p.add_argument('--pid',type=int,required=True)
    a=p.parse_args();capture(a.instance,a.pid)
