// Isolated /vias mount, no SPA fallback, no proxy, no private data.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(process.argv[2]),port=Number(process.argv[3]||8787);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/vias'){res.writeHead(301,{Location:'/vias/'});return res.end();}
 if(!u.pathname.startsWith('/vias/')){res.writeHead(404);return res.end();}
 let name;try{name=decodeURIComponent(u.pathname.slice(6));}catch{res.writeHead(400);return res.end();}
 if(!name)name='index.html';const file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
});server.listen(port,'127.0.0.1',()=>console.log('PREVIEW_READY '+port));
