"""Temporarily append capture agents to one explicitly selected Prism instance.
Restoration touches only the two keys changed here, preserving other launcher updates.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
KEYS=('OverrideJavaArgs','JvmArgs')


def value(text,key):
    match=re.search(r'^'+re.escape(key)+r'=(.*)$',text,re.M)
    return match.group(1) if match else None


def change(text,key,new):
    pattern=r'^'+re.escape(key)+r'=.*(?:\n|$)'
    if re.search(pattern,text,re.M): return re.sub(pattern,lambda _: '' if new is None else key+'='+new+'\n',text,flags=re.M)
    if new is None:return text
    return text.replace('[General]\n','[General]\n'+key+'='+new+'\n',1)


def prepare(instance):
    instance=Path(instance).resolve(strict=True)
    target=instance/'instance.cfg'
    text=target.read_text('utf-8')
    folder=ROOT/'private-packs/runtime-session'
    folder.mkdir(parents=True,exist_ok=True)
    backup=folder/'launcher-restore.json'
    if backup.exists():raise ValueError('A capture session is already prepared; restore it first')
    raw_args=value(text,'JvmArgs') or ''
    if value(text,'OverrideJavaArgs')!='true':
        global_config=instance.parent.parent/'prismlauncher.cfg'
        raw_args=value(global_config.read_text('utf-8'),'JvmArgs') or ''
    if raw_args.startswith('"'):
        # Qt escaping of quoted argument strings overlaps JSON for normal JVM arguments.
        raw_args=json.loads(raw_args)
    if '\n' in raw_args or '\r' in raw_args:raise ValueError('Multiline Java arguments need explicit adapter')
    profile_agent=ROOT/'artifacts/profile-agent/amidst-rwg-profile.jar'
    capture_agent=ROOT/'artifacts/capture-agent/amidst-runtime-capture.jar'
    for path in (profile_agent,capture_agent):
        if not path.is_file():raise FileNotFoundError(path)
    bytecode=folder/'classes';profiles=folder/'profiles'
    properties=folder/'capture.properties'
    properties.write_text('output='+bytecode.as_posix()+'\nprefixes=rwg/,biomesoplenty/,net/minecraft/world/biome/\n','utf-8')
    for path in (profile_agent,capture_agent,profiles,properties):
        if ' ' in str(path):raise ValueError('This launcher adapter requires capture paths without spaces')
    # Observer before profile hook captures input definitions, not our injected hook.
    args=(raw_args+' -javaagent:'+capture_agent.as_posix()+'='+properties.as_posix()+' -javaagent:'+profile_agent.as_posix()+'='+profiles.as_posix()).strip()
    # Qt stores unquoted strings safely unless a literal backslash/quote needs escaping.
    serialized=args if not any(c in args for c in '\\"') else json.dumps(args,ensure_ascii=False)
    changes={'OverrideJavaArgs':'true','JvmArgs':serialized}
    state={'instance':str(instance),'original':{key:value(text,key) for key in KEYS},'temporary':changes,
           'agents':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (profile_agent,capture_agent)}}
    backup.write_text(json.dumps(state,indent=2),'utf-8')
    for key,new in changes.items():text=change(text,key,new)
    target.write_text(text,'utf-8')
    print('Capture parameters prepared; existing JVM arguments retained.')


def restore():
    path=ROOT/'private-packs/runtime-session/launcher-restore.json'
    state=json.loads(path.read_text('utf-8'))
    target=Path(state['instance'])/'instance.cfg'
    text=target.read_text('utf-8')
    for key in KEYS:
        current=value(text,key)
        def decoded(item):
            return json.loads(item) if item and item.startswith('"') else item
        if decoded(current) not in (decoded(state['temporary'][key]),decoded(state['original'][key])):raise ValueError('Launcher setting changed independently: '+key)
        text=change(text,key,state['original'][key])
    target.write_text(text,'utf-8')
    path.rename(path.with_name('launcher-restored.json'))
    print('Original Java argument settings restored; other instance settings preserved.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['prepare','restore'])
    parser.add_argument('--instance')
    args=parser.parse_args()
    if args.action=='restore':restore()
    elif not args.instance:parser.error('--instance is required')
    else:prepare(args.instance)
