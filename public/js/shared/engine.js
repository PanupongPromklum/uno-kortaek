// UNO engine (pure, JSON-serialisable state). Shared by the Supabase Edge Function and local tests.
export const COLORS = ['red', 'yellow', 'green', 'blue'];
export const TURN_MS = 20000;
export const UNO_MS = 3000;
const AWAY_MS = 3000;

function buildDeck() {
  const d = []; let id = 0;
  const add = (color, value) => d.push({ id: id++, color, value });
  for (const c of COLORS) {
    add(c, '0');
    for (let n = 1; n <= 9; n++) { add(c, String(n)); add(c, String(n)); }
    for (const v of ['S', 'R', '+2']) { add(c, v); add(c, v); }
  }
  for (let i = 0; i < 4; i++) { add('wild', 'W'); add('wild', '+4'); }
  return d;
}
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));

export function newGame(players, rules, now) {
  const G = {
    rules: { stacking: false, jumpIn: false, sevenZero: false, chaos: false, speed: false, ...rules },
    players: players.map(p => ({ id: p.id, name: p.name, char: p.char, bot: !!p.bot, hand: [], saidUno: false })),
    draw: shuffle(buildDeck()), discard: [], dir: 1, cur: 0, color: null, pending: 0, pendingKind: null,
    drawnId: null, pickTarget: false, uno: null, lastPlayedBy: null, winner: null,
    turnStart: now, deadline: now + TURN_MS, botAt: null, turnNo: 0, events: [], turnMs: rules && rules.speed ? 8000 : TURN_MS,
  };
  for (let r = 0; r < 7; r++) for (const p of G.players) p.hand.push(G.draw.pop());
  let first;
  for (;;) { first = G.draw.pop(); if (first.color !== 'wild') break; G.draw.unshift(first); }
  G.discard.push(first); G.color = first.color;
  G.cur = Math.floor(Math.random() * G.players.length);
  const c0 = G.cur;
  if (first.value === 'S') G.cur = step(G, c0, 1);
  else if (first.value === 'R') { G.dir = -1; G.cur = G.players.length === 2 ? c0 : step(G, c0, 1); }
  else if (first.value === '+2') { give(G, G.players[c0], 2); G.events.push({ type: 'draw', pid: G.players[c0].id, count: 2, forced: true }); G.cur = step(G, c0, 1); }
  startTurn(G, now);
  return G;
}

const n = G => G.players.length;
const step = (G, from, k = 1) => (((from + G.dir * k) % n(G)) + n(G)) % n(G);
const idx = (G, id) => G.players.findIndex(p => p.id === id);
const top = G => G.discard[G.discard.length - 1];
const emit = (G, e) => G.events.push(e);

function chaos(G) {
  const kinds = ['rain', 'flip', 'paint', 'gift'];
  const max = Math.max(...G.players.map(p => p.hand.length));
  const kind = kinds.filter(k => k !== 'gift' || max > 2)[Math.floor(Math.random() * (max > 2 ? 4 : 3))];
  const ev = { type: 'chaos', kind };
  if (kind === 'rain') { emit(G, ev); for (const p of G.players) { give(G, p, 1); emit(G, { type: 'draw', pid: p.id, count: 1, forced: true }); } return; }
  if (kind === 'flip') G.dir = -G.dir;
  if (kind === 'paint') { G.color = COLORS[Math.floor(Math.random() * 4)]; ev.color = G.color; }
  if (kind === 'gift') {
    const p = G.players.filter(x => x.hand.length === max)[0];
    const pool = p.hand.filter(c => c.color !== 'wild');
    const c = (pool.length ? pool : p.hand)[Math.floor(Math.random() * (pool.length || p.hand.length))];
    p.hand.splice(p.hand.indexOf(c), 1); G.draw.unshift(c); ev.pid = p.id;
  }
  emit(G, ev);
}
function startTurn(G, now) {
  G.turnNo++; G.turnStart = now; G.deadline = now + (G.turnMs || TURN_MS); G.drawnId = null;
  if (G.rules.chaos && G.turnNo > 1 && G.turnNo % 6 === 0) chaos(G);
  const p = G.players[G.cur];
  G.botAt = p && p.bot ? now + rnd(900, 1800) : null;
}
function take(G) {
  if (G.draw.length === 0) {
    const t = G.discard.pop(); G.draw = shuffle(G.discard); G.discard = [t];
    if (G.draw.length === 0) return null;
  }
  return G.draw.pop();
}
function give(G, p, k) {
  const got = [];
  for (let i = 0; i < k; i++) { const c = take(G); if (c) { p.hand.push(c); got.push(c); } }
  p.saidUno = false;
  return got;
}
export function canPlay(G, card) {
  if (G.pending > 0) return G.rules.stacking && card.value === G.pendingKind;
  if (card.color === 'wild') return true;
  return card.color === G.color || card.value === top(G).value;
}
function checkWin(G) {
  for (const p of G.players) if (p.hand.length === 0 && !G.winner) { G.winner = p.id; emit(G, { type: 'win', pid: p.id }); }
  return !!G.winner;
}

// ---------------- actions ----------------
export function play(G, pid, cardId, color, now) {
  if (G.winner) return 'จบเกมแล้ว';
  if (G.pickTarget) return 'รอเลือกคนสลับไพ่';
  const i = idx(G, pid); if (i < 0) return 'ไม่พบผู้เล่น';
  const p = G.players[i];
  const card = p.hand.find(c => c.id === cardId); if (!card) return 'ไม่มีไพ่ใบนี้';
  let jump = false;
  if (i !== G.cur) {
    const t = top(G);
    if (G.rules.jumpIn && G.pending === 0 && card.color !== 'wild' && card.color === t.color && card.value === t.value) jump = true;
    else return 'ยังไม่ถึงตาคุณ';
  } else {
    if (G.drawnId !== null && card.id !== G.drawnId) return 'ลงได้เฉพาะใบที่เพิ่งจั่ว';
    if (!canPlay(G, card)) return 'ลงใบนี้ไม่ได้';
  }
  if (card.color === 'wild' && !COLORS.includes(color)) return 'ต้องเลือกสี';

  p.hand.splice(p.hand.indexOf(card), 1);
  G.discard.push(card); G.lastPlayedBy = pid;
  G.color = card.color === 'wild' ? color : card.color;
  G.uno = null;
  const ev = { type: 'play', pid, card, color: G.color, jump, effect: null };
  emit(G, ev);
  if (p.hand.length === 0) { checkWin(G); return null; }
  if (p.hand.length === 1 && !p.saidUno) {
    if (p.bot && Math.random() < 0.85) { p.saidUno = true; emit(G, { type: 'uno', pid }); }
    else {
      G.uno = { id: pid, until: now + UNO_MS, botAt: null };
      const catcher = G.players.find(o => o.bot && o.id !== pid);
      if (catcher && Math.random() < (p.bot ? 0.5 : 0.6)) G.uno.botAt = now + rnd(1300, 2700);
    }
  }
  if (p.hand.length > 1) p.saidUno = false;

  const v = card.value;
  let next;
  if (v === 'S') { ev.effect = 'skip'; ev.target = G.players[step(G, i, 1)].id; next = step(G, i, 2); }
  else if (v === 'R') { ev.effect = 'reverse'; G.dir = -G.dir; next = n(G) === 2 ? i : step(G, i, 1); }
  else if (v === '+2' || v === '+4') {
    ev.effect = v === '+2' ? 'draw2' : 'wild4';
    const k = v === '+2' ? 2 : 4;
    if (G.rules.stacking) { G.pending += k; G.pendingKind = v; next = step(G, i, 1); ev.target = G.players[next].id; }
    else {
      const victim = G.players[step(G, i, 1)]; ev.target = victim.id;
      give(G, victim, k); emit(G, { type: 'draw', pid: victim.id, count: k, forced: true, by: pid });
      next = step(G, i, 2);
    }
  }
  else if (v === 'W') { ev.effect = 'wild'; next = step(G, i, 1); }
  else if (v === '7' && G.rules.sevenZero) { ev.effect = 'seven'; G.pickTarget = true; G.cur = i; G.drawnId = null; G.deadline = now + (G.turnMs || TURN_MS); G.botAt = p.bot ? now + rnd(900, 1500) : null; return null; }
  else if (v === '0' && G.rules.sevenZero) {
    ev.effect = 'zero';
    const hands = G.players.map(x => x.hand);
    G.players.forEach((x, k) => { x.hand = hands[(((k - G.dir) % n(G)) + n(G)) % n(G)]; x.saidUno = false; });
    G.uno = null;
    next = step(G, i, 1);
  }
  else next = step(G, i, 1);
  if (checkWin(G)) return null;
  G.cur = next; startTurn(G, now);
  return null;
}

export function chooseTarget(G, pid, targetId, now) {
  if (!G.pickTarget || G.players[G.cur].id !== pid) return 'ไม่ใช่ช่วงเลือกคนสลับ';
  const me = G.players[G.cur], t = G.players.find(p => p.id === targetId);
  if (!t || t.id === pid) return 'เลือกคนอื่น';
  [me.hand, t.hand] = [t.hand, me.hand]; me.saidUno = false; t.saidUno = false;
  G.pickTarget = false; G.uno = null;
  emit(G, { type: 'swap', pid, target: targetId });
  if (checkWin(G)) return null;
  G.cur = step(G, G.cur, 1); startTurn(G, now);
  return null;
}

export function drawCard(G, pid, now) {
  if (G.winner) return 'จบเกมแล้ว';
  if (G.pickTarget) return 'รอเลือกคนสลับไพ่';
  const i = idx(G, pid); if (i !== G.cur) return 'ยังไม่ถึงตาคุณ';
  const p = G.players[i];
  if (G.pending > 0) {
    const k = G.pending; G.pending = 0; G.pendingKind = null;
    give(G, p, k); emit(G, { type: 'draw', pid, count: k, forced: true, by: G.lastPlayedBy });
    G.cur = step(G, i, 1); startTurn(G, now); return null;
  }
  if (G.drawnId !== null) return 'จั่วแล้ว เลือกลงหรือข้ามตา';
  const got = give(G, p, 1);
  emit(G, { type: 'draw', pid, count: got.length, forced: false });
  if (!got.length) { G.cur = step(G, i, 1); startTurn(G, now); return null; }
  G.drawnId = got[0].id;
  if (p.bot) G.botAt = now + rnd(600, 1100);
  return null;
}

export function pass(G, pid, now) {
  const i = idx(G, pid);
  if (i !== G.cur || G.drawnId === null) return 'ข้ามตาไม่ได้';
  emit(G, { type: 'pass', pid });
  G.cur = step(G, i, 1); startTurn(G, now); return null;
}

export function sayUno(G, pid) {
  const p = G.players[idx(G, pid)]; if (!p) return 'ไม่พบผู้เล่น';
  if (p.hand.length > 2) return 'ยังมีไพ่เยอะอยู่';
  if (p.saidUno) return null;
  p.saidUno = true;
  if (G.uno && G.uno.id === pid) G.uno = null;
  emit(G, { type: 'uno', pid });
  return null;
}

export function catchUno(G, catcherId, now) {
  if (G.uno && now > G.uno.until) G.uno = null;
  const w = G.uno;
  if (!w || w.id === catcherId) return 'ไม่มีให้จับ';
  const victim = G.players[idx(G, w.id)];
  G.uno = null;
  give(G, victim, 2);
  emit(G, { type: 'catch', pid: catcherId, target: victim.id });
  emit(G, { type: 'draw', pid: victim.id, count: 2, forced: true, by: catcherId });
  return null;
}

// ---------------- bot brain ----------------
function bestColor(hand) {
  const cnt = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.color !== 'wild') cnt[c.color] += 1 + (isNaN(+c.value) ? 0.5 : 0);
  const best = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  return best[0][1] > 0 ? best[0][0] : COLORS[Math.floor(Math.random() * 4)];
}
function botMove(G, now) {
  const i = G.cur, p = G.players[i];
  if (G.pickTarget) {
    const t = G.players.filter(o => o.id !== p.id).sort((a, b) => a.hand.length - b.hand.length)[0];
    return chooseTarget(G, p.id, t.id, now);
  }
  const nextP = G.players[step(G, i, 1)];
  const danger = nextP.hand.length <= 2;
  let cands = p.hand.filter(c => (G.drawnId === null || c.id === G.drawnId) && canPlay(G, c));
  if (!cands.length) return G.drawnId !== null ? pass(G, p.id, now) : drawCard(G, p.id, now);
  const score = c => {
    const v = c.value; let s = 0;
    if (c.color === 'wild') s = v === '+4' ? (danger ? 90 : 5) : (danger ? 40 : 10);
    else if (v === '+2') s = danger ? 85 : 45;
    else if (v === 'S' || v === 'R') s = danger ? 80 : 50;
    else s = 30 + Number(v) + (c.color === G.color ? 8 : 0);
    if (p.hand.length <= 2 && c.color === 'wild') s += 30; // finish strong
    return s + Math.random() * 6;
  };
  cands.sort((a, b) => score(b) - score(a));
  const c = cands[0];
  if (p.hand.length === 2 && Math.random() < 0.85) sayUno(G, p.id);
  return play(G, p.id, c.id, c.color === 'wild' ? bestColor(p.hand.filter(x => x.id !== c.id)) : null, now);
}

// Time-driven progress: bots, turn timer, away players, bot UNO catches.
export function tick(G, now, awayIds = []) {
  if (G.winner) return false;
  let changed = false;
  if (G.uno && G.uno.botAt && now >= G.uno.botAt && now <= G.uno.until) {
    const catcher = G.players.find(o => o.bot && o.id !== G.uno.id);
    if (catcher) { catchUno(G, catcher.id, now); changed = true; }
  }
  if (G.uno && now > G.uno.until) { G.uno = null; changed = true; }
  const p = G.players[G.cur];
  if (p.bot && G.botAt && now >= G.botAt) { botMove(G, now); return true; }
  const away = awayIds.includes(p.id) && now >= G.turnStart + AWAY_MS;
  if (!p.bot && (now >= G.deadline || away)) {
    if (G.pickTarget) { const t = G.players.filter(o => o.id !== p.id).sort((a, b) => a.hand.length - b.hand.length)[0]; chooseTarget(G, p.id, t.id, now); }
    else if (G.drawnId !== null) pass(G, p.id, now);
    else if (G.pending > 0) drawCard(G, p.id, now);
    else { drawCard(G, p.id, now); if (!G.winner && G.players[G.cur].id === p.id && G.drawnId !== null) pass(G, p.id, now); }
    emit(G, { type: 'timeout', pid: p.id });
    return true;
  }
  return changed;
}

export function wakeAt(G) {
  if (G.winner) return null;
  const t = [G.deadline];
  if (G.botAt) t.push(G.botAt);
  if (G.uno) t.push(G.uno.botAt || G.uno.until, G.uno.until + 50);
  return Math.min(...t.filter(Boolean));
}

export function publicView(G, now) {
  return {
    players: G.players.map(p => ({ id: p.id, name: p.name, char: p.char, bot: p.bot, count: p.hand.length, saidUno: p.saidUno })),
    top: top(G), color: G.color, cur: G.players[G.cur].id, dir: G.dir, pending: G.pending, pendingKind: G.pendingKind,
    pickTarget: G.pickTarget, drawCount: G.draw.length, lastPlayedBy: G.lastPlayedBy,
    uno: G.uno ? G.uno.id : null, unoUntil: G.uno ? G.uno.until : null, winner: G.winner, rules: G.rules,
    turnStart: G.turnStart, deadline: G.deadline, turnNo: G.turnNo, wakeAt: wakeAt(G), now,
    drawnBy: G.drawnId !== null ? G.players[G.cur].id : null,
    standings: G.winner ? G.players.map(p => ({ id: p.id, count: p.hand.length })).sort((a, b) => a.count - b.count) : null,
  };
}
