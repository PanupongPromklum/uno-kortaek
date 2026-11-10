// Network layer: OnlineNet (Supabase) and LocalNet (offline practice with bots, same rules code)
import { apply } from './shared/rooms.js';
const C = window.UNO_CONFIG;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function emailFor(username) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(username.trim().toLowerCase()));
  return 'u' + [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24) + '@' + C.emailDomain;
}

export class OnlineNet {
  constructor() {
    this.mode = 'online';
    this.sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  async session() { const { data } = await this.sb.auth.getSession(); this.uid = data.session ? data.session.user.id : null; return !!this.uid; }
  async register(u, p) { const r = await this.call({ t: 'register', username: u, password: p }); return r.error ? r : this.login(u, p); }
  async login(u, p) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: await emailFor(u), password: p });
    if (error) return { error: /invalid/i.test(error.message) ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : error.message };
    this.uid = data.user.id; return { ok: true };
  }
  async logout() { this.close(); await this.sb.auth.signOut(); this.uid = null; }
  async call(msg) {
    try {
      const { data, error } = await this.sb.functions.invoke('uno', { body: msg });
      if (error) { try { return await error.context.json(); } catch { return { error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง' }; } }
      // apply the fresh state returned by the server right away (realtime arrives later for everyone else)
      if (data && this.h && this.code && data.code === this.code) {
        if (data.room) this.h.room(data.room);
        if (data.hand) this.h.hand(data.hand);
      }
      return data || {};
    } catch { return { error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง' }; }
  }
  async open(code, h) {
    this.close(); this.code = code; this.h = h;
    const ch = this.sb.channel('room:' + code, { config: { presence: { key: this.uid } } });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, p => {
      if (this.code !== code) return;
      if (p.eventType === 'DELETE') h.room(null); else h.room(p.new);
    })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hands', filter: `player_id=eq.${this.uid}` }, p => {
        if (this.code === code && p.new && p.new.room_code === code) h.hand(p.new.data);
      })
      .on('presence', { event: 'sync' }, () => h.presence(Object.keys(ch.presenceState())))
      .subscribe(async st => {
        if (st === 'SUBSCRIBED') { h.conn(true); try { await ch.track({ at: Date.now() }); } catch {} this.refresh(); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') h.conn(false);
      });
    this.ch = ch;
    await this.refresh();
    this.poll = setInterval(() => this.refresh(), 6000);
  }
  async refresh() {
    const code = this.code; if (!code) return;
    const { data: r, error } = await this.sb.from('rooms').select('*').eq('code', code).maybeSingle();
    if (code !== this.code || error) return;
    this.h.room(r);
    const { data: hd } = await this.sb.from('hands').select('data').eq('room_code', code).eq('player_id', this.uid).maybeSingle();
    if (code === this.code && hd) this.h.hand(hd.data);
  }
  close() { if (this.ch) this.sb.removeChannel(this.ch); this.ch = null; clearInterval(this.poll); this.code = null; }
}

export class LocalNet {
  constructor(name) { this.mode = 'local'; this.uid = 'me'; this.name = name || 'ฉัน'; this.room = null; this.game = null; }
  async session() { return true; }
  async logout() { this.close(); }
  async call(m) {
    await sleep(25);
    if (m.t === 'me') return { username: this.name, room: this.room ? { code: this.room.code, phase: this.room.phase, players: this.room.players } : null };
    if (m.t === 'create') {
      this.room = { code: 'BOTS', host: 'me', phase: 'lobby', rules: { stacking: false, jumpIn: false, sevenZero: false },
        players: [{ id: 'me', name: this.name, char: m.chars[0], bot: false, ready: false, loaded: false, away: false }],
        state: null, events: [], seq: 0, version: 0, load_deadline: null };
      this.game = null; return { ok: true, code: 'BOTS' };
    }
    if (m.t === 'join') return { error: 'โหมดฝึกเล่นได้กับบอทเท่านั้น' };
    if (!this.room) return { error: 'ไม่มีห้อง' };
    if (m.t === 'leave') { this.room = null; this.game = null; return { ok: true }; }
    const r = apply(this.room, this.game ? structuredClone(this.game) : null, 'me', this.name, m, Date.now());
    if (r.error) return { error: r.error };
    this.game = r.game; this.room.version++;
    this.emit(!!r.clearHands);
    return { ok: true, code: this.room.code };
  }
  emit(clear) {
    const snap = structuredClone(this.room);
    const G = this.game;
    const hd = G ? { hand: structuredClone(G.players.find(p => p.id === 'me').hand), drawn: G.players[G.cur].id === 'me' ? G.drawnId : null } : (clear ? { hand: [], drawn: null } : null);
    setTimeout(() => { if (!this.h) return; this.h.room(snap); if (hd) this.h.hand(hd); }, 15);
  }
  async open(code, h) { this.h = h; h.conn(true); h.presence(['me']); this.emit(false); }
  close() { this.h = null; }
}
