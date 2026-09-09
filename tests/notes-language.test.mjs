import {test}from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import{readFileSync}from'node:fs';
test('notes default to English, escape both languages and switch without remounting chat',()=>{
 const handlers={},window={};vm.runInNewContext(readFileSync(new URL('../docs/notes-language.js',import.meta.url),'utf8'),{window,document:{addEventListener:(n,f)=>handlers[n]=f}});
 const html=window.studyroomNote({heading:'<Energy>',points:['Light'],heading_zh:'能量',points_zh:['<光>'],page:1,quote:'Light'},'Light');
 assert.match(html,/data-language="en"/);assert.match(html,/&lt;Energy&gt;/);assert.match(html,/&lt;光&gt;/);assert.match(html,/lang="zh-CN" hidden/);
 const en=[{hidden:false}],zh=[{hidden:true}],buttons=['en','zh','both'].map(v=>({dataset:{noteLanguage:v},setAttribute(k,v){this[k]=v}}));const note={dataset:{},querySelectorAll:s=>s==='.note-en'?en:s==='.note-zh'?zh:buttons};
 for(const mode of ['zh','both','en']){handlers.click({target:{closest:()=>({dataset:{noteLanguage:mode},closest:()=>note})}});assert.equal(en[0].hidden,mode==='zh');assert.equal(zh[0].hidden,mode==='en');assert.equal(buttons.find(b=>b.dataset.noteLanguage===mode)['aria-pressed'],'true')}
});
