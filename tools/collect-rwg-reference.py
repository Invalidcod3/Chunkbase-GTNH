"""Collect small read-only final biome tiles from the live Worker for calibration."""
import argparse
import importlib.util
import json
from pathlib import Path
import time
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('worker_query',ROOT/'tools/worker-query.py')
client=importlib.util.module_from_spec(spec);spec.loader.exec_module(client)
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--instance',required=True);parser.add_argument('--targets');parser.add_argument('--output');args=parser.parse_args()
    output=ROOT/'private-packs/runtime-session/worker-reference.json'
    cases=[]
    targets=json.loads(Path(args.targets).read_text('utf-8'))['targets'] if args.targets else [{'seed':str(seed),'chunk':[cx,cz]} for seed in [0,47,9007199254740993] for cx,cz in [(0,0),(-1,-1),(2,-3),(-113,97),(37,41),(1001,-2049),(-300,128),(299,-501)]]
    if args.targets:output=output.with_name('worker-coverage-reference.json')
    if args.output:output=Path(args.output)
    for target in targets:
            seed=int(target['seed']);cx,cz=target['chunk']
            start=time.monotonic();result=client.query(args.instance,'biomes',seed,cx*16,cz*16,16,16,1)
            if not result.get('ok') or len(result.get('ids',[]))!=256:raise ValueError(result.get('error','Unexpected biome result'))
            cases.append({'seed':str(seed),'chunk':[cx,cz],'ids':result['ids'],'source':result.get('biomeSource'),'pipeline':result.get('predictionPipeline')})
            output.write_text(json.dumps({'schemaVersion':1,'source':'live Worker protocol 21','cases':cases},indent=2),'utf-8')
            if len(cases)%20==0 or len(cases)==len(targets):print(f'Collected {len(cases)}/{len(targets)} tiles ({time.monotonic()-start:.2f}s)',flush=True)
