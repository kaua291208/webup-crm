import http from 'node:http';
import {readFile} from 'node:fs/promises';
import api from '../api/index.js';
const port=Number(process.env.PORT||3000);
http.createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://localhost:'+port);
 if(url.pathname.startsWith('/api/')){
 const chunks=[];let size=0;for await(const part of req){size+=part.length;if(size>1048576){res.writeHead(413);res.end();return;}chunks.push(part);}
 const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
 const response=await api.fetch(request);
 res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([k])=>k!=='set-cookie')));
 for(const cookie of response.headers.getSetCookie()) res.appendHeader('Set-Cookie',cookie);
 res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 const file={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/import-worker.js':'import-worker.js','/vendor/xlsx.full.min.js':'vendor/xlsx.full.min.js'}[url.pathname];
 if(!file){res.writeHead(404);res.end('Not found');return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
 res.end(await readFile(new URL('../'+(file.startsWith('vendor/')?'dist/':'public/')+file,import.meta.url)));
 }catch{res.writeHead(500);res.end('Server error');}
}).listen(port,'127.0.0.1',()=>console.log('WebUp CRM: http://localhost:'+port));
