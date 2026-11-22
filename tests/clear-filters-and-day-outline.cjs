// Alt+Shift+C clears all filters (like the Clear all button), and the selected Calendar day is outlined.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1300,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;const a=createItem(db,'Todo');a.title='Water the plants';const b=createItem(db,'Note');b.title='Garden notes';selected=a.id;render();showCalendar();focusOutlineItem(a.id);
   for(const o of $('filterType').options)o.selected=o.value==='notes';$('filterType').dispatchEvent(new Event('change'));$('search').value='garden';renderTree()});
 assert.equal(await p.locator('#clearAllFilters').isHidden(),false,'filters are active');
 await p.evaluate(()=>focusOutlineItem(selected));await p.keyboard.press('Alt+Shift+KeyC');
 assert.deepEqual(await p.evaluate(()=>[$('search').value,selectedItemTypes().length,$('clearAllFilters').hidden]),['',0,true],'Alt+Shift+C clears search and filters');
 assert.match(await p.locator('#toast').textContent(),/Filters cleared/);
 assert.equal(await p.locator('#clearAllFilters').getAttribute('data-shortcut'),'Alt+Shift+C','tooltip shows the shortcut');
 // Selected day outline
 const shadow=await p.evaluate(()=>{const d=iso(new Date(Date.now()+86400000));calendarCursorDate=d;renderCalendar();const day=document.querySelector(`#calendarBody .day[data-date="${d}"]`);day.classList.add('calendar-anchor');const cs=getComputedStyle(day);return [cs.boxShadow,cs.borderTopColor]});
 assert.match(shadow[0],/inset/,'outlined with an inset border');assert.equal(shadow[1],'rgba(0, 0, 0, 0)','no top line');
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS Alt+Shift+C clears filters; selected day outlined');
})().catch(e=>{console.error(e);process.exit(1)});
