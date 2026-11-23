// Two extension views analysing the same positions: latency + browser memory.
const {chromium}=require('playwright-core');
const path=require('node:path');
const {execSync}=require('node:child_process');
(async()=>{
const ext=path.resolve(process.env.CHESS_TEST_EXTENSION||'../extension');
const dir='/tmp/chess-views-'+process.pid;
const context=await chromium.launchPersistentContext(dir,{headless:true,
  executablePath:process.env.CHESS_TEST_CHROME||'/usr/bin/chromium',ignoreDefaultArgs:['--disable-extensions'],
  args:['--no-sandbox','--disable-extensions-except='+ext,'--load-extension='+ext]});
const rss=()=>Math.round(execSync(`ps -axo rss,command | grep -F "${dir}" | grep -v grep | awk '{s+=$1} END {print s}'`).toString()/1024);
const out={};
try{
  const store=await context.newPage();await store.goto('chrome://extensions');
  const item=store.locator('extensions-item').filter({has:store.getByText('Chess Studio',{exact:true})});await item.waitFor();
  const base='chrome-extension://'+await item.getAttribute('id')+'/';
  const views=[await context.newPage(),await context.newPage()];
  for(const v of views) await v.goto(base+'popup.html');
  await views[0].waitForTimeout(1000);
  out['RSS MB, two views idle']=rss();
  const run=(v,moves,depth)=>v.evaluate(async([moves,depth])=>{const {analyze}=await import('./engine.mjs');const {Chess}=await import('./vendor/chess.mjs');
    const g=new Chess();for(const m of moves)g.move(m);const t=performance.now();await analyze(g,{depth,count:3});return Math.round(performance.now()-t);},[moves,depth]);
  const both=async(moves,depth)=>(await Promise.all(views.map(v=>run(v,moves,depth))));
  out['both views, first position d16 (ms each)']=await both(['e4','c5'],16);
  let peak=0;const sampler=setInterval(()=>{peak=Math.max(peak,rss());},100);
  out['both views, next position d20 (ms each)']=await both(['e4','c5','Nf3'],20);
  clearInterval(sampler);out['RSS MB, peak during a shared search']=peak;
  out['both views, takeback to previous (ms each)']=await both(['e4','c5'],16);
  out['RSS MB, two views after search (warm)']=rss();
  await views[0].waitForTimeout(50000);
  out['RSS MB, 50 s after last search']=rss();
}finally{console.log(JSON.stringify(out,null,1));await context.close();}
})().catch(e=>{console.error(e);process.exit(1);});
