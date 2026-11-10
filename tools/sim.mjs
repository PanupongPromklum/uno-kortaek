// node tools/sim.mjs — all-bot games through tick(), checks card conservation & termination
import * as E from '../supabase/functions/uno/engine.js';
let bad = 0, done = 0, turns = 0; const N = 800;
for (let g = 0; g < N; g++) {
  const np = 2 + (g % 5);
  const rules = { stacking: g % 2 === 0, jumpIn: g % 3 === 0, sevenZero: g % 4 === 0 };
  let now = 1e6;
  const G = E.newGame(Array.from({ length: np }, (_, i) => ({ id: 'b' + i, name: 'B' + i, char: 'c' + i, bot: true })), rules, now);
  let k = 0;
  while (!G.winner && k++ < 5000) {
    now = E.wakeAt(G) + 1;
    E.tick(G, now);
    const total = G.players.reduce((s, p) => s + p.hand.length, 0) + G.draw.length + G.discard.length;
    if (total !== 108) { bad++; console.log('count', total); break; }
    G.events.length = 0;
  }
  turns += k; if (G.winner) done++;
}
// human timeout path
let now = 0; const H = E.newGame([{ id: 'h', name: 'H', char: 'a' }, { id: 'b', name: 'B', char: 'b', bot: true }], {}, now);
for (let k = 0; k < 3000 && !H.winner; k++) { now = E.wakeAt(H) + 1; E.tick(H, now); }
console.log({ N, done, bad, avgTicks: Math.round(turns / N), humanTimeoutGameEnded: !!H.winner });
