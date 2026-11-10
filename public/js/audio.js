// Sound: synthesized SFX, procedural lo-fi BGM (or audio/bgm.mp3 if present), character voices
// (voice/<event>_<n>.mp3 if present, otherwise the browser's Thai speech voice). No paid services.
const Snd = (() => {
  let ctx = null, master = null, sfxBus = null, bgmBus = null, voiceBus = null, noiseBuf = null;
  let muted = localStorage.getItem('uno_mute') === '1';
  let musicOn = localStorage.getItem('uno_music') !== '0';
  const voiceBufs = {}; let voiceSrc = null;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = .8; sfxBus.connect(master);
    voiceBus = ctx.createGain(); voiceBus.gain.value = 1.1; voiceBus.connect(master);
    bgmBus = ctx.createGain(); bgmBus.gain.value = 0; bgmBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (musicOn && wantBgm) startBgm();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(e => window.addEventListener(e, init, { passive: true }));

  // ---------- SFX ----------
  const env = (g, t, a, peak, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  function tone(f0, f1, dur, peak = .5, type = 'sine', when = 0, bus = sfxBus, at = null) {
    if (!ctx) return; const t = at != null ? at : ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, .005, peak, dur); o.connect(g).connect(bus); o.start(t); o.stop(t + dur + .05);
  }
  function noise(dur, peak, freq = 2000, when = 0, sweep = 0, bus = sfxBus, at = null, type = 'bandpass') {
    if (!ctx) return; const t = at != null ? at : ctx.currentTime + when, s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur); f.Q.value = .7;
    const g = ctx.createGain(); env(g, t, .004, peak, dur); s.connect(f).connect(g).connect(bus); s.start(t, Math.random()); s.stop(t + dur + .05);
  }
  const fx = {
    play() { noise(.09, .5, 2400); tone(240, 90, .12, .35, 'triangle'); },
    slap() { noise(.18, .9, 3000); tone(170, 45, .24, .8, 'triangle'); tone(900, 300, .06, .25, 'square'); try { navigator.vibrate && navigator.vibrate(40); } catch {} },
    draw() { noise(.18, .3, 700, 0, 3800); },
    uno() { tone(660, 660, .14, .35, 'square'); tone(990, 990, .22, .35, 'square', .11); },
    turn() { tone(988, 988, .1, .16); tone(1319, 1319, .16, .13, 'sine', .08); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, .3, .3, 'triangle', i * .12)); },
    error() { tone(180, 130, .16, .25, 'square'); },
    start() { [392, 523, 659, 784].forEach((f, i) => tone(f, f, .2, .28, 'triangle', i * .09)); },
    pop() { tone(500, 950, .08, .22); },
    pencil() { noise(.25, .25, 4500, 0, 2500, sfxBus, null, 'highpass'); },
    chaos() { [784, 659, 523, 880, 1047].forEach((f, i) => tone(f, f * 1.01, .14, .25, 'square', i * .07)); },
  };

  // ---------- lo-fi BGM (procedural, ~76 BPM) ----------
  let wantBgm = false, bgmTimer = null, nextT = 0, stepN = 0, bgmEl = null, bgmFile = null;
  const BPM = 76, S16 = 60 / BPM / 4;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const PROG = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]; // Fmaj7 Em7 Dm7 Cmaj7
  const BASS = [41, 40, 38, 36];
  const SCALE = [72, 74, 76, 79, 81, 84];
  function epiano(m, t, dur, v) {
    const f = mtof(m), g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const [type, mul, det] of [['sine', 1, 0], ['triangle', 1, 6], ['sine', 2, -4]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul; o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = mul === 2 ? .25 : .5; o.connect(og).connect(lp); o.start(t); o.stop(t + dur + .1);
    }
    lp.connect(g).connect(bgmBus);
  }
  function bgmStep(t) {
    const bar = Math.floor(stepN / 16) % 4, s = stepN % 16, swing = (s % 2) ? S16 * .18 : 0, tt = t + swing;
    if (s === 0) PROG[bar].forEach((m, i) => epiano(m, tt + i * .012, S16 * 15, .07));
    if (s === 10 && Math.random() < .6) PROG[bar].slice(1).forEach(m => epiano(m + 12, tt, S16 * 5, .03));
    if (s === 0 || s === 7 || s === 10) tone(mtof(BASS[bar]), mtof(BASS[bar]), S16 * (s === 0 ? 6 : 3), .18, 'sine', 0, bgmBus, tt);
    if (s === 0 || s === 9) { tone(110, 40, .28, .35, 'sine', 0, bgmBus, tt); }
    if (s === 4 || s === 12) noise(.16, .12, 1600, 0, 900, bgmBus, tt);
    if (s % 2 === 0) noise(.04, s % 4 ? .025 : .04, 7500, 0, 0, bgmBus, tt, 'highpass');
    if (Math.random() < .16 && s % 2 === 0) { const m = SCALE[Math.floor(Math.random() * SCALE.length)]; tone(mtof(m), mtof(m), .5, .05, 'triangle', 0, bgmBus, tt); }
    if (Math.random() < .25) noise(.02, .02, 3000, 0, 0, bgmBus, tt); // vinyl crackle
    stepN++;
  }
  function schedule() { while (nextT < ctx.currentTime + .25) { bgmStep(nextT); nextT += S16; } }
  async function startBgm() {
    wantBgm = true; if (!ctx || !musicOn) return;
    if (bgmFile === null) { try { const r = await fetch('audio/bgm.mp3', { method: 'HEAD' }); bgmFile = r.ok; } catch { bgmFile = false; } }
    bgmBus.gain.cancelScheduledValues(ctx.currentTime); bgmBus.gain.setTargetAtTime(bgmFile ? 0 : .55, ctx.currentTime, .6);
    if (bgmFile) {
      if (!bgmEl) { bgmEl = new Audio('audio/bgm.mp3'); bgmEl.loop = true; bgmEl.volume = .35; }
      bgmEl.muted = muted; bgmEl.play().catch(() => {}); return;
    }
    if (bgmTimer) return;
    nextT = ctx.currentTime + .1; bgmTimer = setInterval(schedule, 100);
  }
  function stopBgm() {
    if (bgmEl) bgmEl.pause();
    if (!ctx) return; bgmBus.gain.setTargetAtTime(0, ctx.currentTime, .3);
    setTimeout(() => { if (!(musicOn && wantBgm)) { clearInterval(bgmTimer); bgmTimer = null; } }, 1200);
  }

  // ---------- voices ----------
  async function loadVoices(chars, ids) {
    init(); if (!ctx) return;
    const jobs = [];
    for (const id of ids) {
      const c = chars[id]; if (!c) continue; voiceBufs[id] = voiceBufs[id] || {};
      for (const [ev, files] of Object.entries(c.voice || {})) for (const f of files) {
        if (voiceBufs[id][f]) continue;
        jobs.push(fetch(`characters/${id}/voice/${f}`).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => new Promise((ok, no) => ctx.decodeAudioData(b, ok, no))).then(buf => { voiceBufs[id][f] = buf; }).catch(() => {}));
      }
    }
    await Promise.all(jobs);
  }
  let thVoices = [];
  const pickVoices = () => { thVoices = (speechSynthesis.getVoices() || []).filter(v => /^th/i.test(v.lang)); };
  if ('speechSynthesis' in window) { pickVoices(); speechSynthesis.onvoiceschanged = pickVoices; }
  function ttsVoice(gender) {
    if (!thVoices.length) pickVoices();
    const natural = thVoices.filter(v => /natural|online|neural/i.test(v.name));
    const pool = natural.length ? natural : thVoices;
    const male = pool.find(v => /niwat|male|ชาย/i.test(v.name));
    const female = pool.filter(v => !/niwat/i.test(v.name));
    if (gender === 'm' && male) return male;
    return female[0] || pool[0] || null;
  }
  // say(charId, event, idx, text, tts) → returns duration estimate (s)
  function say(id, file, text, tts = {}) {
    if (muted) return 0;
    init();
    const buf = file && voiceBufs[id] && voiceBufs[id][file];
    if (buf) {
      if (voiceSrc) { try { voiceSrc.stop(); } catch {} }
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(voiceBus); s.start(); voiceSrc = s;
      duck(buf.duration); return buf.duration;
    }
    // ไม่มีไฟล์เสียงอัด → ไม่พูด (ปิดเสียง AI อ่านแล้ว) แสดงแค่ข้อความ
    return 0;
  }
  function duck(sec) { if (!ctx || !bgmBus || !musicOn || bgmFile) return; const t = ctx.currentTime; bgmBus.gain.cancelScheduledValues(t); bgmBus.gain.setTargetAtTime(.22, t, .05); bgmBus.gain.setTargetAtTime(.55, t + sec + .2, .4); }

  return {
    fx: n => { init(); if (fx[n]) fx[n](); }, loadVoices, say, init,
    bgm(on) { if (on) startBgm(); else { wantBgm = false; stopBgm(); } },
    get muted() { return muted; }, get music() { return musicOn; },
    toggleMute() { muted = !muted; localStorage.setItem('uno_mute', muted ? '1' : '0'); if (master) master.gain.value = muted ? 0 : 1; if (bgmEl) bgmEl.muted = muted; if (muted && 'speechSynthesis' in window) speechSynthesis.cancel(); return muted; },
    toggleMusic() { musicOn = !musicOn; localStorage.setItem('uno_music', musicOn ? '1' : '0'); if (musicOn) startBgm(); else stopBgm(); return musicOn; },
  };
})();
