// Local, allowlisted diagnostic harness. No private archive or game files are served.
import http from "node:http";
import { readFile } from "node:fs/promises";
const pack = new URL(
  "../private-packs/rwg-selection-browser/",
  import.meta.url,
);
const html = `<!doctype html><meta charset="utf-8"><title>RWG 浏览器采样验证</title>
<style>body{font:18px system-ui;background:#17131f;color:#e4ddd0;margin:40px}pre{white-space:pre-wrap}</style>
<h1>RWG 浏览器采样验证</h1><p>使用 Java 对照数据检查选择与混合；不包含最终地表群系。</p><pre id="result">正在浏览器计算线程中验证…</pre>
<script type="module">const worker=new Worker('./check.js',{type:'module'});worker.onmessage=e=>{document.querySelector('#result').textContent=e.data;worker.terminate();};worker.onerror=e=>{document.querySelector('#result').textContent='失败：'+e.message;};</script>`;
const worker = `import * as engine from './selection.js';
const groups=[[[3,3,7],[17,31,17],[64,92,127],[151,151,190],[221,255]],[[3,7],[17,31],[64,92,127],[],[]],[[255],[255],[255],[255],[255]]];
try {
 const fixtures=await(await fetch('./reference.json')).json();let key,pixels=0,scalars=0;const start=performance.now();
 for(const f of fixtures){const next=f.seed+':'+f.noise+':'+f.profile;if(key!==next){engine.configure(f.seed,f.noise,...groups[f.profile].map(g=>Int32Array.from(g)));key=next;}
 const [cx,cz]=f.chunk,x=cx*16,z=cz*16;
 for(const [name,expected]of [['rawBiome',f.raw],['riverStrength',Math.fround(f.river)],['oceanValue',Math.fround(f.ocean)]]){if(engine[name](x,z)!==expected)throw Error(name+' mismatch '+key);scalars++;}
 const actual=engine.blendedChunk(cx,cz);for(let i=0;i<256;i++){if(actual[i]!==f.blended[i])throw Error('pixel mismatch '+key+' '+i);pixels++;}}
 postMessage('通过：'+fixtures.length+' 个案例\\n逐像素一致：'+pixels+'\\n数值完全一致：'+scalars+'\\n耗时：'+Math.round(performance.now()-start)+' ms\\n范围：受控目录；实际 GTNH 环境尚未校准。');
}catch(error){postMessage('失败：'+error.message);}`;
http
  .createServer(async (req, res) => {
    const route = new URL(req.url, "http://localhost").pathname;
    try {
      let body, type;
      if (route === "/") {
        body = html;
        type = "text/html; charset=utf-8";
      } else if (route === "/check.js") {
        body = worker;
        type = "text/javascript";
      } else if (route === "/selection.js" || route === "/reference.json") {
        body = await readFile(new URL(route.slice(1), pack));
        type = route.endsWith(".js") ? "text/javascript" : "application/json";
      } else {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end("Validation files unavailable");
    }
  })
  .listen(4174, "127.0.0.1", () =>
    console.log("RWG validation: http://127.0.0.1:4174/"),
  );
