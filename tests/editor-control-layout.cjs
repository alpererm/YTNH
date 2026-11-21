const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const path = require('node:path');
const {webkit, chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
  const browser = await engine.launch(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {});
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve(__dirname, '../app.html')).href);
    for (const width of [1500, 950]) {
      await page.setViewportSize({width, height:800});
      await page.evaluate(() => {
        installDatabase(createEmptyDatabase());
        const item = createItem(db, 'Note');
        item.content = 'Before\nOne paragraph\n## After';
        edit(item.id);
        focusBodyStart();
      });
      await page.keyboard.press('Control+h');
      const find = await page.getByLabel('Find text').boundingBox();
      const replace = await page.getByLabel('Replace with').boundingBox();
      assert.equal(find.x, replace.x);
      assert.equal(find.width, replace.width);
      const frame = await page.locator('#editorWorkspace .writingArea').boundingBox();
      for (const control of await page.locator('#documentFindBar input, #documentFindBar button').all()) {
        const box = await control.boundingBox();
        assert.ok(box.x >= frame.x && box.x + box.width <= frame.x + frame.width + 1);
      }
      await page.keyboard.press('Control+f');
      for (const key of ['Enter','Delete']) {
        await page.locator('#richEditor > div').nth(1).click({clickCount:3,position:{x:12,y:8}});
        await page.keyboard.press(key);
        const content = await page.evaluate(() => itemById(db,selected).content);
        assert.equal(content,key === 'Enter' ? 'Before\n\n## After' : 'Before\n## After');
        assert.equal(await page.evaluate(() => getSelection().isCollapsed),true);
        await page.evaluate(() => undo());
        assert.equal(await page.evaluate(() => itemById(db,selected).content),'Before\nOne paragraph\n## After');
      }
    }
    console.log('PASS Find field alignment, available width and triple-click paragraph replacement');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1});
