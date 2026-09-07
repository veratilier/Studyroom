// Protocol fixture only. It never contacts Codex or an AI provider.
import {createInterface} from 'node:readline';
const mode=process.argv[2];
createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line),send=x=>process.stdout.write(JSON.stringify(x)+'\n');
 if(m.id===undefined)return;
 if(m.method==='initialize')send({id:m.id,result:{}});
 if(m.method==='thread/start'||m.method==='thread/resume')send({id:m.id,result:{thread:{id:m.params.threadId||'thread-fixture'}}});
 if(m.method==='turn/start'){
  if(mode==='timeout')return;
  const threadId=m.params.threadId;
  send({method:'item/completed',params:{threadId,turnId:'turn-fixture',item:{type:'agentMessage',phase:'commentary',text:'Not a final answer'}}});
  send({method:'item/completed',params:{threadId,turnId:'turn-fixture',item:{type:'agentMessage',phase:'final_answer',text:'{"answer":"Fixture result"}'}}});
  // Deliberately emit notifications before the turn/start response to exercise the race.
  send({method:'turn/completed',params:{threadId,turn:{id:'turn-fixture',status:'completed'}}});
  send({id:m.id,result:{turn:{id:'turn-fixture'}}});
 }
});
