// Premove stress test over hundreds of generated positions.
//
// Positions: human-like games played by the local human model (seeded, so the
// run is repeatable), sampled at many plies, plus a targeted set where the side
// to move can win one of your pieces. In every position the opponent is to move
// and you are the other side, as when the panel computes a premove.
//
// Invariants for every premove found:
//   side    - it moves one of your pieces (never the opponent's).
//   legal   - it is legal after the opponent's likeliest reply.
//   safe    - against the opponent's best reply (Stockfish) and every reply with
//             at least 10% probability, after which it is legal, it loses at most
//             SAFE_LOSS expected score versus your best answer, checked
//             independently at depth 14.
// Usage: CHESS_TEST_CHROME=... node premove-stress.cjs [games] [targeted]
const {chromium}=require('playwright-core');
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const GAMES=Number(process.argv[2]||60);
const TARGETED=Number(process.argv[3]||120);
// Optional: positions from real games (see extract-positions.mjs) instead of generated ones.
const FILE=process.env.POSITIONS_FILE?JSON.parse(fs.readFileSync(process.env.POSITIONS_FILE,'utf8')):null;
(async()=>{
const ext=path.resolve(process.env.CHESS_TEST_EXTENSION||'../extension');
const context=await chromium.launchPersistentContext('/tmp/chess-premove-stress-'+process.pid,{headless:true,
  executablePath:process.env.CHESS_TEST_CHROME||'/usr/bin/chromium',ignoreDefaultArgs:['--disable-extensions'],
  args:['--no-sandbox','--disable-extensions-except='+ext,'--load-extension='+ext]});
try {
  const store=await context.newPage();
  await store.goto('chrome://extensions');
  const item=store.locator('extensions-item').filter({has:store.getByText('Chess Studio',{exact:true})});
  await item.waitFor();
  const page=await context.newPage();
  page.setDefaultTimeout(0);
  page.on('console',m=>{if(m.text().startsWith('#'))console.log(m.text().slice(1));});
  await page.goto('chrome-extension://'+await item.getAttribute('id')+'/popup.html');
  const report=await page.evaluate(async([GAMES,TARGETED,FILE])=>{
    const {analyze}=await import('./engine.mjs');
    const {Chess}=await import('./vendor/chess.mjs');
    const {findSafePremove,uciOf}=await import('./premove.mjs');
    const {humanRanks}=await import('./human-lines.mjs');
    const {expectedScore}=await import('./pro-lines.mjs');
    const {see,VALUE}=await import('./tactics.mjs');
    const SAFE_LOSS=0.08; // 2 x MAX_LOSS: room for depth 12 vs 14 noise
    let seed=20261125;
    const random=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    const sample=(ranks)=>{let r=random(),acc=0;for(const row of ranks){acc+=row.probability;if(r<=acc)return row.move;}return ranks[0]?.move;};
    // Can the side to move win one of the other side's pieces (positive exchange)?
    const winsPiece=(board)=>board.moves({verbose:true}).some(m=>m.captured&&m.captured!=='p'&&see(board,m.to,board.turn())>=2);
    const random_=[],targeted=[];
    const elos=new Map();
    if(FILE){for(const p of FILE.random){random_.push(p.fen);elos.set(p.fen,p.elo);}for(const p of FILE.attacked){targeted.push(p.fen);elos.set(p.fen,p.elo);}}
    else for(let g=0;g<GAMES;g++){
      const board=new Chess();
      const elo=[1000,1300,1600,1900][g%4];
      for(let ply=0;ply<70&&!board.isGameOver();ply++){
        board.move(sample(humanRanks(board,elo)));
        if(board.isGameOver())break;
        if(ply>=5&&ply%6===g%6) random_.push(board.fen());
        if(ply>=4&&targeted.length<TARGETED&&winsPiece(board)&&random()<0.5) targeted.push(board.fen());
      }
    }
    const positions=[...random_.map(fen=>['random',fen]),...targeted.map(fen=>['attacked',fen])];
    console.log('#positions '+positions.length+' ('+random_.length+' random, '+targeted.length+' with a piece of yours attacked)');
    const failures=[],found={random:0,attacked:0},ms=[];
    let index=0;
    for(const [kind,fen] of positions){
      index++;
      const board=new Chess(fen);
      const player=board.turn()==='w'?'b':'w';
      const ranks=humanRanks(board,elos.get(fen)||1500);
      const weights=new Map(ranks.map(r=>[uciOf(r.move),r.probability]));
      const width=board.moves().length;
      const depth=Math.max(8,Math.min(width>30?10:12,14));
      const budget=AbortSignal.timeout(2500);
      const t=performance.now();
      let premove=null;
      try{premove=await findSafePremove(board,{analyze,depth,signal:budget,weights,mode:'obvious'});}catch(e){if(e.name!=='TimeoutError'&&e.name!=='AbortError')throw e;}
      ms.push(performance.now()-t);
      if(!premove) continue;
      found[kind]++;
      const fail=(why,extra={})=>failures.push({kind,fen,premove:premove.san,move:premove.move,why,...extra});
      if(board.get(premove.from)?.color!==player){fail('side');continue;}
      // Replies to check independently: the engine's best and every likely one.
      const [top]=await analyze(board,{depth:14,count:1});
      const check=new Set(ranks.filter(r=>r.probability>=0.10).map(r=>uciOf(r.move)));
      if(top?.pv[0]) check.add(top.pv[0]);
      const likeliest=uciOf(ranks[0].move);
      for(const id of check){
        const after=new Chess(fen);
        after.move({from:id.slice(0,2),to:id.slice(2,4),promotion:id[4]});
        if(after.isGameOver()) continue;
        const legal=after.moves({verbose:true}).find(m=>m.from+m.to===premove.move.slice(0,4)&&(!m.promotion||m.promotion==='q'));
        if(!legal){if(id===likeliest)fail('illegal after likeliest',{reply:id});continue;}
        const [best]=await analyze(after,{depth:14,count:1});
        if(!best||best.pv[0]===uciOf(legal)) continue;
        const [mine]=await analyze(after,{depth:14,count:1,only:uciOf(legal)});
        const loss=expectedScore(best)-expectedScore(mine);
        if(loss>SAFE_LOSS) fail('loses',{reply:id,loss:Math.round(loss*1000)/1000,best:best.pv[0]});
      }
      if(index%25===0) console.log('#'+index+'/'+positions.length+' found '+(found.random+found.attacked)+' failures '+failures.length);
    }
    ms.sort((a,b)=>a-b);
    return {positions:positions.length,random:random_.length,attacked:targeted.length,found,failures,
      medianMs:Math.round(ms[ms.length>>1]),p90Ms:Math.round(ms[Math.floor(ms.length*0.9)]),maxMs:Math.round(ms.at(-1))};
  },[GAMES,TARGETED,FILE]);
  fs.writeFileSync('premove-stress.json',JSON.stringify(report,null,1));
  console.log(JSON.stringify({...report,failures:report.failures.length},null,1));
  for(const f of report.failures.slice(0,20)) console.log(JSON.stringify(f));
  assert.equal(report.failures.length,0,'premove failures');
  console.log('Premove stress passed: '+report.positions+' positions, no wrong-side, illegal or losing premove.');
} finally { await context.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
