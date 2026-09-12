"""Inspect explicitly selected GTNH mod/config metadata without changing the instance."""
import argparse, hashlib, json, re, socket
from pathlib import Path


def collect(root, probe=False):
    root=Path(root).resolve()
    game=root/'.minecraft' if (root/'.minecraft').is_dir() else root
    mods=[]
    for file in sorted((game/'mods').glob('*.jar')):
        if re.search('rwg|realistic|biomesoplenty|gregtech|galacticraft|galaxyspace|amidst|hardcore|draconic|twilight',file.name,re.I):
            mods.append({'file':file.name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
    settings={}
    config=game/'config'
    for relative in ['RWG.cfg','DraconicEvolution.cfg','TwilightForest.cfg','Galacticraft/core.conf','Galacticraft/planets.conf','GalaxySpace/core.conf','GalaxySpace/dimensions.conf']:
        path=config/relative
        if path.is_file():
            selected=[]
            for line in path.read_text('utf-8',errors='replace').splitlines():
                if re.search(r'^\s*[BI]:.*(dimension|chaos|village|mineshaft|biome)',line,re.I):selected.append(line.strip())
            settings[relative]=selected
    report={'schemaVersion':1,'mods':mods,'selectedSettings':settings,'worker':{'available':False}}
    if probe:
        # Token is kept in memory and is neither printed nor saved in reports.
        path=config/'amidstgtnhworker.cfg'
        text=path.read_text('utf-8') if path.is_file() else ''
        def setting(kind,name,default):
            match=re.search(r'^\s*'+kind+':'+name+r'=(.*)$',text,re.M)
            return match.group(1).strip() if match else default
        port=int(setting('I','port','47117'));token=setting('S','token','')
        try:
            with socket.create_connection(('127.0.0.1',port),timeout=3) as connection:
                connection.settimeout(15)
                connection.sendall((json.dumps({'command':'hello','token':token})+'\n').encode())
                data=connection.makefile('rb').readline(16*1024*1024)
                hello=json.loads(data)
                if isinstance(hello,dict):hello.pop('token',None)
                report['worker']={'available':True,'hello':hello}
        except (OSError,ValueError) as error:
            report['worker']={'available':False,'reason':type(error).__name__}
    return report


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--instance',required=True);p.add_argument('--output',required=True);p.add_argument('--probe-worker',action='store_true');args=p.parse_args()
    report=collect(args.instance,args.probe_worker);out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2,ensure_ascii=False),'utf-8')
    print(json.dumps({'mods':report['mods'],'selectedSettings':report['selectedSettings'],'workerAvailable':report['worker']['available']},ensure_ascii=False,indent=2))
