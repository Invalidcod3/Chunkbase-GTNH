"""Collect an explicit read-only query plan; preserve partial results and seed strings."""
import argparse
import importlib.util
import json
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('worker_query',ROOT/'tools/worker-query.py')
client=importlib.util.module_from_spec(spec);spec.loader.exec_module(client)


def collect(instance, plan, output):
    if plan.get('schemaVersion')!=1 or not isinstance(plan.get('cases'),list) or not 1<=len(plan['cases'])<=4096:
        raise ValueError('Invalid calibration plan')
    names=set()
    allowed={'id','command','seed','x','z','width','height','step','dimension','dimension_key','marker_mode','structure_group'}
    for case in plan['cases']:
        if not isinstance(case,dict) or set(case)-allowed or not isinstance(case.get('id'),str) or case['id'] in names:
            raise ValueError('Invalid or duplicate calibration case')
        if case.get('command') not in client.READ_ONLY_COMMANDS:raise ValueError('Read-only command required')
        if 'seed' in case and (not isinstance(case['seed'],str) or not re.fullmatch(r'[+-]?\d+',case['seed'])):
            raise ValueError('Plan seeds must be decimal strings')
        names.add(case['id'])
    result={'schemaVersion':1,'source':'live Worker protocol 21','complete':False,'cases':[]}
    output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
    def save():output.write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf-8')
    for case in plan['cases']:
        args={k:v for k,v in case.items() if k!='id'}
        if 'seed' in args:args['seed']=int(args['seed'])
        try:
            response=client.query(instance,**args)
            if response.get('ok') is not True:raise ValueError(response.get('error','Worker rejected request'))
            if case['command']=='prospecting':
                for deposit in response.get('prospecting',{}).get('deposits',[]):
                    if deposit.get('source') not in ('PREDICTED','INITIAL') or any(deposit.get('currentAmounts') or []):
                        raise ValueError('Save records cannot serve as seed-only calibration; choose a different seed')
            result['cases'].append({'query':case,'response':response})
            save()
            print(f"Collected {len(result['cases'])}/{len(plan['cases'])}: {case['id']}",flush=True)
        except Exception:
            # The exception may include third-party text. Persist the failure ID only.
            result['failedCase']=case['id'];save();raise
    result['complete']=True;save()
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--instance',required=True);p.add_argument('--plan',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();collect(a.instance,json.loads(Path(a.plan).read_text('utf-8')),a.output)
