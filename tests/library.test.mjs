import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker, { chunkPages, validatePages, validateResult } from '../worker/index.mjs';

// Each test creates disposable random credentials for an in-memory fake environment.
// No production configuration, account credentials, or network access is used.
function setup() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../worker/migrations/0001_library.sql', import.meta.url),'utf8'));
  const wrap = (query, args=[]) => ({
    bind(...values){return wrap(query,values)},
    async first(){return sql.prepare(query).get(...args)||null},
    async all(){return {results:sql.prepare(query).all(...args)}},
    async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}}}
  });
  const objects = new Map(); let calls=0;
  const env={ALLOWED_ORIGIN:'https://study.r-vera.com',LOGIN_PASSWORD:crypto.randomUUID(),SESSION_SECRET:crypto.randomUUID(),DAILY_AI_CALL_LIMIT:'30',
    DB:{prepare:wrap,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}}},
    FILES:{async put(key,body){objects.set(key,body)},async get(key){return objects.has(key)?{body:objects.get(key)}:null},async delete(key){objects.delete(key)}},
    AI:{async run(model,args){calls++;const input=JSON.parse(args.messages[1].content),p=input[0];return {response:JSON.stringify({sections:[{heading:'细胞与能量',points:['课件讨论光合作用。'],page:p.page,quote:p.text.slice(0,50)}],vocabulary:[{term:'photosynthesis',chinese:'光合作用',definition:'Conversion of light energy.',page:p.page}]})}}}
  };
  let token='';
  async function request(path,method='GET',body,headers={}){
    const h={Origin:env.ALLOWED_ORIGIN,...(token?{Authorization:`Bearer ${token}`} : {}),...headers};
    if(body&&!(body instanceof FormData)&&typeof body!=='string'){h['Content-Type']='application/json';body=JSON.stringify(body)}
    return worker.fetch(new Request('https://api.example'+path,{method,body,headers:h}),env);
  }
  async function login(){const res=await request('/session','POST',{password:env.LOGIN_PASSWORD});assert.equal(res.status,200);token=(await res.json()).token;}
  async function upload(pages=[{page:1,text:'photosynthesis converts light energy into chemical energy in cells.'}],file='sample.txt',subject='BIO101'){
    const form=new FormData();form.set('file',new File([pages.map(p=>p.text).join('\n')],file));form.set('pages',JSON.stringify(pages));form.set('subject',subject);form.set('title','第一讲');
    return request('/courses','POST',form);
  }
  return {env,sql,objects,request,login,upload,calls:()=>calls};
}
test('private endpoints reject unauthenticated requests and foreign origins',async()=>{
  const s=setup();assert.equal((await s.request('/courses')).status,401);
  assert.equal((await s.request('/session','POST',{password:s.env.LOGIN_PASSWORD},{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await s.request('/session','POST',{password:'wrong'})).status,401);
  await s.login();assert.equal((await s.request('/courses')).status,200);
  assert.equal((await s.request('/courses','GET',undefined,{Authorization:'Bearer 9999999999999.fake.fake'})).status,401);
});
test('upload -> classify -> analyze -> retrieve source, with duplicate protection',async()=>{
  const s=setup();await s.login();let r=await s.upload();assert.equal(r.status,201);const course=await r.json();
  assert.equal(course.status,'pending');assert.equal(course.completed,0);assert.equal(s.objects.size,1);
  r=await s.upload();const duplicate=await r.json();assert.equal(duplicate.id,course.id);assert.equal(duplicate.duplicate,true);assert.equal(s.objects.size,1);
  r=await s.request(`/courses/${course.id}/analyze`,'POST');assert.equal(r.status,200);const done=await r.json();
  assert.equal(done.status,'ready');assert.equal(done.parts[0].vocabulary[0].term,'photosynthesis');
  await s.request(`/courses/${course.id}/analyze`,'POST');assert.equal(s.calls(),1,'completed requests do not spend another inference');
  r=await s.request(`/courses/${course.id}/file`);assert.match(await r.text(),/photosynthesis/);assert.equal(r.headers.get('Cache-Control'),'no-store');
  r=await s.request(`/courses/${course.id}`,'PATCH',{subject:'SCI102',title:'生命科学'});assert.equal((await r.json()).subject,'SCI102');
  const list=await (await s.request('/courses')).json();assert.equal(list.courses[0].title,'生命科学');
});
test('multi-part processing preserves all text and resumes after provider failure',async()=>{
  const s=setup();await s.login();const pages=[{page:1,text:'photosynthesis '+ 'a'.repeat(11000)},{page:2,text:'photosynthesis another page'}];
  const course=await (await s.upload(pages)).json();assert.equal(course.total,2);
  let r=await s.request(`/courses/${course.id}/analyze`,'POST');assert.equal((await r.json()).completed,1);
  const run=s.env.AI.run;s.env.AI.run=async()=>{throw Error('secret upstream details')};
  r=await s.request(`/courses/${course.id}/analyze`,'POST');assert.equal(r.status,502);assert.doesNotMatch(await r.text(),/secret/);
  let d=await (await s.request(`/courses/${course.id}`)).json();assert.equal(d.completed,1);assert.equal(d.status,'pending');
  s.env.AI.run=run;d=await (await s.request(`/courses/${course.id}/analyze`,'POST')).json();assert.equal(d.completed,2);assert.equal(d.status,'ready');
});
test('lease prevents overlapping analysis; daily budget retains pending work',async()=>{
  const s=setup();await s.login();const c=await (await s.upload()).json();
  s.sql.prepare('UPDATE sections SET lease_until=? WHERE course_id=?').run(Date.now()+60000,c.id);
  assert.equal((await s.request(`/courses/${c.id}/analyze`,'POST')).status,409);assert.equal(s.calls(),0);
  s.sql.prepare('UPDATE sections SET lease_until=0 WHERE course_id=?').run(c.id);
  s.sql.prepare('INSERT INTO budgets VALUES(?,30)').run(new Date().toISOString().slice(0,10));
  assert.equal((await s.request(`/courses/${c.id}/analyze`,'POST')).status,429);
  assert.equal((await (await s.request(`/courses/${c.id}`)).json()).completed,0);
});
test('rejects unsupported, oversized and empty material without saving originals',async()=>{
  const s=setup();await s.login();assert.equal((await s.upload(undefined,'bad.html')).status,400);
  assert.equal((await s.upload([{page:1,text:''}])).status,400);
  assert.equal((await s.upload([{page:1,text:'a'.repeat(120001)}])).status,413);
  assert.equal(s.objects.size,0);
  assert.throws(()=>validatePages([{page:1,text:'x'},{page:1,text:'y'}]));
});
test('grounding filters invented page citations and absent vocabulary',()=>{
  const input=[{page:2,text:'Photosynthesis transforms light energy.'}];
  const result=validateResult({sections:[{heading:'有效',points:['说明'],page:2,quote:'Photosynthesis transforms'},{heading:'错误页',points:['错'],page:9,quote:'Photosynthesis'}],vocabulary:[{term:'Photosynthesis',chinese:'光合作用',definition:'Light conversion.',page:2},{term:'mitochondria',chinese:'线粒体',definition:'Organelle',page:2}]},input);
  assert.equal(result.sections.length,1);assert.equal(result.vocabulary.length,1);
  assert.throws(()=>validateResult({sections:[],vocabulary:[]},input));
});
test('chunking does not lose long-page text or source page numbers',()=>{
  const original='甲'.repeat(12500),chunks=chunkPages([{page:17,text:original}]);
  assert.equal(chunks.flat().map(x=>x.text).join(''),original);assert.ok(chunks.flat().every(x=>x.page===17));
});
