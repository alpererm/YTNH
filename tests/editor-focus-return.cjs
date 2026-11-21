const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const b=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{}),p=await b.newPage({viewport:{width:1500,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{autosaveEnabled=false;applyAppearance();installDatabase(createEmptyDatabase());window.i=createItem(db,'Note');i.title='Focus return';i.content='First paragraph';edit(i.id);focusBodyStart()});
 for(const width of [1500,1000]){
  await p.setViewportSize({width,height:900});
  for(const content of ['', 'First paragraph','- [ ] Checklist','| A | B |\n|---|---|\n| C | D |']){
   await p.evaluate(content=>{i.content=content;edit(i.id);focusBodyStart();window.originalBlock=$('richEditor').firstElementChild},content);
   for(let n=0;n<3;n++){
    await p.keyboard.press('Alt+Digit1');await p.keyboard.press('Alt+Digit2');
    assert(await p.evaluate(()=>$('richEditor').firstElementChild===originalBlock),'Same-item focus must not rebuild document');
    const before=await p.locator('#richEditor [data-mdblock]').count();await p.keyboard.type('abc');assert.equal(await p.locator('#richEditor [data-mdblock]').count(),before);
   }
  }
 }
 // Browser input at the root must retain its text-node caret when normalized.
 await p.evaluate(()=>{i.content='Existing';edit(i.id);focusBodyStart();const text=document.createTextNode('a');$('richEditor').append(text);getSelection().collapse(text,1);$('richEditor').dispatchEvent(new InputEvent('input',{inputType:'insertText',data:'a'}))});
 await p.keyboard.type('bcdef');assert.equal(await p.evaluate(()=>i.content),'Existing\nabcdef');assert.equal(await p.locator('#richEditor [data-mdblock]').count(),2);
 // Source mode and its caret also survive a round trip.
 await p.evaluate(()=>{setSourceMode(true);$('content').focus();$('content').setSelectionRange(3,3)});await p.keyboard.press('Alt+Digit1');await p.keyboard.press('Alt+Digit2');assert(await p.evaluate(()=>sourceMode()));assert.equal(await p.locator('#content').evaluate(e=>e.selectionStart),3);
 assert.deepEqual(errors,[]);await b.close();console.log('PASS shortcut focus return, unchanged document nodes, empty/paragraph/checklist/table typing, raw-text normalization and Source caret');
})().catch(e=>{console.error(e);process.exit(1)});
