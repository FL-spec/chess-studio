import assert from 'node:assert/strict';
import { Chess } from '../extension/vendor/chess.mjs';
import { lichessPlacement, placement, reconstruct, supported } from '../extension/detect.mjs';
import { humanLines } from '../extension/human-lines.mjs';
const initial=new Chess();
const moves=['e4','d5','exd5','Qxd5','Nc3'];
const played=moves.map(move=>initial.move(move));
const fen=initial.fen();
const board={querySelectorAll:()=>initial.board().flat().filter(Boolean).map(piece=>({
 getAttribute:()=>`piece ${piece.color}${piece.type} square-${piece.square.charCodeAt(0)-96}${piece.square[1]}`
}))};
assert.equal(placement(board),fen.split(' ')[0]);
assert.equal(reconstruct(placement(board),{moves}).fen,fen);
assert.equal(reconstruct(placement(board),{previous:{fen:played.at(-1).before}}).fen,fen);
assert.equal(reconstruct(placement(board),{fen}).fen,fen);
assert.equal(supported('https://www.chess.com/pt/play/computer'),true);
assert.equal(supported('https://www.chess.com/play/coach?source=play_nav'),true);
assert.equal(supported('https://chess.com/pt/play/coach'),true);
assert.equal(supported('https://chess.com/play/coaching'),false);
assert.equal(supported('https://lichess.org/analysis'),true);
assert.equal(supported('https://lichess.org/abc123'),false);
assert.equal(supported('https://www.chess.com/game/live/123'),true);
const names={p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
for(const flipped of [false,true]) {
  const model={closest:()=>flipped?{}:null,getBoundingClientRect:()=>({width:400,height:400,x:10,y:30}),
    querySelectorAll:()=>initial.board().flat().filter(Boolean).map(piece=>{
      const cls=[piece.color==='w'?'white':'black',names[piece.type]];
      cls.contains=token=>cls.includes(token);
      const x=piece.square.charCodeAt(0)-97,y=8-Number(piece.square[1]);
      return {classList:cls,getBoundingClientRect:()=>({x:10+50*(flipped?7-x:x),y:30+50*(flipped?7-y:y),width:50,height:50})};
    })};
  assert.equal(lichessPlacement(model),fen.split(' ')[0]);
}
const lines=humanLines(fen,1450);
assert.equal(lines.length,3);
for(const line of lines) {
  const game=new Chess(fen);
  line.line.forEach(move=>assert.ok(game.move(move)));
}
console.log('Detector unit tests passed, including Lichess board orientation and legal human continuations.');

const {readFileSync}=await import('node:fs');
const {runInNewContext}=await import('node:vm');
const source=readFileSync(new URL('../extension/generic-board.js',import.meta.url),'utf8');
let listener;
let positions=[fen];
const runtime={id:'extension',onMessage:{addListener:callback=>listener=callback}};
runInNewContext(source,{
  chrome:{runtime},
  location:{hostname:'board.example'},
  document:{querySelectorAll:()=>positions.map(value=>({
    getClientRects:()=>[{}],
    getAttribute:name=>name==='data-fen'?value:null
  }))}
});
const message='chess-studio-generic-position';
const snapshot=()=>{let result;listener(message,{id:'extension'},value=>result=value);return result;};
assert.equal(snapshot().fen,fen);
positions.push(new Chess().fen());
assert.equal(snapshot().status,'generic-ambiguous');
positions=['incomplete board position'];
assert.equal(snapshot().status,'generic-missing');
assert.doesNotThrow(()=>listener(message,{id:'untrusted'},()=>assert.fail('unauthorized reply')));
console.log('Generic reader tests passed, including ambiguous and incomplete positions.');
