// Lazy-loaded parsers. Version-pinned; originals are parsed locally before upload.
const PDF_ROOT = new URL('./vendor/pdfjs/', import.meta.url).href;
const ZIP_URL = new URL('./vendor/jszip.min.js', import.meta.url).href;
let zipLoading;
async function zipLibrary() {
  if (window.JSZip) return window.JSZip;
  if (!zipLoading) zipLoading = new Promise((resolve,reject) => {
    const script=document.createElement('script'); script.src=ZIP_URL; script.crossOrigin='anonymous';
    script.onload=()=>resolve(window.JSZip); script.onerror=()=>{zipLoading=null;script.remove();reject(Error('文件解析组件未能加载，请联网重试。'));};
    document.head.append(script);
  });
  return zipLoading;
}
function xml(s) {
  const d=new DOMParser().parseFromString(s,'application/xml');
  if(d.querySelector('parsererror')) throw Error('文件内部格式损坏，无法读取。');
  return d;
}
const elements=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
async function entry(zip,path) {
  const f=zip.file(path); if(!f) throw Error('课件缺少必要内容，请重新导出文件。');
  // Guard decompression size before expanding OOXML entries; JSZip metadata is local-only.
  if(f._data?.uncompressedSize>8*1024*1024) throw Error('单页内容过大，请拆分课件。');
  const content=await f.async('string');
  if(content.length>8*1024*1024) throw Error('单页内容过大，请拆分课件。');
  return xml(content);
}
export async function extract(file,onProgress=()=>{}) {
  if(file.size>20*1024*1024) throw Error('文件超过 20 MB，请压缩或拆分后上传。');
  const ext=file.name.split('.').pop().toLowerCase(),pages=[],warnings=[];
  if(ext==='pdf') {
    let lib;try{lib=await import(PDF_ROOT+'pdf.min.mjs')}catch{throw Error('PDF 解析组件未能加载，请联网重试。')}
    lib.GlobalWorkerOptions.workerSrc=PDF_ROOT+'pdf.worker.min.mjs';
    const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,cMapUrl:PDF_ROOT+'cmaps/',cMapPacked:true,standardFontDataUrl:PDF_ROOT+'standard_fonts/',wasmUrl:PDF_ROOT+'wasm/'});
    let pdf;
    try {
      pdf=await task.promise;
      if(pdf.numPages>300) throw Error('课件超过 300 页，请分讲上传。');
      for(let page=1;page<=pdf.numPages;page++) {
        onProgress(`正在读取第 ${page} / ${pdf.numPages} 页`);
        const p=await pdf.getPage(page),content=await p.getTextContent();
        const text=content.items.map(i=>(i.str||'')+(i.hasEOL?'\n':' ')).join('').trim();
        pages.push({page,text});p.cleanup();
      }
    } finally {await task.destroy();}
    warnings.push('仅提取 PDF 文字，图表与图片内容需对照原件阅读。');
  } else if(ext==='pptx'||ext==='xlsx') {
    const JSZip=await zipLibrary(),zip=await JSZip.loadAsync(await file.arrayBuffer());
    const entries=Object.values(zip.files);
    if(entries.length>5000||entries.reduce((n,e)=>n+(e._data?.uncompressedSize||0),0)>100*1024*1024) throw Error('解压后内容过大，请拆分文件。');
    if(ext==='pptx') {
      const presentation=await entry(zip,'ppt/presentation.xml'),rels=await entry(zip,'ppt/_rels/presentation.xml.rels');
      const targets=new Map(elements(rels,'Relationship').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
      const ids=elements(presentation,'sldId');if(ids.length>300) throw Error('幻灯片超过 300 页，请拆分。');
      for(const id of ids) {
        const rid=id.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
        const target=targets.get(rid);if(!target) throw Error('幻灯片顺序无法读取。');
        const path=new URL(target,'https://archive.invalid/ppt/').pathname.slice(1);
        const d=await entry(zip,path);
        pages.push({page:pages.length+1,text:elements(d,'p').map(p=>elements(p,'t').map(t=>t.textContent).join('')).join('\n')});
      }
      warnings.push('仅提取幻灯片文字，图片、图表及演讲者备注未解读。');
    } else {
      const shared=zip.file('xl/sharedStrings.xml')?elements(await entry(zip,'xl/sharedStrings.xml'),'si').map(si=>elements(si,'t').map(t=>t.textContent).join('')):[];
      const book=await entry(zip,'xl/workbook.xml'),rels=await entry(zip,'xl/_rels/workbook.xml.rels');
      const targets=new Map(elements(rels,'Relationship').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
      for(const sheet of elements(book,'sheet')) {
        const rid=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),target=targets.get(rid);
        if(!target) continue;
        const d=await entry(zip,new URL(target,'https://archive.invalid/xl/').pathname.slice(1));
        const rows=elements(d,'row').map(row=>`行${row.getAttribute('r')}: `+elements(row,'c').map(c=>{
          const v=elements(c,'v')[0]?.textContent||'';
          return `${c.getAttribute('r')}: ${c.getAttribute('t')==='s'?(shared[Number(v)]||''):c.getAttribute('t')==='inlineStr'?elements(c,'t').map(t=>t.textContent).join(''):v}`;
        }).join(' | '));
        for(let i=0;i<rows.length;i+=25) pages.push({page:pages.length+1,text:`工作表：${sheet.getAttribute('name')}\n${rows.slice(i,i+25).join('\n')}`});
      }
      warnings.push('词表按工作表与每 25 行分段，文中的页码表示提取段；未重新计算公式。');
    }
  } else if(ext==='txt'||ext==='md') {
    const content=await file.text();
    for(let i=0;i<content.length;i+=5000) pages.push({page:pages.length+1,text:content.slice(i,i+5000)});
    warnings.push('文本文件每 5000 字分段，文中的页码表示提取段。');
  } else throw Error('请选择 PDF、PPTX、XLSX、TXT 或 Markdown；旧版 PPT 请另存为 PPTX。');
  if(pages.length>300||pages.reduce((n,p)=>n+p.text.length,0)>120000) throw Error('课件内容过多，请拆分后上传；没有截断内容。');
  if(!pages.some(p=>p.text.trim().length>=20)) throw Error('没有读到足够文字，可能是扫描件；请先进行 OCR 或上传文字版。');
  const empty=pages.filter(p=>p.text.trim().length<20).map(p=>p.page);
  if(empty.length) warnings.push(`第 ${empty.join('、')} 页文字很少或为空，可能需要 OCR。`);
  return {pages,warnings};
}
