// Node transport adapter for the actual browser Worker module and isolated
// engine graphs. No browser automation, GPU emulation or production changes.
import {parentPort,workerData} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
const queued=[];
globalThis.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};
globalThis.fetch=async url=>{
  try {const source=await readFile(url,'utf8');return {ok:true,json:async()=>JSON.parse(source)};}
  catch{return {ok:false,status:404};}
};
parentPort.on('message',data=>self.onmessage?self.onmessage({data}):queued.push(data));
await import(workerData?.entry||'../../dist/engine/worker.js');
for(const data of queued)self.onmessage({data});
