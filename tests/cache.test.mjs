import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
test('PWA installs the versioned HTML assets and offline fallback never reads an old cache',async()=>{
 const events={};let installed=[],activated=false,opened=[];
 const scope='https://study.r-vera.com/';const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
 const assets=[...html.matchAll(/(?:src|href)="([^"#]+\?v=7)"/g)].map(m=>m[1]);assert.ok(assets.length>=6);
 const cache={addAll:async r=>{installed=r.map(x=>x.url)},match:async r=>String(r.url||r)===scope?new Response('new offline shell'):undefined};
 const self={location:{origin:'https://study.r-vera.com'},registration:{scope},addEventListener:(n,f)=>events[n]=f,skipWaiting:async()=>{activated=true}};
 vm.runInNewContext(readFileSync(new URL('../docs/sw.js',import.meta.url),'utf8'),{self,URL,Response,Request:class extends Request{constructor(u,o){super(new URL(u,scope),o)}},caches:{open:async n=>{opened.push(n);return cache},match:()=>{throw Error('must not search old caches')}},fetch:async()=>{throw Error('offline')}});
 let work;events.install({waitUntil:p=>work=p});await work;assert.equal(activated,true);for(const a of assets)assert.ok(installed.includes(new URL(a,scope).href));
 events.fetch({request:{url:scope+'?v=7',method:'GET',mode:'navigate'},respondWith:p=>work=p});assert.equal(await (await work).text(),'new offline shell');assert.ok(opened.every(n=>n==='studyroom-shell-v7'));
});
