'use strict';
(()=>{
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pending=new Map(),drafts=new Map();
  window.studyroomMountChat=({courseId,target,api,isCurrent})=>{
    const panel=document.createElement('section');panel.className='note course-chat';
    panel.innerHTML='<h3>问这份课件</h3><p class="quiet">解释概念、比较单词，或让学习助手出题考考你。回答由 AI 生成，请对照课件核实。</p><div class="chat-history"></div><form><label>你的问题<textarea maxlength="4000" rows="3" required placeholder="例如：用简单的话解释这讲的核心概念，然后问我一道题。"></textarea></label><div class="actions"><button class="button" type="submit">发送问题</button><button class="button secondary" type="button">刷新回答</button></div></form><p class="chat-status" role="status" aria-live="polite"></p>';
    target.append(panel);
    const form=panel.querySelector('form'),input=panel.querySelector('textarea'),submit=panel.querySelector('[type=submit]'),refresh=panel.querySelector('[type=button]'),status=panel.querySelector('.chat-status'),history=panel.querySelector('.chat-history');
    input.value=drafts.get(courseId)||'';input.oninput=()=>drafts.set(courseId,input.value);
    const alive=()=>panel.isConnected&&isCurrent();
    async function load(){
      try{const data=await api(`/courses/${courseId}/chat`);if(!alive())return;
        history.innerHTML=data.messages.map(m=>`<article class="chat-pair"><p class="chat-question">${escape(m.question)}</p><p class="chat-answer">${escape(m.answer||m.error||'正在回答…')}</p></article>`).join('')||'<p class="quiet">围绕这份课件开始提问，历史会保存在课件中。</p>';
        const current=pending.get(courseId);const saved=current&&data.messages.find(m=>m.id===current.id);
        if(saved&&saved.status!=='pending'){pending.delete(courseId);if(saved.status==='complete'&&input.value===saved.question){input.value='';drafts.delete(courseId);}}
        submit.disabled=data.messages.some(m=>m.status==='pending')||!!pending.get(courseId)?.sending;
        status.textContent=data.messages.some(m=>m.status==='pending')?'助手正在回答，稍后可刷新查看。':'';
      }catch(e){if(alive())status.textContent=e.message;}
    }
    refresh.onclick=load;
    form.onsubmit=async e=>{
      e.preventDefault();const question=input.value.trim();if(!question||submit.disabled)return;
      let request=pending.get(courseId);
      if(request&&request.question!==question){status.textContent='上次发送的结果还未确认，请先刷新回答。';return;}
      if(!request){request={id:crypto.randomUUID(),question};pending.set(courseId,request);}
      request.sending=true;submit.disabled=true;status.textContent='正在思考，请稍等…';
      try{const result=await api(`/courses/${courseId}/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,request_id:request.id})});
        if(result.status!=='pending')pending.delete(courseId);
        if(result.status==='complete'){drafts.delete(courseId);if(alive())input.value='';}
        if(alive())await load();
      }catch(e){if(e.status&&e.status<500)pending.delete(courseId);if(alive())status.textContent=e.message+' 可刷新查看；重发同一问题不会重复创建请求。';}
      finally{request.sending=false;if(alive())submit.disabled=false;}
    };
    load();
  };
})();
