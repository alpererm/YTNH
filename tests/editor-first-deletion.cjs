const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1400,height:900}});p.setDefaultTimeout(5000);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 async function setup(mode='editor',count=2){await p.evaluate(({mode,count})=>{
   installDatabase(createEmptyDatabase());appearance.defaultView=mode;undoStack=[];redoStack=[];
   for(let n=0;n<count;n++){const i=createItem(db,'Note');i.title='Note '+n;i.content='Body '+n}
   selected=db.items[0].id;render();edit(selected);$('layout').dataset.view='editor';
 },{mode,count})}
 async function state(){return p.evaluate(()=>({open:editorIsOpen(),view:$('layout').dataset.view,selected,title:editorDocument()?.title||null,empty:$('editor').classList.contains('editor-empty'),count:activeItems(db).length}))}
 await setup();await p.evaluate(()=>deleteOutlineSelection());await p.locator('#modalCancel').click();assert.equal((await state()).title,'Note 0');
 await p.evaluate(()=>deleteOutlineSelection());await p.locator('#modalOK').click();assert.deepEqual(await state(),{open:true,view:'editor',selected:await p.evaluate(()=>activeItems(db)[0].id),title:'Note 1',empty:false,count:1});
 await p.evaluate(()=>deleteOutlineSelection());await p.locator('#modalOK').click();assert.deepEqual(await state(),{open:true,view:'editor',selected:null,title:null,empty:true,count:0});assert(await p.locator('#emptyEditorMessage').isVisible());assert.equal(await p.locator('#editorWorkspace').isVisible(),false);
 await p.evaluate(()=>{setEditorFocus(true);edit(null)});assert.equal(await p.evaluate(()=>$('layout').classList.contains('editor-focus')),false);assert((await state()).empty);
 await p.evaluate(()=>undo());assert.equal((await state()).title,'Note 1');assert(!(await state()).empty);
 await p.evaluate(()=>redo());assert((await state()).empty);assert((await state()).open);
 await p.evaluate(()=>{const i=createItem(db,'Note');i.title='New';edit(i.id)});assert.equal((await state()).title,'New');assert(await p.locator('#editorWorkspace').isVisible());
 await setup('calendar');await p.evaluate(()=>deleteOutlineSelection());await p.locator('#modalOK').click();assert.equal((await state()).open,false);
 for(const promote of [false,true]){
   await setup();await p.evaluate(()=>{const child=createItem(db,'Note',selected);child.title='Child';render();deleteOutlineSelection()});
   await p.locator(promote?'#promoteChildren':'#deleteTree').click();assert((await state()).open);assert.equal((await state()).title,promote?'Child':'Note 1');
 }
 await setup('editor',1);await p.evaluate(()=>{const g=new OutlineLocations(db);removeLocation(g.selected(itemById(db,selected)),true)});await p.locator('#modalOK').click();assert((await state()).empty);assert((await state()).open);
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS Editor First deletion, cancellation, subtree/promotion, last item, undo/redo, linked deletion and Calendar First');
})().catch(e=>{console.error(e);process.exit(1)});
