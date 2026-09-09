'use strict';
(()=>{
 const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.studyroomNote=(s,source)=>{
  const paired=!!s.heading_zh&&s.points_zh?.length===s.points.length;
  return `<article class="note bilingual-note" data-language="${paired?'en':'legacy'}">${paired?'<div class="note-language" role="group" aria-label="笔记语言"><button type="button" data-note-language="en" aria-pressed="true">英</button><span aria-hidden="true">/</span><button type="button" data-note-language="zh" aria-pressed="false">中</button><button type="button" data-note-language="both" aria-pressed="false">对照</button></div>':'<p class="quiet">旧版笔记 · 可在上方补齐英文对照</p>'}<h3><span class="note-en" lang="en">${safe(s.heading)}</span>${paired?`<span class="note-zh" lang="zh-CN" hidden>${safe(s.heading_zh)}</span>`:''}</h3><ul>${s.points.map((p,i)=>`<li><span class="note-en" lang="en">${safe(p)}</span>${paired?`<span class="note-zh" lang="zh-CN" hidden>${safe(s.points_zh[i])}</span>`:''}</li>`).join('')}</ul>${s.page==null?'':`<details><summary>Source / 对照原文 · ${s.page}</summary><blockquote>${safe(s.quote)}</blockquote><p class="source-text">${safe(source)}</p></details>`}</article>`;
 };
 document.addEventListener('click',e=>{
  const button=e.target.closest('[data-note-language]');if(!button)return;
  const note=button.closest('.bilingual-note'),mode=button.dataset.noteLanguage;note.dataset.language=mode;
  note.querySelectorAll('[data-note-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.noteLanguage===mode)));
  note.querySelectorAll('.note-en').forEach(n=>n.hidden=mode==='zh');note.querySelectorAll('.note-zh').forEach(n=>n.hidden=mode==='en');
 });
})();
