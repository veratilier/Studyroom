import {request} from 'node:https';
import {resolve4} from 'node:dns/promises';
import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export function endpoint(value){let u;try{u=new URL(value)}catch{fail('请输入有效 API 地址。')}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||(u.port&&u.port!=='443'))fail('API 地址须为 HTTPS，不含账号、查询参数或自定义端口。');u.pathname=u.pathname.replace(/\/$/,'').replace(/\/chat\/completions$/,'')+'/chat/completions';return u;}
export function publicIPv4(ip){const a=ip.split('.').map(Number);return a.length===4&&a.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&![0,10,127].includes(a[0])&&a[0]<224&&!(a[0]===169&&a[1]===254)&&!(a[0]===172&&a[1]>=16&&a[1]<=31)&&!(a[0]===192&&[0,168].includes(a[1]))&&!(a[0]===100&&a[1]>=64&&a[1]<=127)&&!(a[0]===198&&[18,19,51].includes(a[1]))&&!(a[0]===203&&a[1]===0);}
export function seal(secret,id,value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),iv);c.setAAD(Buffer.from(id));const encrypted=Buffer.concat([c.update(value,'utf8'),c.final()]);return [iv,c.getAuthTag(),encrypted].map(b=>b.toString('base64')).join('.')}
export function unseal(secret,id,value){const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64')),c=createDecipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),iv);c.setAAD(Buffer.from(id));c.setAuthTag(tag);return Buffer.concat([c.update(data),c.final()]).toString()}
export async function completion(settings,params){
 const url=endpoint(settings.baseUrl);let addresses;try{addresses=await resolve4(url.hostname)}catch{fail('API 域名无法解析，请检查地址。',502)}
 if(!addresses.length||addresses.some(a=>!publicIPv4(a)))fail('API 地址不能指向本机或内网。');
 const body=JSON.stringify({model:settings.model,messages:params.messages,stream:false});
 return new Promise((resolve,reject)=>{
  const error=message=>Object.assign(Error(message),{status:502});
  // Pin the validated address for this connection; preserve HTTPS hostname verification. Never follow redirects.
  const req=request(url,{method:'POST',agent:false,lookup:(_host,options,cb)=>options.all?cb(null,[{address:addresses[0],family:4}]):cb(null,addresses[0],4),headers:{Authorization:'Bearer '+settings.apiKey,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
   const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>2*1024*1024){req.destroy(error('API 返回内容过大。'));return;}chunks.push(chunk)});
   res.on('error',()=>reject(error('API 连接中断。')));res.on('end',()=>{if(res.statusCode<200||res.statusCode>=300)return reject(error(`API 请求失败（${res.statusCode}），请检查密钥、模型或余额。`));try{const data=JSON.parse(Buffer.concat(chunks).toString()),content=data.choices?.[0]?.message?.content;if(typeof content!=='string'||!content.trim())throw Error();resolve({response:content})}catch{reject(error('API 未返回有效的文本回答。'))}});
  });
  const timer=setTimeout(()=>req.destroy(error('API 请求超时，请稍后重试。')),90000);req.on('close',()=>clearTimeout(timer));req.on('error',()=>reject(error('API 连接失败，请检查服务地址。')));req.end(body);
 });
}
