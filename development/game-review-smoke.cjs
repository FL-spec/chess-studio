// Renders game-review.html in Chromium with the extension loaded, waits for the
// full analysis, checks for page errors and writes screenshots.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
const PGN=`[White "Magnus Carlsen"]
[Black "Viswanathan Anand"]
[Result "1-0"]

1.e4 c5 2.Nf3 e6 3.d4 cxd4 4.Nxd4 a6 5.c4 Nf6 6.Nc3 Bb4 7.Qd3 Nc6 8.Nxc6 dxc6 9.Qxd8+ Kxd8 10.e5 Nd7 11.Bf4 Bxc3+ 12.bxc3 Kc7 13.h4 b6 14.h5 h6 15.O-O-O Bb7 16.Rd3 c5 17.Rg3 Rag8 18.Bd3 Nf8 19.Be3 g6 20.hxg6 Nxg6 21.Rh5 Bc6 22.Bc2 Kb7 23.Rg4 a5 24.Bd1 Rd8 25.Bc2 Rdg8 26.Kd2 a4 27.Ke2 a3 28.f3 Rd8 29.Ke1 Rd7 30.Bc1 Ra8 31.Ke2 Ba4 32.Be4+ Bc6 33.Bxg6 fxg6 34.Rxg6 Ba4 35.Rxe6 Rd1 36.Bxa3 Ra1 37.Ke3 Bc2 38.Re7+ 1-0`;
(async()=>{
const extension=path.resolve(process.env.CHESS_TEST_EXTENSION||'../extension');
const context=await chromium.launchPersistentContext('/tmp/chess-studio-review-'+process.pid,{
  executablePath:process.env.CHESS_TEST_CHROME||'/usr/bin/chromium',headless:true,ignoreDefaultArgs:['--disable-extensions'],
  args:['--no-sandbox','--disable-extensions-except='+extension,'--load-extension='+extension]
});
const errors=[];
try {
const store=await context.newPage();
await store.goto('chrome://extensions');
const item=store.locator('extensions-item').filter({has:store.getByText('Chess Studio',{exact:true})});
await item.waitFor();
const url='chrome-extension://'+await item.getAttribute('id')+'/';
const page=await context.newPage();
page.on('pageerror',error=>{errors.push(error.message);console.log('pageerror',error.message);});
page.on('console',message=>{if(message.type()==='error')console.log('Console',message.text());});
await page.setViewportSize({width:1440,height:900});
await page.goto(url+'game-review.html?pgn='+encodeURIComponent('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0'));
await page.locator('#progress.done').waitFor({state:'attached',timeout:60000});
assert.match(await page.locator('#result').innerText(),/White won by checkmate/);
await page.evaluate(pgn=>chrome.storage.local.set({preferences:{theme:'light'},reviews:[{id:'r1',pgn,white:'Magnus Carlsen',black:'Viswanathan Anand',result:'1-0',reason:'resignation',playerColor:'w',site:'https://lichess.org/abc',date:'2014-11-15T12:00:00Z'}]}),PGN);
const started=Date.now();
await page.goto(url+'game-review.html?id=r1');
await page.locator('#title').getByText('Viswanathan Anand').waitFor();
assert.equal(await page.locator('#board .square').count(),64);
await page.locator('#progress-text').getByText(/Analysing \d+ \/ 76/).waitFor({state:'attached',timeout:30000});
await page.screenshot({path:'game-review-progress.png'});
await page.locator('#progress.done').waitFor({state:'attached',timeout:600000});
console.log('Analysis took',((Date.now()-started)/1000).toFixed(1),'s');
assert.match(await page.locator('#result').innerText(),/You won by resignation/);
const saved=await page.evaluate(async()=>(await chrome.storage.local.get('reviews')).reviews[0].analysis);
assert.equal(saved.lines.length,76);assert.equal(saved.complete,true);
console.log('Stored analysis bytes',JSON.stringify(saved).length);
console.log('Summary:',(await page.locator('#summary').innerText()).replace(/\n+/g,' | '));
await page.screenshot({path:'game-review-start-light.png'});
// Jump to the first blunder or mistake dot on the graph.
const dot=page.locator('.gr-graph-dot').first();
assert.ok(await dot.count(),'the game has at least one mistake dot');
await dot.click();
console.log('Coach:',(await page.locator('#coach').innerText()).replace(/\n+/g,' | '));
await page.locator('.gr-badge').waitFor();
await page.screenshot({path:'game-review-light.png'});
await page.getByRole('button',{name:'Show'}).click();
await page.getByRole('button',{name:'Back'}).waitFor();
await page.keyboard.press('ArrowRight');
await page.screenshot({path:'game-review-line-light.png'});
await page.getByRole('button',{name:'Back'}).click();
await page.keyboard.press('End');await page.keyboard.press('Home');await page.keyboard.press('ArrowRight');
assert.equal(await page.locator('#step').innerText(),'1. e4');
// Cached: reopening is instant.
await page.evaluate(()=>chrome.storage.local.set({preferences:{theme:'dark'}}));
const again=Date.now();
await page.reload();
await page.locator('#progress.done').waitFor({state:'attached',timeout:10000});
console.log('Reopen took',Date.now()-again,'ms');
await dot.click();
await page.screenshot({path:'game-review-dark.png'});
await page.setViewportSize({width:420,height:900});
await page.screenshot({path:'game-review-narrow-dark.png',fullPage:true});
await page.evaluate(()=>chrome.storage.local.set({preferences:{theme:'light'}}));
await page.reload();
await page.locator('#progress.done').waitFor({state:'attached',timeout:10000});
await dot.click();
await page.screenshot({path:'game-review-narrow-light.png',fullPage:true});
assert.deepEqual(errors,[]);
console.log('game review smoke passed');
} finally { await context.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
