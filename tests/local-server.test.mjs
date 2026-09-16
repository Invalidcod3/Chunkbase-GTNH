import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createLocalServer} from '../dist/start-local.mjs';
test('portable launcher serves modules with the correct MIME and confines access to its package',async t=>{
  const server=await createLocalServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/map-canvas/);
  const js=await fetch(base+'/engine/packs.js');assert.match(js.headers.get('content-type'),/^text\/javascript/);assert.match(await js.text(),/loadProviders/);
  const outside=await fetch(base+'/%2e%2e%5cREADME.md');assert.equal(outside.status,404);
  const write=await fetch(base+'/',{method:'POST'});assert.equal(write.status,405);
});
