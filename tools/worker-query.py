"""Read-only calibration requests to the explicitly selected local GTNH Worker."""
import argparse
import json
from pathlib import Path
import re
import socket


def query(instance, command, seed=0, x=0, z=0, width=16, height=16, step=1):
    root=Path(instance)
    game=root/'.minecraft' if (root/'.minecraft').is_dir() else root
    config=(game/'config/amidstgtnhworker.cfg').read_text('utf-8')
    def setting(kind,key,default):
        match=re.search(r'^\s*'+kind+':'+key+r'=(.*)$',config,re.M)
        return match.group(1).strip() if match else default
    port=int(setting('I','port','47117'))
    if command not in ('hello','biomes','compare_biomes'):raise ValueError('Read-only command required')
    if not -(1<<63)<=seed<(1<<63):raise ValueError('Invalid seed')
    if not 1<=width*height<=65536 or min(width,height,step)<1:raise ValueError('Invalid sample bounds')
    request={'protocol':21,'command':command,'token':setting('S','token',''),'seed':seed,'dimension':0,'x':x,'z':z,'width':width,'height':height,'step':step}
    with socket.create_connection(('127.0.0.1',port),timeout=5) as connection:
        connection.settimeout(35)
        connection.sendall((json.dumps(request)+'\n').encode())
        data=connection.makefile('rb').readline(16*1024*1024)
    response=json.loads(data)
    response.pop('token',None)
    return response


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--instance',required=True);parser.add_argument('--command',choices=['hello','biomes','compare_biomes'],required=True)
    parser.add_argument('--output',required=True)
    for name,default in [('seed',0),('x',0),('z',0),('width',16),('height',16),('step',1)]:parser.add_argument('--'+name,type=int,default=default)
    args=parser.parse_args()
    result=query(args.instance,args.command,args.seed,args.x,args.z,args.width,args.height,args.step)
    target=Path(args.output);target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps({'ok':result.get('ok'),'error':result.get('error'),'protocol':result.get('protocol'),'biomes':len(result.get('biomes',[])),'samples':len(result.get('ids',[]))},ensure_ascii=False))
