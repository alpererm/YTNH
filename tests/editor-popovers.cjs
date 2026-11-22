// Editor helpers at the caret: the slash menu ("/" at the start of a line), [[ item suggestions without a
// dialog, and the floating selection toolbar.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1300,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());const t=createItem(db,'Note');t.title='Garden plan';const d=createItem(db,'Todo');d.title='Garden gate';d.status='Done';const i=createItem(db,'Note');i.title='Doc';i.content='Intro\n\n';window.ids={t:t.id,i:i.id};selected=i.id;render();edit(i.id)});
 await p.waitForTimeout(200);
 const toEnd=()=>p.evaluate(()=>{const r=document.createRange();r.selectNodeContents($('richEditor').lastElementChild);r.collapse(false);$('richEditor').focus();getSelection().removeAllRanges();getSelection().addRange(r)});
 const shown=()=>p.locator('#caretPopover:not(.hidden) .caretPopoverItem').allTextContents();
 const content=()=>p.evaluate(()=>{syncModelFromRich();return itemById(db,ids.i).content});
 await toEnd();
 // Slash menu
 await p.keyboard.type('/');assert((await shown()).length>=10,'all commands listed');
 await p.keyboard.type('num');assert.deepEqual(await shown(),['Numbered list']);
 await p.keyboard.press('Escape');assert.equal((await shown()).length,0,'Esc closes and keeps the text');
 assert.match(await content(),/\/num$/);
 for(let n=0;n<4;n++)await p.keyboard.press('Backspace');
 await p.keyboard.type('/head');assert.deepEqual(await shown(),['Heading 1','Heading 2','Heading 3']);
 await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');await p.keyboard.type('Section');
 assert.match(await content(),/\n## Section$/,'Heading 2 via the menu');
 await p.keyboard.press('Enter');await p.keyboard.type('/che');await p.keyboard.press('Enter');await p.keyboard.type('Buy soil');
 assert.match(await content(),/- \[ \] Buy soil$/,'Checklist via the menu');
 await p.keyboard.press('Enter');await p.keyboard.press('Enter');
 await p.keyboard.type('a/b stays text');assert.equal((await shown()).length,0,'"/" inside a sentence is plain text');
 // [[ suggestions
 await p.keyboard.press('Enter');await p.keyboard.type('See [[gard');
 const refs=await shown();assert.deepEqual(refs.slice(0,2),['Garden plan','Garden gate'],'ranked, finished last');
 assert(refs.includes('Create Note: “gard”'));
 assert.equal(await p.locator('#modalbg.open').count(),0,'no dialog');
 await p.keyboard.press('Enter');await p.keyboard.type(' done');
 assert.match(await content(),new RegExp('See \\[\\[@\\{'+(await p.evaluate(()=>ids.t))+'\\}\\]\\] done$'));
 // Selection toolbar
 await p.evaluate(()=>{const b=[...$('richEditor').children].find(c=>c.textContent.includes('Intro'));const r=document.createRange();r.selectNodeContents(b);getSelection().removeAllRanges();getSelection().addRange(r)});
 await p.waitForTimeout(100);
 assert.equal(await p.locator('#selectionBar:not(.hidden)').count(),1,'toolbar appears for a selection');
 await p.locator('#selectionBar [data-selection-cmd="bold"]').click();
 assert.match(await content(),/^\*\*Intro\*\*/,'Bold from the toolbar');
 await p.evaluate(()=>{const r=document.createRange();r.selectNodeContents($('richEditor').lastElementChild);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r)});
 await p.waitForTimeout(100);
 assert.equal(await p.locator('#selectionBar:not(.hidden)').count(),0,'hidden without a selection');
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS slash menu, [[ suggestions at the caret, selection toolbar');
})().catch(e=>{console.error(e);process.exit(1)});
