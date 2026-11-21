const assert=require('node:assert/strict');const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const b=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});try{
 const p=await b.newPage();await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{
  installDatabase(createEmptyDatabase());window.i=createItem(db,'Note');window.disk=JSON.stringify(db);window.writes=0;window.failWrite=null;
  storage.name='SQLite fixture';storage.handle={sqlite:true,saveModel:async model=>{if(failWrite)throw Error(failWrite);writes++;disk=JSON.stringify(model);return {mode:'direct',name:storage.name}}};i.title='Changed';touch(db,i);
 });
 await p.waitForFunction(()=>saveState==='Saved');assert.equal(await p.evaluate(()=>writes),1);
 await p.evaluate(async()=>{let release;const original=storage.save.bind(storage);storage.save=async(...args)=>{await new Promise(r=>release=r);return original(...args)};i.title='First';touch(db,i);window.saving=requestDatabaseSave();i.title='Latest';touch(db,i);release();storage.save=original;await saving});
 assert.equal(await p.evaluate(()=>JSON.parse(disk).items[0].title),'Latest');assert.equal(await p.evaluate(()=>dirty),false);
 await p.evaluate(async()=>{failWrite='The database changed outside this app.';i.title='Conflict';touch(db,i);await requestDatabaseSave()});
 assert.equal(await p.evaluate(()=>saveState),'Conflict detected');assert.equal(await p.evaluate(()=>dirty),true);assert.equal(await p.evaluate(()=>JSON.parse(disk).items[0].title),'Latest');
 await p.evaluate(async()=>{saveBlocked=false;failWrite='Disk full';await requestDatabaseSave()});assert.equal(await p.evaluate(()=>saveState),'Save failed');assert.equal(await p.evaluate(()=>dirty),true);
 await p.evaluate(async()=>{failWrite=null;saveBlocked=false;await requestDatabaseSave()});assert.equal(await p.evaluate(()=>dirty),false);
 await p.clock.install();await p.evaluate(()=>{resetAutosave();writes=0;edit(i.id);focusBodyStart();window.caret=getSelection().anchorOffset});
 for(let n=0;n<16;n++){await p.evaluate(()=>{i.content+='x';touch(db,i)});await p.clock.runFor(1000)}
 assert(await p.evaluate(()=>writes>=1));assert.equal(await p.evaluate(()=>document.activeElement.id),'richEditor');
 await p.evaluate(async()=>{storage.handle=null;const before=disk;let rejected=false;try{await storage.save(db)}catch{rejected=true}if(!rejected||disk!==before)throw Error('Disconnected write was not refused')});
 console.log('PASS SQLite idle/continuous autosave, serialized latest state, conflict/write failure retention, retry, caret and disconnected-write refusal');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
