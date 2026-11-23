// Details → History… lists earlier versions from backups and restores one (undoable).
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
  const id=await page.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());
   const n=createItem(db,'Note');n.title='Plan';n.content='Current text';
   window.notesDesktop={sqlite:{itemHistory:async item=>item===n.id?[
     {backup:'b3',savedAt:Date.UTC(2026,10,23,10),title:'Plan',content:'Current text',status:'Todo',archived:false},
     {backup:'b2',savedAt:Date.UTC(2026,10,22,9),title:'Plan draft',content:'Older text',status:'Todo',archived:false},
     {backup:'b1',savedAt:Date.UTC(2026,10,20,9),title:'First idea',content:'First text',status:'Todo',archived:false}]:[]}};
   render();edit(n.id);selectSidebarTab('details');return n.id});
  await page.click(`[data-item-history="${id}"]`);
  await page.waitForSelector('.historyList');
  assert.equal(await page.locator('.historyList [data-version]').count(),2,'the copy identical to now is hidden');
  assert.match(await page.locator('#modalText').innerText(),/2 earlier versions of “Plan”/);
  assert.equal(await page.locator('#historyText').innerText(),'Older text');
  await page.click('.historyList [data-version="1"]');
  assert.equal(await page.locator('#historyTitle').innerText(),'First idea');
  await page.click('#historyRestore');
  assert.deepEqual(await page.evaluate(id=>({t:itemById(db,id).title,c:itemById(db,id).content}),id),{t:'First idea',c:'First text'});
  await page.evaluate(()=>undo());
  assert.deepEqual(await page.evaluate(id=>({t:itemById(db,id).title,c:itemById(db,id).content}),id),{t:'Plan',c:'Current text'});
  assert.deepEqual(errors,[]);
  console.log('PASS item history: lists backup versions, previews, restores, undo');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
