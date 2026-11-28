// #54 highlighted suggestions stay in view; #58 Esc order in Editor-first mode; #59 Show in Outline leaves Focus Mode.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 const ev=(f,a)=>page.evaluate(f,a);
 await ev(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());
   for(let i=0;i<12;i++){const x=createItem(db,'Note');x.title='Tagged '+i;x.explicitTags=['topic-'+String(i).padStart(2,'0')]}
   const n=createItem(db,'Note');n.title='Target note';n.scheduledDates=['2026-11-18'];window.nid=n.id;render();openSelectedInFullEditor(n.id);selectSidebarTab('properties')});
 // #54: arrowing to the last suggestion keeps it visible inside the list.
 await ev(()=>{const s=document.getElementById('tagSuggestions');s.style.maxHeight='90px';s.style.overflowY='auto'}); // a short list, so it must scroll
 await page.locator('#tagInput').click();await page.keyboard.type('topic');
 const count=await page.locator('#tagSuggestions button').count();
 for(let i=1;i<count;i++)await page.keyboard.press('ArrowDown');
 assert.equal(await ev(()=>{const list=document.getElementById('tagSuggestions'),active=list.querySelector('.active');const a=active.getBoundingClientRect(),l=list.getBoundingClientRect();return a.top>=l.top-1&&a.bottom<=l.bottom+1}),true,'the highlighted tag is scrolled into view');
 await page.keyboard.press('Escape');
 // #58: Editor-first mode: the first Esc clears the day filter, the second returns to the editor.
 await ev(()=>{appearance={...appearance,defaultView:'editor'};closeRightEditor();setView('calendar');calendarMode='weeks';weekAnchor=new Date(2026,10,18,12);showCalendar();renderCalendar()});
 await page.locator('.day[data-date="2026-11-18"]').dblclick({position:{x:6,y:6}});
 assert.equal(await ev(()=>outlineDayFilter),'2026-11-18');
 await page.keyboard.press('Escape');
 assert.deepEqual(await ev(()=>[outlineDayFilter,editorIsOpen()]),[null,false],'first Esc clears the filter');
 await page.keyboard.press('Escape');
 assert.equal(await ev(()=>editorIsOpen()),true,'second Esc returns to the editor');
 // #59: Show in Outline from Focus Mode leaves Focus Mode and shows the row.
 await ev(()=>{appearance={...appearance,defaultView:'calendar'};openSelectedInFullEditor(nid);setEditorFocus(true)});
 assert.equal(await ev(()=>$('layout').classList.contains('editor-focus')),true);
 await page.locator('#editCode .itemMarker').click({button:'right'});
 await page.getByRole('menuitem',{name:'Show in Outline',exact:true}).click();
 assert.equal(await ev(()=>$('layout').classList.contains('editor-focus')),false,'Focus Mode ends');
 assert.equal(await page.locator(`#tree .row[data-id="${await ev(()=>nid)}"]`).isVisible(),true,'the item is shown in the Outline');
 // #56: the revealed row is visibly tinted, then settles to the normal selection colour.
 const tint=()=>ev(()=>getComputedStyle(document.querySelector(`#tree .row[data-id="${nid}"]`)).backgroundColor);
 await ev(()=>{closeRightEditor();setView('calendar');showCalendar();renderCalendar()});
 await ev(()=>selectAndReveal(nid));await page.waitForTimeout(150);
 const during=await tint();await page.waitForTimeout(2400);const after=await tint();
 assert.notEqual(during,after,'the row is tinted while it flashes');
 // #39: Settings keeps one height across its tabs.
 await ev(()=>openSettings());await page.waitForTimeout(100);
 const heights=[];for(const t of ['general','appearance','editor','calendar']){await page.locator('#settingsTab-'+t).click();await ev(()=>Promise.allSettled(document.getAnimations().map(a=>a.finished)));heights.push(Math.round((await page.locator('.modal').boundingBox()).height))}
 assert.equal(new Set(heights).size,1,'Settings height per tab: '+heights);
 await ev(()=>closeModalShell());
 assert.deepEqual(errors,[]);
 console.log('PASS suggestions scroll (#54), Esc order in Editor-first (#58), Show in Outline from Focus Mode (#59), visible reveal flash (#56), Settings keeps one size (#39)');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
