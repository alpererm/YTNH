const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const p=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());const a=createItem(db,'Note'),b=createItem(db,'Note');a.title='First';a.content='Original';b.title='Second';window.ids=[a.id,b.id];render();edit(a.id);focusBodyStart()});
 await p.keyboard.type('Pending ');
 await p.locator('#tree .row').filter({hasText:'Second'}).locator('.title').click();
 assert.deepEqual(await p.evaluate(()=>[selected,editorDisplayedId,itemById(db,ids[0]).content]),[...(await p.evaluate(()=>[ids[1],ids[1]])),'Pending Original']);
 await p.locator('#editorTitle').fill('Changed title');
 await p.locator('#tree .row').filter({hasText:'First'}).locator('.title').click();
 assert.equal(await p.evaluate(()=>selected),await p.evaluate(()=>ids[0]));
 for(const content of ['', 'Short text','**Formatted**\n- bullet\n- [ ] checklist']){
 await p.evaluate(content=>{itemById(db,ids[0]).content=content;edit(ids[0]);$('richEditor').blur()},content);
 const bounds=await p.locator('.documentScroll').boundingBox();
 await p.mouse.click(bounds.x+bounds.width/2,bounds.y+bounds.height-10);
 assert.equal(await p.evaluate(()=>document.activeElement.id),'richEditor');
 await p.keyboard.type('END');
 assert.ok((await p.evaluate(()=>itemById(db,ids[0]).content)).endsWith('END'));
 }
 await p.evaluate(()=>{setEditorFocus(true);$('richEditor').blur()});
 const box=await p.locator('.documentScroll').boundingBox();await p.mouse.click(box.x+box.width/2,box.y+box.height-10);
 assert.equal(await p.evaluate(()=>document.activeElement.id),'richEditor');
 assert.deepEqual(errors,[]);console.log('PASS single-click switching from body/title preserves edits; blank writing area supports empty/formatted/list documents and Focus Mode');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
