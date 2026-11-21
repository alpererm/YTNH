// Registered legacy libraries transition explicitly; native replies are simulated here.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});try{
 const p=await browser.newPage();await p.goto(require('node:url').pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../library-bridge.js'),'utf8')});
 await p.evaluate(()=>{
  autosaveEnabled=false;installDatabase(createEmptyDatabase());createItem(db,'Note').title='Current workspace';dirty=false;
  window.probe={head:'r1',paused:true,unpublished:true,cancelPicker:false,failReview:false,failConvert:false,calls:[],exports:0,model:structuredClone(db)};
  window.api=createDesktopLibraries(async(_,q)=>{const {op,args}=q;probe.calls.push(op);
   const record=()=>({id:'legacy',name:'Old local library',revision:probe.head,paused:probe.paused,unpublished:probe.unpublished});
   if(op==='list')return [record()];
   if(op==='legacy_review'){if(probe.failReview)throw Error('Required archive unavailable');return record()}
   if(op==='export'){probe.exports++;return 'synthetic export'}
   if(op==='portable_transition'){if(probe.cancelPicker)return null;if(probe.failConvert)throw Error('Local revision changed after review');if(args.revision!==probe.head)throw Error('Stale revision');return {...record(),name:'Converted.ytnh',portable:true,paused:false,unpublished:false}}
   if(op==='read')return {model:structuredClone(probe.model),revision:probe.head};
   if(op==='status')return {...record(),portable:true,unpublished:false};
   throw Error('Unexpected operation '+op);
  });
  window.before={db,selection:selected,history:JSON.stringify(undoStack)};
 });
 async function begin(){await p.evaluate(async()=>{window.handle=(await api.recent())[0].handle;window.result=handle.getFile().then(async f=>({text:await f.text()}),e=>({error:e.name}))});}
 await begin();
 const dialog=p.locator('.libraryDialog');await dialog.waitFor();
 assert.match(await dialog.innerText(),/paused for a handoff/);assert.match(await dialog.innerText(),/unpublished changes/);
 await p.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await p.evaluate(()=>result)).error,'AbortError');
 assert(await p.evaluate(()=>db===before.db&&selected===before.selection&&JSON.stringify(undoStack)===before.history));
 await p.evaluate(()=>probe.cancelPicker=true);await begin();await p.getByRole('button',{name:'Convert this local copy…',exact:true}).click();
 assert.equal((await p.evaluate(()=>result)).error,'AbortError');assert.equal(await p.evaluate(()=>handle.portable),false);
 await p.evaluate(()=>{probe.cancelPicker=false;probe.failReview=true});await begin();
 await p.getByRole('heading',{name:'Library conversion did not finish',exact:true}).waitFor();
 assert.match(await dialog.innerText(),/Required archive unavailable/);
 await p.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal((await p.evaluate(()=>result)).error,'AbortError');
 await p.evaluate(()=>{probe.failReview=false;probe.failConvert=true});await begin();await p.getByRole('button',{name:'Convert this local copy…',exact:true}).click();
 await p.getByRole('heading',{name:'Library conversion did not finish',exact:true}).waitFor();
 await p.evaluate(()=>{probe.failConvert=false;probe.head='r2'});await p.getByRole('button',{name:'Retry',exact:true}).click();
 await p.getByRole('button',{name:'Export local recovery…',exact:true}).click();
 await p.waitForFunction(()=>probe.exports===1);await p.getByRole('button',{name:'Convert this local copy…',exact:true}).click();
 const result=await p.evaluate(()=>window.result);assert(!result.error);assert.equal(JSON.parse(result.text).items[0].title,'Current workspace');
 assert(await p.evaluate(()=>handle.portable&&handle.revision==='r2'&&handle.name==='Converted.ytnh'));
 assert.equal(await p.evaluate(()=>probe.calls.some(op=>['inspect','auto_receive','auto_snapshot','allow_local'].includes(op))),false);
 assert(await p.evaluate(()=>db===before.db&&JSON.stringify(undoStack)===before.history));
 console.log('PASS legacy transition paused/unpublished warnings, cancellation, missing assets, stale revision retry, export and portable identity without handoff');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
