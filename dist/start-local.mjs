import http from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

export async function createLocalServer(root=fileURLToPath(new URL('./',import.meta.url))){
  root=await realpath(root);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.otf':'font/otf','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'};
  return http.createServer(async(req,res)=>{
    try{
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const target=await realpath(path.resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname)));
      const relative=path.relative(root,target);
      if(relative.startsWith('..')||path.isAbsolute(relative)||!(await stat(target)).isFile())throw new Error('Not found');
      const data=await readFile(target);
      res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:data);
    }catch{res.writeHead(404);res.end('Not found');}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=await createLocalServer();
  server.once('error',error=>{if(error.code==='EADDRINUSE')server.listen(0,'127.0.0.1');else{console.error(error.message);process.exitCode=1;}});
  server.on('listening',()=>{
    const url='http://127.0.0.1:'+server.address().port+'/';console.log('Amidst GTNH: '+url+'\nKeep this window open. Close it to stop the local server.');
    if(process.platform==='win32'&&!process.argv.includes('--no-open')){
      const child=spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'});child.on('error',()=>console.log('Open the URL above in your browser.'));
    }
  });
  server.listen(Number(process.env.PORT||4177),'127.0.0.1');
}
