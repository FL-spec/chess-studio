// Engine pool, de-duplication, cache and cancellation.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
const ext=path.resolve(process.env.CHESS_TEST_EXTENSION||'../extension');
const context=await chromium.launchPersistentContext('/tmp/chess-engine-'+process.pid,{headless:true,
  executablePath:process.env.CHESS_TEST_CHROME||'/usr/bin/chromium',ignoreDefaultArgs:['--disable-extensions'],
  args:['--no-sandbox','--disable-extensions-except='+ext,'--load-extension='+ext]});
try {
  const store=await context.newPage();
  await store.goto('chrome://extensions');
  const item=store.locator('extensions-item').filter({has:store.getByText('Chess Studio',{exact:true})});
  await item.waitFor();
  const page=await context.newPage();
  await page.goto('chrome-extension://'+await item.getAttribute('id')+'/popup.html');
  const r=await page.evaluate(async()=>{
    let spawned=0;const Native=Worker;
    window.Worker=class extends Native{constructor(...a){super(...a);spawned++;}};
    try{delete chrome.offscreen;}catch{} if(chrome.offscreen) Object.defineProperty(chrome,'offscreen',{value:undefined});
    const {analyze}=await import('./engine.mjs');
    const {Chess}=await import('./vendor/chess.mjs');
    const out={};
    const a=new Chess();a.move('e4');
    let progress=0;
    const [x,y]=await Promise.all([analyze(a,{depth:10,onProgress:()=>progress++}),analyze(a,{depth:10})]);
    out.shared=JSON.stringify(x)===JSON.stringify(y);out.spawnedShared=spawned;out.progress=progress;
    x[0].pv.length=0;
    const z=await analyze(a,{depth:10});
    out.cacheCopy=z[0].pv.length>0&&JSON.stringify(z)===JSON.stringify(y);out.spawnedCache=spawned;
    const b=new Chess();b.move('d4');
    const c1=new AbortController();
    const p1=analyze(b,{depth:22,signal:c1.signal});const p2=analyze(b,{depth:22});
    c1.abort();
    out.abortRejects=await p1.then(()=>false,e=>e.name==='AbortError');
    const c2=new AbortController();
    const c=new Chess();c.move('c4');
    const p3=analyze(c,{depth:30,signal:c2.signal});
    setTimeout(()=>c2.abort(),200);
    out.longAbort=await p3.then(()=>false,e=>e.name==='AbortError');
    out.otherSurvives=(await p2).length===3;
    const d=new Chess();d.move('Nf3');
    out.afterAbort=(await analyze(d,{depth:8})).length===3;
    // Several restricted moves in one MultiPV search (Pro candidates).
    const only=await analyze(new Chess(),{depth:8,count:3,only:'a2a3 h2h3 b1a3'});
    out.onlyMany=only.length===3&&new Set(only.map(l=>l.pv[0])).size===3&&only.every(l=>['a2a3','h2h3','b1a3'].includes(l.pv[0]));
    out.spawnedTotal=spawned;
    out.reference=JSON.stringify(await analyze(new Chess('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'),{depth:14,count:3}));
    return out;
  });
  console.log({...r,reference:undefined});
  assert.equal(r.onlyMany,true);
  assert.equal(r.shared,true);assert.equal(r.spawnedShared,1);assert.ok(r.progress>=8);
  assert.equal(r.cacheCopy,true);assert.equal(r.spawnedCache,1);
  assert.equal(r.abortRejects,true);assert.equal(r.longAbort,true);assert.equal(r.otherSurvives,true);assert.equal(r.afterAbort,true);
  assert.ok(r.spawnedTotal<=2,'warm workers are reused');
  // Offscreen path: two views share one host, one search and one cache.
  const base='chrome-extension://'+await item.getAttribute('id')+'/';
  const views=[await context.newPage(),await context.newPage()];
  await views[0].goto(base+'popup.html');await views[1].goto(base+'popup.html');
  const hook=()=>{window.__spawned=0;const N=Worker;window.Worker=class extends N{constructor(...a){super(...a);window.__spawned++;}};};
  for(const v of views) await v.evaluate(hook);
  const job=v=>v.evaluate(async()=>{const {analyze}=await import('./engine.mjs');const {Chess}=await import('./vendor/chess.mjs');
    const g=new Chess('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');let p=0;
    const t=performance.now();const lines=await analyze(g,{depth:14,count:3,onProgress:()=>p++});return {lines:JSON.stringify(lines),ms:performance.now()-t,p};});
  const [v1,v2]=await Promise.all(views.map(job));
  const hosts=await views[0].evaluate(async()=>(await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})).length);
  const spawnedInViews=await Promise.all(views.map(v=>v.evaluate(()=>window.__spawned)));
  const again=await job(views[1]);
  console.log({hosts,spawnedInViews,ms:[v1.ms,v2.ms,again.ms].map(Math.round),progress:[v1.p,v2.p]});
  assert.equal(hosts,1);assert.deepEqual(spawnedInViews,[0,0]);
  assert.equal(v1.lines,v2.lines);assert.equal(again.lines,v1.lines);assert.ok(v1.p>0&&v2.p>0);
  assert.ok(again.ms<50,'shared cache serves the second view');
  assert.equal(v1.lines,r.reference,'offscreen result equals in-page result');
  // Cancel through the host, then search again.
  const cancelled=await views[0].evaluate(async()=>{const {analyze}=await import('./engine.mjs');const {Chess}=await import('./vendor/chess.mjs');
    const c=new AbortController();const g=new Chess();g.move('g3');const p=analyze(g,{depth:30,signal:c.signal});setTimeout(()=>c.abort(),150);
    const a=await p.then(()=>false,e=>e.name==='AbortError');const h=new Chess();h.move('b3');return a&&(await analyze(h,{depth:8})).length===3;});
  assert.equal(cancelled,true);
  console.log('Engine passed: warm reuse, shared searches, LRU cache, progress, cancellation, offscreen host shared by two views.');
} finally { await context.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
