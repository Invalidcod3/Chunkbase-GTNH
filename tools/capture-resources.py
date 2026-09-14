"""Capture initialized resource registries from an explicitly selected live GTNH JVM."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[1]


def module(name, file):
    spec=importlib.util.spec_from_file_location(name, ROOT/'tools'/file)
    loaded=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


def capture(instance, pid):
    if not str(pid).isdigit() or int(pid)<1:raise ValueError('Explicit JVM PID required')
    worker=module('resource_worker_query','worker-query.py')
    hello=worker.query(instance,'hello')
    if not hello.get('ok') or hello.get('protocol')!=21:raise ValueError('Compatible Worker required')
    module('resource_profile_build','build-profile-agent.py').build()
    output=ROOT/'private-packs/runtime-session'
    output.mkdir(parents=True,exist_ok=True)
    # The target JVM resolves paths against its own directory: all paths must be absolute.
    config=(ROOT/'private-packs/live-capture.properties').read_text('utf-8')
    config='\n'.join('mode=resources' if line.startswith('mode=') else 'output='+output.as_posix() if line.startswith('output=') else line for line in config.splitlines())+'\n'
    path=ROOT/'private-packs/resource-capture.properties';path.write_text(config,'utf-8')
    subprocess.run(['java','--add-modules','jdk.attach','-cp',str(ROOT/'artifacts/profile-agent'),'AttachCapture',str(pid),str(ROOT/'artifacts/profile-agent/amidst-capture-entry.jar'),str(path)],check=True)
    profile=output/'resource-profile.json'
    mods=Path(instance)/'.minecraft/mods'
    fingerprints={}
    for pattern in ['gregtech-*.jar','galacticgreg-*.jar','visualprospecting-*.jar','Amidst*.jar','amidst*.jar']:
        for jar in mods.glob(pattern):fingerprints[jar.name]=hashlib.sha256(jar.read_bytes()).hexdigest()
    receipt={'schemaVersion':1,'profileSha256':hashlib.sha256(profile.read_bytes()).hexdigest(),'sourceJars':fingerprints,'scope':'initialized configuration and display textures only; no save data'}
    (output/'resource-capture-receipt.json').write_text(json.dumps(receipt,indent=2),'utf-8')
    print('Captured private resource profile. Recalibrate before building the browser pack.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--instance',required=True)
    parser.add_argument('--pid',required=True,type=int)
    args=parser.parse_args();capture(args.instance,args.pid)
