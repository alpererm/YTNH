// Quick Open: '>' lists commands and settings; plain text still finds items.
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const path=require('node:path');const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
  await page.evaluate(()=>{autosaveEnabled=false;installDatabase(createEmptyDatabase());const n=createItem(db,'Note');n.title='Supplier archive notes';render()});
  const run=async text=>{await page.evaluate(()=>openQuickOpen());await page.fill('#refSearch',text);await page.keyboard.press('Enter');await page.waitForTimeout(80)};
  // Plain text still finds items, not commands.
  await page.evaluate(()=>openQuickOpen());await page.fill('#refSearch','archive');
  assert.equal(await page.locator('#refResults .commandResult').count(),0);
  assert.match(await page.locator('#refResults').innerText(),/Supplier archive notes/);
  // '>' lists commands, filtered by words.
  await page.fill('#refSearch','>');assert.ok(await page.locator('#refResults .commandResult').count()>30);
  await page.fill('#refSearch','> arch compl');assert.deepEqual(await page.locator('#refResults .commandResult').allInnerTexts(),['›\nArchive Completed…']);
  await page.keyboard.press('Escape');
  await run('> archive completed');
  await page.waitForSelector('#appConfirmTitle, .toast',{timeout:3000});
  assert.equal(await page.evaluate(()=>document.getElementById('modalTitle').textContent),'Archive');
  await page.evaluate(()=>{document.querySelector('dialog.libraryDialog')?.remove();closeModalShell()});
  // Settings change through the Settings dialog's own controls and are saved.
  await run('> theme graphite');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(APPEARANCE_KEY)).theme),'dark');
  await run('> spell off');
  assert.equal(await page.evaluate(()=>appearance.spellcheck),false);
  await run('> spell on');
  assert.equal(await page.evaluate(()=>appearance.spellcheck),true);
  // Complex settings open the right tab with the control focused.
  await run('> font');
  assert.equal(await page.evaluate(()=>document.getElementById('modalTitle').textContent),'Settings');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'settingsFont');
  await page.evaluate(()=>closeModalShell());
  await run('> weekends off');
  assert.equal(await page.evaluate(()=>db.settings.hideWeekends),true);
  assert.deepEqual(errors,[]);
  console.log('PASS Quick Open commands and settings with >');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
