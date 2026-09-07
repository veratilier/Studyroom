import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';

export function codexTurn({binary='codex',args=['-c','web_search="disabled"',...['shell_tool','unified_exec','code_mode_host','apps','plugins','browser_use','computer_use','image_generation','view_image','multi_agent','goals','skill_search'].flatMap(name=>['--disable',name]),'app-server'],cwd,home,threadId,model,messages,timeout=80000,onThread=()=>{},spawnProcess=spawn}) {
  return new Promise((resolve,reject)=>{
    const child=spawnProcess(binary,args,{cwd,env:{...Object.fromEntries(['PATH','HOME','USER','LOGNAME','LANG','LC_ALL','TMPDIR','SSL_CERT_FILE','SSL_CERT_DIR','HTTP_PROXY','HTTPS_PROXY','NO_PROXY'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),...(home?{CODEX_HOME:home}:{})},stdio:['pipe','pipe','pipe']});
    let next=0,finished=false,thread=threadId,turn=null,final='',fallback='';
    const pending=new Map(),events=[];
    const send=message=>child.stdin.write(JSON.stringify(message)+'\n');
    const error=message=>Object.assign(new Error(message),{status:502});
    function finish(err,value){
      if(finished)return;finished=true;clearTimeout(timer);lines.close();
      for(const p of pending.values())p.reject(err||error('会话已结束。'));pending.clear();
      child.kill('SIGTERM');const kill=setTimeout(()=>child.kill('SIGKILL'),1000);kill.unref();child.once('exit',()=>clearTimeout(kill));
      err?reject(err):resolve(value);
    }
    const timer=setTimeout(()=>finish(error('学习助手响应超时，当前请求已停止，请稍后再试。')),timeout);
    const rpc=(method,params)=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});send({id,method,params})});
    const lines=createInterface({input:child.stdout});
    child.stderr.on('data',()=>{}); // Never send provider logs or credentials to the web client.
    child.on('error',()=>finish(error('无法启动 VPS 上的 Codex，请检查安装与服务配置。')));
    child.on('exit',()=>{if(!finished)finish(error('Codex 连接已断开，请检查 VPS 上的登录状态。'))});
    child.stdin.on('error',()=>finish(error('Codex 输入连接已关闭。')));
    function event(message){
      const p=message.params||{};
      if(p.threadId!==thread)return;
      if(!turn){events.push(message);return;}
      if(p.turnId&&p.turnId!==turn)return;
      if(message.method==='item/completed'&&p.item?.type==='agentMessage'){
        if(p.item.phase==='final_answer')final=p.item.text;
        else if(!p.item.phase)fallback=p.item.text;
      }
      if(message.method==='turn/completed'&&p.turn?.id===turn){
        if(p.turn.status!=='completed')return finish(error('学习助手未完成回答，请稍后再试。'));
        const answer=final||fallback;
        if(!answer)return finish(error('学习助手没有返回完整答案。'));
        finish(null,{response:answer,threadId:thread});
      }
    }
    lines.on('line',line=>{
      if(finished)return;
      if(line.length>2*1024*1024)return finish(error('学习助手返回内容过大。'));
      let m;try{m=JSON.parse(line)}catch{return finish(error('Codex 协议响应无法读取。'))}
      if(m.method&&m.id!==undefined){
        // This learning endpoint never approves filesystem changes, commands or external tool access.
        send({id:m.id,error:{code:-32601,message:'Interactive tool approvals are not enabled in Studyroom.'}});return;
      }
      if(m.id!==undefined){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(error('Codex 请求失败，请核对登录、版本与模型配置。')):p.resolve(m.result);}
      else event(m);
    });
    (async()=>{
      await rpc('initialize',{clientInfo:{name:'studyroom',title:'Studyroom',version:'0.2.0'}});
      send({method:'initialized',params:{}});
      const settings={cwd,approvalPolicy:'never',sandbox:'read-only',...(model?{model}:{})};
      const result=threadId?await rpc('thread/resume',{...settings,threadId}):await rpc('thread/start',settings);
      thread=result.thread.id;await onThread(thread);
      const started=await rpc('turn/start',{threadId:thread,cwd,approvalPolicy:'never',sandboxPolicy:{type:'readOnly',networkAccess:false},input:[{type:'text',text:JSON.stringify(messages)}]});
      turn=started.turn.id;for(const e of events.splice(0))event(e);
    })().catch(e=>finish(e));
  });
}
