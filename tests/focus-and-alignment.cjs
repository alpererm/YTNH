// No hidden editor caret while another pane has focus; Esc in Focus Mode returns to the editor when the
// editor is the default view; single-line Outline rows have equal space above and below the title, and
// icons sit on the title line (Outline and Daily Planner); Note icons use the Todo colour.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 const p=await browser.newPage({viewport:{width:1300,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
 await p.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());db.settings.hideWeekends=false;
  const a=createItem(db,'Todo');a.title='One';a.body='Body one';const n=createItem(db,'Note');n.title='Two';n.body='Body two';
  const c=createItem(db,'Todo');c.title='A long title that wraps over more than one line in the Outline pane, with plenty of words to be sure';
  window.ids={a:a.id,n:n.id,c:c.id};selected=a.id;render();edit(a.id)});
 await p.waitForTimeout(200);await p.click('#richEditor');await p.keyboard.type('x');
 await p.locator(`#tree .row[data-id]`).nth(1).locator('.title').click();await p.keyboard.press('ArrowUp');await p.waitForTimeout(200);
 assert.equal(await p.evaluate(()=>{const n=getSelection().anchorNode;return !!n&&$('richEditor').contains(n)}),false,'no caret left in the editor while the Outline has focus');

 // Single-line rows: equal top and bottom space; icons centred on the first line.
 await p.evaluate(()=>{showCalendar();focusPane('calendar')});
 for(const id of await p.evaluate(()=>[ids.a,ids.n])){
   const g=await p.evaluate(id=>{const r=document.querySelector(`#tree .row[data-id="${id}"]`),R=r.getBoundingClientRect(),T=r.querySelector('.outlineText').getBoundingClientRect(),t=r.querySelector('.title').getBoundingClientRect(),m=r.querySelector('.itemMarker svg').getBoundingClientRect();return {top:T.top-R.top,bottom:R.bottom-T.bottom,off:(m.top+m.height/2)-(t.top+t.height/2)}},id);
   assert(Math.abs(g.top-g.bottom)<1,'equal row margins '+JSON.stringify(g));assert(Math.abs(g.off)<1.5,'icon on title line '+JSON.stringify(g));
 }
 assert.equal(await p.evaluate(()=>{const c=s=>getComputedStyle(document.querySelector(s)).color;return c(`#tree [data-marker-id="${ids.n}"]`)===c(`#tree [data-marker-id="${ids.a}"]`)}),true,'Note icon uses the Todo colour');

 // Daily Planner: the icon is centred on the title line.
 await p.evaluate(()=>{const d=today();PlannerModel.session(db,itemById(db,ids.a),d,600,60);PlannerModel.session(db,itemById(db,ids.n),d,720,30);render();DailyPlanner.open(false)});
 await p.waitForTimeout(200);
 for(const g of await p.evaluate(()=>[...document.querySelectorAll('.planBlock')].map(b=>{const t=b.querySelector('.planTitle').getBoundingClientRect(),m=b.querySelector('.itemMarker svg').getBoundingClientRect(),B=b.getBoundingClientRect();return {off:(m.top+m.height/2)-(t.top+t.height/2),top:t.top-B.top}})))
   {assert(Math.abs(g.off)<1.5,'planner icon on title line '+JSON.stringify(g));assert(g.top>=3,'title has room at the top')}

 // Editor-first: Esc in Focus Mode returns to the editor (from writing and from the Calendar).
 await p.evaluate(()=>{appearance.defaultView='editor';edit(ids.a);$('layout').dataset.view='editor';$('richEditor').focus();setEditorFocus(true)});
 await p.keyboard.press('Escape');
 assert.deepEqual(await p.evaluate(()=>[$('layout').classList.contains('editor-focus'),editorIsOpen(),$('layout').dataset.view]),[false,true,'editor']);
 await p.evaluate(()=>{showCalendar();focusPane('calendar');setEditorFocus(true)});
 await p.keyboard.press('Escape');
 assert.deepEqual(await p.evaluate(()=>[$('layout').classList.contains('editor-focus'),editorIsOpen(),$('layout').dataset.view]),[false,true,'editor'],'Esc goes back to the editor, not the Calendar');
 // Calendar-first keeps its behaviour: Esc leaves Focus Mode and closes the editor.
 await p.evaluate(()=>{appearance.defaultView='calendar';edit(ids.a);$('richEditor').focus();setEditorFocus(true)});
 await p.keyboard.press('Escape');
 assert.deepEqual(await p.evaluate(()=>[$('layout').classList.contains('editor-focus'),editorIsOpen()]),[false,false]);

 // Editor toolbar: Focus Mode comes before the sidebar toggle.
 await p.evaluate(()=>edit(ids.a));
 assert(await p.evaluate(()=>$('editorFocusToggle').getBoundingClientRect().left<$('sidebarToggle').getBoundingClientRect().left));
 // A parent whose only children are hidden (here: weekend-only items while weekends are hidden) shows no arrow.
 const arrows=await p.evaluate(()=>{installDatabase(createEmptyDatabase());db.settings.hideWeekends=true;const parent=createItem(db,'Todo');parent.title='Parent';const kid=createItem(db,'Todo',parent.id);kid.title='Saturday only';kid.scheduledDates=['2026-11-21'];const other=createItem(db,'Todo');other.title='Other parent';const visibleKid=createItem(db,'Note',other.id);visibleKid.title='Visible';render();
   const has=id=>!!document.querySelector(`#tree .row[data-id="${id}"] > .outlineChevron`);return [has(parent.id),has(other.id)]});
 assert.deepEqual(arrows,[false,true],'arrows only for children that are shown');
 // No caret in an unfocused editor.
 assert.equal(await p.evaluate(()=>{edit(db.items[0].id);document.activeElement?.blur();return getComputedStyle($('richEditor')).caretColor}),'rgba(0, 0, 0, 0)');
 // A planned item without a date keeps the rightmost icon column free.
 const slot=await p.evaluate(()=>{const i=createItem(db,'Todo');i.title='Planned only';PlannerModel.session(db,i,today(),1200,30);i.scheduledDates=[];render();return [...document.querySelector(`#tree .row[data-id="${i.id}"] .outlineNavigation`).children].map(c=>c.dataset.outlineNavigation||c.className)});
 assert.deepEqual(slot,['clock','navigationSlot']);
 assert.deepEqual(errors,[]);
 await browser.close();console.log('PASS hidden caret, Focus Mode Esc in editor-first, row/planner alignment, Note colour, button order');
})().catch(e=>{console.error(e);process.exit(1)});
