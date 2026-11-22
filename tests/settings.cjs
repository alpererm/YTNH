// Settings are tabbed; these checks show every panel so each control can be reached directly.
const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await (process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch({...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1100,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
 await page.evaluate(()=>{localStorage.removeItem(APPEARANCE_KEY);appearance=normalizeAppearance(null);applyAppearance();installDatabase(createEmptyDatabase());const i=createItem(db,'Note');i.title='Settings test';i.content='Body text';edit(i.id)});
 const before=await page.evaluate(()=>JSON.stringify(db));
 const open=async()=>{await page.locator('#appMenu summary').first().click();await page.locator('#settingsBtn').click();await page.evaluate(()=>document.querySelectorAll('.settingsPanel').forEach(x=>x.hidden=false))};
 await open();await page.selectOption('#settingsFont','serif');await page.selectOption('#settingsEditorSize','20');await page.selectOption('#settingsInterfaceSize','16');await page.selectOption('#settingsTheme','dark');await page.locator('#modalOK').click();
 assert.equal(await page.evaluate(()=>JSON.stringify(db)),before);
 assert.equal(await page.locator('body').getAttribute('data-theme'),'dark');
 assert.equal(await page.locator('#richEditor').evaluate(e=>getComputedStyle(e).fontSize),'20px');
 assert.match(await page.locator('#richEditor').evaluate(e=>getComputedStyle(e).fontFamily),/Georgia/);
 // Settings apply as soon as they change; Escape only closes the dialog.
 await open();await page.selectOption('#settingsEditorSize','22');await page.keyboard.press('Escape');
 assert.equal(await page.locator('#modalbg.open').count(),0);assert.equal(await page.evaluate(()=>appearance.editorSize),22);
 await page.reload();assert.equal(await page.evaluate(()=>appearance.editorSize),22);assert.equal(await page.locator('body').getAttribute('data-theme'),'dark');
 // Restore defaults applies immediately too.
 await open();await page.locator('#settingsDefaults').click();
 assert.equal(await page.evaluate(()=>appearance.editorSize),await page.evaluate(()=>normalizeAppearance(null).editorSize));assert.equal(await page.locator('body').getAttribute('data-theme'),'light');
 await page.selectOption('#settingsTheme','dark');await page.keyboard.press('Escape');
 await open();await page.setViewportSize({width:360,height:640});await page.screenshot({path:require('node:path').join(require('node:os').tmpdir(),'settings-dark.png')});
 assert(await page.locator('#modalOK').isVisible());
 const fits=await page.locator('.modal').evaluate(e=>{const r=e.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.bottom<=innerHeight});assert(fits);
 await page.locator('#settingsDefaults').click();await page.locator('#modalOK').click();assert.equal(await page.evaluate(()=>appearance.editorSize),14);assert.equal(await page.locator('body').getAttribute('data-theme'),'light');
 await open();await page.selectOption('#settingsEditorSize','8');await page.selectOption('#settingsInterfaceSize','8');await page.locator('#modalOK').click();assert.equal(await page.evaluate(()=>appearance.editorSize),8);assert.equal(await page.locator('#richEditor').evaluate(e=>getComputedStyle(e).fontSize),'8px');await page.reload();assert.equal(await page.evaluate(()=>appearance.interfaceSize),8);assert.equal(await page.evaluate(()=>appearance.editorSize),8);assert.deepEqual(errors,[]);await browser.close();console.log('PASS settings save/reload, cancel, defaults, dark/narrow layout, and unchanged notes JSON');
})().catch(e=>{console.error(e);process.exit(1)});
