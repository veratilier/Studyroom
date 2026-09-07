import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('late history never replaces a newer refresh; reconnect reloads without resending and logout clears drafts',async()=>{
 const listeners=[];const window={addEventListener:(name,fn,options)=>listeners.push({name,fn,options})};
 const document={createElement(){const children=new Map();return {isConnected:true,innerHTML:'',querySelector(s){if(!children.has(s))children.set(s,{value:'',textContent:'',innerHTML:'',disabled:false});return children.get(s)}}}};
 vm.runInNewContext(readFileSync(new URL('../docs/chat.js',import.meta.url),'utf8'),{window,document,AbortController,crypto});
 const requests=[];let panel;const mount=()=>window.studyroomMountChat({courseId:'course-a',target:{append:p=>panel=p},isCurrent:()=>true,api:(path,options)=>new Promise(resolve=>requests.push({path,options,resolve}))});
 const flush=()=>new Promise(r=>setImmediate(r));
 mount();panel.querySelector('[type=button]').onclick();
 requests[1].resolve({messages:[{question:'new',answer:'current'}]});await flush();
 requests[0].resolve({messages:[{question:'old',answer:'stale'}]});await flush();
 assert.match(panel.querySelector('.chat-history').innerHTML,/current/);assert.doesNotMatch(panel.querySelector('.chat-history').innerHTML,/stale/);
 panel.querySelector('textarea').value='private draft';panel.querySelector('textarea').oninput();
 listeners[0].fn();assert.equal(requests.length,3);assert.equal(requests[2].options,undefined);
 window.studyroomResetChat();requests[2].resolve({messages:[{question:'late',answer:'after logout'}]});await flush();
 assert.doesNotMatch(panel.querySelector('.chat-history').innerHTML,/after logout/);
 assert.equal(listeners[0].options.signal.aborted,true);mount();assert.equal(panel.querySelector('textarea').value,'');
});
