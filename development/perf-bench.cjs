// Performance bench: node perf-bench.cjs  (CHESS_TEST_EXTENSION selects the build)
const {chromium}=require('playwright-core');
const path=require('node:path');
const fs=require('node:fs');
const html=fs.readFileSync(path.join(__dirname,'website-smoke.cjs'),'utf8').match(/const html=`([\s\S]*?)`;/)[1].replaceAll('\\\\','\\');
(async()=>{
const ext=path.resolve(process.env.CHESS_TEST_EXTENSION||'../extension');
const context=await chromium.launchPersistentContext('/tmp/chess-bench-'+process.pid,{headless:true,
  executablePath:process.env.CHESS_TEST_CHROME||'/usr/bin/chromium',ignoreDefaultArgs:['--disable-extensions'],
  args:['--no-sandbox','--disable-extensions-except='+ext,'--load-extension='+ext]});
const out={};
try {
  await context.route('https://www.chess.com/**',r=>r.fulfill({contentType:'text/html',body:html,status:200}));
  const store=await context.newPage();
  await store.goto('chrome://extensions');
  const item=store.locator('extensions-item').filter({has:store.getByText('Chess Studio',{exact:true})});
  await item.waitFor();
  const base='chrome-extension://'+await item.getAttribute('id')+'/';
  const page=await context.newPage();
  await page.goto(base+'popup.html');
  Object.assign(out,await page.evaluate(async()=>{
    const {analyze}=await import('./engine.mjs');
    const {Chess}=await import('./vendor/chess.mjs');
    const r={};
    const time=async(label,fn)=>{const t=performance.now();await fn();r[label]=Math.round(performance.now()-t);};
    const a=new Chess(); a.move('e4'); a.move('e5'); a.move('Nf3');
    const b=new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNB1K2R w KQkq - 4 4');
    let first;
    await time('cold depth12 x3',()=>analyze(a,{depth:12,count:3,onProgress:l=>{first??=performance.now();}}));
    await time('warm new position depth12 x3',()=>analyze(b,{depth:12,count:3}));
    await time('repeat same position depth12 x3',()=>analyze(b,{depth:12,count:3}));
    const c=new Chess(); c.move('d4');
    let t0=performance.now(), firstLine;
    await time('depth16 x3',()=>analyze(c,{depth:16,count:3,onProgress:()=>{firstLine??=performance.now()-t0;}}));
    r['depth16 first streamed line']=firstLine===undefined?'n/a':Math.round(firstLine);
    const d=new Chess(); d.move('c4');
    await time('8 sequential depth8 x1 (scan)',async()=>{for(let i=0;i<8;i++){const g=new Chess(); g.move(['a3','b3','c3','d3','e3','f3','g3','h3'][i]); await analyze(g,{depth:8,count:1});}});
    const fens=['rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1','r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3','8/8/8/4k3/8/8/4P3/4K3 w - - 0 1','r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1','6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1'];
    const results=[];for(const f of fens){results.push(await analyze(new Chess(f),{depth:14,count:3}));results.push(await analyze(new Chess(f),{depth:10,count:1,only:new Chess(f).moves({verbose:true}).at(-1).lan}));}
    r.results=JSON.stringify(results);
    return r;
  }));
  const training=await context.newPage();
  await training.goto('https://www.chess.com/pt/play/computer');
  await training.evaluate(()=>loadPosition('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR',['e4','d5']));
  await page.waitForTimeout(800);
  const tabId=await page.evaluate(async()=>(await chrome.tabs.query({url:'https://www.chess.com/*'}))[0].id);
  const pos=await page.evaluate(id=>chrome.tabs.sendMessage(id,'chess-studio-position'),tabId);
  // capture cost: 200 forced captures through the message path is noisy; measure observer + timer CPU instead
  const cdp=await context.newCDPSession(training);
  await cdp.send('Performance.enable');
  const busy=async ms=>{const m0=(await cdp.send('Performance.getMetrics')).metrics;await training.waitForTimeout(ms);const m1=(await cdp.send('Performance.getMetrics')).metrics;
    const g=(m,n)=>m.find(x=>x.name===n).value;return {scriptMs:Math.round((g(m1,'ScriptDuration')-g(m0,'ScriptDuration'))*1000),taskMs:Math.round((g(m1,'TaskDuration')-g(m0,'TaskDuration'))*1000)};};
  out['idle 5s, no arrows']=await busy(5000);
  // persistent live arrow (owner port) stays forever: worst case for the old interval
  await page.evaluate(([id,fen])=>{const port=chrome.tabs.connect(id,{name:'chess-studio-live-arrows'});window.__port=port;port.postMessage({type:'chess-studio-mark',fen,lines:[{move:'g1f3',reply:'',showMove:true}]});},[tabId,pos.fen]);
  await training.waitForTimeout(300);
  out['arrow drawn']=await training.evaluate(()=>!!document.querySelector('svg, [class*=chess-studio]'));
  out['idle 5s, live arrow shown']=await busy(5000);
  // ms per capture (in-page timing of the same work via message round trip)
  const t=Date.now(); for(let i=0;i<50;i++) await page.evaluate(id=>chrome.tabs.sendMessage(id,'chess-studio-position'),tabId);
  out['position request round trip ms (avg of 50)']=+((Date.now()-t)/50).toFixed(2);
  out['busy 50 board updates (move/undo)']=await (async()=>{const p=busy(0);const m0=(await cdp.send('Performance.getMetrics')).metrics;
    for(let i=0;i<25;i++){await training.evaluate(()=>loadPosition('rnbqkbnr/ppp1pppp/8/3p4/4P3/5N2/PPPP1PPP/RNBQKB1R',['e4','d5','Nf3']));await training.evaluate(()=>loadPosition('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR',['e4','d5']));}
    await training.waitForTimeout(300);const m1=(await cdp.send('Performance.getMetrics')).metrics;const g=(m,n)=>m.find(x=>x.name===n).value;await p;return {scriptMs:Math.round((g(m1,'ScriptDuration')-g(m0,'ScriptDuration'))*1000)};})();
} finally { const res=out.results; delete out.results; if(process.env.BENCH_RESULTS) fs.writeFileSync(process.env.BENCH_RESULTS,res||''); console.log(JSON.stringify(out,null,1)); await context.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
