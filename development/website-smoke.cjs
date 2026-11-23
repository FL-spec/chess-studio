const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
const html=`<!doctype html><meta charset=utf-8><title>Training fixture</title><style>wc-chess-board{display:block;width:400px;height:400px}</style>
<nav id="sidebar-main-menu"><a href="/member/studio-player">Studio-Player</a></nav>
<main class="board-layout-main">
  <div class="board-layout-top"><span class="cc-user-username-component">Coach Magnus</span></div>
  <wc-chess-board></wc-chess-board>
  <div class="board-layout-bottom"><span class="cc-user-username-component">Studio-Player</span></div>
</main>
<wc-simple-move-list class="move-list"></wc-simple-move-list><script>
const start='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
function loadPosition(placement,moves) {
  document.querySelector('wc-chess-board').innerHTML=placement.split('/').map((rank,row)=>{
    let file=0;
    return [...rank].map(piece=>{
      if(/\\d/.test(piece)){file+=Number(piece);return '';}
      const type=(piece===piece.toLowerCase()?'b':'w')+piece.toLowerCase();
      return '<div class="piece '+type+' square-'+(++file)+(8-row)+'"></div>';
    }).join('');
  }).join('');
  document.querySelector('wc-simple-move-list').innerHTML=moves.map(move=>{
    const figurine=/^[KQRBN]/.test(move)
      ? '<span class="icon-font-chess" data-figurine="'+move[0]+'"></span> '+move.slice(1)
      : move;
    return '<div class="node"><span class="node-highlight-content">'+figurine+' </span></div>';
  }).join('');
  sessionStorage.setItem(location.pathname,JSON.stringify([placement,moves]));
}
loadPosition(...JSON.parse(sessionStorage.getItem(location.pathname)||JSON.stringify([start,[]])));
</script>`;
(async()=>{
const ext=path.resolve(process.env.CHESS_TEST_EXTENSION||'../extension');
const context=await chromium.launchPersistentContext('/tmp/chess-website-'+process.pid,{headless:true,
  executablePath:process.env.CHESS_TEST_CHROME||'/usr/bin/chromium',ignoreDefaultArgs:['--disable-extensions'],
  args:['--no-sandbox','--disable-extensions-except='+ext,'--load-extension='+ext]});
try {
 await context.route('https://www.chess.com/**',route=>route.fulfill({contentType:'text/html',body:html,status:200}));
 const store=await context.newPage();
 await store.goto('chrome://extensions');
 const extension=store.locator('extensions-item').filter({has:store.getByText('Chess Studio',{exact:true})});
 await extension.waitFor();
 const base='chrome-extension://'+await extension.getAttribute('id')+'/';
 const training=await context.newPage();
 await training.goto('https://www.chess.com/pt/play/computer');
 await training.evaluate(()=>loadPosition('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR',['e4','d5']));
 const launcher=await context.newPage();
 await launcher.goto(base+'popup.html');
 assert.deepEqual(await launcher.getByRole('button').allTextContents(),['Pop out','Pin analysis','Open Studio']);
 assert.equal(await launcher.getByRole('combobox').count(),0);
 const floatingPage=context.waitForEvent('page');
 await launcher.getByRole('button',{name:'Pop out',exact:true}).click().catch(error=>{
   if(!launcher.isClosed()) throw error;
 });
 const popup=await floatingPage;
 await popup.locator('body.floating').waitFor();
 assert.equal(await popup.evaluate(async()=> (await chrome.windows.getCurrent()).type),'popup');
 await popup.setViewportSize({width:380,height:580});
 const errors=[];
 popup.on('pageerror',e=>errors.push(e.message));
 const rows=page=>page.locator('.move-row-choice');
 const mode=(page,name)=>page.getByRole('group',{name:'Analysis mode'}).getByRole('button',{name,exact:true});
 const turn=(page,name)=>page.getByRole('heading',{name,exact:true});
 const arrows=training.locator('[data-chess-studio-mark] g[data-move]');
 const engineArrow=training.locator('[data-chess-studio-mark] g[data-kind="move"]');
 const replyArrow=training.locator('[data-chess-studio-mark] g[data-kind="reply"]');
 const count=async (locator,n)=>{await locator.nth(n-1).waitFor({state:"attached"});assert.equal(await locator.count(),n);};
 const setting=(page,name)=>page.getByRole('combobox',{name,exact:true});
 const toggle=(page,name)=>page.getByRole('switch',{name,exact:true});
 const setSwitch=async (page,name,on)=>{const item=toggle(page,name);if((await item.getAttribute('aria-checked'))!==String(on))await item.click();};
 const assertPressed=async (locator,pressed)=>assert.equal(await locator.getAttribute('aria-pressed'),String(pressed));
 await rows(popup).first().waitFor();
 await turn(popup,'White to move').waitFor();
 await assertPressed(mode(popup,'Engine'),true);
 await count(arrows,1);
 await popup.screenshot({path:'website-popup.png'});
 const viewToggle=popup.getByRole('radiogroup',{name:'Panel mode'});
 await viewToggle.getByRole('radio',{name:'Commentator',exact:true}).click();
 await popup.locator('.coach-card').waitFor();
 assert.equal(await rows(popup).count(),0);
 await popup.getByRole('radiogroup',{name:'Panel mode'}).getByRole('radio',{name:'Coach',exact:true}).click();
 await rows(popup).first().waitFor();
 const engineScores=await rows(popup).locator('.score').allTextContents();
 assert.deepEqual(engineScores.map(Number),engineScores.map(Number).sort((a,b)=>b-a));
 assert.equal(await rows(popup).first().locator('img.move-piece').count(),1);
 await popup.locator('button.board-player[data-color=b]').click();
 await popup.getByText(/^Replies after/).waitFor();
 await rows(popup).nth(1).click();
 const reply=await rows(popup).nth(1).getAttribute('data-choice');
 await training.locator('[data-chess-studio-mark] g[data-move="'+reply+'"]').waitFor({state:'attached'});
 assert.equal(await engineArrow.count(),0);
 await popup.locator('button.board-player[data-color=w]').click();
 await popup.getByRole('button',{name:'All moves',exact:true}).click();
 await count(engineArrow,5);
 await rows(popup).nth(1).click();
 await assertPressed(rows(popup).nth(1),true);
 await engineArrow.nth(1).waitFor({state:'detached'});
 const settingsPage=context.waitForEvent('page');
 await popup.getByRole('link',{name:'Settings',exact:true}).click();
 const settings=await settingsPage;
 await settings.getByRole('heading',{name:'Settings',exact:true}).waitFor();
 assert.equal(await toggle(settings,'Automatic board arrows').getAttribute('aria-checked'),'true');
 assert.equal(await setting(settings,'Board arrows follow').inputValue(),'preview');
 const evaluation = popup.locator('.panel-evaluation meter');
 await evaluation.waitFor();
 const whiteScore = await popup.locator('.panel-evaluation .score').textContent();
 await setSwitch(settings,'Pop-out and pinned evaluation bar',false);
 await evaluation.waitFor({state:'hidden'});
 await setSwitch(settings,'Pop-out and pinned evaluation bar',true);
 await evaluation.waitFor();
 await setting(settings,'Board arrows follow').selectOption('selection');
 await popup.getByRole('button',{name:'Show opponent arrows',exact:true}).click();
 await replyArrow.first().waitFor({state:'detached'});
 await mode(popup,'Human').click();
 await assertPressed(mode(popup,'Human'),true);
 await rows(popup).first().waitFor();
 await popup.getByText('Maia-3 · Likely moves',{exact:true}).waitFor();
 assert.equal(await popup.locator('.panel-evaluation .score').textContent(),whiteScore);
 const humanScores=await rows(popup).locator('.score').allTextContents();
 assert.deepEqual(humanScores.map(parseFloat),humanScores.map(parseFloat).sort((a,b)=>b-a));
 await popup.getByRole('button',{name:'All moves',exact:true}).click();
 await count(engineArrow,5);
 await mode(popup,'Engine').click();
 await assertPressed(popup.getByRole('button',{name:'Show opponent arrows',exact:true}),false);
 await setSwitch(settings,'Automatic board arrows',false);
 await arrows.first().waitFor({state:'detached'});
 await setSwitch(settings,'Automatic board arrows',true);
 await arrows.first().waitFor({state:"attached"});
 const panel=await context.newPage();
 await panel.setViewportSize({width:320,height:900});
 await panel.goto(base+'panel.html');
 await turn(panel,'White to move').waitFor();
 await mode(panel,'Human').click();
 await rows(panel).first().waitFor();
 await assertPressed(mode(panel,'Human'),true);
 await panel.locator('.panel-evaluation meter').waitFor();
 await panel.screenshot({path:'website-panel.png'});
 const id=Number(new URL(popup.url()).searchParams.get('source'));
 const studioPage=context.waitForEvent('page');
 await panel.getByRole('button',{name:'Open Studio',exact:true}).click();
 const studio=await studioPage;
 await studio.setViewportSize({width:1280,height:970});
 await assertPressed(mode(studio,'Human'),true);
 await mode(studio,'Engine').click();
 await studio.locator('button.board-player[data-color=b]').click();
 await studio.locator('button.board-player[data-color=b]').click();
 await studio.getByText(/^Replies after/).waitFor();
 const engineReplies=await rows(studio).locator('.score').allTextContents();
 assert.deepEqual(engineReplies.map(Number),engineReplies.map(Number).sort((a,b)=>b-a));
 await mode(studio,'Human').click();
 await studio.getByText(/^Replies after/).waitFor();
 await rows(studio).nth(1).click();
 await studio.getByRole('button',{name:'Show your arrows'}).click();
 assert.equal(await studio.locator('.board-arrows g[data-kind="move"]').count(),0);
 await studio.getByRole('button',{name:'All moves',exact:true}).click();
 await count(studio.locator('.board-arrows g[data-kind="reply"]'),5);
 await studio.locator('button.board-player[data-color=w]').click();
 await rows(studio).nth(1).click();
 const original=await studio.locator('.board [data-square=e4]').getAttribute('aria-label');
 await studio.getByRole('button',{name:'Next move'}).click();
 await studio.getByText(/ · 1 \/ /).waitFor();
 await studio.getByRole('button',{name:'Next move'}).click();
 await studio.getByText(/ · 2 \/ /).waitFor();
 await studio.getByRole('button',{name:'Previous move'}).click();
 await studio.getByRole('button',{name:'Previous move'}).click();
 assert.equal(await studio.locator('.board [data-square=e4]').getAttribute('aria-label'),original);
 await studio.screenshot({path:'website-workspace.png',fullPage:true});
 await studio.getByRole('button',{name:'Back to game'}).click();
 await studio.waitForFunction(async source=>(await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id===source,id);
 await popup.close();
 const studioLauncher=await context.newPage();
 await studioLauncher.goto(base+'popup.html');
 const directPage=context.waitForEvent('page');
 await studioLauncher.getByRole('button',{name:'Open Studio',exact:true}).click().catch(error=>{
   if(!studioLauncher.isClosed()) throw error;
 });
 const directStudio=await directPage;
 await turn(directStudio,'White to move').waitFor();
 assert.match(directStudio.url(),new RegExp('website.html.*source='+id));
 await directStudio.close();
 await training.goto('https://www.chess.com/play/coach?source=play_nav');
 await turn(studio,'White to move').waitFor();
 await studio.locator('.board-player[data-color="w"]').getByText('You · White').waitFor();
 await training.locator('wc-chess-board').evaluate(board=>board.classList.add('flipped'));
 await studio.locator('.board-player[data-color="b"]').getByText('You · Black').waitFor();
 assert.equal(await studio.locator('.position-board .square').first().getAttribute('data-square'),'h1');
 await setting(settings,'Board arrows follow').selectOption('turn');
 await mode(studio,'Human').click();
 await studio.locator('button.board-player[data-color=w]').click();
 await training.evaluate(()=>loadPosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR',['e4']));
 await turn(studio,'Black to move').waitFor();
 await studio.getByText(/^Replies after/).waitFor();
 await assertPressed(studio.locator('button.board-player[data-color=w]'),true);
 const blackArrow=studio.locator('.board-arrows g[data-move]').first();
 await blackArrow.waitFor({state:'attached'});
 const origin=(await blackArrow.getAttribute('data-move')).slice(0,2);
 assert.match(await studio.locator('[data-square="'+origin+'"]').getAttribute('aria-label'),/black/);

 await training.evaluate(()=>loadPosition('rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR',['e4','c6']));
 await turn(studio,'White to move').waitFor();
 await studio.getByRole('heading',{name:'Why c6?'}).waitFor();
 await training.goto('https://www.chess.com/play/computer');
 await turn(studio,'White to move').waitFor();
 await training.evaluate(()=>loadPosition('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R',['e4','e5','Nf3','Nc6']));
 await training.reload();
 await studio.getByRole('heading',{name:'Why Nc6?'}).waitFor();
 await studio.locator('[data-square=f3][aria-label="f3 white knight"]').waitFor();
 await training.evaluate(()=>loadPosition('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR',['e4','e5']));
 await studio.getByRole('heading',{name:'Why e5?'}).waitFor();
 await training.goto('https://www.chess.com/puzzles');
 await studio.getByRole('heading',{name:'Looking for a game…'}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('Website fixtures passed: ranked lenses, arrow sets, conditional replies, floating window, Studio replay and return, Coach and Computer sync.');
} finally {await context.close();}
})().catch(e=>{console.error(e);process.exit(1);});
