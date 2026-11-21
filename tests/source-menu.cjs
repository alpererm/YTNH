const {chromium,webkit}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const b=await ({chromium,webkit}[process.env.BROWSER_ENGINE||'chromium']).launch(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{});
 try{
  const p=await b.newPage({viewport:{width:1500,height:950}});
  await p.goto(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app.html')).href);
  await p.evaluate(()=>{installDatabase(createEmptyDatabase());const i=createItem(db,'Note');i.content='**Bold**';edit(i.id)});
  assert.equal(await p.locator('.editmeta > #sourceToggle').count(),0);
  assert.equal(await p.locator('.editmeta > #editorTitle').count(),1);
  async function geometry(){return p.locator('#richEditor').evaluate(e=>{
   const r=e.getBoundingClientRect(),scroll=e.closest('.documentScroll'),v=scroll.getBoundingClientRect(),frame=e.closest('.writingArea').getBoundingClientRect(),s=getComputedStyle(scroll);
   return {width:r.width,available:scroll.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),left:r.left,right:r.right,viewportLeft:v.left,viewportRight:v.right,frameWidth:frame.width,padding:getComputedStyle(e).paddingLeft};
  })}
  function fits(g){return Math.abs(g.width-g.available)<=1&&g.left>=g.viewportLeft&&g.right<=g.viewportRight+1&&g.padding==='44px'}
  assert(fits(await geometry()),JSON.stringify(await geometry()));
  // Model a reserved strip independently of macOS overlay-scrollbar preferences.
  // Linux classic scrollbars also reduce clientWidth without shrinking the frame.
  const strip=await p.addStyleTag({content:'.documentScroll{border-right:15px solid transparent!important}'});
  const reserved=await geometry();assert(reserved.frameWidth-reserved.width>3);assert(fits(reserved),JSON.stringify(reserved));
  // Prove the geometry assertion still rejects an incorrectly narrowed editor.
  await p.locator('#richEditor').evaluate(e=>e.style.width='50%');assert.equal(fits(await geometry()),false);
  await p.locator('#richEditor').evaluate(e=>e.style.removeProperty('width'));await strip.evaluate(e=>e.remove());
  assert(fits(await geometry()));
  for(let n=0;n<2;n++){await p.locator('#formatMenu summary').click();await p.locator('#sourceToggle').click();assert.equal(await p.evaluate(()=>sourceMode()),n===0)}
  assert.equal(await p.locator('#richEditor strong').textContent(),'Bold');
  console.log('PASS header title, available writing width with reserved space, deliberate narrow-width rejection and Source/Rich round trip');
 }finally{await b.close()}
})().catch(e=>{console.error(e);process.exit(1)});
