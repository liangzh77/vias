// On-demand public OSM tiles only. No scraping, prefetch, arbitrary upstream or bulk downloads.
// The local Mac relays normal viewport requests so the phone does not need a separate proxy.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);
const root=path.resolve('artifacts/map-cache');
const inflight=new Map();
export async function tileRequest(url,res,method='GET'){
 const m=/^\/map\/tiles\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(url);
 if(!m){res.writeHead(404);res.end();return;}
 const [z,x,y]=m.slice(1).map(Number);if(z>18||x>=2**z||y>=2**z){res.writeHead(400);res.end();return;}
 const key=`${z}-${x}-${y}.png`,file=path.join(root,key);let buffer;
 try{const stat=await fs.stat(file);if(Date.now()-stat.mtimeMs<7*86400000)buffer=await fs.readFile(file);}catch{}
 try{
  if(!buffer){
   if(!inflight.has(key)){
    if(inflight.size>=12){res.writeHead(429,{'Retry-After':'2'});res.end();return;}
    const task=(async()=>{
     const args=['--fail','--silent','--show-error','--max-time','15','--user-agent','ViasLocalResearch/0.1 (single-user local H5 preview; no bulk download)'];
     if(process.env.MAP_HTTP_PROXY)args.push('--proxy',process.env.MAP_HTTP_PROXY);
     args.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
     const {stdout}=await execFileAsync('curl',args,{encoding:'buffer',maxBuffer:1_000_000,timeout:17000});
     const data=Buffer.from(stdout);if(data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw new Error('Unexpected tile format');
     await fs.mkdir(root,{recursive:true});await fs.writeFile(file,data);
     const files=await fs.readdir(root);if(files.length>256){const oldest=await Promise.all(files.map(async f=>({f,time:(await fs.stat(path.join(root,f))).mtimeMs})));oldest.sort((a,b)=>a.time-b.time);await Promise.all(oldest.slice(0,files.length-256).map(f=>fs.unlink(path.join(root,f.f)).catch(()=>{})));}
     return data;
    })();inflight.set(key,task);task.finally(()=>inflight.delete(key)).catch(()=>{});
   }
   buffer=await inflight.get(key);
  }
  res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=604800','X-Content-Type-Options':'nosniff'});res.end(method==='HEAD'?undefined:buffer);
 }catch{res.writeHead(502,{'Cache-Control':'no-store'});res.end('Map tile unavailable');}
}
