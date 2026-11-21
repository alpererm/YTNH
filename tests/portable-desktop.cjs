// Browser simulation of native replies; actual package/SQLite operations have Rust tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1400,height:900}});page.setDefaultTimeout(6000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'../crates/library/tests/fixtures/library.json')));
 await page.addInitScript(model=>{
  window.probe={model,head:'r1',published:'r1',calls:[],localWrites:0,masterWrites:0,closeCount:0,failLocal:false,failMaster:false,unavailable:false,cancelSaveAs:false,cancelOpen:true};
  window.__TAURI__={window:{getCurrentWindow:()=>({setTheme:async()=>{}})},core:{invoke:async(command,{op,args}={})=>{
   if(command==='capture_status')return {errors:[]};
   if(command==='acknowledge_close'||command==='finish_close_attempt')return;
   if(command==='close_app'){probe.closeCount++;return}
   if(command==='confirm_close')throw Error('Portable close must not offer discard');
   if(command!=='library_action')throw Error('Unexpected native command '+command);
   probe.calls.push(op);
   const record=()=>({id:probe.id||'portable-id',name:probe.name||'Library.ytnh',portable:true,revision:probe.head,published:probe.published,unpublished:probe.head!==probe.published});
   if(op==='last')return 'portable-id';if(op==='list')return [record()];if(op==='status')return record();if(op==='remember')return;
   if(op==='portable_reopen'){if(probe.unavailable)throw Error('Master unavailable');return record()}
   if(op==='portable_recover')return record();
   if(op==='portable_recovery_list')return {copies:probe.onlyDamaged?[]:[{...record(),copy:'verified-copy'}],issues:[{copy:'damaged-copy',error:'Invalid receipt; retained'}]};
   if(op==='portable_adopt'){if(args.copy!=='verified-copy')throw Error('Invalid recovery selection');return record()}
   if(op==='read')return {model:structuredClone(probe.model),revision:probe.head};
   if(op==='save'){
    if(probe.failLocal)throw Error('Local disk full');
    assertRevision(args.revision);probe.localWrites++;probe.model=structuredClone(args.model);probe.head='r'+(probe.localWrites+1);return {revision:probe.head};
   }
   if(op==='portable_publish'||op==='portable_save_as'){
    assertRevision(args.revision);
    if(op==='portable_publish'&&probe.failMaster)throw Error('Conflict: master changed outside YuTaNoHe');
    if(op==='portable_save_as'&&probe.cancelSaveAs)return null;
    if(op==='portable_save_as')probe.name='Recovered.ytnh';
    if(probe.head!==probe.published||op==='portable_save_as'){probe.masterWrites++;probe.masterModel=structuredClone(probe.model)}
    probe.published=probe.head;return record();
   }
   if(op==='portable_open')return null;
   if(op==='portable_new'){
    if(probe.cancelNew)return null;
    probe.id='new-portable-id';probe.name='New portable.ytnh';probe.model=structuredClone(args.model);
    probe.head=probe.published='new-r1';return record();
   }
   throw Error('Unexpected operation '+op);
   function assertRevision(revision){if(revision!==probe.head)throw Error('Wrong revision')}
  }}};
 },fixture);
 const root=path.resolve(__dirname,'..');
 await page.route('http://portable-test.local/**',route=>{
  const name=new URL(route.request().url()).pathname.slice(1)||'app.html';let body=fs.readFileSync(path.join(root,name));
  if(name==='app.html')body=body.toString().replace('<script>"use strict";',()=>'<script>'+fs.readFileSync(path.join(root,'library-bridge.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'bridge.js'),'utf8')+'</script><script>"use strict";');
  return route.fulfill({body,contentType:name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'application/javascript'});
 });
 await page.goto('http://portable-test.local/app.html');
 await page.waitForFunction(()=>db&&storage.handle?.portable&&!fileOperationBusy);
 assert.equal(await page.locator('.libraryDialog[open]').count(),0);
 await page.evaluate(()=>{edit(db.items[0].id);focusBodyStart();window.originalEditor=$('richEditor');});
 await page.keyboard.type('Portable edit ');
 await page.waitForFunction(()=>!dirty&&probe.localWrites>0);
 assert.equal(await page.evaluate(()=>probe.masterWrites),0);
 const caret=await page.evaluate(()=>captureEditorSelection());
 const undo=await page.evaluate(()=>undoStack.length);
 await page.evaluate(()=>$('saveFile').click());await page.waitForFunction(()=>!notesDesktop.sqlite.busy&&probe.masterWrites===1);
 assert(await page.evaluate(()=>originalEditor===$('richEditor')));
 assert.deepEqual(await page.evaluate(()=>captureEditorSelection()),caret);
 assert.equal(await page.evaluate(()=>undoStack.length),undo);
 assert(await page.evaluate(()=>probe.masterModel.items[0].content.includes('Portable edit')));
 await page.evaluate(()=>$('saveFile').click());await page.waitForFunction(()=>!notesDesktop.sqlite.busy);
 assert.equal(await page.evaluate(()=>probe.masterWrites),1);
 // A cancelled picker keeps the selected model and editor; no destructive reload.
 await page.evaluate(()=>{window.before=db;window.beforeSelected=selected;$('openFile').click()});
 await page.waitForFunction(()=>!notesDesktop.sqlite.busy&&probe.calls.includes('portable_open'));
 assert(await page.evaluate(()=>db===before&&selected===beforeSelected));
 // Close failure: no native close and no discard option.
 await page.keyboard.type(' changed');
 await page.evaluate(()=>{probe.failMaster=true;window.dispatchEvent(new Event('notes-desktop-close'))});
 await page.getByRole('button',{name:'Cancel Close',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>probe.closeCount),0);
 await page.getByRole('button',{name:'Cancel Close',exact:true}).click();await page.waitForFunction(()=>!notesDesktopClosing);
 assert(await page.evaluate(()=>db.items[0].content.includes('changed')&&!dirty&&probe.published!==probe.head));
 // Save As picker cancellation also cancels closing.
 await page.evaluate(()=>{probe.cancelSaveAs=true;window.dispatchEvent(new Event('notes-desktop-close'))});
 await page.getByRole('button',{name:'Save As…',exact:true}).click();await page.waitForFunction(()=>!notesDesktopClosing);
 assert.equal(await page.evaluate(()=>probe.closeCount),0);
 // Save As success publishes the latest local content and then permits close.
 await page.evaluate(()=>{probe.cancelSaveAs=false;window.dispatchEvent(new Event('notes-desktop-close'))});
 await page.getByRole('button',{name:'Save As…',exact:true}).click();await page.waitForFunction(()=>probe.closeCount===1&&!notesDesktopClosing);
 assert.equal(await page.evaluate(()=>storage.name),'Recovered.ytnh');
 // A failed local SQLite write must prevent master publication and leave in-memory changes.
 await page.evaluate(()=>{probe.failMaster=false;probe.failLocal=true;edit(db.items[0].id);focusBodyStart()});
 await page.keyboard.type(' pending');
 await page.evaluate(()=>{window.masterCount=probe.masterWrites;window.dispatchEvent(new Event('notes-desktop-close'))});
 await page.getByRole('button',{name:'Cancel Close',exact:true}).waitFor();
 assert(await page.evaluate(()=>dirty&&probe.masterWrites===masterCount&&probe.closeCount===1));
 await page.evaluate(()=>{probe.failLocal=false});await page.getByRole('button',{name:'Retry',exact:true}).click();await page.waitForFunction(()=>probe.closeCount===2&&!notesDesktopClosing);
 assert(await page.evaluate(()=>!dirty&&probe.masterModel.items[0].content.includes('pending')));
 // Recent-file reopening offers explicit local recovery without cloud/handoff operations.
 await page.evaluate(()=>{probe.unavailable=true;window.opening=notesDesktop.sqlite.recent().then(r=>notesDesktop.sqlite.openRecent(r[0]))});
 await page.getByRole('button',{name:'Recover local work',exact:true}).click();await page.evaluate(()=>opening);
 assert(await page.evaluate(()=>db&&storage.handle.portable&&storage.handle.masterIssue));
 assert.equal(await page.evaluate(()=>probe.calls.some(op=>['inspect','auto_snapshot','allow_local','prepare','receive'].includes(op))),false);
 // The retired creation command must be absent, even when viewing a legacy library.
 await page.evaluate(()=>{storage.handle.portable=false;$('appMenu').open=true});
 await page.getByRole('button',{name:'Recover Local Library…',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Connect handoff folder…',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Receive handoff…',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Convert existing SQLite library…',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'New handoff library…',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Convert this library to portable file…',exact:true}).count(),0);
 await page.evaluate(()=>{storage.handle.portable=true;$('appMenu').open=false;probe.unavailable=false;probe.cancelNew=true;window.beforeNew=db;window.beforeNewSelection=selected;$('newFile').click()});
 await page.waitForFunction(()=>!notesDesktop.sqlite.busy&&probe.calls.includes('portable_new'));
 assert(await page.evaluate(()=>db===beforeNew&&selected===beforeNewSelection&&storage.handle.id==='portable-id'));
 // New file uses the portable path; it must not create a legacy exchange library.
 await page.evaluate(()=>{probe.cancelNew=false;$('newFile').click()});
 await page.waitForFunction(()=>!notesDesktop.sqlite.busy&&storage.handle?.id==='new-portable-id');
 assert(await page.evaluate(()=>storage.handle.portable&&storage.name==='New portable.ytnh'&&db.items.length===0));
 assert.equal(await page.evaluate(()=>probe.calls.includes('create')),false);
 // PM-02: valid choices remain usable with explicit warnings for damaged copies.
 await page.evaluate(()=>[...document.querySelectorAll('#appMenu button')].find(b=>b.textContent==='Recover Local Library…').click());
 await page.getByRole('heading',{name:'Local recovery copies',exact:true}).waitFor();
 assert.match(await page.locator('.libraryDialog').innerText(),/damaged-copy: Invalid receipt; retained/);
 await page.getByRole('button',{name:'New portable.ytnh · new-r1',exact:true}).click();
 await page.waitForFunction(()=>!notesDesktop.sqlite.busy&&probe.calls.includes('portable_adopt'));
 await page.evaluate(()=>{probe.onlyDamaged=true;window.beforeRecovery=db;[...document.querySelectorAll('#appMenu button')].find(b=>b.textContent==='Recover Local Library…').click()});
 await page.getByRole('heading',{name:'Local recovery copies',exact:true}).waitFor();
 assert.equal(await page.locator('.libraryDialog button').count(),1);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.waitForFunction(()=>!notesDesktop.sqlite.busy);
 assert(await page.evaluate(()=>db===beforeRecovery));
 assert.deepEqual(errors,[]);
 console.log('PASS portable startup, local-only autosave, manual save/caret/undo, cancelled picker, close Retry/Save As/Cancel, failed local write retention explicit local recovery, retired handoff creation and portable New/cancellation');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
