const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {webkit, chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await (process.env.BROWSER_ENGINE === 'webkit' ? webkit : chromium)
    .launch(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {});
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.resolve(__dirname, '../app.html')).href);
    const result = await page.evaluate(() => {
      installDatabase(createEmptyDatabase());
      const hash = 'b'.repeat(64), alt = 'Map [west] "A" <img src=x>';
      const reference = managedImageMarkdown(alt, hash, 'png');
      const content = 'Before\n'+reference+'\nAfter';
      storage.handle = {sqlite:true};
      db.imageAssets = {[hash]:{extension:'png'}};
      const holder = document.createElement('div');
      holder.innerHTML = markdownToEditorHTML(content);
      return {
        source:editorHTMLToMarkdown(holder), original:content,
        types:[...holder.children].map(x=>x.dataset.mdblock),
        injection:!!holder.querySelector('img,script'),alt:holder.querySelector('[role=img]').ariaLabel,
        matches:managedImageLine(reference).alt===alt,
        traversal:managedImageLine('![x](assets/../private.png)'),
        fenced:markdownToEditorHTML('```\n'+reference+'\n```').includes('data-mdblock="image"')
      };
    });
    assert.equal(result.original,result.source);
    assert.deepEqual(result.types,['p','image','p']);
    assert.equal(result.alt,'Map [west] "A" <img src=x>');
    assert.equal(result.injection,false);
    assert.equal(result.matches,true);
    assert.equal(result.traversal,null);
    assert.equal(result.fenced,false);
    console.log('PASS managed image reference and missing-image round trip');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
