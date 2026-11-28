// Archive completed: fully finished branches are archived in place, grouped by parent in the dialog.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
  const ids=await page.evaluate(()=>{
   autosaveEnabled=false;installDatabase(createEmptyDatabase());
   const mk=(type,title,parent,status)=>{const i=createItem(db,type,parent?.id);i.title=title;if(status)i.status=status;return i};
   const project=mk('Note','Project');
   const phase=mk('Todo','Phase 1',project,'Done');            // fully finished branch
   const step=mk('Todo','Step A',phase,'Done');mk('Note','Minutes',step);mk('Todo','Step B',phase,'Cancelled');
   const open=mk('Todo','Phase 2',project,'Done');mk('Todo','Still open',open);   // unfinished child keeps parent
   const loose=mk('Todo','Loose done',null,'Done');
   const recurring=mk('Todo','Weekly report',project,'Done');recurring.recurrence={frequency:'weekly',interval:1,startDate:'2026-11-02',days:[1]};
   const fresh=mk('Todo','Done today',project,'Done');
   const old=new Date(Date.now()-40*86400000).toISOString();for(const i of [phase,step,loose,...db.items.filter(x=>x.parentId===step.id||x.parentId===phase.id)])i.updatedAt=old;
   render();return {project:project.id,phase:phase.id,step:step.id,open:open.id,loose:loose.id,recurring:recurring.id,fresh:fresh.id};
  });
  const roots=await page.evaluate(days=>completedBranchRoots(db,{notChangedForDays:days}).map(i=>i.title).sort(),0);
  assert.deepEqual(roots,['Done today','Loose done','Phase 1']);
  assert.deepEqual(await page.evaluate(()=>completedBranchRoots(db,{notChangedForDays:30}).map(i=>i.title).sort()),['Loose done','Phase 1']);
  // Through the dialog, with the 30-day filter and the preview confirmed.
  const before=await page.evaluate(()=>JSON.stringify(db.items.map(i=>[i.id,i.archived,i.parentId])));
  await page.evaluate(()=>openArchiveBrowser());
  await page.locator('.archiveMore>summary').click(); // the tools sit in the … menu (#43)
  await page.selectOption('#archiveCompletedAge','30');
  await page.click('#archiveCompleted');
  await page.waitForSelector('#appConfirmTitle');
  assert.equal(await page.locator('#appConfirmTitle').innerText(),'Archive completed?');
  const preview=await page.locator('dialog.libraryDialog > p').innerText();
  assert.match(preview,/2 completed branches \(5 items\)/);assert.match(preview,/Project › Phase 1/);
  await page.click('dialog.libraryDialog button.primary');
  const r=await page.evaluate(ids=>{const g=id=>itemById(db,id);return {
    phase:g(ids.phase).archived,step:g(ids.step).archived,stepParent:g(ids.step).parentId===ids.phase,phaseParent:g(ids.phase).parentId===ids.project,
    open:g(ids.open).archived,loose:g(ids.loose).archived,recurring:g(ids.recurring).archived,fresh:g(ids.fresh).archived}},ids);
  assert.deepEqual(r,{phase:true,step:true,stepParent:true,phaseParent:true,open:false,loose:true,recurring:false,fresh:false});
  // The dialog groups archived branches under their parent path.
  await page.evaluate(()=>openArchiveBrowser());
  assert.deepEqual(await page.locator('#archiveList .archiveGroupTitle').allInnerTexts(),['Top level','Project']);
  // One undo restores every archived item.
  await page.evaluate(()=>{closeModalShell?.();undo()});
  assert.equal(await page.evaluate(()=>JSON.stringify(db.items.map(i=>[i.id,i.archived,i.parentId]))),before);
  assert.deepEqual(errors,[]);
  console.log('PASS archive completed keeps hierarchy, skips unfinished and recurring, undoes in one step');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
