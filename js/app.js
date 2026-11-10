import { OnlineNet, LocalNet } from './net.js';
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const W = 1280, H = 720, C = { x: 640, y: 318 };
const COLOR = { red: '#E5484D', yellow: '#F5B921', green: '#38B26B', blue: '#3B82E0' };
const SYM = { S: '⊘', R: '⇄', '+2': '+2', W: '★', '+4': '+4' };
const LABEL = { skip: 'ข้าม!', reverse: 'กลับทิศ!', draw2: '+2!', wild: 'เปลี่ยนสี!', wild4: '+4!!', seven: 'สลับมือ!', zero: 'ส่งมือวน!' };
const VOICE = { skip: 'skip', reverse: 'reverse', draw2: 'draw2', wild: 'wild', wild4: 'wild4', seven: 'wild', zero: 'wild' };

// ---------- stage scaling ----------
let SCALE = 1;
function fit() { SCALE = Math.min(innerWidth / W, innerHeight / H); $('#stage').style.transform = `scale(${SCALE})`; }
addEventListener('resize', fit); fit();
const toStage = (cx, cy) => { const r = $('#stage').getBoundingClientRect(); return { x: (cx - r.left) / SCALE, y: (cy - r.top) / SCALE }; };

// ---------- characters ----------
let ORDER = [], CH = {};
async function loadChars() {
  const m = await (await fetch('characters/manifest.json', { cache: 'no-cache' })).json();
  ORDER = m.characters;
  await Promise.all(ORDER.map(async id => { CH[id] = { id, ...(await (await fetch(`characters/${id}/character.json`, { cache: 'no-cache' })).json()) }; }));
}
const ch = id => CH[id] || { id, name: id, color: '#999', light: '#ddd', lines: {}, voice: {} };
const img = (id, pose = 'idle') => `characters/${id}/${pose}.png`;
const names = () => Object.fromEntries(ORDER.map(id => [id, ch(id).name]));

// ---------- state ----------
let net = null, myName = '', room = null, S = null, hand = { hand: [], drawn: null }, lastSeq = -1, online = new Set(), connected = true;
let offSamples = [], clockOff = 0, lastTick = 0, keepRoom = null, sortMode = true, selected = null, pendingWild = null, lastFrom = null;
const meId = () => net && net.uid;
const nowS = () => Date.now() + clockOff;
function sampleClock(t) { const now = Date.now(); offSamples.push({ at: now, off: t - now }); offSamples = offSamples.filter(s => now - s.at < 60000); clockOff = Math.max(...offSamples.map(s => s.off)); }

// ---------- ui helpers ----------
function show(id) { $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
let toastT; function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
function parade(el) { el.innerHTML = ORDER.map(id => `<img src="${img(id)}" alt="">`).join(''); }

// ---------- boot / auth ----------
let authMode = 'login';
$$('.tabs button').forEach(b => b.onclick = () => { authMode = b.dataset.tab; $$('.tabs button').forEach(x => x.classList.toggle('on', x === b)); $('#a-go').textContent = authMode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครและเข้าเล่น'; $('#a-err').textContent = ''; });
async function doAuth() {
  Snd.init(); const u = $('#a-user').value.trim(), p = $('#a-pass').value;
  if (!u || !p) { $('#a-err').textContent = 'กรอกชื่อผู้ใช้และรหัสผ่าน'; return; }
  $('#a-go').disabled = true; $('#a-err').textContent = '';
  if (!(net instanceof OnlineNet)) net = new OnlineNet();
  const r = authMode === 'login' ? await net.login(u, p) : await net.register(u, p);
  $('#a-go').disabled = false;
  if (r.error) { $('#a-err').textContent = r.error; return; }
  afterLogin();
}
$('#a-go').onclick = doAuth; $('#a-pass').onkeydown = e => { if (e.key === 'Enter') doAuth(); };
$('#a-offline').onclick = () => { Snd.init(); net = new LocalNet('ฉัน'); afterLogin(); };

async function afterLogin() {
  Snd.bgm(true);
  const r = await net.call({ t: 'me' });
  if (r.error) { if (r.auth) { show('s-auth'); return; } toast(r.error); show('s-auth'); return; }
  myName = r.username; $('#m-name').textContent = myName;
  $('#m-join').parentElement.classList.toggle('hidden', net.mode === 'local');
  $('#m-logout').textContent = net.mode === 'local' ? 'กลับไปหน้าล็อกอิน' : 'ออกจากระบบ';
  const want = new URLSearchParams(location.search).get('room');
  if (r.room) {
    const mine = r.room.players && r.room.players.find(p => p.id === meId());
    if (mine && mine.away) { keepRoom = r.room.code; showMenu(); return; }
    await enterRoom(r.room.code);
    if (r.room.phase === 'playing' || r.room.phase === 'loading') net.call({ t: 'rejoin', code: r.room.code });
    return;
  }
  if (want && net.mode === 'online') { history.replaceState(null, '', location.pathname); return joinRoom(want); }
  showMenu();
}
function showMenu() {
  room = null; S = null;
  const b = $('#m-rejoin'); b.classList.toggle('hidden', !keepRoom); b.textContent = `กลับเข้าห้อง ${keepRoom || ''}`;
  show('s-menu');
}

// ---------- menu ----------
async function createRoom(bots = 0) {
  const r = await net.call({ t: 'create', chars: ORDER });
  if (r.error) return toast(r.error);
  await enterRoom(r.code);
  for (let i = 0; i < bots; i++) await net.call({ t: 'addBot', code: r.code, chars: shuffled(ORDER), names: names() });
}
async function joinRoom(code) {
  const r = await net.call({ t: 'join', code, chars: shuffled(ORDER) });
  if (r.error) return toast(r.error);
  await enterRoom(r.code);
}
const shuffled = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
$('#m-create').onclick = () => createRoom(0);
$('#m-bots').onclick = () => createRoom(3);
$('#m-join').onclick = () => joinRoom($('#m-code').value.trim().toUpperCase());
$('#m-code').oninput = e => e.target.value = e.target.value.toUpperCase();
$('#m-rejoin').onclick = async () => { const c = keepRoom; keepRoom = null; await enterRoom(c); net.call({ t: 'rejoin', code: c }); };
$('#m-logout').onclick = async () => { await net.logout(); net = null; show('s-auth'); };

// ---------- room connection ----------
async function enterRoom(code) {
  lastSeq = -1; room = null; S = null; hand = { hand: [], drawn: null }; selected = null;
  await net.open(code, { room: onRoom, hand: onHand, presence: ids => { online = new Set(ids); if (room) rerender(); }, conn: ok => { connected = ok; $('#conn').classList.toggle('hidden', ok); } });
}
async function leaveRoom() {
  const playing = room && (room.phase === 'playing' || room.phase === 'loading');
  const code = room && room.code;
  await net.call({ t: 'leave', code });
  net.close();
  keepRoom = playing && net.mode === 'online' ? code : null;
  $('#over').classList.add('hidden'); $('#menu').classList.add('hidden');
  showMenu();
}

function onRoom(r) {
  if (!r) { if (room) toast('ห้องถูกปิดแล้ว'); net.close(); showMenu(); return; }
  if (room && r.code === room.code && r.version < room.version) return;
  const first = lastSeq < 0, prevPhase = room ? room.phase : null;
  room = r; S = r.state;
  if (S && S.now && (!prevPhase || r.events.length)) sampleClock(S.now);
  const me = r.players.find(p => p.id === meId());
  if (!me) { net.close(); showMenu(); return; }
  if (me.away) { keepRoom = r.code; net.close(); showMenu(); return; }
  const evs = (r.events || []).filter(e => e.seq > lastSeq);
  lastSeq = Math.max(lastSeq, r.seq);
  if (r.phase === 'lobby') { $('#over').classList.add('hidden'); renderLobby(); show('s-lobby'); }
  else if (r.phase === 'loading') { show('s-loading'); renderLoading(); startLoading(); }
  else {
    if (!$('#s-game').classList.contains('active')) { show('s-game'); buildSeats(true); }
    if (prevPhase === 'loading' && !first) startBanner();
    renderGame();
    if (r.phase === 'over') showOver(first);
  }
  if (!first) evs.forEach(onEvent);
}
let autoPassFor = null;
function onHand(d) {
  hand = d && d.hand ? d : { hand: [], drawn: null };
  if (room && room.phase !== 'lobby') { renderHand(); if (S) updateButtons(); }
  if (S && room && room.phase === 'playing' && S.cur === meId() && hand.drawn != null && autoPassFor !== S.turnNo) {
    const c = hand.hand.find(x => x.id === hand.drawn);
    if (c && !playable(c)) { autoPassFor = S.turnNo; setTimeout(() => { if (S && S.cur === meId() && hand.drawn != null) act({ t: 'pass' }); }, 650); }
  }
}
function rerender() { if (!room) return; if (room.phase === 'lobby') renderLobby(); else if (room.phase === 'loading') renderLoading(); else renderGame(); }
const isHuman = p => !p.bot;
const isOnline = id => net.mode === 'local' || online.has(id);

// heartbeat: timers + server ticks (bots, turn timer, loading timeout)
setInterval(() => {
  if (!room) return;
  const humans = room.players.filter(isHuman).map(p => p.id).sort();
  const jit = net.mode === 'local' ? 0 : Math.max(0, humans.indexOf(meId())) * 350 + 150;
  const t = nowS();
  let due = false;
  if (room.phase === 'playing' && S && S.wakeAt && t > S.wakeAt + jit) due = true;
  if (room.phase === 'loading' && room.load_deadline && t > room.load_deadline + jit) due = true;
  if (due && Date.now() - lastTick > 1200) { lastTick = Date.now(); net.call({ t: 'tick', code: room.code }); }
  if (room.phase === 'playing') updateTimer();
}, 200);

// ---------- lobby ----------
function renderLobby() {
  const isHost = room.host === meId(), me = room.players.find(p => p.id === meId());
  $('#l-code').textContent = room.code; $('#l-copy').classList.toggle('hidden', net.mode === 'local');
  $('#l-mode').textContent = net.mode === 'local' ? 'โหมดฝึก (ออฟไลน์)' : `${room.players.length}/6 คน`;
  let html = '';
  for (let i = 0; i < 6; i++) {
    const p = room.players[i];
    if (!p) { html += `<div class="slot empty">${isHost ? '<button class="btn small lime" data-add>+ เพิ่มบอท</button>' : 'รอผู้เล่น'}</div>`; continue; }
    const st = p.bot ? 'บอท' : p.id === room.host ? 'เจ้าของห้อง' : p.ready ? 'พร้อม' : 'รอ…';
    const ok = p.bot || p.ready || p.id === room.host;
    html += `<div class="frame slotf ${isHuman(p) && !isOnline(p.id) ? 'off' : ''} ${p.id === meId() ? 'me' : ''}" data-id="${p.id}" style="--r:${(i * 37) % 7 - 3}deg">${frameHTML(p, { pose: p.id === meId() ? 'shout' : 'idle', tr: i % 2 ? 5 : -4, suffix: p.id === meId() ? ' (คุณ)' : '',
      extra: `<span class="tag ${ok ? 'ok' : ''}">${st}</span>${p.bot && isHost ? `<button class="kick" data-kick="${p.id}" title="เอาบอทออก">✕</button>` : ''}` })}</div>`;
  }
  $('#l-slots').innerHTML = html;
  $$('#l-slots [data-add]').forEach(b => b.onclick = () => net.call({ t: 'addBot', code: room.code, chars: shuffled(ORDER), names: names() }).then(r => r.error && toast(r.error)));
  $$('#l-slots [data-kick]').forEach(b => b.onclick = () => net.call({ t: 'removeBot', code: room.code, id: b.dataset.kick }));
  const c = ch(me.char);
  $('#l-preview').src = img(me.char, 'shout'); $('#l-pname').textContent = c.name; $('#l-ptitle').textContent = c.title || '';
  const taken = new Set(room.players.filter(p => p.id !== meId()).map(p => p.char));
  $('#l-chars').innerHTML = ORDER.map(id => `<button class="cc ${id === me.char ? 'sel' : ''} ${taken.has(id) ? 'taken' : ''}" data-c="${id}" title="${esc(ch(id).name)}"><img src="${img(id)}" alt="${esc(ch(id).name)}"></button>`).join('');
  renderNamecards(me); $$('#l-chars .cc').forEach(b => b.onclick = () => { Snd.fx('pop'); net.call({ t: 'pickChar', code: room.code, char: b.dataset.c }).then(r => r.error && toast(r.error)); });
  for (const k of ['stacking', 'jumpIn', 'sevenZero', 'chaos', 'speed']) { const el = $('#r-' + k); el.checked = !!room.rules[k]; el.disabled = !isHost; }
  const others = room.players.filter(p => isHuman(p) && p.id !== room.host);
  const allReady = others.every(p => p.ready);
  $('#l-ready').classList.toggle('hidden', isHost); $('#l-ready').textContent = me.ready ? 'ยกเลิกพร้อม' : 'พร้อม!';
  $('#l-start').classList.toggle('hidden', !isHost); $('#l-start').disabled = room.players.length < 2 || !allReady;
  $('#l-hint').textContent = !isHost ? 'กด "พร้อม!" แล้วรอเจ้าของห้องเริ่มเกม'
    : room.players.length < 2 ? 'ส่งรหัสห้องให้เพื่อน หรือกด "+ เพิ่มบอท"' : allReady ? 'ทุกคนพร้อมแล้ว กดเริ่มเล่นได้เลย' : 'รอเพื่อนกด "พร้อม!"';
}
$('#l-ready').onclick = () => { const me = room.players.find(p => p.id === meId()); net.call({ t: 'ready', code: room.code, ready: !me.ready }); };
$('#l-start').onclick = () => net.call({ t: 'start', code: room.code }).then(r => r.error && toast(r.error));
$('#l-leave').onclick = leaveRoom;
$('#l-copy').onclick = () => { const u = `${location.origin}${location.pathname}?room=${room.code}`; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast('คัดลอกลิงก์แล้ว'), () => toast(u, 5000)); };
for (const k of ['stacking', 'jumpIn', 'sevenZero', 'chaos', 'speed']) $('#r-' + k).onchange = () => net.call({ t: 'rules', code: room.code, rules: Object.fromEntries(['stacking', 'jumpIn', 'sevenZero', 'chaos', 'speed'].map(x => [x, $('#r-' + x).checked])) });

// ---------- loading ----------
function renderLoading() {
  $('#ld-row').innerHTML = room.players.map(p => `<figure class="${p.loaded ? 'ok' : ''}"><img src="${img(p.char)}" alt=""><figcaption>${esc(p.name)}</figcaption></figure>`).join('');
}
let loadingFor = null;
async function startLoading() {
  const key = room.code + ':' + room.seq;
  if (loadingFor && loadingFor.startsWith(room.code + ':') && room.players.find(p => p.id === meId()).loaded) return;
  if (loadingFor === key) return; loadingFor = key;
  const ids = room.players.map(p => p.char);
  const urls = [...new Set(ids.flatMap(id => ['idle', 'shout', 'win', 'sad', 'bg', 'card_back', 'card_art', 'emblem'].map(k => img(id, k))))];
  let done = 0; const total = urls.length + 1, bar = $('#ld-bar');
  const tick = () => { done++; bar.style.width = (100 * done / total) + '%'; };
  await Promise.all(urls.map(u => new Promise(ok => { const i = new Image(); i.onload = i.onerror = () => { tick(); ok(); }; i.src = u; })));
  await Snd.loadVoices(CH, ids); tick();
  await sleep(300);
  if (room && room.phase === 'loading') net.call({ t: 'loaded', code: room.code });
}

// ---------- player frames (namecards) ----------
const NAMECARDS = [
  { tape: 'repeating-linear-gradient(45deg,#A1E6EF 0 8px,#D3F4F8 8px 16px)', deco: '★', dc: '#F3CF3E', sw: '#A1E6EF' },
  { tape: 'repeating-linear-gradient(45deg,#E87D9D 0 8px,#F7C3D2 8px 16px)', deco: '♥', dc: '#E87D9D', sw: '#E87D9D' },
  { tape: 'repeating-linear-gradient(90deg,#F5E87A 0 10px,#FFF6B8 10px 20px)', deco: '✿', dc: '#F5A623', sw: '#F5E87A' },
  { tape: 'radial-gradient(#fff 25%,#DFF671 27%) 0 0/12px 12px', deco: '♣', dc: '#6CC57A', sw: '#DFF671' },
  { tape: 'repeating-linear-gradient(45deg,#BA479C 0 8px,#E3A6D3 8px 16px)', deco: '✦', dc: '#BA479C', sw: '#BA479C' },
  { tape: 'repeating-linear-gradient(90deg,#1BBDC7 0 6px,#fff 6px 12px)', deco: '☁', dc: '#62B2E6', sw: '#1BBDC7' },
  { tape: 'repeating-linear-gradient(45deg,#FFD9C7 0 8px,#F07C7C 8px 16px)', deco: '❀', dc: '#F07C7C', sw: '#FFB199' },
  { tape: 'repeating-linear-gradient(0deg,#C6B6F2 0 8px,#E6DEFB 8px 16px)', deco: '☾', dc: '#8E7CD6', sw: '#C6B6F2' },
];
function frameHTML(p, o = {}) {
  const nc = NAMECARDS[(p.card || 0) % 8], c = ch(p.char);
  return `<i class="tp" style="background:${nc.tape};--tr:${o.tr || -4}deg"></i>
    <div class="ph" style="--bgc:url(characters/${p.char}/bg.png)"><img src="${img(p.char, o.pose || 'idle')}" alt=""></div>
    <div class="nm"><span>${esc(p.name)}${o.suffix || ''}</span></div><div class="tbar"><i></i></div>
    <span class="deco" style="--dc:${nc.dc}">${nc.deco}</span>${o.extra || ''}`;
}
// balanced layout: opponents evenly spaced on the upper arc of an ellipse (symmetric for 1..5 opponents)
const ARC = { cx: 640, cy: 345, rx: 505, ry: 220 };
function oppPos(k, j) { const a = (180 + (j + 1) * 180 / (k + 1)) * Math.PI / 180; return { x: Math.round(ARC.cx + ARC.rx * Math.cos(a)), y: Math.round(ARC.cy + ARC.ry * Math.sin(a)) }; }
const ME_POS = { x: 128, y: 560 };
let seatSig = '', seat = {};
function buildSeats(force) {
  if (!S) return;
  const sig = S.players.map(p => p.id + p.char).join('|') + meId();
  if (!force && sig === seatSig) return; seatSig = sig;
  const N = S.players.length, myIdx = Math.max(0, S.players.findIndex(p => p.id === meId()));
    seat = {}; const box = $('#frames'); box.innerHTML = '';
  S.players.forEach((p, i) => {
    const o = (i - myIdx + N) % N;
    const pos = o === 0 ? ME_POS : oppPos(N - 1, o - 1);
    seat[p.id] = { pos };
    const f = document.createElement('div'); f.className = 'frame'; f.dataset.id = p.id;
    f.style.left = pos.x + 'px'; f.style.top = pos.y + 'px'; f.style.setProperty('--r', ((i * 37) % 7 - 3) + 'deg');
    f.onclick = () => { if (S.pickTarget && S.cur === meId() && p.id !== meId()) act({ t: 'target', id: p.id }); };
    box.appendChild(f);
  });
  $('#draw-pile .pile-stack').style.backgroundImage = `url(characters/${(S.players.find(p => p.id === meId()) || S.players[0]).char}/card_back.png)`;
}

function renderGame() {
  if (!S) return;
  buildSeats(false);
  const me = meId(), over = room.phase === 'over';
  S.players.forEach((p, i) => {
    const f = $(`#frames .frame[data-id="${CSS.escape(p.id)}"]`); if (!f) return;
    const rp = room.players.find(x => x.id === p.id) || p;
    const off = isHuman(p) && !isOnline(p.id) && net.mode === 'online';
    const pose = over ? (p.id === S.winner ? 'win' : 'sad') : 'idle';
    const prev = f.dataset.cnt; f.dataset.cnt = p.count;
    f.className = `frame ${p.id === S.cur && !over ? 'cur' : ''} ${p.id === me ? 'me' : ''} ${off ? 'off' : ''} ${S.pickTarget && S.cur === me && p.id !== me && !over ? 'target' : ''}`;
    f.innerHTML = frameHTML({ ...p, card: rp.card }, { pose, tr: (i % 2 ? 5 : -4), suffix: off ? ' (หลุด)' : '',
      extra: `<b class="cnt ${prev && +prev !== p.count ? 'pop' : ''}">${p.count}</b>${p.saidUno && p.count === 1 ? '<span class="uno">UNO!</span>' : ''}${p.bot ? '<span class="tag">บอท</span>' : ''}` });
  });
  $('#g-room').textContent = (net.mode === 'local' ? 'โหมดฝึก' : room.code) + ' · ตาที่ ' + S.turnNo + (S.rules.chaos ? ' · วุ่นวาย' : '') + (S.rules.speed ? ' · สปีด' : '');
  $('#draw-count').textContent = `เหลือ ${S.drawCount} ใบ`;
  $('#dirarrow').classList.toggle('rev', S.dir < 0);
  const pb = $('#pend-badge'); pb.classList.toggle('hidden', !S.pending); pb.textContent = '+' + S.pending;
  $('#draw-pile').classList.toggle('can', S.cur === me && !S.pickTarget && hand.drawn == null && !over);
  if (!flying) syncDiscard();
  const b = $('#banner'), mine = S.cur === me && !over, cp = S.players.find(p => p.id === S.cur);
  b.classList.toggle('mine', mine);
  b.innerHTML = '<span>' + esc(over ? '' : S.pickTarget ? (mine ? 'แตะกรอบคนที่จะสลับมือด้วย' : `${cp.name} กำลังเลือกคนสลับมือ`) : mine ? (hand.drawn != null ? 'ลงใบที่จั่ว หรือข้ามตา' : S.pending ? `ลงซ้อน หรือแตะกองเพื่อจั่ว ${S.pending} ใบ` : 'ตาคุณ!') : `ตาของ ${cp.name}`) + '</span>';
  if (mine && lastTurnSeen !== S.turnNo) { lastTurnSeen = S.turnNo; Snd.fx('turn'); }
  renderHand(); updateButtons(); updateTimer();
}
let lastTurnSeen = -1;
function updateTimer() {
  if (!S) return;
  const f = $(`#frames .frame[data-id="${CSS.escape(S.cur)}"] .tbar`); if (!f) return;
  const left = Math.max(0, (S.deadline - nowS()) / 1000), total = (S.deadline - S.turnStart) / 1000 || 20;
  f.style.setProperty('--p', (left / total).toFixed(3)); f.classList.toggle('low', left <= 5);
  const catchBtn = $('#b-catch'); if (!catchBtn.classList.contains('hidden') && (!S.unoUntil || nowS() > S.unoUntil)) catchBtn.classList.add('hidden');
}
function updateButtons() {
  const me = S.players.find(p => p.id === meId()), over = room.phase === 'over';
  $('#b-pass').classList.toggle('hidden', !(S.cur === meId() && hand.drawn != null) || over);
  const n = hand.hand.length;
  $('#b-uno').classList.toggle('hidden', over || !me || me.saidUno || !(n === 1 || (n === 2 && S.cur === meId())));
  $('#b-catch').classList.toggle('hidden', over || !S.uno || S.uno === meId() || !S.unoUntil || nowS() > S.unoUntil);
}

// ---------- cards ----------
const LAB = { S: 'ข้าม', R: 'กลับทิศ', '+2': 'จั่ว +2', W: 'เปลี่ยนสี', '+4': 'จั่ว +4' };
function cardEl(card, owner) {
  const el = document.createElement('div'); el.className = `card ${card.color}`; el.dataset.id = card.id;
  const v = card.value, special = isNaN(+v), sym = SYM[v] || v;
  const pose = special ? 'card_art' : 'card_art';
  el.innerHTML = `<div class="win"><img class="art" src="${img(owner, pose)}" alt=""></div><span class="num">${sym}</span><span class="num br">${sym}</span>${special ? `<span class="lab">${LAB[v]}</span>` : ''}`;
  return el;
}
function backEl(owner) { const el = document.createElement('div'); el.className = 'card back'; el.style.backgroundImage = `url(characters/${owner}/card_back.png)`; return el; }
function ownerOf(pid) { const p = S && S.players.find(x => x.id === pid); return p ? p.char : (S ? S.players[0].char : ORDER[0]); }
let flying = 0;
function syncDiscard() {
  const box = $('#discard-cards'), top = S.top, owner = ownerOf(S.lastPlayedBy);
  $('#ring').style.setProperty('--ring', COLOR[S.color]);
  const key = top.id + ':' + owner; if (box.dataset.key === key) return; box.dataset.key = key;
  while (box.children.length > 2) box.removeChild(box.firstChild);
  const el = cardEl(top, owner); el.style.transform = `rotate(${(top.id * 37 % 21) - 10}deg)`; box.appendChild(el);
}
function playable(c) {
  if (!S || room.phase !== 'playing') return false;
  if (S.cur !== meId()) return S.rules.jumpIn && !S.pending && !S.pickTarget && c.color !== 'wild' && c.color === S.top.color && c.value === S.top.value;
  if (S.pickTarget) return false;
  if (hand.drawn != null && c.id !== hand.drawn) return false;
  if (S.pending) return S.rules.stacking && c.value === S.pendingKind;
  return c.color === 'wild' || c.color === S.color || c.value === S.top.value;
}
const CORD = { red: 0, yellow: 1, green: 2, blue: 3, wild: 4 };
const VORD = v => isNaN(+v) ? 10 + ['S', 'R', '+2', 'W', '+4'].indexOf(v) : +v;
function renderHand() {
  const box = $('#hand'); if (!S) return;
  const list = sortMode ? [...hand.hand].sort((a, b) => CORD[a.color] - CORD[b.color] || VORD(a.value) - VORD(b.value)) : hand.hand;
  const n = list.length, Wd = 780, cw = 118, step = n > 1 ? Math.min(92, (Wd - cw) / (n - 1)) : 0, x0 = (Wd - (cw + step * (n - 1))) / 2;
  const mine = ownerOf(meId());
  const have = new Map([...box.children].map(el => [+el.dataset.id, el]));
  const ids = new Set(list.map(c => c.id));
  have.forEach((el, id) => { if (!ids.has(id) && !el.classList.contains('drag')) el.remove(); });
  const pile = { x: 520 - 250, y: 290 - 520 };
  list.forEach((c, i) => {
    let el = have.get(c.id), fresh = !el;
    if (fresh) { el = cardEl(c, mine); el.addEventListener('pointerdown', down); box.appendChild(el); }
    const ok = playable(c), sel = selected === c.id && ok, mid = (n - 1) / 2;
    const x = x0 + step * i, y = (sel ? -60 : 0) + Math.abs(i - mid) * 1.2, rot = (i - mid) * Math.min(2.2, 18 / n);
    el.style.zIndex = i + 1; el.classList.toggle('dim', !ok && S.cur === meId());
    el.style.opacity = el.dataset.sent === '1' ? '0' : '';
    const target = `translate(${x}px,${y}px) rotate(${rot}deg)`;
    if (fresh && seenHand) { el.style.transition = 'none'; el.style.transform = `translate(${pile.x}px,${pile.y}px) scale(.75)`; void el.offsetWidth; el.style.transition = ''; requestAnimationFrame(() => el.style.transform = target); }
    else if (!el.classList.contains('drag')) el.style.transform = target;
    el.dataset.x = x; el.dataset.y = y;
  });
  seenHand = true;
}
let seenHand = false;
$('#b-sort').onclick = () => { sortMode = !sortMode; $('#b-sort').textContent = sortMode ? 'เรียงไพ่' : 'ไม่เรียง'; renderHand(); };

// drag & tap
let drag = null;
function down(e) {
  Snd.init(); const el = e.currentTarget, id = +el.dataset.id, card = hand.hand.find(c => c.id === id); if (!card) return;
  drag = { el, card, sx: e.clientX, sy: e.clientY, ox: +el.dataset.x, oy: +el.dataset.y, moved: false };
  el.setPointerCapture(e.pointerId); el.onpointermove = move; el.onpointerup = el.onpointercancel = up;
}
const overTable = (cx, cy) => { const p = toStage(cx, cy); return Math.hypot(p.x - C.x, p.y - C.y) < 190; };
function move(e) {
  if (!drag) return; const dx = (e.clientX - drag.sx) / SCALE, dy = (e.clientY - drag.sy) / SCALE;
  if (!drag.moved && Math.hypot(dx, dy) > 10) { drag.moved = true; drag.el.classList.add('drag'); }
  if (drag.moved) { drag.el.style.transform = `translate(${drag.ox + dx}px,${drag.oy + dy}px) scale(1.12)`; $('#ring').classList.toggle('hot', overTable(e.clientX, e.clientY)); }
}
function up(e) {
  const d = drag; drag = null; if (!d) return; const el = d.el; el.onpointermove = el.onpointerup = el.onpointercancel = null; $('#ring').classList.remove('hot');
  const ok = playable(d.card);
  if (d.moved) {
    el.classList.remove('drag');
    if (overTable(e.clientX, e.clientY) && ok) { lastFrom = toStage(e.clientX, e.clientY); tryPlay(d.card, el); }
    else { if (overTable(e.clientX, e.clientY)) { Snd.fx('error'); toast('ลงใบนี้ไม่ได้'); } renderHand(); }
    return;
  }
  if (!ok) { Snd.fx('error'); selected = null; renderHand(); return; }
  if (selected === d.card.id) { const r = el.getBoundingClientRect(); lastFrom = toStage(r.left + r.width / 2, r.top + r.height / 2); tryPlay(d.card, el); }
  else { selected = d.card.id; Snd.fx('pop'); renderHand(); }
}
function tryPlay(card, el) {
  selected = null;
  if (card.color === 'wild') { pendingWild = { card, el }; $('#picker').classList.remove('hidden'); renderHand(); return; }
  sendPlay(card, null, el);
}
async function sendPlay(card, color, el) {
  if (el) { el.dataset.sent = '1'; el.style.opacity = '0'; }
  const r = await act({ t: 'play', card: card.id, color });
  if (r && r.error && el) { el.dataset.sent = ''; el.style.opacity = ''; renderHand(); }
}
$$('#picker .colors button').forEach(b => b.onclick = () => { $('#picker').classList.add('hidden'); const p = pendingWild; pendingWild = null; if (p) { const r = p.el.getBoundingClientRect(); lastFrom = toStage(r.left + r.width / 2, r.top + r.height / 2); sendPlay(p.card, b.dataset.c, p.el); } });
$('#pk-cancel').onclick = () => { $('#picker').classList.add('hidden'); pendingWild = null; renderHand(); };
async function act(m) { const r = await net.call({ ...m, code: room.code }); if (r && r.error) { Snd.fx('error'); toast(r.error); } return r; }
$('#draw-pile').onclick = () => { Snd.init(); if (S && S.cur === meId()) act({ t: 'draw' }); else toast('ยังไม่ถึงตาคุณ'); };
$('#b-pass').onclick = () => act({ t: 'pass' });
$('#b-uno').onclick = () => act({ t: 'uno' });
$('#b-catch').onclick = () => { $('#b-catch').classList.add('hidden'); act({ t: 'catch' }); };
$('#g-menu').onclick = () => $('#menu').classList.remove('hidden');
$('#mn-resume').onclick = () => $('#menu').classList.add('hidden');
$('#mn-leave').onclick = leaveRoom;
const muteIcon = () => $('#g-mute').textContent = Snd.muted ? '🔇' : '🔊'; muteIcon();
$('#g-mute').onclick = () => { Snd.toggleMute(); muteIcon(); };
const musicIcon = () => { $('#g-music').style.opacity = Snd.music ? 1 : .4; }; musicIcon();
$('#g-music').onclick = () => { Snd.toggleMusic(); musicIcon(); };
$('#g-full').onclick = async () => { try { if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); await screen.orientation.lock('landscape').catch(() => {}); } else await document.exitFullscreen(); } catch {} };

// ---------- events & effects ----------
const plateXY = pid => (seat[pid] ? seat[pid].pos : C);
const discardXY = () => ({ x: 490 + 152, y: 215 + 62 });
function onEvent(ev) {
  switch (ev.type) {
    case 'play': animPlay(ev); break;
    case 'draw': animDraw(ev); break;
    case 'uno': Snd.fx('uno'); cutin(ev.pid, 'uno', 'UNO!'); break;
    case 'catch': Snd.fx('slap'); shake(true); cutin(ev.pid, 'catch', 'จับได้!'); bubble(ev.target, 'caught'); break;
    case 'chaos': chaosNote(ev); break;
    case 'swap': Snd.fx('slap'); shake(); toast(`${nameOf(ev.pid)} สลับมือกับ ${nameOf(ev.target)}`); break;
    case 'win': Snd.fx('win'); cutin(ev.pid, 'win', 'ชนะ!!', true); break;
    case 'timeout': if (ev.pid === meId()) toast('หมดเวลา! ระบบจั่วให้แล้ว'); break;
    case 'start': startBanner(); if (S && S.players.length) bubble(S.players[Math.floor(Math.random() * S.players.length)].id, 'start', 1300); break;
    case 'sticker': showSticker(ev.pid, ev.id); break;
  }
}
const nameOf = id => (S && S.players.find(p => p.id === id) || { name: '?' }).name;
function startBanner() { const b = $('#startbanner'); b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = ''; setTimeout(() => b.classList.add('hidden'), 1300); Snd.fx('start'); }
function shake(big) { const g = $('#s-game'); g.classList.remove('shake', 'shake-big'); void g.offsetWidth; g.classList.add(big ? 'shake-big' : 'shake'); }
function impact(big) {
  const d = discardXY(), fx = $('#fx'), cx = d.x + 59, cy = d.y + 88;
  const ring = document.createElement('div'); ring.className = 'impact' + (big ? ' big' : ''); ring.style.left = cx + 'px'; ring.style.top = cy + 'px'; fx.appendChild(ring); setTimeout(() => ring.remove(), 550);
  if (big) for (let i = 0; i < 14; i++) { const s = document.createElement('i'); s.className = 'spark'; const a = Math.random() * 6.28, r = 120 + Math.random() * 160; s.style.left = cx + 'px'; s.style.top = cy + 'px'; s.style.setProperty('--dx', Math.cos(a) * r + 'px'); s.style.setProperty('--dy', Math.sin(a) * r + 'px'); s.style.background = ['#fff', '#C6F432', '#3FF0FF', '#FF4FA3'][i % 4]; fx.appendChild(s); setTimeout(() => s.remove(), 750); }
}
function animPlay(ev) {
  const owner = ownerOf(ev.pid), g = cardEl(ev.card, owner), fx = $('#fx');
  const src = ev.pid === meId() && lastFrom ? { x: lastFrom.x - 59, y: lastFrom.y - 88 } : (() => { const p = plateXY(ev.pid); return { x: p.x - 59, y: p.y - 88 }; })();
  lastFrom = null;
  const dst = discardXY();
  g.style.transform = `translate(${src.x}px,${src.y}px) scale(.8)`; fx.appendChild(g); flying++; void g.offsetWidth;
  g.style.transform = `translate(${dst.x}px,${dst.y}px) rotate(${(ev.card.id * 37 % 21) - 10}deg) scale(1.15)`;
  setTimeout(() => {
    g.remove(); flying = Math.max(0, flying - 1); if (S) syncDiscard();
    const special = !!ev.effect || ev.jump;
    Snd.fx(special ? 'slap' : 'play'); impact(special); shake(special);
    if (ev.effect) cutin(ev.pid, VOICE[ev.effect], (ev.jump ? 'ตบแทรก! ' : '') + LABEL[ev.effect], false, ev.color);
    else if (ev.jump) cutin(ev.pid, 'skip', 'ตบแทรก!');
    const react = { skip: 'skipped', draw2: 'hit2', wild4: 'hit4' }[ev.effect];
    if (react && ev.target && ev.target !== ev.pid) bubble(ev.target, react);
  }, 390);
}
function animDraw(ev) {
  Snd.fx('draw');
  if (ev.pid === meId()) return; // own cards fly in via renderHand
  const from = { x: 520, y: 290 }, to = plateXY(ev.pid), owner = ownerOf(ev.pid);
  for (let i = 0; i < Math.min(ev.count, 4); i++) setTimeout(() => {
    const g = backEl(owner); g.style.transform = `translate(${from.x}px,${from.y}px) scale(.75)`; $('#fx').appendChild(g); void g.offsetWidth;
    g.style.transform = `translate(${to.x - 59}px,${to.y - 88}px) scale(.45)`; setTimeout(() => g.remove(), 420);
  }, i * 110);
}
function pickLine(char, ev) {
  const c = ch(char), arr = (c.lines && c.lines[ev]) || []; if (!arr.length) return null;
  const i = Math.floor(Math.random() * arr.length), files = (c.voice && c.voice[ev]) || [];
  return { text: arr[i], file: files.find(f => f.startsWith(`${ev}_${i + 1}.`)) || null };
}
function speak(char, ev) { const l = pickLine(char, ev); if (!l) return { text: '', dur: 0 }; return { text: l.text, dur: Snd.say(char, l.file, l.text, ch(char).tts) }; }
const cutQ = []; let cutBusy = false;
function cutin(pid, event, label, big, color, delay) { cutQ.push({ kind: 'cut', pid, event, label, big, color, delay: delay || 0 }); if (cutQ.length > 6) cutQ.shift(); if (!cutBusy) runCut(); }
function bubble(pid, event, delay) { if (!pid) return; cutQ.push({ kind: 'bubble', pid, event, delay: delay || 0 }); if (cutQ.length > 6) cutQ.shift(); if (!cutBusy) runCut(); }
async function runCut() {
  cutBusy = true;
  while (cutQ.length) {
    const c = cutQ.shift(), char = ownerOf(c.pid); if (!char) continue;
    if (c.delay) await sleep(c.delay);
    if (c.kind === 'bubble') { await showBubble(c.pid, char, c.event); continue; }
    const k = ch(char), el = $('#cutin');
    el.querySelector('img').src = img(char, c.event === 'lose' ? 'sad' : c.event === 'win' ? 'win' : 'shout');
    el.style.setProperty('--cc', c.color ? COLOR[c.color] : k.accent || k.color);
    el.querySelector('b').textContent = c.label;
    const { text, dur } = speak(char, c.event);
    const sp = el.querySelector('span'); sp.textContent = text; sp.style.display = text ? '' : 'none';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    el.querySelectorAll('img,.band,.say').forEach(n => { n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; });
    await sleep(Math.max(c.big ? 2000 : 1300, dur * 1000 + 250));
    el.classList.remove('show'); await sleep(60);
  }
  cutBusy = false;
}
async function showBubble(pid, char, ev) {
  const { text, dur } = speak(char, ev); if (!text) return;
  const el = [...document.querySelectorAll('.screen.active .frame')].find(f => f.dataset.id === pid);
  let pos = { x: 640, y: 200 };
  if (el) { const r = el.getBoundingClientRect(); pos = toStage(r.left + r.width / 2, r.top + 8); }
  pos.x = Math.min(1120, Math.max(170, pos.x)); pos.y = Math.max(70, pos.y);
  const b = document.createElement('div'); b.className = 'sbub'; b.textContent = text; b.style.left = pos.x + 'px'; b.style.top = pos.y + 'px';
  $('#bubbles').appendChild(b);
  const ms = Math.max(1300, dur * 1000 + 200);
  await sleep(ms - 250); b.classList.add('out'); setTimeout(() => b.remove(), 260); await sleep(250);
}
const CHAOS = {
  rain: ['ฝนไพ่!', 'ทุกคนจั่วเพิ่มคนละ 1 ใบ', '#A1E6EF'],
  flip: ['พลิกทิศ!', 'ลำดับเล่นกลับด้านแล้ว', '#DFF671'],
  paint: ['สาดสี!', '', '#F7A8C2'],
  gift: ['ของขวัญ!', '', '#F5E87A'],
};
const CNAME = { red: 'แดง', yellow: 'เหลือง', green: 'เขียว', blue: 'ฟ้า' };
function chaosNote(ev) {
  const [t, sub, col] = CHAOS[ev.kind] || ['เหตุการณ์สุ่ม!', '', '#F5E87A'];
  const n = $('#bignote'); n.style.background = col;
  n.querySelector('b').textContent = t;
  n.querySelector('span').textContent = ev.kind === 'paint' ? `สีบนโต๊ะเปลี่ยนเป็น${CNAME[ev.color]}` : ev.kind === 'gift' ? `${nameOf(ev.pid)} ไพ่เยอะสุด ได้ทิ้ง 1 ใบ` : sub;
  n.classList.remove('hidden'); n.style.animation = 'none'; void n.offsetWidth; n.style.animation = '';
  Snd.fx('chaos'); shake();
  clearTimeout(chaosNote.t); chaosNote.t = setTimeout(() => n.classList.add('hidden'), 2200);
}

// ---------- result ----------
let overShownFor = null;
async function showOver(first) {
  const key = room.code + ':' + room.seq; if (overShownFor && overShownFor.split(':')[0] === room.code && S.winner === overWinner) { fillOver(); return; }
  overShownFor = key; overWinner = S.winner;
  if (!first) { await sleep(2300); if (S.winner !== meId()) cutin(meId(), 'lose', 'แพ้…'); await sleep(1200); }
  fillOver();
}
let overWinner = null;
function fillOver() {
  if (!room || room.phase !== 'over') return;
  const w = S.winner, wp = S.players.find(p => p.id === w);
  $('#o-win').src = img(wp.char, 'win');
  $('#o-title').textContent = w === meId() ? 'คุณชนะ!' : `${wp.name} ชนะ!`;
  $('#o-list').innerHTML = (S.standings || []).map((s, i) => { const p = S.players.find(x => x.id === s.id); return `<li><b>${i + 1}</b><img src="${img(p.char, i === 0 ? 'win' : 'sad')}" alt="">${esc(p.name)}<span>เหลือ ${s.count} ใบ</span></li>`; }).join('');
  const host = room.host === meId();
  $('#o-again').classList.toggle('hidden', !host); $('#o-wait').classList.toggle('hidden', host);
  $('#over').classList.remove('hidden');
}
$('#o-again').onclick = () => { overShownFor = null; overWinner = null; act({ t: 'again' }); };
$('#o-leave').onclick = leaveRoom;


// ---------- namecards & stickers ----------
function renderNamecards(me) {
  const box = $('#l-cards'); if (!box) return;
  box.innerHTML = NAMECARDS.map((n, i) => `<button class="${(me.card || 0) % 8 === i ? 'sel' : ''}" data-card="${i}" style="--nc:${n.sw}" title="นามบัตรแบบที่ ${i + 1}"></button>`).join('');
  $$('#l-cards button').forEach(b => b.onclick = () => net.call({ t: 'pickCard', code: room.code, card: +b.dataset.card }).then(r => r.error && toast(r.error)));
}
const STICKERS = [
  { id: 'lol', e: '😆', t: '555' }, { id: 'love', e: '💖', t: 'รักเลย' }, { id: 'angry', e: '💢', t: 'โกรธแล้วนะ' }, { id: 'cry', e: '😭', t: 'ฮือออ' },
  { id: 'hurry', e: '⏰', t: 'เร็วหน่อย!' }, { id: 'gg', e: '👏', t: 'เก่งมาก' }, { id: 'oops', e: '😳', t: 'อุ๊ย!' }, { id: 'thx', e: '🙏', t: 'ขอบใจน้า' },
];
$('#stk-grid').innerHTML = STICKERS.map(s => `<button data-stk="${s.id}"><span>${s.e}</span>${s.t}</button>`).join('');
$$('[data-stk-open]').forEach(b => b.onclick = e => { e.stopPropagation(); $('#stk-tray').classList.toggle('hidden'); });
$$('#stk-grid button').forEach(b => b.onclick = () => { $('#stk-tray').classList.add('hidden'); if (room) net.call({ t: 'sticker', code: room.code, id: b.dataset.stk }).then(r => r.error && toast(r.error)); });
document.addEventListener('pointerdown', e => { if (!e.target.closest('#stk-tray') && !e.target.closest('[data-stk-open]')) $('#stk-tray').classList.add('hidden'); });
function showSticker(pid, id) {
  const s = STICKERS.find(x => x.id === id); if (!s || !room) return;
  const p = room.players.find(x => x.id === pid); if (!p) return;
  const el = [...document.querySelectorAll('.screen.active .frame')].find(f => f.dataset.id === pid);
  let pos = { x: 640, y: 300 };
  if (el) { const r = el.getBoundingClientRect(); pos = toStage(r.left + r.width / 2, r.top + r.height * .35); }
  pos.x = Math.min(1120, Math.max(160, pos.x)); pos.y = Math.min(600, Math.max(90, pos.y));
  const d = document.createElement('div'); d.className = 'stk'; d.style.left = pos.x + 'px'; d.style.top = pos.y + 'px';
  d.innerHTML = `<img src="${img(p.char, 'idle')}" alt=""><div class="bb"><span>${s.e}</span>${esc(s.t)}</div>`;
  $('#stickers').appendChild(d); setTimeout(() => d.remove(), 2700); Snd.fx('pop');
}


// ---------- notebook decorations (inline SVG: colored pencils, doodles, eraser) ----------
const OLc = '#3A2E39';
function pencil(col, len = 260) {
  return `<svg width="${len + 40}" height="40" viewBox="0 0 ${len + 40} 40"><rect x="22" y="6" width="${len - 40}" height="28" rx="3" fill="${col}" stroke="${OLc}" stroke-width="3"/>
  <path d="M28 15H${len - 22}M28 25H${len - 22}" stroke="#fff6" stroke-width="3"/><rect x="${len - 22}" y="6" width="22" height="28" fill="#C9C9D2" stroke="${OLc}" stroke-width="3"/>
  <rect x="${len}" y="8" width="16" height="24" rx="5" fill="#F7A8C2" stroke="${OLc}" stroke-width="3"/>
  <path d="M22 6 L2 20 L22 34 Z" fill="#F2D3A7" stroke="${OLc}" stroke-width="3" stroke-linejoin="round"/><path d="M8 16 L2 20 L8 24 Z" fill="${col}"/></svg>`;
}
const doodle = {
  star: c => `<svg width="56" height="56" viewBox="0 0 56 56"><path d="M28 5l6 15 16 1-12 10 4 16-14-9-14 9 4-16L6 21l16-1z" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round"/></svg>`,
  heart: c => `<svg width="50" height="46" viewBox="0 0 50 46"><path d="M25 42C8 30 3 20 8 11c5-8 14-6 17 2 3-8 12-10 17-2 5 9 0 19-17 31z" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round"/></svg>`,
  swirl: c => `<svg width="70" height="40" viewBox="0 0 70 40"><path d="M4 30c10-22 22-22 20-6s14 12 18-4 14-14 24 6" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/></svg>`,
  eraser: () => `<svg width="110" height="60" viewBox="0 0 110 60"><g transform="rotate(-10 55 30)"><rect x="8" y="14" width="94" height="34" rx="6" fill="#F7A8C2" stroke="${OLc}" stroke-width="3"/><rect x="58" y="14" width="44" height="34" rx="6" fill="#A1E6EF" stroke="${OLc}" stroke-width="3"/></g></svg>`,
};
function place(box, html, x, y, rot = 0, op = 1) { const d = document.createElement('div'); d.innerHTML = html; const el = d.firstElementChild; el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.transform = `rotate(${rot}deg)`; el.style.opacity = op; box.appendChild(el); }
function decorate() {
  $$('.brand').forEach(b => b.innerHTML = `<div class="uno"><span>U</span><span>N</span><span>O</span></div><div class="kt"><span class="hl pink">คอแตก</span></div><p class="tag"><span class="hl cyan">ไพ่ปั่นๆ</span> เล่นกับเพื่อน ตะโกนจนคอแตก</p>`);
  const spots = [[14, 0, -6], [176, 10, 5], [336, 0, -4], [34, 138, 4], [196, 142, -5], [352, 136, 6]];
  $$('.cluster').forEach(cl => { cl.innerHTML = ORDER.slice(0, 6).map((id, i) => { const [x, y, r] = spots[i]; return `<img src="${img(id)}" alt="" style="left:${x}px;top:${y}px;--r:${r}deg">`; }).join('') ; });
  $$('.deskdeco').forEach(dd => { dd.innerHTML = ''; place(dd, pencil('#E87D9D'), 20, 668, -4); place(dd, pencil('#62B2E6', 220), 980, 14, 12); place(dd, pencil('#F3CF3E', 200), 1040, 52, 8); place(dd, doodle.eraser(), 1150, 640, 0); place(dd, doodle.star('#E87D9D'), 1210, 300, 10, .8); place(dd, doodle.heart('#62B2E6'), 14, 260, -10, .7); });
  const g = $('.gdeco'); g.innerHTML = '';
  place(g, doodle.star('#F3CF3E'), 250, 640, -8, .8); place(g, doodle.swirl('#E87D9D'), 1050, 520, 6, .6); place(g, doodle.heart('#BA479C'), 70, 440, 8, .5);
  place(g, pencil('#6CC57A', 200), 960, 668, -3, .95);
}

// ---------- boot ----------
(async () => {
  await loadChars(); decorate();
  try { net = new OnlineNet(); if (await net.session()) return afterLogin(); } catch (e) { console.warn(e); }
  show('s-auth');
})();
document.addEventListener('visibilitychange', () => { if (!document.hidden && net && net.refresh) net.refresh(); });
window.__uno = { get room() { return room; }, get S() { return S; }, get hand() { return hand; }, cutin };
