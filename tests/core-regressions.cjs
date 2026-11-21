// Shared local/CI entry point. Native behavior is covered separately by Rust tests.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const browserTests=[
  'editor-identity-row','editor-first-deletion',
  'editor-surface','pinned-shortcuts','quick-open-ranking','text-sizing','editor-width','inline-creation','local-fonts','mouse-history',
  'desktop-csp','item-markers','jump-to-date','outline-navigation','native-theme','settings',
  'keyboard-search','desktop-shortcuts','milestones','workspace-navigation',
  'autosave','bridge','cancelled-reopen','sqlite-desktop','portable-desktop','capture-focus',
  'editor-structure','image-editing','daily-planner','planner-outlook',
  'meeting-moves','outlook-cancellations','planner-validation',
  'editor-toprow','format-palette','interface','outline-layout',
  'palette-layout','source-menu','workspace-density','writing-border'
];
const requested=process.argv.slice(2);
if(requested.some(name=>!browserTests.includes(name)))throw Error('Unknown core test');
const engines=process.env.BROWSER_ENGINE?[process.env.BROWSER_ENGINE]:['chromium','webkit'];
if(engines.some(engine=>!['chromium','webkit'].includes(engine)))throw Error('Unknown browser engine');
let failed=0,passed=0;
function run(name,engine){
  const env={...process.env};
  if(engine)env.BROWSER_ENGINE=engine;
  // A Chromium executable override must never be handed to WebKit.
  if(engine==='webkit')delete env.BROWSER_PATH;
  const label=engine?engine+'/'+name:name;
  console.log('\nRUN '+label);
  const result=spawnSync(process.execPath,[path.join(__dirname,name+'.cjs')],{
    env,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024
  });
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  if(result.error)console.error(result.error.message);
  if(result.status===0){passed++;console.log('OK '+label)}
  else {failed++;console.error('FAIL '+label)}
}
if(!requested.length)run('planner-model');
for(const engine of engines)for(const name of requested.length?requested:browserTests)run(name,engine);
console.log('\nCore regressions: '+passed+' passed, '+failed+' failed');
process.exitCode=failed?1:0;
