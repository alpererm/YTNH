// Keep Both: when another computer saved the same library, its changed items are copied into a
// "Conflicting changes" branch, saved locally, and then the library file is replaced. Native replies are simulated.
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
    if(op==='portable_publish'&&probe.failMaster)throw Error('Conflict: the library file was changed outside YTNH; use Save As or cancel');
    if(op==='portable_save_as'&&probe.cancelSaveAs)return null;
    if(op==='portable_save_as')probe.name='Recovered.ytnh';
    if(probe.head!==probe.published||op==='portable_save_as'){probe.masterWrites++;probe.masterModel=structuredClone(probe.model)}
    probe.published=probe.head;return record();
   }
   if(op==='portable_open')return null;
   if(op==='portable_conflict_read'){probe.readHead=probe.head;return structuredClone(probe.conflict)}
   if(op==='portable_conflict_adopt'){if(args.fingerprint.sha256!==probe.conflict.fingerprint.sha256)throw Error('Wrong fingerprint');probe.adoptedAfterWrites=probe.localWrites;probe.failMaster=false;return record()}
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
 // Pure merge: only items the other computer changed and that differ here are copied, under one branch.
 const unit=await page.evaluate(()=>{
  const other=structuredClone(db),[a,b]=other.items.filter(i=>!i.archived);
  b.title='Changed elsewhere';const extra=structuredClone(a);extra.id='other-new-item';extra.title='New elsewhere';extra.parentId=b.id;other.items.push(extra);
  const copy=structuredClone(db);const n=mergeConflictingCopy(copy,other,[a.id,b.id,extra.id],'ab'.repeat(32));
  const root=copy.items.find(i=>i.title==='Conflicting changes from another computer');
  const kids=copy.items.filter(i=>i.parentId===root.id).map(i=>i.title),grand=copy.items.filter(i=>kids.length&&i.parentId===copy.items.find(x=>x.title==='Changed elsewhere (other computer)')?.id).map(i=>i.title);
  const again=mergeConflictingCopy(copy,other,[a.id,b.id,extra.id],'ab'.repeat(32));
  const unrelated=mergeConflictingCopy(structuredClone(db),structuredClone(db),null,'cd'.repeat(32));
  return {n,kids,grand,again,unrelated,valid:validateDatabase(copy)};
 });
 assert.deepEqual(unit,{n:2,kids:['Changed elsewhere (other computer)'],grand:['New elsewhere'],again:0,unrelated:0,valid:true});
 console.log('PASS merge copies only changed, differing items under one branch, once');

 // Whole flow from the conflict dialog.
 await page.evaluate(()=>{const other=structuredClone(probe.model),it=other.items.find(i=>!i.archived&&i.id!==db.items[0].id);it.title='Renamed on the work PC';
  probe.conflict={model:other,changed:[it.id],fingerprint:{sha256:'ef'.repeat(32),bytes:1234}};edit(db.items[0].id);focusBodyStart()});
 await page.keyboard.type('Mac edit ');
 await page.waitForFunction(()=>!dirty&&probe.localWrites>0);
 await page.evaluate(()=>{probe.failMaster=true;$('saveFile').click()});
 await page.waitForSelector('.libraryDialog[open] h3');
 assert.equal(await page.locator('.libraryDialog[open] h3').innerText(),'Library changed on another computer');
 const writesBefore=await page.evaluate(()=>probe.localWrites);
 await page.locator('.libraryDialog[open] button',{hasText:'Keep Both'}).click();
 await page.waitForFunction(()=>!notesDesktop.sqlite.busy&&probe.masterWrites===1);
 const after=await page.evaluate(()=>({adopted:probe.adoptedAfterWrites,master:probe.masterModel.items.map(i=>i.title),mine:probe.masterModel.items[0].content}));
 assert.ok(after.adopted>writesBefore,'merged copy is saved locally before the file is replaced');
 assert.ok(after.master.includes('Conflicting changes from another computer'));
 assert.ok(after.master.includes('Renamed on the work PC (other computer)'));
 assert.ok(after.mine.includes('Mac edit'));
 assert.equal(await page.locator('.libraryDialog[open]').count(),0);
 console.log('PASS Keep Both saves the merge locally, then replaces the library file with both sides');
 assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
