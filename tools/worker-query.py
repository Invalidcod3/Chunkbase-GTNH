"""Read-only calibration requests to the explicitly selected local GTNH Worker."""
import argparse
import json
from pathlib import Path
import re
import socket

READ_ONLY_COMMANDS=('hello','biomes','compare_biomes','structures','prospecting_catalog','prospecting','spawn')

def query(instance, command, seed=0, x=0, z=0, width=16, height=16, step=1, *, dimension=0, dimension_key=None, marker_mode='ORES', structure_group='standard', vanilla_dungeons=False):
    if command not in READ_ONLY_COMMANDS:raise ValueError('Read-only command required')
    if not all(type(v) is int for v in [seed,x,z,width,height,step,dimension]):raise ValueError('Integer coordinates and seed required')
    if not -(1<<63)<=seed<(1<<63):raise ValueError('Invalid seed')
    if not -(1<<31)<=dimension<(1<<31):raise ValueError('Invalid dimension')
    area_limit=67108864 if command=='structures' else 262144 if command=='prospecting' else 65536
    if not 1<=width*height<=area_limit or min(width,height,step)<1 or step>256:raise ValueError('Invalid sample bounds')
    if any(abs(v)>30000000 for v in [x,z,x+(width-1)*step,z+(height-1)*step]):raise ValueError('Coordinates outside world border')
    if command=='prospecting' and (max(width,height)>512 or marker_mode not in ('ORES','FLUID')):raise ValueError('Invalid prospecting request')
    if structure_group not in ('standard','thaumcraft'):raise ValueError('Invalid structure group')
    if type(vanilla_dungeons) is not bool or vanilla_dungeons and (command!='structures' or dimension!=0 or structure_group!='standard'):raise ValueError('Invalid dungeon request')
    if dimension_key is not None and (not isinstance(dimension_key,str) or not re.fullmatch(r'[a-z0-9_.:/-]{1,128}',dimension_key)):raise ValueError('Invalid dimension key')
    root=Path(instance)
    game=root/'.minecraft' if (root/'.minecraft').is_dir() else root
    config=(game/'config/amidstgtnhworker.cfg').read_text('utf-8')
    def setting(kind,key,default):
        match=re.search(r'^\s*'+kind+':'+key+r'=(.*)$',config,re.M)
        return match.group(1).strip() if match else default
    port=int(setting('I','port','47117'))
    request={'protocol':21,'command':command,'token':setting('S','token',''),'seed':seed,'dimension':dimension,'x':x,'z':z,'width':width,'height':height,'step':step}
    if dimension_key is not None:request['dimensionKey']=dimension_key
    if command=='prospecting':request['markerMode']=marker_mode
    if command=='structures':request['structureGroup']=structure_group
    if vanilla_dungeons:request['vanillaDungeonsOnly']=True
    def send():
        with socket.create_connection(('127.0.0.1',port),timeout=5) as connection:
            connection.settimeout(35)
            connection.sendall((json.dumps(request)+'\n').encode())
            return json.loads(connection.makefile('rb').readline(16*1024*1024))
    response=send()
    # Retry only an explicit version rejection, and only the reviewed current protocol.
    if isinstance(response,dict) and response.get('protocol')==25 and str(response.get('error','')).startswith('unsupported protocol '):
        request['protocol']=25
        response=send()
    # Remove token-named fields even in a malformed/nested error response.
    def scrub(value):
        if isinstance(value,dict):return {k:scrub(v) for k,v in value.items() if k.lower()!='token'}
        if isinstance(value,list):return [scrub(v) for v in value]
        return value
    if not isinstance(response,dict):raise ValueError('Invalid Worker response')
    return scrub(response)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--instance',required=True);parser.add_argument('--command',choices=READ_ONLY_COMMANDS,required=True)
    parser.add_argument('--output',required=True)
    parser.add_argument('--dimension',type=int,default=0);parser.add_argument('--dimension-key')
    parser.add_argument('--marker-mode',choices=['ORES','FLUID'],default='ORES')
    parser.add_argument('--structure-group',choices=['standard','thaumcraft'],default='standard')
    parser.add_argument('--vanilla-dungeons',action='store_true')
    for name,default in [('seed',0),('x',0),('z',0),('width',16),('height',16),('step',1)]:parser.add_argument('--'+name,type=int,default=default)
    args=parser.parse_args()
    result=query(args.instance,args.command,args.seed,args.x,args.z,args.width,args.height,args.step,dimension=args.dimension,dimension_key=args.dimension_key,marker_mode=args.marker_mode,structure_group=args.structure_group,vanilla_dungeons=args.vanilla_dungeons)
    target=Path(args.output);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps({'ok':result.get('ok'),'error':result.get('error'),'protocol':result.get('protocol'),'biomes':len(result.get('biomes',[])),'samples':len(result.get('ids',[]))},ensure_ascii=False))
    if result.get('ok') is not True:raise SystemExit(1)
