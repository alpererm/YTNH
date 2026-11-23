// Deleting moves branches to Recently deleted for 30 days; they can be restored under their parent.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
  const ids=await page.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());
   const mk=(type,title,p)=>{const i=createItem(db,type,p?.id);i.title=title;return i};
   const project=mk('Note','Project'),phase=mk('Todo','Phase',project),step=mk('Todo','Step',phase),solo=mk('Todo','Solo',project);mk('Todo','Keep',project);
   render();return {project:project.id,phase:phase.id,step:step.id,solo:solo.id}});
  const del=async(id,button)=>{await page.evaluate(id=>{selected=id;multiSelected.clear();$('delete').click()},id);await page.click(button)};
  // Delete a branch: it is archived in place with trashedAt, hidden from the Outline.
  await del(ids.phase,'#deleteTree');
  let r=await page.evaluate(ids=>({phase:itemById(db,ids.phase),step:itemById(db,ids.step),visible:!!document.querySelector(`#tree .row[data-id="${ids.phase}"]`)}),ids);
  assert.ok(r.phase.archived&&r.phase.trashedAt&&r.step.archived&&r.phase.parentId===ids.project&&!r.visible);
  // Undo reverses the delete.
  await page.evaluate(()=>undo());assert.equal(await page.evaluate(id=>itemById(db,id).archived,ids.phase),false);
  await del(ids.phase,'#deleteTree');
  // Archive dialog: listed under Recently deleted, not among archived items.
  await page.evaluate(()=>openArchiveBrowser());
  assert.match(await page.locator('#trashList').innerText(),/Phase[\s\S]*Project · 2 items/);
  assert.doesNotMatch(await page.locator('#archiveList').innerText(),/Phase/);
  await page.click(`#trashList [data-untrash="${ids.phase}"]`);
  r=await page.evaluate(ids=>({a:itemById(db,ids.phase).archived,t:itemById(db,ids.phase).trashedAt,step:itemById(db,ids.step).archived,parent:itemById(db,ids.phase).parentId===ids.project}),ids);
  assert.deepEqual(r,{a:false,t:undefined,step:false,parent:true});
  await page.evaluate(()=>closeModalShell());
  // A single item without children also goes to Recently deleted.
  await page.evaluate(id=>{selected=id;multiSelected.clear();$('delete').click()},ids.solo);
  assert.equal(await page.evaluate(()=>document.getElementById('modalTitle').textContent),'Delete item?');
  await page.click('#modalOK');
  assert.ok(await page.evaluate(id=>!!itemById(db,id).trashedAt,ids.solo));
  // Delete now removes it permanently (after the app's own confirmation).
  await page.evaluate(()=>openArchiveBrowser());await page.click(`#trashList [data-purge="${ids.solo}"]`);await page.click('dialog.libraryDialog button.primary');
  assert.equal(await page.evaluate(id=>itemById(db,id),ids.solo),undefined);
  await page.evaluate(()=>closeModalShell());
  // Opening a library removes items deleted more than 30 days ago, and keeps newer ones.
  const kept=await page.evaluate(ids=>{trashSubtree(db,ids.phase);const fresh=createItem(db,'Todo',ids.project);fresh.title='Fresh';trashSubtree(db,fresh.id);
    itemById(db,ids.phase).trashedAt=new Date(Date.now()-31*86400000).toISOString();fresh.trashedAt=new Date(Date.now()-29*86400000).toISOString();
    installDatabase(JSON.parse(JSON.stringify(db)));return {phase:!!itemById(db,ids.phase),step:!!itemById(db,ids.step),fresh:!!itemById(db,fresh.id)}},ids);
  assert.deepEqual(kept,{phase:false,step:false,fresh:true});
  assert.deepEqual(errors,[]);
  console.log('PASS Recently deleted: trash, undo, restore under parent, delete now, 30-day cleanup');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
