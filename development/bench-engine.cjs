// Measures Stockfish search cost and Maia-3 output shapes inside the extension.
// Usage: CHESS_TEST_CHROME=... MAIA_ONNX=/path/maia3.onnx node bench-engine.cjs
const {chromium}=require('playwright-core');const path=require('node:path');const fs=require('node:fs');
(async()=>{
const ext=path.resolve(process.env.CHESS_TEST_EXTENSION||'../extension');
const ctx=await chromium.launchPersistentContext('/tmp/cs-bench-'+process.pid,{headless:true,executablePath:process.env.CHESS_TEST_CHROME,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--disable-extensions-except='+ext,'--load-extension='+ext]});
try{
 if(process.env.MAIA_ONNX) await ctx.route('https://raw.githubusercontent.com/**',r=>r.fulfill({status:200,body:fs.readFileSync(process.env.MAIA_ONNX),contentType:'application/octet-stream'}));
 const store=await ctx.newPage(); await store.goto('chrome://extensions');
 const item=store.locator('extensions-item').filter({has:store.getByText('Chess Studio',{exact:true})}); await item.waitFor();
 const base='chrome-extension://'+await item.getAttribute('id')+'/';
 const p=await ctx.newPage(); p.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await p.goto(base+'index.html');
 const r=await p.evaluate(async()=>{
   const {analyzeCommand}=await import('./engine-core.mjs');
   const fens=['r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3','r2q1rk1/pp2bppp/2n1pn2/3p4/3P4/2NBPN2/PP3PPP/R2Q1RK1 w - - 0 11','8/5pk1/6p1/3P4/5P2/6PK/8/8 b - - 0 45'];
   const out={};
   for(const d of [8,10,12,14,16]){let t=performance.now();for(const f of fens) await analyzeCommand('position fen '+f,1,{depth:d,count:1});out['d'+d+'_pv1_ms']=Math.round((performance.now()-t)/fens.length);}
   for(const d of [8,10]){let t=performance.now();await analyzeCommand('position fen '+fens[1],30,{depth:d,count:30});out['d'+d+'_pv30_ms']=Math.round(performance.now()-t);}
   return out;});
 console.log('ENGINE',JSON.stringify(r));
 if(process.env.MAIA_ONNX){
  const m=await p.evaluate(async()=>{const {maiaRanks}=await import('./maia.mjs');const {Chess}=await import('./vendor/chess.mjs');
    let t=performance.now(); await maiaRanks([new Chess()],[1500]); const first=performance.now()-t;
    t=performance.now(); for(let i=0;i<10;i++) await maiaRanks([new Chess()],[1500+i]); const one=(performance.now()-t)/10;
    const boards=Array.from({length:30},()=>new Chess()); t=performance.now(); await maiaRanks(boards,boards.map(()=>1500)); const batch=performance.now()-t;
    return {firstMs:Math.round(first),singleMs:Math.round(one),batch30Ms:Math.round(batch)};});
  console.log('MAIA',JSON.stringify(m));
 }
}finally{await ctx.close();}})();
