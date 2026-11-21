// Regression for packaged Tauri style nonces. file:// tests alone miss these failures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webkit, chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await (process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium).launch(
    process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const csp = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'))).app.security.csp;
    await page.route('http://desktop-csp.local/**', route => {
      const name = new URL(route.request().url()).pathname.slice(1) || 'app.html';
      let body = fs.readFileSync(path.join(root, name));
      const headers = {};
      if (name === 'app.html') {
        // Tauri adds nonces to style blocks and style-src. They invalidate unsafe-inline
        // for HTML style attributes, while CSSOM property assignments remain allowed.
        body = body.toString().replaceAll('<style>', '<style nonce="regression">');
        headers['Content-Security-Policy'] = csp.replace(/style-src([^;]*)/, "$& 'nonce-regression'");
      }
      return route.fulfill({ body, headers, contentType: name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : 'application/javascript' });
    });
    await page.goto('http://desktop-csp.local/app.html');
    // Prove the test really enforces the policy rather than accidentally running without it.
    assert.equal(await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.innerHTML = '<div style="--blocked-probe:yes"></div>';
      document.body.append(probe);
      const value = getComputedStyle(probe.firstChild).getPropertyValue('--blocked-probe');
      probe.remove(); return value;
    }), '');
    await page.evaluate(() => {
      window.notesDesktop = { sqlite: { imageEditing: true, async readImage() {
        return { extension: 'svg', data: btoa('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="red"/></svg>') };
      } } };
      initManagedImageImports(); installDatabase(createEmptyDatabase());
      const parent = createItem(db, 'Todo'), child = createItem(db, 'Todo', parent.id), grandchild = createItem(db, 'Todo', child.id);
      window.fixtureIds = [parent.id, child.id, grandchild.id];
      const hash = 'a'.repeat(64); db.imageAssets = { [hash]: { extension: 'svg', bytes: 10 } };
      storage.handle = { sqlite: true, id: 'fixture', async saveModel() {} };
      parent.content = managedImageMarkdown('Fixture', hash, 'svg');
      edit(parent.id); renderTree();
    });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => applyTheme(theme), theme);
      for (const grouping of ['', 'created', 'scheduled', 'type', 'tag', 'status', 'target']) {
        await page.evaluate(grouping => { db.settings.groupBy = grouping; renderTree(); }, grouping);
        const depths = await page.locator('#tree .row').evaluateAll(nodes => nodes.map(n => Number(getComputedStyle(n).getPropertyValue('--hierarchy-depth'))));
        assert.deepEqual(depths, [0, 1, 2], theme + ' / ' + grouping);
        assert.equal(await page.locator('.outlineHierarchyGuides').count(),0);
      }
    }
    await page.evaluate(() => { db.settings.pinnedItems = [fixtureIds[0]]; renderTree(); });
    assert.equal(await page.locator('#pinnedOutline .pinEntry').count(),1);
    assert.equal(await page.locator('#pinnedOutline .pinExpand').count(),0);
    await page.waitForFunction(() => document.querySelector('.imagePixels img')?.naturalWidth === 600);
    const pixels = page.locator('.imagePixels img');
    await pixels.click();
    const handle = await page.locator('[data-corner=se]').boundingBox();
    await page.mouse.move(handle.x + 3, handle.y + 3); await page.mouse.down();
    await page.mouse.move(handle.x - 150, handle.y - 75, { steps: 5 }); await page.mouse.up();
    const saved = await page.evaluate(() => ({ content: editorDocument().content, width: document.querySelector('.managedFigure').getBoundingClientRect().width }));
    assert.match(saved.content, /width="\d+"/);
    await page.evaluate(() => { edit(fixtureIds[1]); edit(fixtureIds[0]); });
    await page.waitForFunction(() => document.querySelector('.imagePixels img')?.naturalWidth === 600);
    assert.equal(await pixels.evaluate(n => n.getBoundingClientRect().width), saved.width);
    assert.equal(await page.evaluate(() => editorDocument().content), saved.content);
    await page.evaluate(() => { $('sourceToggle').click(); $('sourceToggle').click(); });
    await page.waitForFunction(() => document.querySelector('.imagePixels img')?.naturalWidth === 600);
    assert.equal(await pixels.evaluate(n => n.getBoundingClientRect().width), saved.width);
    const snapshot = await page.evaluate(() => JSON.stringify(db));
    await page.evaluate(snapshot => { installDatabase(JSON.parse(snapshot)); edit(fixtureIds[0]); }, snapshot);
    await page.waitForFunction(() => document.querySelector('.imagePixels img')?.naturalWidth === 600);
    assert.equal(await pixels.evaluate(n => n.getBoundingClientRect().width), saved.width);
    for(const theme of ['light','dark']){
      for(const width of [900,1400]){
        await page.setViewportSize({width,height:900});
        await page.evaluate(theme=>{applyTheme(theme);chooseReference(false,()=>{},{title:'Locations',describe:i=>'Parent / '+i.title})},theme);
        assert.equal(await page.locator('.refLocationDescription').first().evaluate(el=>getComputedStyle(el).display),'block');
        assert.equal(await page.locator('#repeatInterval').evaluate(el=>getComputedStyle(el).maxWidth),'90px');
        await page.keyboard.press('Escape');
      }
    }
    await page.evaluate(()=>{closeModalShell();editorDocument().content='## <span data-text-size="27">Sized heading</span>';syncRichFromModel(editorDocument())});
    assert.equal(await page.locator('#richEditor [data-text-size]').evaluate(el=>getComputedStyle(el).fontSize),'27px');
    await page.evaluate(()=>{setSourceMode(true);setSourceMode(false)});
    assert.equal(await page.locator('#richEditor [data-text-size]').evaluate(el=>getComputedStyle(el).fontSize),'27px');
    assert.deepEqual(errors, []);
    console.log('PASS enforced desktop CSP: hierarchy in every grouping/theme, flat pins, resized image after navigation, Source and reload');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
