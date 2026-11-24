const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const engine = process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium;
  const browser = await engine.launch(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {});
  for (const [theme, expected, uiStyle] of [['midnight', 'dark', 'classic'], ['amber', 'dark', 'bear'], ['sepia', 'light', 'classic']]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../app.html')).href);
    const preferences = { theme, font: 'serif', interfaceSize: 10, editorSize: 16, spellcheck: false, language: 'tr', extra: 'keep' };
    await page.evaluate(data => localStorage.setItem(APPEARANCE_KEY, JSON.stringify(data)), { ...preferences, uiStyle });
    await page.reload();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem(APPEARANCE_KEY))), { ...preferences, theme: expected });
    assert.equal(await page.locator('body').getAttribute('data-theme'), expected);
    assert(await page.locator('#outlineGroupButton').isVisible());
    await page.evaluate(() => openSettings());
    assert.deepEqual(await page.locator('#settingsTheme option').allTextContents(), ['Paper White', 'Graphite Dark']);
    assert.equal(await page.locator('#settingsFont').inputValue(), 'serif');
    assert.equal(await page.locator('#settingsUIStyle').count(), 0);
    await page.locator('#modalOK').click();
    await page.evaluate(() => {
      autosaveEnabled = false;
      installDatabase(createEmptyDatabase());
      const target = createItem(db, 'Todo');
      target.title = 'Procurement';
      target.target = { startMonth: '2026-11', endMonth: '2027-03' };
      const milestone = createItem(db, 'Todo', target.id);
      milestone.title = 'Approval';
      milestone.milestone = { targetWeek: '2026-W46' };
      window.beforePicker = JSON.stringify(db);
      openQuickOpen();
    });
    assert.equal(await page.locator('.refResult').count(), 2);
    assert.equal(await page.locator('.refResult small:not(.refPath)').count(), 0);
    assert.equal(await page.locator('.refResult small.refPath').count(), 1, 'the child shows its parent path');
    assert.doesNotMatch(await page.locator('#refResults').innerText(), /target|milestone/i);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => JSON.stringify(db)), await page.evaluate(() => beforePicker));
    assert.deepEqual(errors, []);
    await page.close();
  }
  await browser.close();
  console.log('PASS upgrades from both preferences and Quick Open planning items');
})().catch(error => { console.error(error); process.exit(1); });
