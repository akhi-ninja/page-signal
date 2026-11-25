import {lookup} from 'node:dns/promises';
import {request} from 'node:https';
import {isIP} from 'node:net';
import {prepareConnectorRequest} from './connector-request.mjs';
// Conservative IPv4-only pilot. Reject special-use ranges and all IPv6.
export function publicIPv4(address){
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===0||b===168||(b===88&&c===99)))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
export async function executeConnectorTransport(connection,operation,secret,env=process.env){
 if(env.PAGESIGNAL_CONNECTOR_TRANSPORT_ENABLED!=='true')throw Error('Transport disabled');
 const {url,options}=prepareConnectorRequest(connection,operation,secret,env);
 const deadline=AbortSignal.timeout(10000);
 try{
 const addresses=await new Promise((resolve,reject)=>{
 const abort=()=>reject(Error('DNS timeout'));deadline.addEventListener('abort',abort,{once:true});
 lookup(url.hostname,{all:true,family:4}).then(resolve,reject).finally(()=>deadline.removeEventListener('abort',abort));
 });
 if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw Error('Destination rejected');
 const pinned=addresses[0].address;
 return await new Promise((resolve,reject)=>{
 const req=request(url,{method:options.method,headers:Object.fromEntries(options.headers),agent:false,family:4,autoSelectFamily:false,servername:url.hostname,rejectUnauthorized:true,signal:deadline,lookup(_host,opts,cb){if(opts.all)cb(null,[{address:pinned,family:4}]);else cb(null,pinned,4)}},res=>{
 if(res.statusCode>=300&&res.statusCode<400){res.destroy();reject(Error('Redirect rejected'));return}
 const chunks=[];let size=0;
 res.on('data',chunk=>{size+=chunk.length;if(size>262144){res.destroy();req.destroy();reject(Error('Response limit exceeded'));return}chunks.push(chunk)});
 res.on('error',reject);res.on('aborted',()=>reject(Error('Response aborted')));
 res.on('end',()=>{const type=String(res.headers['content-type']||'').split(';')[0].trim().toLowerCase();if(type!=='application/json'&&!type.endsWith('+json')){reject(Error('Unsupported response type'));return}try{resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(chunks).toString('utf8'))})}catch{reject(Error('Invalid JSON response'))}});
 });req.on('error',reject);req.end(options.body);
 });
 }catch{throw Error('Connector transport failed')}
}
