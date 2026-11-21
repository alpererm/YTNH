// Cancellation must preserve a live portable editor while a registered legacy copy is reviewed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});try{
 const p=await browser.newPage();await p.goto(require('node:url').pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../library-bridge.js'),'utf8')});
 await p.evaluate(()=>{
  autosaveEnabled=false;installDatabase(createEmptyDatabase());const item=createItem(db,'Note');item.title='Retained';item.content='Pending body';edit(item.id);focusBodyStart();checkpoint();dirty=true;
  window.probe={writes:0,reads:0,fail:false,head:'r1'};
  window.api=createDesktopLibraries(async(_,q)=>{const {op,args}=q;
   if(op==='list')return [{id:'current',portable:true,name:'Current.ytnh'},{id:'legacy',name:'Legacy'}];
   if(op==='legacy_review'){if(probe.fail)throw Error('Missing required asset');return {id:'legacy',name:'Legacy',revision:'old',paused:false,unpublished:true}}
   if(op==='portable_reopen')throw Error('Master unavailable');
   if(op==='save'){if(args.revision!==probe.head)throw Error('Stale local revision');probe.writes++;return {revision:probe.head}}
   if(op==='read'){probe.reads++;throw Error('No read should occur on cancellation')}
   throw Error(op);
  });
 });
 await p.evaluate(async()=>{window.current=(await api.recent())[0].handle;current.checked=true;current.revision='r1';storage.handle=current;window.retained={model:JSON.stringify(db),undo:JSON.stringify(undoStack),selected,body:$('richEditor').innerHTML,caret:captureEditorSelection()}});
 for(const mode of ['legacy','asset-error','portable']){
  await p.evaluate(async mode=>{probe.fail=mode==='asset-error';const record=(await api.recent())[mode==='portable'?0:1];window.reopening=record.handle.getFile().then(()=> 'opened',e=>e.name)},mode);
  await p.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await p.evaluate(()=>reopening),'AbortError');
  assert(await p.evaluate(()=>current.checked&&dirty&&probe.reads===0&&JSON.stringify(db)===retained.model&&JSON.stringify(undoStack)===retained.undo&&selected===retained.selected&&$('richEditor').innerHTML===retained.body));
  await p.evaluate(()=>current.saveModel(db));
 }
 await p.evaluate(()=>probe.head='external-r2');assert.equal(await p.evaluate(async()=>{try{await current.saveModel(db);return true}catch{return false}}),false);
 assert.equal(await p.evaluate(()=>probe.writes),3);
 console.log('PASS cancelled legacy/portable reopening retains pending model, undo, selection and editor; existing writes remain possible and stale writes fail');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
