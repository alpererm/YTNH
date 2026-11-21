const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');const {pathToFileURL}=require('node:url');const path=require('node:path');
(async()=>{
 const b=await(process.env.BROWSER_ENGINE==='webkit'?webkit:chromium).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 for(const installed of [[],['bearSans','avenir','avenirNext']]){
  const p=await b.newPage({viewport:{width:1200,height:800}}),errors=[],remote=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))remote.push(r.url())});
  await p.addInitScript(installed=>{
   const Native=window.FontFace;
   window.FontFace=function(name,source,...rest){
    if(!name.startsWith('YuTaNoHeLocalProbe'))return new Native(name,source,...rest);
    if(!source.split(',').every(s=>s.trim().startsWith('local(')))throw new Error('Font probe must be local');
    return {load:()=>installed.includes(name.replace('YuTaNoHeLocalProbe',''))?Promise.resolve():Promise.reject(new Error('Not installed'))};
   };
  },installed);
  await p.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);
  await p.evaluate(async()=>{await localFontsReady;autosaveEnabled=false;installDatabase(createEmptyDatabase());window.note=createItem(db,'Note');note.title='Meeting notes';window.todo=createItem(db,'Todo');todo.title='Call supplier';selected=todo.id;render();focusOutlineItem(todo.id)});
  assert.equal(await p.locator('#undoBtn,#redoBtn,.appMenuSection>strong').count(),0);
  await p.evaluate(()=>{checkpoint();todo.title='Changed';touch(db,todo);renderTree();focusOutlineItem(todo.id)});
  await p.keyboard.press('Control+z');assert.equal(await p.evaluate(()=>itemById(db,todo.id).title),'Call supplier');
  await p.keyboard.press('Control+Shift+z');assert.equal(await p.evaluate(()=>itemById(db,todo.id).title),'Changed');
  for(const theme of ['light', 'dark']){
   await p.evaluate(t=>{appearance.theme=t;applyTheme();$('appMenu').open=true},theme);
   for(const button of await p.locator('.appMenuBody button').all())assert.equal(await button.evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');
   for(const divider of await p.locator('.appMenuSection+.appMenuSection').all())assert.equal(await divider.evaluate(e=>getComputedStyle(e).borderTopWidth),'1px');
   if(installed.length===0)await p.screenshot({path:`/private/tmp/compact-menu-${theme}.png`});
   await p.evaluate(()=>$('appMenu').open=false);
  }
  await p.evaluate(()=>{window.before=JSON.stringify(db);openQuickOpen()});
  assert.equal(await p.locator('.refResult small').count(),0);assert.equal(await p.locator('[data-ref-pick]').count(),2);
  await p.locator('#refSearch').press('Escape');await p.evaluate(()=>openSettings());
  assert.deepEqual(await p.locator('#settingsFont option').evaluateAll(options=>options.map(o=>o.value).filter(v=>['bearSans','avenir','avenirNext'].includes(v))),installed);
  if(installed.length){await p.selectOption('#settingsFont','avenirNext');await p.locator('#modalOK').click();assert.match(await p.locator('#richEditor').evaluate(e=>getComputedStyle(e).fontFamily),/Avenir Next/);await p.reload();assert.equal(await p.evaluate(()=>appearance.font),'avenirNext');await p.evaluate(()=>openSettings());assert.equal(await p.locator('#settingsFont').inputValue(),'avenirNext')}
  else {assert.equal(await p.evaluate(()=>JSON.stringify(db)),await p.evaluate(()=>before));await p.locator('#modalOK').click()}
  assert.deepEqual(remote,[]);assert.deepEqual(errors,[]);await p.close();
 }
 const real=await b.newPage();await real.goto(pathToFileURL(path.resolve(__dirname,'../app.html')).href);console.log('Installed font probes:',await real.evaluate(async()=>{await localFontsReady;return [...availableLocalFonts]}));
 await b.close();console.log('PASS compact borderless menu in two themes, keyboard undo/redo, Quick Open labels, installed-only font choices, persistence and no network font requests');
})().catch(e=>{console.error(e);process.exit(1)});
