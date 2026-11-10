import { createClient } from 'npm:@supabase/supabase-js@2';
import { apply } from './rooms.js';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function emailFor(username: string) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(username.trim().toLowerCase()));
  return 'u' + [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24) + '@uno-kortaek.game';
}
const genCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 4 }, () => a[Math.floor(Math.random() * a.length)]).join(''); };

async function setRoomOf(uid: string, code: string | null) { await admin.from('profiles').update({ current_room: code }).eq('id', uid); }

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  let m: any; try { m = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  if (m.t === 'register') {
    const username = String(m.username || '').trim(), password = String(m.password || '');
    if (!/^[\p{L}\p{M}\p{N}_.-]{2,16}$/u.test(username)) return json({ error: 'ชื่อผู้ใช้ 2-16 ตัว (ตัวอักษร ตัวเลข _ . -)' });
    if (password.length < 6) return json({ error: 'รหัสผ่านอย่างน้อย 6 ตัว' });
    const { data: ex } = await admin.from('profiles').select('id').ilike('username', username.replace(/[%_]/g, '\\$&')).maybeSingle();
    if (ex) return json({ error: 'ชื่อนี้มีคนใช้แล้ว' });
    const { data, error } = await admin.auth.admin.createUser({ email: await emailFor(username), password, email_confirm: true, user_metadata: { username } });
    if (error) return json({ error: /already/i.test(error.message) ? 'ชื่อนี้มีคนใช้แล้ว' : error.message });
    await admin.from('profiles').insert({ id: data.user.id, username });
    return json({ ok: true });
  }

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  const { data: ud } = await admin.auth.getUser(token);
  if (!ud?.user) return json({ error: 'กรุณาเข้าสู่ระบบใหม่', auth: true }, 401);
  const uid = ud.user.id;
  const { data: prof } = await admin.from('profiles').select('username,current_room').eq('id', uid).single();
  const uname = prof?.username || 'player';

  if (m.t === 'me') {
    let room = null;
    if (prof?.current_room) {
      const { data } = await admin.from('rooms').select('code,phase,players').eq('code', prof.current_room).maybeSingle();
      if (data && data.phase !== 'dead' && data.players.some((p: any) => p.id === uid)) room = data; else await setRoomOf(uid, null);
    }
    return json({ username: uname, room });
  }

  if (m.t === 'create') {
    for (let i = 0; i < 6; i++) {
      const code = genCode();
      const used = new Set<string>();
      const char = (m.chars || []).find((c: string) => !used.has(c)) || 'apple';
      const { error } = await admin.from('rooms').insert({ code, host: uid, players: [{ id: uid, name: uname, char, card: Math.floor(Math.random() * 8), bot: false, ready: false, loaded: false, away: false }] });
      if (!error) { await admin.from('room_secrets').insert({ room_code: code, game: null }); await setRoomOf(uid, code); return json({ ok: true, code }); }
    }
    return json({ error: 'สร้างห้องไม่สำเร็จ ลองใหม่' });
  }

  const code = String(m.code || prof?.current_room || '').toUpperCase().trim();
  if (!code) return json({ error: 'ไม่ได้อยู่ในห้อง' });

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: loaded, error: le } = await admin.rpc('uno_load', { p_code: code });
    if (le) return json({ error: le.message });
    if (!loaded) { if (m.t === 'leave' || m.t === 'me') await setRoomOf(uid, null); return json({ error: 'ไม่พบห้องนี้' }); }
    const room = loaded.room, before = loaded.game;
    const prevHands = new Map<string, string>();
    if (before) for (const p of before.players) prevHands.set(p.id, JSON.stringify([p.hand, before.drawnId]));
    const now = Date.now();
    const res = apply(room, before ? structuredClone(before) : null, uid, uname, m, now);
    if (res.error) return json({ error: res.error });
    if (m.t === 'tick' && room.events.length === 0 && JSON.stringify(room.players) === JSON.stringify(loaded.room.players) && room.phase === loaded.room.phase) return json({ ok: true, idle: true });
    const G = res.game;
    const hands: any[] = [];
    if (G) for (const p of G.players) {
      if (p.bot) continue;
      const drawn = G.players[G.cur].id === p.id ? G.drawnId : null;
      const sig = JSON.stringify([p.hand, drawn]);
      if (prevHands.get(p.id) !== sig || m.t === 'rejoin' || m.t === 'loaded') hands.push({ id: p.id, data: { hand: p.hand, drawn, turnNo: G.turnNo } });
    }
    if (res.clearHands) for (const p of room.players) if (!p.bot) hands.push({ id: p.id, data: { hand: [], drawn: null } });
    const dead = room.phase === 'dead';
    const { data: ok, error: ce } = await admin.rpc('uno_commit', { p_code: code, p_version: room.version, p_room: room, p_game: G, p_hands: hands });
    if (ce) return json({ error: ce.message });
    if (!ok) continue; // version conflict → retry
    if (m.t === 'join') await setRoomOf(uid, code);
    if (m.t === 'leave' && (loaded.room.phase === 'lobby' || loaded.room.phase === 'over')) await setRoomOf(uid, null);
    if (dead) await admin.from('rooms').delete().eq('code', code);
    // return fresh state to the caller so its screen updates instantly (realtime still updates everyone)
    room.version = room.version + 1;
    let hand = null;
    if (G) { const me = G.players.find((p: any) => p.id === uid); if (me) hand = { hand: me.hand, drawn: G.players[G.cur].id === uid ? G.drawnId : null, turnNo: G.turnNo }; }
    else if (res.clearHands) hand = { hand: [], drawn: null };
    return json({ ok: true, code, room: dead ? null : room, hand });
  }
  return json({ error: 'คนกดพร้อมกันเยอะ ลองอีกครั้ง' });
});
