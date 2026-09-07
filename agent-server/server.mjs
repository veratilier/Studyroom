import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import worker from '../worker/index.mjs';
import {storage} from './storage.mjs';
import {codexTurn} from './codex.mjs';

export function createAgentServer(config,run=codexTurn){
  if(!config.password||!config.secret||config.secret.length<32)throw Error('Set private LOGIN_PASSWORD and SESSION_SECRET locally.');
  if(!config.home||!config.data)throw Error('Set dedicated STUDYROOM_CODEX_HOME and STUDYROOM_DATA_DIR outside the repository.');
  const home=resolve(config.home),cwd=resolve(config.data,'agent-workspace');mkdirSync(cwd,{recursive:true,mode:0o700});
  // Use a dedicated Codex profile. Reject inherited MCP/plugin tooling rather than approving it from a web request.
  let profile='';try{profile=readFileSync(resolve(home,'config.toml'),'utf8')}catch(e){if(e.code!=='ENOENT')throw e;}
  if(/mcp_servers|plugins|config_profile|profile\s*=/.test(profile))throw Error('Use a dedicated Codex profile without MCP servers, plugins or named profiles. Existing profiles are not modified.');
  const local=storage(config.data);let running=0;
  const agent={async run(model,params,context={}){
    if(running>=2)throw Object.assign(Error('学习助手正在处理其他内容，请稍后再试。'),{status:429});
    running++;
    try{return await run({binary:config.binary||'codex',cwd,home,model:config.model,messages:params.messages,
      threadId:context.key?local.getThread(context.key):undefined,
      onThread:id=>{if(context.key)local.setThread(context.key,id);}})}finally{running--;}
  }};
  const env={...local,AI:agent,AGENT:agent,ALLOWED_ORIGIN:config.origin||'https://study.r-vera.com',LOGIN_PASSWORD:config.password,SESSION_SECRET:config.secret,DAILY_AI_CALL_LIMIT:config.dailyLimit||'30'};
  const server=createServer(async(req,res)=>{
    try{
      const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v!==undefined)headers.set(k,Array.isArray(v)?v.join(','):v);
      // Ignore spoofed forwarded client IPs; a shared limit is conservative for this single-owner service.
      headers.set('CF-Connecting-IP',req.socket.remoteAddress||'local');
      const method=req.method||'GET';
      const request=new Request('http://localhost'+req.url,{method,headers,...(!['GET','HEAD'].includes(method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
      const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));
      if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
    }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:'课件服务暂时不可用。'}));}
  });
  server.requestTimeout=120000;server.headersTimeout=15000;
  server.on('close',()=>local.db.close());
  return {server,env,local};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  process.umask(0o077);
  const {server}=createAgentServer({password:process.env.LOGIN_PASSWORD,secret:process.env.SESSION_SECRET,home:process.env.STUDYROOM_CODEX_HOME,data:process.env.STUDYROOM_DATA_DIR,binary:process.env.CODEX_BIN,model:process.env.CODEX_MODEL,origin:process.env.ALLOWED_ORIGIN,dailyLimit:process.env.DAILY_AI_CALL_LIMIT});
  server.listen(Number(process.env.PORT||8788),'127.0.0.1',()=>console.log('Studyroom agent service listening on loopback.'));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close();setTimeout(()=>process.exit(0),90000).unref();});
}
