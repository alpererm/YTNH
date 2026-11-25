const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
  const browser = await engine.launch(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  await page.goto(pathToFileURL(path.resolve(__dirname, '../app.html')).href);
  await page.evaluate(() => {
    autosaveEnabled = false;
    installDatabase(createEmptyDatabase());
    const note = createItem(db, 'Note');
    note.title = 'Confirm a long delivery schedule with the supplier and the engineering team';
    note.scheduledDates = ['2026-11-06'];
    window.noteId = note.id;
    window.original = JSON.stringify(db);
    selected = note.id;
    weekAnchor = new Date(2026, 10, 6, 12);
    render(); showCalendar(); centerCurrentWeekRow();
  });
  async function aligned(selectors) {
    const offsets = await page.evaluate(list => list.map(selector => {
      const box = document.querySelector(selector).getBoundingClientRect();
      return [selector, box.y + box.height / 2];
    }), selectors);
    assert(Math.max(...offsets.map(x=>x[1]))-Math.min(...offsets.map(x=>x[1]))<=1.5,JSON.stringify(offsets));
  }
  await aligned(['#appMenu>summary','#outlineSearchButton','#weeksEarlier','#calendarPeriodTitle','#today','#weekMode','#yearsMode']);
  await page.keyboard.press('Control+Shift+f');
  await page.locator('#search').fill('delivery');
  await aligned(['#appMenu>summary','#search','#weeksLater']);
  const item = page.locator('.day[data-date="2026-11-06"] .calendarItemTitle').first();
  assert(await item.evaluate(el=>el.scrollWidth>el.clientWidth||el.scrollHeight>el.clientHeight));
  await item.hover();
  await page.waitForSelector('#calendarTooltip');
  assert.equal(await page.locator('#calendarTooltip').innerText(),await item.innerText());
  await page.locator('.day[data-date="2026-11-06"]').dblclick({position:{x:8,y:8}});
  await page.waitForFunction(()=>!$('outlineSearchSlot').classList.contains('search-expanded'));
  assert.equal(await page.locator('#search').inputValue(),'');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>outlineDayFilter),'2026-11-13');
  await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(()=>outlineDayFilter),'2026-11-06');
  await page.evaluate(()=>{db.settings.hideWeekends=false;renderCalendar();focusPane('calendar')});
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>outlineDayFilter),'2026-11-07');
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(()=>{db.settings.hideWeekends=true;clearOutlineDayFilter();edit(noteId);focusBodyStart()});
  await aligned(['#appMenu>summary','#formatMenu>summary','#editorFocusToggle','#sidebarToggle']);
  // A wrapped title grows downwards; only the controls share a centerline.
  async function titleFits() {
    const geometry=await page.locator('#editorTitle').evaluate(el=>{
      const r=el.getBoundingClientRect(),header=el.closest('.editmeta').getBoundingClientRect();
      const css=getComputedStyle(el);
      return {inside:r.left>=header.left-1&&r.right<=header.right+1,
        noHorizontalOverflow:el.scrollWidth<=el.clientWidth+1,
        // Existing title height is capped; excess text must remain scrollable.
        accessibleText:el.scrollHeight<=el.clientHeight+1||
          (['auto','scroll'].includes(css.overflowY)&&Math.abs(r.height-parseFloat(css.maxHeight))<=1),
        lines:(r.height-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom))/parseFloat(css.lineHeight)};
    });
    assert(geometry.inside&&geometry.noHorizontalOverflow&&geometry.accessibleText,JSON.stringify(geometry));
    return geometry;
  }
  await page.evaluate(()=>{$('editorTitle').value+=' Additional title text '.repeat(5);resizeDocumentTitle()});
  assert((await titleFits()).lines>=2,'Long title should wrap without moving toolbar controls');
  await page.evaluate(()=>{$('editorTitle').value='Short title';resizeDocumentTitle()});
  await aligned(['#appMenu>summary','#formatMenu>summary','#editorFocusToggle','#sidebarToggle']);
  await page.setViewportSize({width:1000,height:800});
  await page.evaluate(()=>{$('editorTitle').value+=' — '.repeat(3)+'Additional title text '.repeat(6);resizeDocumentTitle()});
  await aligned(['#appMenu>summary','#formatMenu>summary','#editorFocusToggle','#sidebarToggle']);
  assert((await titleFits()).lines>=2,'Narrow layout must retain the wrapped title');
  await page.evaluate(()=>{$('editorTitle').value=itemById(db,noteId).title;resizeDocumentTitle()});
  await page.setViewportSize({width:1500,height:900});
  await page.keyboard.press('Meta+Shift+f');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'search');
  await page.locator('#search').fill('supplier');
  await page.locator('#richEditor').click();
  await page.waitForFunction(()=>!$('outlineSearchSlot').classList.contains('search-expanded'));
  assert.equal(await page.evaluate(()=>document.activeElement.id),'richEditor');
  assert.equal(await page.evaluate(()=>getComputedStyle($('editorSidebar')).borderRightWidth),'0px');
  assert.equal(await page.evaluate(()=>getComputedStyle($('editorSidebar')).borderLeftWidth),'1px');
  await page.evaluate(()=>{const i=createItem(db,'Todo');i.target={startMonth:'2026-01',endMonth:'2027-01'};const t=createItem(db,'Todo');t.target={startMonth:'2026-11',endMonth:'2029-04'};t.title='A long running target';window.targetId=t.id;showCalendar();calendarMode='years';yearsPageStart=2026;renderCalendar()});
  const bars=page.locator('.targetBar').filter({hasText:'A long running target'});
  assert.equal(await bars.count(),4);
  assert.equal(new Set(await bars.evaluateAll(els=>els.map(el=>el.dataset.lane))).size,1);
  assert.match(await bars.first().getAttribute('title'),/Nov 2026 – Apr 2029/);
  await aligned(['#appMenu>summary','#yearsPrevious','#yearsNext','#yearsMode']);
  await page.evaluate(()=>openHelp());
  await page.keyboard.press('Control+Shift+f');
  await page.waitForFunction(()=>document.activeElement.id==='search');
  assert.equal(await page.locator('#modalbg.open').count(),0);
  await browser.close();
  console.log('PASS search handoff, shortcuts, calendar titles/tooltips, day stepping, aligned headers and cross-year lanes');
})().catch(error=>{console.error(error);process.exit(1)});
