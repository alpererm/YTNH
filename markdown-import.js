"use strict";
// Import a folder of Markdown files as Notes. The folder becomes "Imported – <name>", each subfolder a
// Note with its files nested inside, each file a Note titled with its file name. Front matter tags and
// dates are read, relative images are copied into the library, and links between imported files become
// item links. Pure data work lives in MarkdownImport.build so it can be tested without a desktop shell.
const MarkdownImport=(()=>{
 const naturalCompare=(a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'});
 const stripExt=name=>name.replace(/\.(md|markdown|mdown)$/i,'');
 const dirOf=p=>p.includes('/')?p.slice(0,p.lastIndexOf('/')):'';
 const baseOf=p=>p.slice(p.lastIndexOf('/')+1);

 // Resolve "a/../b/./c" against a folder; null when it climbs above the import root.
 function resolvePath(from,target){
   const out=from?from.split('/'):[];
   for(const part of target.split('/')){
     if(!part||part==='.')continue;
     if(part==='..'){if(!out.length)return null;out.pop()}else out.push(part);
   }
   return out.join('/');
 }
 function decode(s){try{return decodeURIComponent(s)}catch{return s}}

 // Minimal YAML front matter: "key: value", "key: [a, b]" and "key:" followed by "- item" lines.
 function frontMatter(text){
   const m=/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
   if(!m)return {data:{},body:text};
   const data={};let key=null;
   for(const raw of m[1].split(/\r?\n/)){
     const item=/^\s*-\s+(.*)$/.exec(raw);
     if(item&&key){(Array.isArray(data[key])?data[key]:(data[key]=[])).push(unquote(item[1]));continue}
     const kv=/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(raw);if(!kv)continue;
     key=kv[1].toLowerCase();const v=kv[2].trim();
     if(!v){data[key]=[];continue}
     const list=/^\[(.*)\]$/.exec(v);
     data[key]=list?list[1].split(',').map(x=>unquote(x.trim())).filter(Boolean):unquote(v);
   }
   return {data,body:text.slice(m[0].length).replace(/^\s*\n/,'')};
 }
 function unquote(v){v=String(v).trim();const q=/^(['"])(.*)\1$/.exec(v);return q?q[2]:v}
 function frontTags(data){
   // A list keeps each entry whole ("big idea" → big-idea); a plain string splits on commas and spaces.
   const out=[],add=t=>{const n=normalizeTag(t);if(n&&!out.includes(n))out.push(n)};
   for(const v of [data.tags,data.tag,data.keywords])if(Array.isArray(v))v.forEach(add);else if(v!=null)String(v).split(/[,\s]+/).forEach(add);
   return out;
 }
 function frontDate(data){
   for(const k of ['created','date','created_at','createdat','creation_date']){
     const v=Array.isArray(data[k])?data[k][0]:data[k];if(!v)continue;
     const s=String(v).trim(),day=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
     const d=day?new Date(Date.UTC(+day[1],+day[2]-1,+day[3],12)):new Date(s.replace(' ','T'));
     if(!Number.isNaN(d.getTime())&&d.getUTCFullYear()>1900&&d.getUTCFullYear()<2200)return d.toISOString();
   }
   return null;
 }
 // Apply a transform to Markdown text outside fenced and inline code.
 function outsideAnyCode(text,transform){
   const segments=[];let fence=null;
   for(const line of text.split('\n')){
     const f=/^\s{0,3}(`{3,}|~{3,})/.exec(line),code=!!fence||!!f;
     if(fence&&f&&f[1][0]===fence[0]&&f[1].length>=fence.length)fence=null;else if(!fence&&f)fence=f[1];
     const last=segments.at(-1);if(last&&last.code===code)last.lines.push(line);else segments.push({code,lines:[line]});
   }
   return segments.map(s=>s.code?s.lines.join('\n'):outsideCode(s.lines.join('\n'),transform)).join('\n');
 }

 /**
  * Build Notes for an import. files: [{path:'sub/a.md', text, created?, modified?}], images: ['sub/a.png'].
  * readImage(path) → {hash,extension,bytes} or null (only on desktop libraries).
  * Returns a summary. Throws before changing anything when the folder holds no Markdown files.
  */
 async function build(database,{name,files,images=[],readImage=null}){
   files=files.filter(f=>/\.(md|markdown|mdown)$/i.test(f.path)).sort((a,b)=>naturalCompare(a.path,b.path));
   if(!files.length)throw new Error('No Markdown files were found in “'+name+'”.');
   const root=createItem(database,'Note',null);root.title='Imported – '+name;root.content='';
   const folders=new Map([['',root]]);
   const folderNote=dir=>{
     if(folders.has(dir))return folders.get(dir);
     const parent=folderNote(dirOf(dir)),n=createItem(database,'Note',parent.id);n.title=baseOf(dir);n.content='';folders.set(dir,n);return n;
   };
   // Folders first, in natural order, so each level lists subfolders before files.
   for(const dir of [...new Set(files.map(f=>dirOf(f.path)).filter(Boolean).flatMap(d=>d.split('/').map((_,i,a)=>a.slice(0,i+1).join('/'))))].sort(naturalCompare))folderNote(dir);
   const notes=new Map(),byName=new Map();
   for(const f of files){
     const {data,body}=frontMatter(String(f.text).replace(/\r\n?/g,'\n'));
     const note=createItem(database,'Note',folderNote(dirOf(f.path)).id);
     note.title=stripExt(baseOf(f.path));note.content=body;
     const tags=frontTags(data);if(tags.length)note.explicitTags=tags;
     const created=frontDate(data)||f.created||null;if(created)note.createdAt=created;
     notes.set(f.path,note);
     const key=stripExt(baseOf(f.path)).toLowerCase();byName.set(key,byName.has(key)?null:note);
   }
   const imageSet=new Set(images),imageByName=new Map();for(const p of images){const k=baseOf(p).toLowerCase();imageByName.set(k,imageByName.has(k)?null:p)}
   const imported=new Map();let linked=0,imaged=0,missingImages=0;
   const findNote=(fromDir,target)=>{
     const t=decode(target.split('#')[0].split('?')[0]).trim();if(!t)return null;
     const direct=resolvePath(fromDir,t);
     for(const p of [direct,direct&&direct+'.md',direct&&direct+'.markdown',resolvePath('',t),resolvePath('',t)+'.md'])if(p&&notes.has(p))return notes.get(p);
     if(!t.includes('/'))return byName.get(stripExt(t).toLowerCase())||null;
     return null;
   };
   const findImage=(fromDir,target)=>{
     const t=decode(target.replace(/^<|>$/g,'').split('#')[0].split('?')[0]).trim();if(!t||/^[a-z][a-z+.-]*:/i.test(t))return null;
     const direct=resolvePath(fromDir,t);if(direct&&imageSet.has(direct))return direct;
     const fromRoot=resolvePath('',t);if(fromRoot&&imageSet.has(fromRoot))return fromRoot;
     return t.includes('/')?null:imageByName.get(t.toLowerCase())||null;
   };
   const importImage=async path=>{
     if(!imported.has(path))imported.set(path,readImage?await readImage(path):null);
     return imported.get(path);
   };
   for(const [path,note] of notes){
     const dir=dirOf(path);let text=note.content;
     // Images first: ![alt](rel.png) and ![[pic.png]] (each kept on its own line by the editor).
     const jobs=[];
     text=outsideAnyCode(text,part=>part.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)|!\[\[([^\]\n|]+\.(?:png|jpe?g|gif|webp|svg|heic|heif|bmp))(?:\|[^\]\n]*)?\]\]/gi,(whole,alt,src,wiki)=>{
       const target=findImage(dir,(src||wiki||'').trim().split(/\s+"/)[0]);if(!target)return whole;
       const token='\u0000img'+jobs.length+'\u0000';jobs.push({token,target,alt:alt??baseOf(wiki).replace(/\.[^.]+$/,''),whole});return token;
     }));
     for(const job of jobs){
       const image=await importImage(job.target);
       if(image){database.imageAssets??={};database.imageAssets[image.hash]??={extension:image.extension,bytes:image.bytes,name:baseOf(job.target)};imaged++}else missingImages++;
       text=text.replace(job.token,()=>image?'\n'+managedImageMarkdown(job.alt,image.hash,image.extension)+'\n':job.whole);
     }
     text=text.replace(/\n{3,}/g,'\n\n').replace(/^\n+/,'');
     // Links: [text](other.md), [[other]], [[folder/other|alias]], [[other#heading]].
     text=outsideAnyCode(text,part=>part
       .replace(/(?<!!)\[([^\]\n]*)\]\(([^)\s]+\.(?:md|markdown|mdown)(?:#[^)\s]*)?)\)/gi,(whole,label,target)=>{if(/^[a-z][a-z+.-]*:/i.test(target))return whole;const t=findNote(dir,target);if(!t)return whole;linked++;return '[['+refToken(t.id)+']]'})
       .replace(/(?<!!)\[\[([^\]\n|#]+)(#[^\]\n|]*)?(\|[^\]\n]*)?\]\]/g,(whole,target)=>{if(/^@\{/.test(target))return whole;const t=findNote(dir,target);if(!t)return whole;linked++;return '[['+refToken(t.id)+']]'}));
     note.content=text;
   }
   database.updatedAt=now();
   return {root,notes:notes.size,folders:folders.size-1,links:linked,images:imaged,missingImages};
 }

 async function run(){
   if(!db){toast('Open or create a library first.');return}
   const desktop=window.__TAURI__?.core?.invoke||window.__TAURI_INTERNALS__?.invoke;
   let pick;
   if(desktop){
     try{pick=await desktop('pick_markdown_folder')}catch(error){toast(String(error.message||error));return}
     if(!pick)return;
   }else{
     pick=await browserPick();if(!pick)return;
   }
   if(!pick.files.length){toast('No Markdown files were found in “'+pick.name+'”.');desktop?.('end_markdown_import');return}
   if(pick.files.length>300&&!await appConfirm('Import '+pick.files.length+' files?','This adds '+pick.files.length+' Notes under “Imported – '+pick.name+'”. You can undo the import.','Import'))return;
   const lib=storage.handle?.sqlite&&window.notesDesktop?.sqlite?.imageEditing?storage.handle.id:null;
   const readImage=lib&&desktop?async path=>{const data=await desktop('read_markdown_import_image',{token:pick.token,path});if(!data)return null;try{return await window.notesDesktop.sqlite.importImage(lib,data,true)}catch{return null}}:pick.readImage||null;
   flushPendingInputs?.();checkpoint();const before=codeMapBefore(activeItems(db).map(x=>x.id));
   try{
     const r=await build(db,{name:pick.name,files:pick.files,images:pick.images,readImage});
     rememberChangedCodes(before);markDirty();selected=r.root.id;r.root.collapsed=false;render();revealOutlineItem(r.root.id,{focus:true});
     const parts=[r.notes+' Note'+(r.notes===1?'':'s')];if(r.folders)parts.push(r.folders+' folder'+(r.folders===1?'':'s'));if(r.images)parts.push(r.images+' image'+(r.images===1?'':'s'));if(r.links)parts.push(r.links+' link'+(r.links===1?'':'s'));
     toast('Imported '+parts.join(', ')+(r.missingImages?' · '+r.missingImages+' image'+(r.missingImages===1?'':'s')+' could not be copied':'')+(pick.skipped?' · '+pick.skipped+' file'+(pick.skipped===1?'':'s')+' skipped':''));
   }catch(error){undo?.();toast(error.message)}
   finally{desktop?.('end_markdown_import').catch?.(()=>{})}
 }
 // Browser fallback: a folder picker through <input webkitdirectory>.
 function browserPick(){
   return new Promise(resolve=>{
     const input=document.createElement('input');input.type='file';input.webkitdirectory=true;input.multiple=true;
     input.onchange=async()=>{
       const all=[...input.files].filter(f=>!f.webkitRelativePath.split('/').some(p=>p.startsWith('.')));
       if(!all.length)return resolve(null);
       const name=all[0].webkitRelativePath.split('/')[0],rel=f=>f.webkitRelativePath.split('/').slice(1).join('/');
       const md=all.filter(f=>/\.(md|markdown|mdown)$/i.test(f.name));
       resolve({name,files:await Promise.all(md.map(async f=>({path:rel(f),text:await f.text(),created:new Date(f.lastModified).toISOString()}))),images:all.filter(f=>/\.(png|jpe?g|gif|webp|svg|heic|heif|bmp)$/i.test(f.name)).map(rel),skipped:0});
     };
     input.oncancel=()=>resolve(null);input.click();
   });
 }
 function install(){
   const menu=document.getElementById('calendarMenu');if(!menu||document.getElementById('importMarkdownFolder'))return;
   const b=document.createElement('button');b.type='button';b.id='importMarkdownFolder';b.textContent='Import Markdown Folder…';
   b.onclick=()=>{$('appMenu').open=false;run()};menu.prepend(b);
 }
 install();
 return {build,frontMatter,run};
})();
