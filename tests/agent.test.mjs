import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {codexTurn} from '../agent-server/codex.mjs';
import {createAgentServer} from '../agent-server/server.mjs';
const fixture=fileURLToPath(new URL('./fake-codex.mjs',import.meta.url));

test('app-server protocol handles early notifications, resume and final-only output',async()=>{
 let saved;
 const out=await codexTurn({binary:process.execPath,args:[fixture],cwd:tmpdir(),threadId:'existing-course-thread',messages:[],onThread:id=>saved=id,timeout:3000});
 assert.equal(saved,'existing-course-thread');assert.equal(JSON.parse(out.response).answer,'Fixture result');
});
test('app-server timeout stops the child and reports an actionable failure',async()=>{
 await assert.rejects(codexTurn({binary:process.execPath,args:[fixture,'timeout'],cwd:tmpdir(),messages:[],timeout:100}),/超时/);
});
test('VPS HTTP service persists uploads and course threads; duplicate questions are not re-run',async t=>{
 const root=mkdtempSync(resolve(tmpdir(),'studyroom-test-'));
 const config={data:resolve(root,'data'),home:resolve(root,'profile'),password:crypto.randomUUID(),secret:crypto.randomUUID()};
 const calls=[];
 const run=async args=>{calls.push(args);await args.onThread(args.threadId||'thread-'+crypto.randomUUID());return {response:JSON.stringify({answer:'这是课件里的概念（第1页）。'})};};
 let app=createAgentServer(config,run);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{app.server.closeAllConnections();app.server.close();await once(app.server,'close');rmSync(root,{recursive:true,force:true});});
 let url='http://127.0.0.1:'+app.server.address().port,token='';
 async function request(path,method='GET',body){const headers={Origin:'https://study.r-vera.com',...(token?{Authorization:'Bearer '+token}:{})};if(body&&!(body instanceof FormData)){headers['Content-Type']='application/json';body=JSON.stringify(body);}return fetch(url+path,{method,headers,body});}
 token=(await (await request('/account/register','POST',{name:'owner',password:config.password,legacyPassword:config.password})).json()).token;
 async function upload(text){const f=new FormData();f.set('file',new File([text],'lecture.txt'));f.set('subject','BIO101');f.set('title','Lecture');f.set('pages',JSON.stringify([{page:1,text}]));return (await request('/courses','POST',f)).json();}
 const a=await upload('Photosynthesis converts energy.');const b=await upload('Mitosis divides a cell.');
 const id=crypto.randomUUID();
 let r=await request(`/courses/${a.id}/chat`,'POST',{question:'解释一下',request_id:id});assert.equal(r.status,200);assert.equal((await r.json()).status,'complete');
 await request(`/courses/${a.id}/chat`,'POST',{question:'解释一下',request_id:id});assert.equal(calls.length,1);
 assert.equal((await request(`/courses/${b.id}/chat`,'POST',{question:'解释一下',request_id:id})).status,409);
 const thread=app.local.getThread('chat:'+a.id);
 app.server.closeAllConnections();app.server.close();await once(app.server,'close');
 app=createAgentServer(config,run);await new Promise(r=>app.server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+app.server.address().port;
 await request(`/courses/${a.id}/chat`,'POST',{question:'考考我',request_id:crypto.randomUUID()});assert.equal(calls[1].threadId,thread);
 await request(`/courses/${b.id}/chat`,'POST',{question:'解释细胞',request_id:crypto.randomUUID()});assert.equal(calls[2].threadId,undefined);
 const data=await (await request(`/courses/${a.id}/chat`)).json();assert.equal(data.messages.length,2);
 assert.equal(await (await request(`/courses/${b.id}/file`)).text(),'Mitosis divides a cell.');
 const ownerToken=token;const apiCalls=[];config.complete=async(settings,params)=>{apiCalls.push({settings,params});return {response:JSON.stringify({answer:'API answer'})}};
 config.inviteCode=crypto.randomUUID();
 const friend=await (await request('/account/register','POST',{name:'friend',password:config.password,inviteCode:config.inviteCode})).json();token=friend.token;
 assert.ok(token);assert.deepEqual((await (await request('/courses')).json()).courses,[]);
 for(const suffix of ['', '/file','/chat'])assert.equal((await request(`/courses/${a.id}${suffix}`)).status,404);
 assert.equal((await request(`/courses/${a.id}/analyze`,'POST')).status,404);
 const own=await upload('Photosynthesis converts energy.');assert.notEqual(own.id,a.id);
 assert.equal((await request(`/courses/${own.id}/chat`,'POST',{question:'解释',request_id:crypto.randomUUID()})).status,400);
 const key='test-secret-'+crypto.randomUUID();
 assert.equal((await request('/account/ai','POST',{baseUrl:'http://127.0.0.1',model:'test-model',apiKey:key})).status,400);
 assert.equal((await request('/account/ai','POST',{baseUrl:'https://api.example.com/v1',model:'test-model',apiKey:key})).status,200);
 const publicSettings=await (await request('/account/ai')).text();assert.ok(!publicSettings.includes(key));assert.ok(!publicSettings.includes('apiKey'));
 assert.equal((await request('/account/ai','POST',{baseUrl:'https://other.example.com/v1',model:'test-model'})).status,400);
 await request(`/courses/${own.id}/chat`,'POST',{question:'解释',request_id:crypto.randomUUID()});assert.equal(apiCalls.length,1);assert.equal(apiCalls[0].settings.apiKey,key);assert.equal(calls.length,3);

 const newPassword=crypto.randomUUID();const changed=await (await request('/account/password','POST',{currentPassword:config.password,password:newPassword})).json();
 assert.ok(changed.token);assert.equal((await request('/courses')).status,401);
 token=changed.token;assert.equal((await request('/courses')).status,200);
 await request('/account/logout','POST');assert.equal((await request('/courses')).status,401);
 assert.equal((await request('/account/login','POST',{name:'friend',password:config.password})).status,401);
 token=(await (await request('/account/login','POST',{name:'friend',password:newPassword})).json()).token;assert.ok(token);
 token=ownerToken;assert.equal((await (await request('/account/ai')).json()).configured,false);assert.equal((await (await request('/courses')).json()).courses.length,2);
 assert.equal((await request('/account/register','POST',{name:'intruder',password:newPassword,legacyPassword:config.password})).status,403);

});
