'use strict';
(() => {
  const find=s=>document.querySelector(s), safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TOKEN='studyroom-account-session';
  const base=String(window.STUDYROOM_API||'').replace(/\/$/,'');
  const builtin='<option value="">暂无课件</option>';
  let currentUser=null,assistantKind='',token='',courses=[],selected=null,staged=null,busy=false,uploading=false,loading=false,selectionVersion=0,unlocked=false;
  try {token=sessionStorage.getItem(TOKEN)||'';}catch{}
  function status(message){find('#libraryStatus').textContent=message;}
  function remember(value){token=value;try{value?sessionStorage.setItem(TOKEN,value):sessionStorage.removeItem(TOKEN)}catch{}}
  async function api(path,options={}) {
    if(!base) throw Error('课件上传服务还未接入，请稍后再试。');
    const session=token;let res;try{res=await fetch(base+path,{...options,cache:'no-store',headers:{Authorization:`Bearer ${token}`,...options.headers}})}catch{throw Error('课件服务连接失败，请检查网络后重试。')}
    if(session!==token)throw Error('登录状态已变化，请重新操作。');if(!res.ok){let body;try{body=await res.json()}catch{}if(res.status===401){remember('');setLocked();}throw Object.assign(Error(body?.error||`请求失败（${res.status}），请稍后重试。`),{status:res.status});}
    return options.blob?res.blob():res.json();
  }
  function setLocked(){
    currentUser=null;unlocked=false;courses=[];selected=null;staged=null;selectionVersion++;
    find('#libraryConnected').hidden=true;find('#unlockLibrary').hidden=!base;
    find('#courseList').replaceChildren();resetUpload();subjects();
    find('#subject').value='';find('#lecture').innerHTML=builtin;
    window.studyroomSetAccount(null);window.studyroomSelectCourse('');find('#uploadCourse').reset();
  }
  function subjects(){
    const current=find('#subject').value;
    const names=[...new Set(courses.map(c=>c.subject))];
    find('#subject').innerHTML=names.map(n=>`<option value="${safe(n)}">${safe(n)}</option>`).join('');
    find('#subjectNames').innerHTML=names.map(n=>`<option value="${safe(n)}"></option>`).join('');
    find('#subject').value=names.includes(current)?current:(names[0]||'');
  }
  function courseOptions(){
    const subject=find('#subject').value;
    const custom=courses.filter(c=>c.subject===subject);
    find('#lecture').innerHTML=custom.map(c=>`<option value="${safe(c.id)}">${safe(c.title)}${c.status==='ready'?'':' · 待整理'}</option>`).join('');
    if(!find('#lecture').options.length)find('#lecture').innerHTML='<option value="">暂无课件</option>';
  }
  function cards(){
    const subject=find('#subject').value,custom=courses.filter(c=>c.subject===subject);
    find('#courseList').innerHTML=custom.map(c=>`<article class="note course-card"><span class="pill">${c.status==='ready'?'已整理':'待继续整理'}</span><h3>${safe(c.title)}</h3><p class="quiet">${safe(c.subject)} · ${safe(c.filename)}</p><button class="button secondary" data-open-course="${safe(c.id)}">打开课件</button></article>`).join('')+(!custom.length?'<p class="quiet">这个学科还没有课件，上传后会出现在这里。</p>':'');
    document.querySelectorAll('[data-open-course]').forEach(b=>b.onclick=()=>{find('#lecture').value=b.dataset.openCourse;select(b.dataset.openCourse);window.studyroomTab('notes');});
  }
  async function refresh(){
    if(loading)return;
    if(!base){setLocked();status('课件上传服务尚未接入。');cards();return;}
    if(!token){setLocked();status('登录后可上传课件，并在其他设备查看已保存的课件与梳理。');cards();return;}
    loading=true;const session=token;
    try{
      const account=await api('/account');if(token!==session)return;if(currentUser!==account.user.id){currentUser=account.user.id;window.studyroomSetAccount(currentUser);}const data=await api('/courses');if(token!==session)return;courses=data.courses;assistantKind=data.assistant;unlocked=true;
      find('#unlockLibrary').hidden=true;find('#libraryConnected').hidden=false;
      const old=find('#lecture').value;subjects();courseOptions();
      if(Array.from(find('#lecture').options).some(o=>o.value===old))find('#lecture').value=old;
      cards();status(`课件库已连接 · ${courses.length} 份上传资料`);
    }catch(e){status(e.message)}finally{loading=false;}
  }
  function toStudy(course){
    const seen=new Set(),words=[];
    for(const part of course.parts||[])for(const w of part.vocabulary||[]){
      const key=w.term.normalize('NFKC').toLowerCase().trim();if(seen.has(key))continue;seen.add(key);
      words.push({...w,id:`course-${course.id}-${encodeURIComponent(key)}`,courseId:course.id,lectures:[course.id],roots:'',suffix:''});
    }
    return {...course,words};
  }
  async function select(id){
    const version=++selectionVersion;
    if(!id){selected=null;window.studyroomSelectCourse('');return;}
    selected=id;
    window.studyroomSelectCourse(id,{id,title:'正在读取课件…',words:[],parts:[],loading:true});
    try{
      const course=await api(`/courses/${id}`);
      if(version!==selectionVersion)return;
      window.studyroomSelectCourse(id,toStudy(course));
    }catch(e){if(version===selectionVersion)window.studyroomSelectCourse(id,{id,title:'课件暂时无法读取',words:[],parts:[],loadError:e.message});}
  }
  async function runAnalysis(id){
    if(busy)return;
    busy=true;
    try {
      let data=await api(`/courses/${id}`);
      while(data.completed<data.total && token && selected===id){
        if(selected===id){window.studyroomSelectCourse(id,toStudy(data));find('#analysisStatus').textContent=`正在整理第 ${data.completed+1} / ${data.total} 部分，请保持页面打开…`;}
        data=await api(`/courses/${id}/analyze`,{method:'POST'});
      }
      if(selected===id)window.studyroomSelectCourse(id,toStudy(data));
      status(data.completed===data.total?'梳理与词汇已保存，可在课堂线索和词汇手册查看。':'整理已暂停，已完成部分会保留。');
      await refresh();
    }catch(e){
      status(e.message);
      if(selected===id&&find('#analysisStatus'))find('#analysisStatus').textContent=e.message+' 已完成部分会保留。';
    }finally{busy=false;const button=find('#continueAnalysis');if(button)button.disabled=false;}
  }
  window.renderCourseNotes=course=>{
    const target=find('#noteContent');
    if(course.loading||course.loadError){target.innerHTML=`<div class="note"><p>${safe(course.loadError||'正在读取课件…')}</p>${course.loadError?'<button class="button secondary" id="retryCourse">重新读取</button>':''}</div>`;if(find('#retryCourse'))find('#retryCourse').onclick=()=>select(course.id);return;}
    const total=course.total||0,completed=course.completed||0;
    target.innerHTML=`<div class="note"><p class="eyebrow">${safe(course.subject)}</p><h3>${safe(course.title)}</h3><p class="quiet">已整理 ${completed} / ${total} 部分 · ${course.words.length} 个词汇</p><p id="analysisStatus" role="status" aria-live="polite">${safe(course.error||'AI 辅助整理，仅覆盖已提取的文字；请对照原文核实。')}</p><div class="actions"><button class="button secondary" id="downloadCourse">下载原课件</button>${completed<total?`<button class="button" id="continueAnalysis" ${busy?'disabled':''}>${busy?'整理中…':'继续整理'}</button>`:''}<button class="button secondary" id="courseWords">练习词汇</button></div><details class="course-edit"><summary>修改分类与名称</summary><form id="renameCourse"><label>学科<input name="subject" value="${safe(course.subject)}" maxlength="80" required list="subjectNames"></label><label>课件名称<input name="title" value="${safe(course.title)}" maxlength="160" required></label><button class="button secondary">保存分类</button></form></details></div>`+
      (course.parts||[]).map(part=>`<div class="part-label">第 ${part.part+1} 部分</div>`+part.sections.map(s=>`<article class="note"><h3>${safe(s.heading)}</h3><ul>${s.points.map(p=>`<li>${safe(p)}</li>`).join('')}</ul><details><summary>对照原文 · 第 ${s.page} 页 / 段</summary><blockquote>${safe(s.quote)}</blockquote><p class="source-text">${safe((course.pages||[]).find(p=>p.page===s.page)?.text||'')}</p></details></article>`).join('')).join('');
    if(assistantKind==='codex')window.studyroomMountChat?.({courseId:course.id,target,api,isCurrent:()=>selected===course.id&&unlocked});
    find('#downloadCourse').onclick=async e=>{e.target.disabled=true;try{const blob=await api(`/courses/${course.id}/file`,{blob:true});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=course.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(err){find('#analysisStatus').textContent=err.message}finally{e.target.disabled=false}};
    find('#courseWords').onclick=()=>window.studyroomTab('study');
    if(find('#continueAnalysis'))find('#continueAnalysis').onclick=()=>runAnalysis(course.id);
    find('#renameCourse').onsubmit=async e=>{
      e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
      try{const values=Object.fromEntries(new FormData(e.target));const data=await api(`/courses/${course.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});await refresh();find('#subject').value=data.subject;courseOptions();find('#lecture').value=data.id;cards();select(data.id);}catch(err){find('#analysisStatus').textContent=err.message;button.disabled=false;}
    };
  };
  function resetUpload(){staged=null;find('#extractionPreview').hidden=true;find('#extractionPreview').replaceChildren();find('#uploadButton').textContent='读取课件';find('#cancelUpload').hidden=true;}
  find('#unlockLibrary').onsubmit=async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
    try{const data=await api('/account/'+find('#accountMode').value,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:find('#accountName').value,password:find('#libraryPassword').value,inviteCode:find('#inviteCode').value,legacyPassword:find('#legacyPassword').value})});remember(data.token);find('#libraryPassword').value='';find('#legacyPassword').value='';find('#inviteCode').value='';await refresh();}catch(err){status(err.message)}finally{button.disabled=false;}
  };
  find('#lockLibrary').onclick=async()=>{try{await api('/account/logout',{method:'POST'});}catch(err){status(err.message);return;}remember('');setLocked();cards();status('已退出登录。');};
  find('#accountMode').onchange=()=>{find('#registrationFields').hidden=find('#accountMode').value!=='register';find('#libraryPassword').autocomplete=find('#accountMode').value==='register'?'new-password':'current-password';};
  find('#changePassword').onsubmit=async e=>{e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;try{const data=await api('/account/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});remember(data.token);e.target.reset();status('密码已修改，其他登录已失效。');}catch(err){status(err.message)}finally{button.disabled=false}};
  find('#refreshLibrary').onclick=refresh;
  find('#subject').onchange=()=>{courseOptions();cards();select(find('#lecture').value);find('#uploadSubject').value=find('#subject').value;};
  find('#courseFile').onchange=()=>{resetUpload();const f=find('#courseFile').files[0];if(f&&!find('#uploadTitle').value)find('#uploadTitle').value=f.name.replace(/\.[^.]+$/,'');};
  find('#uploadSubject').oninput=resetUpload;find('#uploadTitle').oninput=resetUpload;find('#cancelUpload').onclick=resetUpload;
  find('#uploadCourse').onsubmit=async e=>{
    e.preventDefault();if(!unlocked||busy||uploading)return;uploading=true;
    const button=find('#uploadButton');button.disabled=true;
    try {
      const file=find('#courseFile').files[0];if(!file)throw Error('请先选择课件。');
      if(!staged){
        const {extract}=await import('./extract.mjs');
        const data=await extract(file,status);if(!unlocked||find('#courseFile').files[0]!==file)throw Error('文件或登录状态已变化，请重新读取。');staged={file,...data};
        const preview=find('#extractionPreview');preview.hidden=false;
        preview.innerHTML=`<p>读到了 ${data.pages.length} 页 / 段。确认后将原文件和文字保存到私人课件库，并交给已连接的学习助手整理。</p>${data.warnings.map(w=>`<p class="correction">${safe(w)}</p>`).join('')}<details><summary>查看提取文字</summary><pre>${safe(data.pages.filter(p=>p.text.trim()).slice(0,2).map(p=>`第 ${p.page} 页 / 段\n${p.text.slice(0,1500)}`).join('\n\n'))}</pre></details>`;
        button.textContent='确认上传并整理';find('#cancelUpload').hidden=false;status('请检查提取预览，再确认上传。');return;
      }
      const form=new FormData();form.set('file',staged.file);form.set('pages',JSON.stringify(staged.pages));form.set('subject',find('#uploadSubject').value.trim());form.set('title',find('#uploadTitle').value.trim());
      status('正在保存课件…');const data=await api('/courses',{method:'POST',body:form});
      const subject=data.subject;resetUpload();find('#uploadCourse').reset();await refresh();
      find('#subject').value=subject;courseOptions();find('#lecture').value=data.id;cards();await select(data.id);window.studyroomTab('notes');
      await runAnalysis(data.id);
    }catch(err){status(err.message)}finally{button.disabled=false;uploading=false;}
  };
  window.studyroomLibraryRefresh=refresh;window.studyroomLectureChange=select;
  find('#uploadSubject').value='';
  window.studyroomTab('library');refresh();
})();
