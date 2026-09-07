import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('existing BIO101 progress survives course switching; uploaded terms use separate progress IDs',async()=>{
  const elements=new Map();const get=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',value:'',checked:false,hidden:false,focus(){},classList:{toggle(){}}});return elements.get(selector)};
  const old={'word-3':{streak:2,weak:false,attempts:3,last:1,due:2}};
  const stored=new Map([['vera-bio101-progress-v1',JSON.stringify(old)]]);
  const ctx=vm.createContext({console,Date,setTimeout,window:{addEventListener(){}},navigator:{},document:{querySelector:get,querySelectorAll:()=>[]},localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)},fetch:async()=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL('../docs/words.json',import.meta.url),'utf8'))})});
  vm.runInContext(readFileSync(new URL('../docs/app.js',import.meta.url),'utf8'),ctx);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('filtered().length',ctx),59);
  ctx.window.studyroomSelectCourse('abc',{id:'abc',title:'另一学科',words:[{id:'course-abc-cell',courseId:'abc',term:'cell',chinese:'细胞',definition:'A cell.',page:2,lectures:['abc']}]});
  assert.equal(vm.runInContext('filtered()[0].id',ctx),'course-abc-cell');
  vm.runInContext('grade(true)',ctx);
  const saved=JSON.parse(stored.get('vera-bio101-progress-v1'));
  assert.deepEqual(saved['word-3'],old['word-3']);assert.equal(saved['course-abc-cell'].streak,1);
  ctx.window.studyroomSelectCourse('L01');assert.equal(vm.runInContext('filtered().length',ctx),59);
  assert.match(vm.runInContext("answer({courseId:'abc',term:'<script>',definition:'x',chinese:'x',page:2})",ctx),/第 2 页/);
});
