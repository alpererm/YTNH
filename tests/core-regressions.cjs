// Shared local/CI entry point. Native behavior is covered separately by Rust tests.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
// Every tests/*.cjs file is a browser test except this runner, the Node-only planner model test
// (run once below) and the timing benchmark, which is informational.
const fs=require('node:fs');
const browserTests=fs.readdirSync(__dirname).filter(f=>f.endsWith('.cjs')).map(f=>f.slice(0,-4))
  .filter(name=>!['core-regressions','planner-model','outline-benchmark'].includes(name)).sort();
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
