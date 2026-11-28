// #57: the Calendar can list unscheduled Notes on the day they were created or last modified.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
 const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await page.evaluate(()=>{
   autosaveEnabled=false;installDatabase(createEmptyDatabase());
   const at=(d,h=10)=>new Date(2026,10,d,h).toISOString();
   const scheduled=createItem(db,'Todo');scheduled.title='Scheduled todo';scheduled.scheduledDates=['2026-11-10'];
   const note=createItem(db,'Note');note.title='Written Tuesday';note.createdAt=at(10);note.updatedAt=at(12);
   const both=createItem(db,'Note');both.title='Scheduled note';both.createdAt=at(10);both.updatedAt=at(10);both.scheduledDates=['2026-11-10'];
   const todo=createItem(db,'Todo');todo.title='Unscheduled todo';todo.createdAt=at(10);todo.updatedAt=at(10);
   const old=createItem(db,'Note');old.title='Archived note';old.createdAt=at(10);old.updatedAt=at(10);old.archived=true;
   window.ids={scheduled:scheduled.id,note:note.id,both:both.id,todo:todo.id};
   weekAnchor=new Date(2026,10,10,12);calendarCursorDate='2026-11-10';render();showCalendar();renderCalendar();
 });
 const day=d=>page.evaluate(d=>[...$('calendarBody').querySelectorAll(`.day[data-date="${d}"] .chip`)].map(c=>(c.classList.contains('datedNote')?'~':'')+c.textContent.trim()),d);
 const set=mode=>page.evaluate(m=>setCalendarNoteDates(m),mode);

 // Off by default: only scheduled items.
 assert.deepEqual(await day('2026-11-10'),['Scheduled todo','Scheduled note']);
 // Created: Notes only (not Todos, not archived, not twice on a day they're scheduled), muted, after scheduled ones.
 await set('created');
 assert.deepEqual(await day('2026-11-10'),['Scheduled todo','Scheduled note','~Written Tuesday+']);
 assert.equal(await page.evaluate(()=>db.settings.calendarNoteDates),'created','saved with the library');
 assert.match(await page.locator('#mainSub').textContent(),/Notes by created date/);
 // Modified uses the last change.
 await set('modified');
 assert.deepEqual(await day('2026-11-10'),['Scheduled todo','Scheduled note']);
 assert.deepEqual(await day('2026-11-12'),['~Written Tuesday✎']);
 // The control in More filters and the Settings choice follow the setting.
 assert.equal(await page.locator('#calendarNoteDates').inputValue(),'modified');
 await page.evaluate(()=>{const s=$('calendarNoteDates');s.value='created';s.dispatchEvent(new Event('change',{bubbles:true}))});
 assert.equal(await page.evaluate(()=>calendarNoteDatesMode()),'created');
 // Undo restores the previous choice.
 await page.evaluate(()=>undo());assert.equal(await page.evaluate(()=>calendarNoteDatesMode()),'modified');
 await set('created');

 const chip=()=>page.locator(`#calendarBody .day[data-date="2026-11-10"] [data-cal-item="${ids_note}"] .calendarItemTitle`);
 const ids_note=await page.evaluate(()=>ids.note);
 // A click selects and reveals; a double-click opens.
 await chip().click();await page.waitForTimeout(300);
 assert.equal(await page.evaluate(()=>selected),ids_note);
 await page.evaluate(()=>showCalendar());await chip().dblclick();
 assert.equal(await page.evaluate(()=>editorIsOpen()&&selected),ids_note);
 await page.evaluate(()=>{showCalendar();renderCalendar()});
 // Keys: Up/Down move between the day's items, Delete explains instead of removing a date, the menu has no Remove this date.
 await page.evaluate(id=>focusCalendarItem(id,'2026-11-10'),ids_note);
 await page.keyboard.press('ArrowUp');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.calItem),await page.evaluate(()=>ids.both));
 await page.keyboard.press('ArrowDown');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.calItem),ids_note);
 await page.keyboard.press('Delete');
 assert.match(await page.locator('.toast').last().textContent(),/Not scheduled: shown by its created date/);
 assert.deepEqual(await page.evaluate(id=>itemById(db,id).scheduledDates,ids_note),[]);
 await chip().click({button:'right'});
 const menu=await page.evaluate(()=>[...document.querySelectorAll('.itemMenu button,[role=menu] button')].map(b=>b.textContent));
 assert(menu.includes('Open')&&!menu.includes('Remove this date'),JSON.stringify(menu));
 await page.keyboard.press('Escape');
 // Dragging it onto a day schedules it there.
 await page.evaluate(id=>{const chip=document.querySelector(`#calendarBody .chip[data-cal-drag-item="${id}"]`),target=document.querySelector('#calendarBody .day[data-date="2026-11-11"]'),dt=new DataTransfer();
   chip.dispatchEvent(new DragEvent('dragstart',{dataTransfer:dt,bubbles:true}));target.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true}));target.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));chip.dispatchEvent(new DragEvent('dragend',{dataTransfer:dt,bubbles:true}))},ids_note);
 assert.deepEqual(await page.evaluate(id=>itemById(db,id).scheduledDates,ids_note),['2026-11-11']);
 assert.deepEqual(await day('2026-11-11'),['Written Tuesday']);
 await page.evaluate(()=>undo());
 // A double-click on the day shows the Notes from that day in the Outline too.
 await page.evaluate(()=>filterOutlineDay('2026-11-10'));
 assert.equal(await page.locator(`#tree .row[data-id="${ids_note}"]:not(.day-context-row)`).count(),1);
 assert.equal(await page.locator(`#tree .row[data-id="${await page.evaluate(()=>ids.todo)}"]`).count(),0);
 await page.evaluate(()=>clearOutlineDayFilter());
 // Off again: the Notes disappear and the setting is removed.
 await set('');
 assert.deepEqual(await day('2026-11-10'),['Scheduled todo','Scheduled note']);
 assert.equal(await page.evaluate(()=>'calendarNoteDates' in db.settings),false);
 assert.deepEqual(errors,[]);
 console.log('calendar note dates: ok');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
