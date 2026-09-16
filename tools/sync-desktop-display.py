"""Pin desktop display sources and update names without changing generator identities."""
import argparse,hashlib,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def sync(source):
    source=Path(source).resolve()
    files={'GtnhBiomeColorPalette.java':'src/main/java/amidst/gtnh/worker/GtnhBiomeColorPalette.java',
           'zh_CN.json':'src/main/resources/amidst/i18n/zh_CN.json',
           'dimension-name-audit.md':'docs/dimension-name-audit.md','pluto-surface-colors.md':'docs/pluto-surface-colors.md'}
    inputs={name:(source/path).read_bytes() for name,path in files.items()}
    translations=json.loads(inputs['zh_CN.json'])
    names=json.loads((ROOT/'tools/dimension-names.json').read_text('utf-8'))
    names.setdefault('Underdark',['deep_dark','漆黑世界','Deep Dark'])
    changes=[]
    for raw,value in names.items():
        english={'The End':'End','Proteus':'Proteus (海卫八)'}.get(value[2],value[2])
        zh=translations[english]
        if value[1]!=zh:changes.append({'key':value[0],'before':value[1],'after':zh})
        value[1]=zh
    if len(names)!=42:raise ValueError('Review the complete dimension catalog')
    base_commit=subprocess.check_output(['git','-C',str(source),'rev-parse','HEAD'],text=True).strip()
    target=ROOT/'tools/desktop-display';target.mkdir(parents=True,exist_ok=True)
    for name,data in inputs.items():(target/name).write_bytes(data)
    manifest={'schemaVersion':1,'repository':'https://github.com/Invalidcod3/Amidst-GTNH',
              'baseCommit':base_commit,
              'sourceState':'local working copy, including uncommitted updates','license':'GPL-3.0',
              'files':{name:{'path':files[name],'sha256':hashlib.sha256(data).hexdigest()} for name,data in inputs.items()},'nameChanges':changes}
    (target/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf-8')
    (ROOT/'tools/dimension-names.json').write_text(json.dumps(names,ensure_ascii=False,indent=2)+'\n','utf-8')
    print('Pinned desktop display sources; updated',len(changes),'existing dimension names, covering',len(names),'dimensions.')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',required=True);sync(p.parse_args().source)
