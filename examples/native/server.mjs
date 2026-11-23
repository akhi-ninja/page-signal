import {createServer} from 'node:http';
import {extractPage} from '@pagesignal/core';
const origin=process.env.EXAMPLE_ORIGIN||'http://localhost:5173';
// Local demonstration only. Add verified authentication and persistent quotas before hosting.
let active=0;
createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 if(req.method!=='POST'||req.url!=='/api/extract')return send(404,{error:'Not found'});
 if(req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/json'))return send(403,{error:'Invalid origin or content type'});
 if(active>=2)return send(429,{error:'Two extractions are already running'});
 active++;const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
 try{let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>4000000){send(413,{error:'Request too large'});return;}chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks));}catch{return send(400,{error:'Invalid JSON'});}
 if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(body?.image||'')||typeof body.text!=='string'||body.text.length>20000)return send(400,{error:'Expected bounded JPEG and text'});
 const result=await extractPage({image:body.image,text:body.text},{apiKey:process.env.OPENAI_API_KEY,signal:controller.signal});send(200,result);
 }catch{if(!res.destroyed)send(502,{error:'Extraction failed; check server configuration'});}finally{active--;}
}).listen(3100,'127.0.0.1',()=>console.log('Local-only extraction adapter listening on 127.0.0.1:3100'));
