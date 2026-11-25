// Safe-premove benchmark: time to result, hit rate and correctness over
// realistic positions with the opponent to move. Correctness: against the
// likely replies (90% of the local human model, at most 6) the premove must lose
// at most MAX_LOSS versus the best answer at depth 14.
// Usage: CHESS_TEST_CHROME=... node premove-bench.cjs [out.json]
const {chromium}=require('playwright-core');
const path=require('node:path');
const fs=require('node:fs');
const POSITIONS=[
  // [name, start FEN or "", SAN moves, expect: "find" | "any" | "none"]
  ['ruy-exchange-recapture','', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6','any'],
  ['qgd-exchange','', 'd4 d5 c4 e6 Nc3 Nf6 cxd5','any'],
  ['scandi-queen-must-move','', 'e4 d5 exd5 Qxd5 Nc3','any'],
  ['scotch-nxc6','', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6','any'],
  ['qa4-check','', 'd4 d5 c4 dxc4 Qa4+','find'],
  ['queen-trade-offer','', 'd4 e5 dxe5 d6 exd6 Bxd6 Qd5 Qe7 Qe4 Qxe4','none'],
  ['knight-trade-d5','', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Nc3 Nd4 Nxd4','find'],
  ['bishop-trade-c4','', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2 Bxd2+','none'],
  ['bxd2-black-recapt','', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Bd2','any'],
  ['italian-quiet','', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O','any'],
  ['qgd-quiet','', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6','any'],
  ['sicilian-open','', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7','any'],
  ['scholar-threat','', 'e4 e5 Bc4 Nc6 Qh5','any'],
  ['hanging-queen-trap','', 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5','any'],
  ['rook-endgame-check','8/5pk1/6p1/8/3R4/6P1/r4PK1/8 w - - 0 40', 'Rd7','any'],
  ['kp-endgame','8/8/4k3/8/3PK3/8/8/8 b - - 0 50', '','any'],
  ['back-rank-king-escape','6k1/5pp1/7p/8/8/8/5PPP/3R2K1 w - - 0 30', 'Rd8+','any'],
  ['promotion-race','8/1P6/8/8/8/8/6pk/K7 w - - 0 50', 'Ka2','any'],
  ['pawn-takes-hanging','', 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5','find'],
  ['wide-middlegame','r2q1rk1/pp2bppp/2n1bn2/3p4/3P4/2NBBN2/PP3PPP/R2Q1RK1 w - - 0 11', 'h3','any'],
  ['queen-hit-must-move','', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Qh4 Nc3 Bb4 Be2 Qxe4','any'],
  ['knight-fork-threat','', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7','find'],
];
(async()=>{
const ext=path.resolve(process.env.CHESS_TEST_EXTENSION||'../extension');
const context=await chromium.launchPersistentContext('/tmp/chess-premove-'+process.pid,{headless:true,
  executablePath:process.env.CHESS_TEST_CHROME||'/usr/bin/chromium',ignoreDefaultArgs:['--disable-extensions'],
  args:['--no-sandbox','--disable-extensions-except='+ext,'--load-extension='+ext]});
try {
  const store=await context.newPage();
  await store.goto('chrome://extensions');
  const item=store.locator('extensions-item').filter({has:store.getByText('Chess Studio',{exact:true})});
  await item.waitFor();
  const page=await context.newPage();
  page.on('console',m=>{if(m.text().startsWith('{'))console.log(m.text());});
  await page.goto('chrome-extension://'+await item.getAttribute('id')+'/popup.html');
  const rows=await page.evaluate(async([POSITIONS,MODULE,TRACE,CONTEND])=>{
    const {analyze}=await import('./engine.mjs');
    const {Chess}=await import('./vendor/chess.mjs');
    const {findSafePremove,uciOf,MAX_LOSS}=await import(MODULE);
    const {humanRanks}=await import('./human-lines.mjs');
    const {expectedScore}=await import('./pro-lines.mjs');
    await analyze(new Chess('8/8/8/4k3/8/8/8/4K2R w K - 0 1'),{depth:10});
    const out=[];
    // Bullet first: a deeper cached search would otherwise serve the shallow one.
    for(const bullet of [true,false]){
      for(const [name,fen,sans,expect] of POSITIONS){
        const board=fen?new Chess(fen):new Chess();
        for(const s of sans.split(' ').filter(Boolean)) board.move(s);
        const ranks=humanRanks(board,1500);
        const weights=new Map(ranks.map(r=>[uciOf(r.move),r.probability]));
        const width=board.moves().length;
        const depth=bullet?8:Math.max(8,Math.min(width>30?10:12,14-4));
        // CONTEND: the panel's main search (depth 18, 3 lines) runs alongside, as in companion.mjs.
        const main=new AbortController();
        if(CONTEND) analyze(board,{depth:18,count:3,signal:main.signal}).catch(()=>{});
        const t=performance.now();let result=null,status='ok';let first=null;
        const signal=AbortSignal.timeout(bullet?1200:2500);
        try{result=await findSafePremove(board,{analyze,depth,signal,weights,trace:TRACE===name&&!bullet?(x)=>console.log(JSON.stringify(x)):undefined});}
        catch(e){status=e.name==='TimeoutError'||e.name==='AbortError'?'timeout':'error:'+e.message;}
        const ms=Math.round(performance.now()-t);main.abort();
        out.push({name,bullet,width,ms,status,move:result?.san||null,uci:result?.move||null,expect,early:first&&Math.round(first)});
        // let the aborted search drain
        await new Promise(r=>setTimeout(r,50));
      }
    }
    // Correctness at depth 14 against likely replies.
    for(const row of out){
      if(!row.uci) continue;
      const [ , fen, sans]=POSITIONS.find(p=>p[0]===row.name);
      const board=fen?new Chess(fen):new Chess();
      for(const s of sans.split(' ').filter(Boolean)) board.move(s);
      const ranks=humanRanks(board,1500).sort((a,b)=>b.probability-a.probability);
      let mass=0,worst=0,worstReply=null;
      for(const r of ranks.slice(0,6)){
        if(mass>=0.9) break; mass+=r.probability;
        const after=new Chess(board.fen());after.move(r.move);
        if(after.isGameOver()) continue;
        const legal=after.moves({verbose:true}).find(m=>m.from+m.to===row.uci.slice(0,4)&&(!m.promotion||m.promotion==='q'));
        if(!legal) continue;
        const [best]=await analyze(after,{depth:14,count:1});
        const [mine]=await analyze(after,{depth:14,count:1,only:uciOf(legal)});
        const loss=Math.max(0,expectedScore(best)-expectedScore(mine));
        if(loss>worst){worst=loss;worstReply=r.move.san;}
      }
      row.deepLoss=+worst.toFixed(3);row.bad=worst>MAX_LOSS*1.5;row.worstReply=worstReply;
    }
    return out;
  },[POSITIONS,process.env.PREMOVE_MODULE||'./premove.mjs',process.env.TRACE,process.env.CONTEND]);
  console.table(rows.map(r=>({name:r.name,bullet:r.bullet,w:r.width,ms:r.ms,early:r.early,status:r.status,move:r.move,loss:r.deepLoss,bad:r.bad})));
  const sum=b=>{const s=rows.filter(r=>r.bullet===b);const ms=s.map(r=>r.ms).sort((x,y)=>x-y);
    return {bullet:b,n:s.length,found:s.filter(r=>r.uci).length,timeouts:s.filter(r=>r.status==='timeout').length,bad:s.filter(r=>r.bad).length,
      medianMs:ms[ms.length>>1],p90Ms:ms[Math.floor(ms.length*0.9)],missedFind:s.filter(r=>r.expect==='find'&&!r.uci).map(r=>r.name)};};
  console.log(sum(false),sum(true));
  if(process.argv[2]) fs.writeFileSync(process.argv[2],JSON.stringify(rows,null,1));
} finally { await context.close(); fs.rmSync('/tmp/chess-premove-'+process.pid,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exit(1);});
