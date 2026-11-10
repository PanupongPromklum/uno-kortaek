// Room / lobby state machine (pure). Mutates `room` (rooms row) and returns { error?, game }.
import * as E from './engine.js';
export const MAX_PLAYERS = 6;
const CHAR_RE = /^[a-z0-9_-]{1,24}$/;

const humans = r => r.players.filter(p => !p.bot);
function pushEvents(room, list) {
  room.events = list.map(e => ({ ...e, seq: ++room.seq }));
}

function startGame(room, now) {
  const G = E.newGame(room.players.map(p => ({ id: p.id, name: p.name, char: p.char, bot: p.bot })), room.rules, now);
  room.phase = 'playing'; room.load_deadline = null;
  pushEvents(room, [{ type: 'start' }, ...G.events.splice(0)]);
  room.state = E.publicView(G, now);
  return G;
}

export function apply(room, game, uid, uname, m, now) {
  const me = room.players.find(p => p.id === uid);
  const isHost = room.host === uid;
  room.events = [];
  const err = e => ({ error: e, game });

  switch (m.t) {
    case 'join':
      if (me) { me.away = false; return { game }; }
      if (room.phase !== 'lobby') return err('เกมเริ่มไปแล้ว');
      if (room.players.length >= MAX_PLAYERS) return err('ห้องเต็มแล้ว (6 คน)');
      {
        const used = new Set(room.players.map(p => p.char));
        const char = (m.chars || []).find(c => CHAR_RE.test(c) && !used.has(c));
        if (!char) return err('ตัวละครไม่พอ');
        room.players.push({ id: uid, name: uname, char, card: Math.floor(Math.random() * 8), bot: false, ready: false, loaded: false, away: false });
      }
      return { game };
    case 'rejoin':
      if (!me) return err('คุณไม่ได้อยู่ในห้องนี้');
      me.away = false; return { game };
    case 'leave': {
      if (!me) return { game };
      if (room.phase === 'lobby' || room.phase === 'over') {
        room.players = room.players.filter(p => p.id !== uid);
        if (isHost) { const h = humans(room)[0]; room.host = h ? h.id : ''; }
        if (!humans(room).length) room.phase = 'dead';
      } else me.away = true;
      return { game };
    }
  }
  if (!me) return err('คุณไม่ได้อยู่ในห้องนี้');

  // stickers / emotes: any phase, max 1 per 1.2s per player
  if (m.t === 'sticker') {
    if (!/^[a-z0-9_-]{1,20}$/.test(m.id || '')) return err('สติกเกอร์ไม่ถูกต้อง');
    if (me.stk && now - me.stk < 1200) return err('ส่งถี่เกินไป รอแป๊บนึง');
    me.stk = now;
    pushEvents(room, [{ type: 'sticker', pid: uid, id: m.id }]);
    return { game };
  }
  if (m.t === 'pickCard') {
    if (room.phase !== 'lobby' && room.phase !== 'over') return err('เปลี่ยนนามบัตรได้ในล็อบบี้');
    const c = Number(m.card); if (!(c >= 0 && c < 8)) return err('นามบัตรไม่ถูกต้อง');
    me.card = c; return { game };
  }

  if (room.phase === 'lobby') {
    switch (m.t) {
      case 'pickChar':
        if (!CHAR_RE.test(m.char || '')) return err('ตัวละครไม่ถูกต้อง');
        if (room.players.some(p => p.char === m.char && p.id !== uid)) return err('ตัวละครนี้มีคนเลือกแล้ว');
        me.char = m.char; me.ready = false; return { game };
      case 'ready': me.ready = !!m.ready; return { game };
      case 'rules':
        if (!isHost) return err('เฉพาะเจ้าของห้อง');
        for (const k of ['stacking', 'jumpIn', 'sevenZero', 'chaos', 'speed']) if (m.rules && k in m.rules) room.rules[k] = !!m.rules[k];
        humans(room).forEach(p => { if (p.id !== room.host) p.ready = false; });
        return { game };
      case 'addBot': {
        if (!isHost) return err('เฉพาะเจ้าของห้อง');
        if (room.players.length >= MAX_PLAYERS) return err('ห้องเต็มแล้ว (6 คน)');
        const used = new Set(room.players.map(p => p.char));
        const char = (m.chars || []).find(c => CHAR_RE.test(c) && !used.has(c));
        if (!char) return err('ตัวละครไม่พอ');
        const id = 'bot-' + Math.random().toString(36).slice(2, 8);
        room.players.push({ id, name: (m.names && m.names[char] ? m.names[char] : char) + ' (บอท)', char, card: Math.floor(Math.random() * 8), bot: true, ready: true, loaded: true, away: false });
        return { game };
      }
      case 'removeBot':
        if (!isHost) return err('เฉพาะเจ้าของห้อง');
        room.players = room.players.filter(p => !(p.bot && p.id === m.id));
        return { game };
      case 'start': {
        if (!isHost) return err('เฉพาะเจ้าของห้อง');
        if (room.players.length < 2) return err('ต้องมีผู้เล่นอย่างน้อย 2 คน (เพิ่มบอทได้)');
        if (humans(room).some(p => p.id !== room.host && !p.ready)) return err('ยังมีคนไม่พร้อม');
        room.phase = 'loading'; room.load_deadline = now + 20000;
        room.players.forEach(p => { p.loaded = !!p.bot; p.away = false; });
        pushEvents(room, [{ type: 'loading' }]);
        return { game: null };
      }
    }
    return err('ทำไม่ได้ตอนอยู่ในล็อบบี้');
  }

  if (room.phase === 'loading') {
    if (m.t === 'loaded') me.loaded = true;
    else if (m.t !== 'tick') return { game };
    const waiting = room.players.filter(p => !p.bot && !p.away && !p.loaded);
    if (!waiting.length || now >= room.load_deadline) return { game: startGame(room, now) };
    return { game };
  }

  if (room.phase === 'over') {
    if (m.t === 'again') {
      if (!isHost) return err('เฉพาะเจ้าของห้อง');
      room.players = room.players.filter(p => p.bot || !p.away);
      room.players.forEach(p => { p.ready = !!p.bot; p.loaded = false; });
      room.phase = 'lobby'; room.state = null;
      pushEvents(room, [{ type: 'lobby' }]);
      return { game: null, clearHands: true };
    }
    return { game };
  }

  // playing
  const G = game;
  if (!G) return err('ไม่มีเกม');
  me.away = false;
  let e = null;
  switch (m.t) {
    case 'play': e = E.play(G, uid, m.card, m.color, now); break;
    case 'draw': e = E.drawCard(G, uid, now); break;
    case 'pass': e = E.pass(G, uid, now); break;
    case 'uno': e = E.sayUno(G, uid); break;
    case 'catch': e = E.catchUno(G, uid, now); break;
    case 'target': e = E.chooseTarget(G, uid, m.id, now); break;
    case 'tick': {
      const away = room.players.filter(p => p.away).map(p => p.id);
      let guard = 0;
      while (E.tick(G, now, away) && guard++ < 3) { /* allow chained bot steps only if already due */ if (!(G.botAt && now >= G.botAt) && !(G.uno && G.uno.botAt && now >= G.uno.botAt)) break; }
      break;
    }
    case 'loaded': case 'rejoin': break;
    default: return err('คำสั่งไม่ถูกต้อง');
  }
  if (e) { G.events.length = 0; return err(e); }
  pushEvents(room, G.events.splice(0));
  if (G.winner) room.phase = 'over';
  room.state = E.publicView(G, now);
  return { game: G };
}
