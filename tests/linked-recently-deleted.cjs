// Deleting a linked item everywhere moves it to Recently deleted; Restore puts it back under its
// parent and relinks it where those places still exist.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
  await page.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());
   const a=createItem(db,'Note');a.title='Project';const b=createItem(db,'Note');b.title='Today';const c=createItem(db,'Note');c.title='Elsewhere';
   const t=createItem(db,'Todo',a.id);t.title='Shared job';const kid=createItem(db,'Todo',t.id);kid.title='Step';
   const g=new OutlineLocations(db);g.clone(g.primary(t),g.primary(b));g.commit(false);
   window.ids={a:a.id,b:b.id,c:c.id,t:t.id,kid:kid.id};render()});
  assert.equal(await page.evaluate(()=>new OutlineLocations(db).byItem.get(ids.t).length),2);

  // Delete everywhere: archived in Recently deleted, links remembered, library still valid.
  await page.evaluate(()=>{const g=new OutlineLocations(db);removeLocation(g.primary(itemById(db,ids.t)),true)});
  assert.match(await page.locator('#modalText').innerText(),/Recently deleted/);
  await page.locator('#modalOK').click();
  const trashed=await page.evaluate(()=>{const t=itemById(db,ids.t);validateDatabase(db);new OutlineLocations(db).validate(true);
   return {archived:t.archived,trashed:!!t.trashedAt,parent:t.parentId===ids.a,links:t.trashedLinks?.length,listed:trashedRoots(db).some(i=>i.id===ids.t),visible:!!document.querySelector(`#tree .row[data-id="${ids.t}"]`),kidActive:!itemById(db,ids.kid).archived}});
  assert.deepEqual(trashed,{archived:true,trashed:true,parent:true,links:1,listed:true,visible:false,kidActive:true});

  // Restore: back under its parent, linked under "Today" again.
  const restored=await page.evaluate(()=>{checkpoint();restoreTrashed(db,ids.t);validateDatabase(db);const g=new OutlineLocations(db);g.validate(true);
   const t=itemById(db,ids.t);return {active:!t.archived,trashed:'trashedAt' in t||'trashedLinks' in t,parent:t.parentId,places:g.byItem.get(ids.t).map(n=>g.nodes.get(n.parent)?.item.title||null).sort()}});
  assert.deepEqual(restored,{active:true,trashed:false,parent:await page.evaluate(()=>ids.a),places:['Project','Today']});

  // A link whose place was deleted meanwhile is skipped; undo of the delete still works.
  const skipped=await page.evaluate(()=>{const g=new OutlineLocations(db);removeLocation(g.primary(itemById(db,ids.t)),true);$('modalOK').click();
   deleteSubtree(db,ids.b);restoreTrashed(db,ids.t);validateDatabase(db);return new OutlineLocations(db).byItem.get(ids.t).length});
  assert.equal(skipped,1);
  console.log('PASS linked items deleted everywhere go to Recently deleted and are relinked on restore');
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
